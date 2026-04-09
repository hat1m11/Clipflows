// backend/src/workers/postWorker.js
require('dotenv').config();
const { Worker } = require('bullmq');
const { query } = require('../db');
const { getPlatform } = require('../platforms');
const { createRedisConnection, POST_QUEUE_NAME } = require('../queue');
const fs = require('fs');
const path = require('path');

console.log('🔧 Post worker starting...');

const worker = new Worker(
  POST_QUEUE_NAME,
  async (job) => {
    const { postTargetId, postId, platform, videoPath, caption, userId } = job.data;

    console.log(`[Worker] Processing job ${job.id} - Platform: ${platform}, Target: ${postTargetId}`);

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found (was the server redeployed?). Please re-upload the video.`);
    }

    // Update status to processing
    await query(
      `UPDATE post_targets SET status = 'processing', updated_at = NOW() WHERE id = $1`,
      [postTargetId]
    );

    // Get user's social account credentials for this platform
    const { rows: accounts } = await query(
      `SELECT * FROM social_accounts WHERE user_id = $1 AND platform = $2`,
      [userId, platform]
    );

    if (!accounts.length) {
      throw new Error(`No connected ${platform} account found for user`);
    }

    const credentials = accounts[0];

    // Get platform adapter
    const platformAdapter = getPlatform(platform);

    // Execute the post
    const result = await platformAdapter.post(videoPath, caption, credentials);

    if (result.success) {
      await query(
        `UPDATE post_targets 
         SET status = 'success', external_post_id = $1, error_message = NULL, updated_at = NOW() 
         WHERE id = $2`,
        [result.externalPostId, postTargetId]
      );

      console.log(`[Worker] ✅ Success - ${platform} post ID: ${result.externalPostId}`);

      // Clean up video file after ALL targets for this post are done
      await cleanupVideoIfDone(postId, videoPath);

      return { success: true, externalPostId: result.externalPostId };
    } else {
      throw new Error(result.error || 'Unknown posting error');
    }
  },
  {
    connection: createRedisConnection(),
    concurrency: 3,
  }
);

// Handle job failures (after all retries exhausted)
worker.on('failed', async (job, err) => {
  console.error(`[Worker] ❌ Job ${job.id} failed permanently:`, err.message);

  const { postTargetId, platform } = job.data;

  await query(
    `UPDATE post_targets 
     SET status = 'failed', error_message = $1, retry_count = $2, updated_at = NOW() 
     WHERE id = $3`,
    [err.message, job.attemptsMade, postTargetId]
  ).catch(console.error);
});

// Handle job completion
worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully`);
});

// Track retry attempts
worker.on('active', async (job) => {
  if (job.attemptsMade > 0) {
    const { postTargetId } = job.data;
    await query(
      `UPDATE post_targets SET retry_count = $1, updated_at = NOW() WHERE id = $2`,
      [job.attemptsMade, postTargetId]
    ).catch(console.error);
  }
});

/**
 * Delete video file once all post targets for a post are complete
 */
async function cleanupVideoIfDone(postId, videoPath) {
  try {
    const { rows } = await query(
      `SELECT COUNT(*) as pending 
       FROM post_targets 
       WHERE post_id = $1 AND status IN ('pending', 'processing')`,
      [postId]
    );

    if (parseInt(rows[0].pending) === 0) {
      if (fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
        console.log(`[Worker] 🗑️  Cleaned up video: ${videoPath}`);
      }
    }
  } catch (err) {
    console.error('[Worker] Cleanup error:', err.message);
  }
}

console.log('✅ Post worker ready, waiting for jobs...');

// Graceful shutdown
process.on('SIGTERM', async () => {
  await worker.close();
  console.log('Worker shut down gracefully');
  process.exit(0);
});

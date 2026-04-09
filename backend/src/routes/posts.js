// backend/src/routes/posts.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db');
const authMiddleware = require('../middleware/auth');
const { createPostQueue } = require('../queue');

const router = express.Router();
router.use(authMiddleware);

// Configure multer for video uploads
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  },
});

// POST /posts/upload - upload a video file
router.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  res.json({
    success: true,
    videoPath: req.file.filename,
    videoSize: req.file.size,
    originalName: req.file.originalname,
  });
});

// POST /posts - create a post and queue it
router.post('/', async (req, res) => {
  const { videoPath, platforms, captions, useGlobalCaption, globalCaption } = req.body;

  if (!videoPath || !platforms?.length) {
    return res.status(400).json({ error: 'Video and at least one platform are required' });
  }

  const fullVideoPath = path.join(uploadDir, videoPath);
  if (!fs.existsSync(fullVideoPath)) {
    return res.status(400).json({ error: 'Video file not found. Please re-upload.' });
  }

  // Verify user has connected accounts for selected platforms
  const { rows: connectedAccounts } = await query(
    `SELECT platform FROM social_accounts WHERE user_id = $1 AND platform = ANY($2::text[])`,
    [req.user.id, platforms]
  );
  const connectedPlatforms = connectedAccounts.map((a) => a.platform);
  const missingPlatforms = platforms.filter((p) => !connectedPlatforms.includes(p));

  if (missingPlatforms.length) {
    return res.status(400).json({
      error: `Not connected to: ${missingPlatforms.join(', ')}. Please connect your accounts first.`,
    });
  }

  // Create post record
  const { rows: postRows } = await query(
    `INSERT INTO posts (user_id, video_url, video_filename) VALUES ($1, $2, $3) RETURNING *`,
    [req.user.id, fullVideoPath, videoPath]
  );
  const post = postRows[0];

  // Create post targets and queue jobs
  const postQueue = createPostQueue();
  const targets = [];

  for (const platform of platforms) {
    const caption = useGlobalCaption ? globalCaption : captions?.[platform] || '';

    const { rows: targetRows } = await query(
      `INSERT INTO post_targets (post_id, platform, caption, status) VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [post.id, platform, caption]
    );
    const target = targetRows[0];

    // Queue the job
    const job = await postQueue.add(
      `post-${platform}`,
      {
        postTargetId: target.id,
        postId: post.id,
        platform,
        videoPath: fullVideoPath,
        caption,
        userId: req.user.id,
      },
      { jobId: `${target.id}-${Date.now()}` }
    );

    // Store job ID on target
    await query(`UPDATE post_targets SET job_id = $1 WHERE id = $2`, [job.id, target.id]);

    targets.push({ ...target, jobId: job.id });
  }

  await postQueue.close();

  res.status(201).json({
    success: true,
    post: {
      ...post,
      targets,
    },
  });
});

// GET /posts - list all posts for user
router.get('/', async (req, res) => {
  const { rows: posts } = await query(
    `SELECT p.*, 
       json_agg(
         json_build_object(
           'id', pt.id,
           'platform', pt.platform,
           'caption', pt.caption,
           'status', pt.status,
           'external_post_id', pt.external_post_id,
           'error_message', pt.error_message,
           'retry_count', pt.retry_count,
           'created_at', pt.created_at,
           'updated_at', pt.updated_at
         ) ORDER BY pt.created_at
       ) as targets
     FROM posts p
     LEFT JOIN post_targets pt ON pt.post_id = p.id
     WHERE p.user_id = $1
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [req.user.id]
  );

  res.json({ posts });
});

// GET /posts/:id - get single post
router.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT p.*, 
       json_agg(
         json_build_object(
           'id', pt.id,
           'platform', pt.platform,
           'caption', pt.caption,
           'status', pt.status,
           'external_post_id', pt.external_post_id,
           'error_message', pt.error_message,
           'retry_count', pt.retry_count
         )
       ) as targets
     FROM posts p
     LEFT JOIN post_targets pt ON pt.post_id = p.id
     WHERE p.id = $1 AND p.user_id = $2
     GROUP BY p.id`,
    [req.params.id, req.user.id]
  );

  if (!rows.length) return res.status(404).json({ error: 'Post not found' });
  res.json({ post: rows[0] });
});

// POST /posts/:id/retry/:targetId - retry a failed post target
router.post('/:id/retry/:targetId', async (req, res) => {
  const { rows } = await query(
    `SELECT pt.*, p.video_url, p.user_id
     FROM post_targets pt
     JOIN posts p ON p.id = pt.post_id
     WHERE pt.id = $1 AND p.id = $2 AND p.user_id = $3 AND pt.status = 'failed'`,
    [req.params.targetId, req.params.id, req.user.id]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'Failed post target not found' });
  }

  const target = rows[0];

  // Reset to pending
  await query(
    `UPDATE post_targets SET status = 'pending', error_message = NULL, updated_at = NOW() WHERE id = $1`,
    [target.id]
  );

  // Re-queue the job
  const postQueue = createPostQueue();
  await postQueue.add(
    `retry-${target.platform}`,
    {
      postTargetId: target.id,
      postId: req.params.id,
      platform: target.platform,
      videoPath: target.video_url,
      caption: target.caption,
      userId: req.user.id,
    }
  );
  await postQueue.close();

  res.json({ success: true, message: 'Post queued for retry' });
});

// DELETE /posts/:id - delete a post (from DB only, not from platforms)
router.delete('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM posts WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );

  if (!rows.length) return res.status(404).json({ error: 'Post not found' });

  const post = rows[0];

  // Delete video file if it still exists
  if (post.video_url && fs.existsSync(post.video_url)) {
    fs.unlinkSync(post.video_url);
  }

  // Delete from DB (cascades to post_targets)
  await query('DELETE FROM posts WHERE id = $1', [post.id]);

  res.json({
    success: true,
    warning: 'Post removed from ClipFlow. Note: Videos already posted to platforms remain there and must be deleted manually.',
  });
});

module.exports = router;

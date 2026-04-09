// backend/src/queue/index.js
const { Queue, Worker, QueueEvents } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  url: process.env.REDIS_URL,
};

// Parse redis URL if provided
const redisConnection = process.env.REDIS_URL
  ? { url: process.env.REDIS_URL }
  : { host: 'localhost', port: 6379 };

const POST_QUEUE_NAME = 'post-video';

function createPostQueue() {
  return new Queue(POST_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5 seconds initial delay
      },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
}

function createQueueEvents() {
  return new QueueEvents(POST_QUEUE_NAME, { connection: redisConnection });
}

module.exports = { createPostQueue, createQueueEvents, POST_QUEUE_NAME, redisConnection };

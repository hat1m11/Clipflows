// backend/src/queue/index.js
const { Queue, Worker, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');

function createRedisConnection() {
  const url = process.env.REDIS_URL;
  if (url) {
    return new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      tls: url.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
    });
  }
  return new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

const POST_QUEUE_NAME = 'post-video';

function createPostQueue() {
  return new Queue(POST_QUEUE_NAME, {
    connection: createRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
}

function createQueueEvents() {
  return new QueueEvents(POST_QUEUE_NAME, { connection: createRedisConnection() });
}

module.exports = { createPostQueue, createQueueEvents, POST_QUEUE_NAME, createRedisConnection };

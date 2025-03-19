// lib/redisClient.js
import { createClient } from 'redis';

let redis;

// Initialize Redis client
export function getRedisClient() {
  if (!redis) {
    redis = createClient({
      url: process.env.REDIS_URL
    });
    
    redis.on('error', (err) => console.error('Redis Client Error', err));
    
    // Connect to Redis (this returns a promise)
    redis.connect().catch(err => console.error('Failed to connect to Redis:', err));
  }
  
  return redis;
}
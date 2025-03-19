/**
 * @fileoverview Redis Client for Funnelback Search Integration
 * 
 * Provides a singleton Redis client instance for use across the application.
 * 
 * @author Victor Chimenti
 * @version 2.1.0
 * @namespace redisClient
 * @license MIT
 * @lastModified 2025-03-19
 */

const { createClient } = require('redis');

let redis;
let isConnecting = false;
let connectionPromise = null;

/**
 * Gets or initializes the Redis client and ensures connection
 * 
 * @returns {Promise<Object|null>} Redis client instance or null if connection failed
 */
async function getRedisClient() {
  // Return existing client if already connected and ready
  if (redis && redis.isReady) {
    return redis;
  }
  
  // Return null if already tried and failed
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL environment variable is not defined. Cache will be disabled.');
    return null;
  }
  
  // If we're in the process of connecting, wait for that to finish
  if (isConnecting && connectionPromise) {
    try {
      await connectionPromise;
      return redis;
    } catch (err) {
      console.error('Waiting for Redis connection failed:', err);
      return null;
    }
  }
  
  // Create new client and connect
  try {
    isConnecting = true;
    
    // Create connection promise that we can await
    connectionPromise = new Promise((resolve, reject) => {
      console.log('Creating new Redis client...');
      
      // Create Redis client
      redis = createClient({
        url: process.env.REDIS_URL,
        socket: {
          reconnectStrategy: (retries) => {
            console.log(`Redis reconnect attempt #${retries}`);
            if (retries > 5) {
              console.error('Max Redis reconnect attempts reached');
              return new Error('Max Redis reconnect attempts reached');
            }
            return Math.min(retries * 100, 3000); // Increase delay with each retry, max 3s
          }
        }
      });
      
      // Handle connection events
      redis.on('error', (err) => {
        console.error('Redis Client Error:', err);
        reject(err);
      });
      
      redis.on('connect', () => {
        console.log('Redis client connected');
      });
      
      redis.on('ready', () => {
        console.log('Redis client ready');
        resolve(redis);
      });
      
      redis.on('reconnecting', () => {
        console.log('Redis client reconnecting');
      });
      
      redis.on('end', () => {
        console.log('Redis client connection ended');
        redis = null;
      });
      
      // Connect to Redis
      redis.connect().catch(err => {
        console.error('Failed to connect to Redis:', err);
        redis = null;
        reject(err);
      });
    });
    
    // Wait for connection to be established
    await connectionPromise;
    return redis;
  } catch (err) {
    console.error('Redis connection failed:', err);
    redis = null;
    return null;
  } finally {
    isConnecting = false;
    connectionPromise = null;
  }
}

/**
 * Gets Redis client connection status
 * 
 * @returns {Object} Status object with connection details
 */
function getRedisStatus() {
  return {
    exists: !!redis,
    isReady: redis?.isReady || false,
    isConnecting,
    hasUrl: !!process.env.REDIS_URL
  };
}

module.exports = {
  getRedisClient,
  getRedisStatus
};
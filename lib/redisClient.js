/**
 * @fileoverview Redis Client for Funnelback Search Integration
 * 
 * Provides a singleton Redis client instance for use across the application.
 * Supports versioned Redis instances for seamless rotation/cycling.
 * 
 * @author Victor Chimenti
 * @version 2.2.1
 * @namespace redisClient
 * @license MIT
 * @lastModified 2025-03-20
 */

const { createClient } = require('redis');

let redis;
let isConnecting = false;
let connectionPromise = null;

/**
 * Determines which Redis URL to use based on version-based environment variables
 * 
 * @returns {string|null} The Redis URL to use, or null if none available
 */
function getRedisUrl() {
  // If an active pointer is defined, use it (points to the variable name, not the value)
  if (process.env.REDIS_URL_ACTIVE) {
    return process.env[process.env.REDIS_URL_ACTIVE];
  }
  
  // Otherwise, try versioned URLs in descending order (newest first)
  // Add new versions here as they are created (V3, V4, etc.)
  if (process.env.REDIS_URL_V2) {
    return process.env.REDIS_URL_V2;
  }
  
  if (process.env.REDIS_URL_V1) {
    return process.env.REDIS_URL_V1;
  }
  
  // Legacy support for original implementation
  return process.env.REDIS_URL;
}

/**
 * Gets or initializes the Redis client and ensures connection
 * Supports versioned Redis URLs for instance rotation
 * 
 * @returns {Promise<Object|null>} Redis client instance or null if connection failed
 */
async function getRedisClient() {
  // Return existing client if already connected and ready
  if (redis && redis.isReady) {
    return redis;
  }
  
  // Get appropriate Redis URL based on versioning system
  const redisUrl = getRedisUrl();
  
  // Return null if no Redis URL is configured
  if (!redisUrl) {
    console.warn('No Redis URL environment variable is defined. Cache will be disabled.');
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
      console.log('Using Redis version identifier:', process.env.REDIS_URL_ACTIVE || 'default');
      
      // Create Redis client
      redis = createClient({
        url: redisUrl,
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
 * Gets Redis client connection status including version information
 * 
 * @returns {Object} Status object with connection details
 */
function getRedisStatus() {
  return {
    exists: !!redis,
    isReady: redis?.isReady || false,
    isConnecting,
    versionIdentifier: process.env.REDIS_URL_ACTIVE || 'default',
    hasUrl: !!getRedisUrl()
  };
}

module.exports = {
  getRedisClient,
  getRedisStatus
};
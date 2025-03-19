/**
 * @fileoverview Redis Client for Funnelback Search Integration
 * 
 * Provides a singleton Redis client instance for use across the application.
 * 
 * @author Victor Chimenti
 * @version 2.0.0
 * @namespace redisClient
 * @license MIT
 * @lastModified 2025-03-19
 */

const { createClient } = require('redis');

let redis;

/**
 * Gets or initializes the Redis client
 * 
 * @returns {Object} Redis client instance
 */
function getRedisClient() {
  if (!redis) {
    // Check if Redis URL is defined
    if (!process.env.REDIS_URL) {
      console.warn('REDIS_URL environment variable is not defined. Cache will be disabled.');
      return null;
    }
    
    // Create Redis client
    redis = createClient({
      url: process.env.REDIS_URL
    });
    
    // Handle connection events
    redis.on('error', (err) => console.error('Redis Client Error', err));
    redis.on('connect', () => console.log('Redis client connected'));
    redis.on('ready', () => console.log('Redis client ready'));
    redis.on('reconnecting', () => console.log('Redis client reconnecting'));
    redis.on('end', () => console.log('Redis client connection ended'));
    
    // Connect to Redis
    redis.connect().catch(err => {
      console.error('Failed to connect to Redis:', err);
      // Reset the client on connection failure so we can retry later
      redis = null;
    });
  }
  
  return redis;
}

module.exports = {
  getRedisClient
};
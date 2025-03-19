/**
 * @fileoverview Redis Cache Service for Funnelback Search Integration
 * 
 * Provides caching functionality using Redis to improve performance
 * and reduce latency for search and suggestion endpoints.
 * 
 * Features:
 * - Configurable TTL for different cache types
 * - Cache key generation based on query parameters
 * - Connection to Redis via redisClient
 * - Debug logging support
 * 
 * @author Victor Chimenti
 * @version 2.0.0
 * @namespace cacheService
 * @license MIT
 * @lastModified 2025-03-19
 */

const { getRedisClient } = require('./redisClient');

// Cache TTL configuration (in seconds)
const CACHE_TTL = {
  suggestions: 3600, // 1 hour for suggestions
  programs: 3600 * 24, // 24 hours for programs
  people: 3600 * 12, // 12 hours for people
  default: 1800 // 30 minutes default
};

/**
 * Checks if caching is enabled by verifying Redis client connection
 * 
 * @returns {boolean} Whether caching is enabled
 */
async function isCachingEnabled() {
  try {
    const redis = getRedisClient();
    return redis.isReady || await redis.ping() === 'PONG';
  } catch (error) {
    console.error('Redis connectivity check failed:', error);
    return false;
  }
}

/**
 * Generates a cache key based on endpoint and query parameters
 * 
 * @param {string} endpoint - The API endpoint (e.g., 'suggest', 'suggestPrograms')
 * @param {Object} params - The query parameters
 * @returns {string} A unique cache key
 */
function generateCacheKey(endpoint, params) {
  // Filter out session-specific parameters
  const relevantParams = { ...params };
  delete relevantParams.sessionId;
  
  // Sort keys for consistent ordering
  const sortedParams = Object.keys(relevantParams)
    .sort()
    .reduce((acc, key) => {
      acc[key] = relevantParams[key];
      return acc;
    }, {});
  
  // Create cache key
  return `${endpoint}:${JSON.stringify(sortedParams)}`;
}

/**
 * Gets data from cache if available
 * 
 * @param {string} endpoint - The API endpoint
 * @param {Object} params - The query parameters
 * @returns {Promise<Object|null>} The cached data or null if not found
 */
async function getCachedData(endpoint, params) {
  try {
    const redis = getRedisClient();
    if (!redis.isReady) {
      console.log('Redis client is not ready, skipping cache check');
      return null;
    }
    
    const cacheKey = generateCacheKey(endpoint, params);
    console.log(`Looking for cached data with key: ${cacheKey}`);
    
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      console.log(`Cache hit for ${cacheKey}`);
      try {
        return JSON.parse(cachedData);
      } catch (parseError) {
        console.error('Error parsing cached data:', parseError);
        return null;
      }
    }
    
    console.log(`Cache miss for ${cacheKey}`);
    return null;
  } catch (error) {
    console.error('Error getting cached data:', error);
    return null;
  }
}

/**
 * Sets data in cache with appropriate TTL
 * 
 * @param {string} endpoint - The API endpoint
 * @param {Object} params - The query parameters
 * @param {Object} data - The data to cache
 * @returns {Promise<boolean>} Whether the data was successfully cached
 */
async function setCachedData(endpoint, params, data) {
  try {
    const redis = getRedisClient();
    if (!redis.isReady) {
      console.log('Redis client is not ready, skipping cache set');
      return false;
    }
    
    const cacheKey = generateCacheKey(endpoint, params);
    // Determine TTL based on endpoint
    const ttl = CACHE_TTL[endpoint] || CACHE_TTL.default;
    
    console.log(`Caching data with key: ${cacheKey}, TTL: ${ttl}s`);
    const stringData = JSON.stringify(data);
    await redis.set(cacheKey, stringData, { EX: ttl });
    
    return true;
  } catch (error) {
    console.error('Error setting cached data:', error);
    return false;
  }
}

/**
 * Invalidates cache for a specific endpoint and query parameters
 * 
 * @param {string} endpoint - The API endpoint
 * @param {Object} params - The query parameters
 * @returns {Promise<boolean>} Whether the cache was successfully invalidated
 */
async function invalidateCache(endpoint, params) {
  try {
    const redis = getRedisClient();
    if (!redis.isReady) {
      console.log('Redis client is not ready, skipping cache invalidation');
      return false;
    }
    
    const cacheKey = generateCacheKey(endpoint, params);
    console.log(`Invalidating cache for key: ${cacheKey}`);
    await redis.del(cacheKey);
    
    return true;
  } catch (error) {
    console.error('Error invalidating cache:', error);
    return false;
  }
}

module.exports = {
  isCachingEnabled,
  getCachedData,
  setCachedData,
  invalidateCache
};
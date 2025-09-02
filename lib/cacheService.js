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
 * - Standardized debug logging support
 * 
 * Debug version with extra logging and error handling
 * 
 * @author Victor Chimenti
 * @version 3.0.1
 * @namespace cacheService
 * @license MIT
 * @lastModified 2025-09-02
 */

const { getRedisClient, getRedisStatus } = require('./redisClient');

// Cache TTL configuration (in seconds)
const CACHE_TTL = {
  suggestions: 14400,    // 4 hours for suggestions (extended from 1 hour)
  programs: 259200,      // 3 days for programs (extended from 1 day)
  people: 86400,         // 24 hours for people (extended from 12 hours)
  default: 1800          // 30 minutes default (unchanged)
};

/**
 * Logs cache operation details consistently across suggestion handlers
 * 
 * @param {string} operation - The cache operation ('check', 'hit', 'miss', 'set', 'error')
 * @param {string} endpoint - The endpoint name (e.g., 'suggestions', 'programs', 'people')
 * @param {string} cacheKey - The cache key being used
 * @param {Object} [metadata] - Additional metadata for the log
 */
function logCacheOperation(operation, endpoint, cacheKey, metadata = {}) {
  const timestamp = new Date().toISOString();
  const requestId = metadata.requestId || 'unknown';
  const query = metadata.query?.query || '[empty query]';

  const logMessage = {
    timestamp,
    service: `cache-${endpoint}`,
    operation,
    cacheKey,
    requestId,
    query: query?.length > 40 ? query.substring(0, 40) + '...' : query,
    ...metadata
  };

  console.log(`CACHE-LOG: ${JSON.stringify(logMessage)}`);
}

/**
 * Logs a cache check operation (before checking if key exists)
 * 
 * @param {string} endpoint - The endpoint name
 * @param {string} cacheKey - The cache key 
 * @param {Object} metadata - Additional metadata
 */
function logCacheCheck(endpoint, cacheKey, metadata = {}) {
  logCacheOperation('check', endpoint, cacheKey, metadata);
}

/**
 * Logs a cache hit operation (when data is found)
 * 
 * @param {string} endpoint - The endpoint name
 * @param {string} cacheKey - The cache key
 * @param {Object} metadata - Additional metadata
 */
function logCacheHit(endpoint, cacheKey, metadata = {}) {
  const enhancedMetadata = {
    ...metadata,
    dataSize: metadata.dataSize || 'unknown',
    processingTime: metadata.processingTime || 'unknown'
  };
  
  logCacheOperation('hit', endpoint, cacheKey, enhancedMetadata);
}

/**
 * Logs a cache miss operation (when data is not found)
 * 
 * @param {string} endpoint - The endpoint name
 * @param {string} cacheKey - The cache key
 * @param {Object} metadata - Additional metadata
 */
function logCacheMiss(endpoint, cacheKey, metadata = {}) {
  logCacheOperation('miss', endpoint, cacheKey, metadata);
}

/**
 * Logs a cache set operation (when storing data)
 * 
 * @param {string} endpoint - The endpoint name
 * @param {string} cacheKey - The cache key
 * @param {Object} metadata - Additional metadata
 */
function logCacheSet(endpoint, cacheKey, metadata = {}) {
  const enhancedMetadata = {
    ...metadata,
    ttl: metadata.ttl || 'default',
    dataSize: metadata.dataSize || 'unknown'
  };
  
  logCacheOperation('set', endpoint, cacheKey, enhancedMetadata);
}

/**
 * Logs a cache error operation (when an error occurs)
 * 
 * @param {string} endpoint - The endpoint name
 * @param {string} cacheKey - The cache key
 * @param {Object} metadata - Additional metadata
 */
function logCacheError(endpoint, cacheKey, metadata = {}) {
  const enhancedMetadata = {
    ...metadata,
    errorType: metadata.errorType || 'unknown',
    errorMessage: metadata.errorMessage || 'Unknown error'
  };
  
  logCacheOperation('error', endpoint, cacheKey, enhancedMetadata);
}

/**
 * Checks if caching is enabled by verifying Redis client connection
 * 
 * @returns {Promise<boolean>} Whether caching is enabled
 */
async function isCachingEnabled() {
  try {
    // Get current Redis status for logging
    const status = getRedisStatus();
    console.log('DEBUG - Redis status check:', status);
    
    // Try to get client and verify it's working
    const redis = await getRedisClient();
    if (!redis) {
      console.log('DEBUG - Redis client is not available');
      return false;
    }
    
    // Try a ping to make sure it's really connected
    try {
      const pingResult = await redis.ping();
      console.log('DEBUG - Redis ping result:', pingResult);
      return pingResult === 'PONG';
    } catch (pingError) {
      console.error('DEBUG - Redis ping failed:', pingError.message);
      return false;
    }
  } catch (error) {
    console.error('DEBUG - Redis connectivity check failed:', error);
    return false;
  }
}

/**
 * Generates a cache key based on endpoint and query parameters
 * FIXED: Now normalizes partial_query to query for consistent cache keys
 * 
 * @param {string} endpoint - The API endpoint (e.g., 'suggest', 'suggestPrograms')
 * @param {Object} params - The query parameters
 * @returns {string} A unique cache key
 */
function generateCacheKey(endpoint, params) {
  // Filter out session-specific parameters
  const relevantParams = { ...params };
  delete relevantParams.sessionId;
  
  // CACHE FIX: Normalize partial_query to query for suggestions to ensure consistent cache keys
  if (endpoint === 'suggestions' && relevantParams.partial_query && !relevantParams.query) {
    relevantParams.query = relevantParams.partial_query;
    delete relevantParams.partial_query;
  }
  
  // Sort keys for consistent ordering
  const sortedParams = Object.keys(relevantParams)
    .sort()
    .reduce((acc, key) => {
      acc[key] = relevantParams[key];
      return acc;
    }, {});
  
  // Create cache key
  const cacheKey = `${endpoint}:${JSON.stringify(sortedParams)}`;
  console.log(`DEBUG - Generated cache key: ${cacheKey}`);
  return cacheKey;
}

/**
 * Gets data from cache if available - Debug version with extra logging
 * 
 * @param {string} endpoint - The API endpoint
 * @param {Object} params - The query parameters
 * @param {string} [requestId] - Optional request ID for tracking
 * @returns {Promise<Object|null>} The cached data or null if not found
 */
async function getCachedData(endpoint, params, requestId = null) {
  console.log(`DEBUG - getCachedData called for ${endpoint}`, {
    requestId,
    paramsExist: !!params,
    queryLength: params?.query?.length
  });
  
  try {
    // Get Redis client with await to ensure connection is ready
    const redis = await getRedisClient();
    if (!redis) {
      console.log('DEBUG - Redis client not available in getCachedData');
      return null;
    }
    
    // Check if Redis is actually ready
    console.log(`DEBUG - Redis ready state:`, redis.isReady);
    if (!redis.isReady) {
      console.log('DEBUG - Redis client is not ready, skipping cache check');
      return null;
    }
    
    const cacheKey = generateCacheKey(endpoint, params);
    
    // Log cache check operation
    logCacheCheck(endpoint, cacheKey, { 
      requestId, 
      query: params 
    });
    
    console.log(`DEBUG - Attempting to get data for key: ${cacheKey}`);
    
    // Get data with timeout protection
    let cachedData;
    try {
      cachedData = await Promise.race([
        redis.get(cacheKey),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis get operation timed out')), 3000)
        )
      ]);
    } catch (timeoutError) {
      console.error('DEBUG - Redis get operation error:', timeoutError);
      return null;
    }
    
    console.log(`DEBUG - Cache lookup result:`, {
      found: !!cachedData,
      dataLength: cachedData?.length
    });
    
    if (cachedData) {
      // Calculate approximate data size
      const dataSize = Buffer.byteLength(cachedData, 'utf8');
      
      // Log cache hit operation
      logCacheHit(endpoint, cacheKey, {
        requestId,
        query: params,
        dataSize: `${Math.round(dataSize / 1024)}KB`
      });
      
      try {
        console.log(`DEBUG - Parsing cached data`);
        const parsedData = JSON.parse(cachedData);
        console.log(`DEBUG - Successfully parsed cached data`);
        return parsedData;
      } catch (parseError) {
        console.error(`DEBUG - Error parsing cached data:`, parseError);
        logCacheError(endpoint, cacheKey, {
          requestId,
          query: params,
          errorType: 'ParseError',
          errorMessage: parseError.message
        });
        return null;
      }
    }
    
    // Log cache miss operation
    logCacheMiss(endpoint, cacheKey, {
      requestId,
      query: params
    });
    
    return null;
  } catch (error) {
    console.error('DEBUG - Error in getCachedData:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Log cache error operation
    logCacheError(endpoint, generateCacheKey(endpoint, params), {
      requestId,
      query: params,
      errorType: error.name,
      errorMessage: error.message
    });
    
    return null;
  }
}

/**
 * Sets data in cache with appropriate TTL - Debug version with extra logging
 * 
 * @param {string} endpoint - The API endpoint
 * @param {Object} params - The query parameters
 * @param {Object} data - The data to cache
 * @param {string} [requestId] - Optional request ID for tracking
 * @returns {Promise<boolean>} Whether the data was successfully cached
 */
async function setCachedData(endpoint, params, data, requestId = null) {
  console.log(`DEBUG - setCachedData called for ${endpoint}`, {
    requestId,
    paramsExist: !!params,
    dataExists: !!data,
    dataType: typeof data
  });
  
  try {
    // Get Redis client with await to ensure connection is ready
    const redis = await getRedisClient();
    if (!redis) {
      console.log('DEBUG - Redis client not available in setCachedData');
      return false;
    }
    
    // Check if Redis is actually ready
    console.log(`DEBUG - Redis ready state:`, redis.isReady);
    if (!redis.isReady) {
      console.log('DEBUG - Redis client is not ready, skipping cache set');
      return false;
    }
    
    const cacheKey = generateCacheKey(endpoint, params);
    // Determine TTL based on endpoint
    const ttl = CACHE_TTL[endpoint] || CACHE_TTL.default;
    
    console.log(`DEBUG - Attempting to serialize data for key: ${cacheKey}`);
    let stringData;
    
    try {
      stringData = JSON.stringify(data);
      console.log(`DEBUG - Data serialized successfully, length: ${stringData.length}`);
    } catch (serializeError) {
      console.error(`DEBUG - Error serializing data:`, serializeError);
      logCacheError(endpoint, cacheKey, {
        requestId,
        query: params,
        errorType: 'SerializeError',
        errorMessage: serializeError.message
      });
      return false;
    }
    
    const dataSize = Buffer.byteLength(stringData, 'utf8');
    
    // Log cache set operation
    logCacheSet(endpoint, cacheKey, {
      requestId,
      query: params,
      ttl: `${ttl}s`,
      dataSize: `${Math.round(dataSize / 1024)}KB`
    });
    
    console.log(`DEBUG - Setting cache with TTL: ${ttl}s`);
    
    // Set cache with timeout protection
    try {
      await Promise.race([
        redis.set(cacheKey, stringData, { EX: ttl }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis set operation timed out')), 3000)
        )
      ]);
      console.log(`DEBUG - Cache set successfully`);
      return true;
    } catch (timeoutError) {
      console.error('DEBUG - Redis set operation error:', timeoutError);
      return false;
    }
  } catch (error) {
    console.error('DEBUG - Error in setCachedData:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Log cache error operation
    logCacheError(endpoint, generateCacheKey(endpoint, params), {
      requestId,
      query: params,
      errorType: error.name,
      errorMessage: error.message
    });
    
    return false;
  }
}

/**
 * Invalidates cache for a specific endpoint and query parameters
 * 
 * @param {string} endpoint - The API endpoint
 * @param {Object} params - The query parameters
 * @param {string} [requestId] - Optional request ID for tracking
 * @returns {Promise<boolean>} Whether the cache was successfully invalidated
 */
async function invalidateCache(endpoint, params, requestId = null) {
  try {
    const redis = await getRedisClient();
    if (!redis || !redis.isReady) {
      console.log('Redis client is not ready, skipping cache invalidation');
      return false;
    }
    
    const cacheKey = generateCacheKey(endpoint, params);
    
    // Log cache invalidation operation
    logCacheOperation('invalidate', endpoint, cacheKey, {
      requestId,
      query: params
    });
    
    await redis.del(cacheKey);
    
    return true;
  } catch (error) {
    // Log cache error operation
    logCacheError(endpoint, generateCacheKey(endpoint, params), {
      requestId,
      query: params,
      errorType: error.name,
      errorMessage: error.message
    });
    
    console.error('Error invalidating cache:', error);
    return false;
  }
}

module.exports = {
  isCachingEnabled,
  getCachedData,
  setCachedData,
  invalidateCache,
  logCacheOperation,
  logCacheCheck,
  logCacheHit,
  logCacheMiss,
  logCacheSet,
  logCacheError
};
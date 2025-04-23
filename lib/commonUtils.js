/**
 * @fileoverview Common Utilities for Funnelback Proxy
 * 
 * Provides standardized utilities for IP extraction, request ID generation,
 * session handling, and structured logging. This module serves as a single
 * source of truth for common functionality used across handlers.
 * 
 * Features:
 * - Consistent client IP extraction with prioritized sources
 * - Standardized request ID generation and validation
 * - Session ID extraction and generation
 * - Structured logging with standardized formats
 * - Request type detection (browser vs server-side)
 * 
 * @author Victor Chimenti
 * @version 1.0.0
 * @namespace commonUtils
 * @license MIT
 * @lastModified 2025-04-23
 */

const os = require('os');

/**
 * Extracts the most reliable client IP from request headers
 * Uses a consistent priority order to ensure deterministic results
 * 
 * @param {Object} req - Express request object
 * @returns {string} The best available client IP address
 */
function extractClientIp(req) {
  // Existing header takes precedence if already set by middleware
  if (req.headers['x-original-client-ip']) {
    return req.headers['x-original-client-ip'];
  }
  
  // Priority order for IP sources
  const clientIp = 
    req.headers['x-real-ip'] ||                                     // Vercel real IP
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||  // First in the x-forwarded-for chain
    req.headers['x-vercel-proxied-for'] ||                          // Vercel-specific header
    req.headers['x-vercel-forwarded-for'] ||                        // Another Vercel-specific header
    req.socket?.remoteAddress ||                                    // Direct socket connection
    'unknown';                                                      // Fallback value
  
  return clientIp;
}

/**
 * Logs detailed information about IP detection
 * 
 * @param {Object} req - Express request object 
 * @param {string} clientIp - The determined client IP
 * @param {string} handlerName - Name of the handler using this function
 * @param {string} [requestId] - Optional request ID for tracking
 */
function logIpDetection(req, clientIp, handlerName, requestId = null) {
  const reqId = requestId || getRequestId(req) || generateRequestId();
  
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: handlerName || 'common-utils',
    requestId: reqId,
    path: req.path || req.url,
    event: 'ip_detection',
    ipSources: {
      determinedClientIp: clientIp,
      xOriginalClientIp: req.headers['x-original-client-ip'],
      xRealIp: req.headers['x-real-ip'],
      xForwardedFor: req.headers['x-forwarded-for'],
      xVercelProxiedFor: req.headers['x-vercel-proxied-for'],
      xVercelForwardedFor: req.headers['x-vercel-forwarded-for'],
      socketRemoteAddress: req.socket?.remoteAddress
    },
    middlewareProcessed: req.headers['x-middleware-processed'] === 'true',
    userAgent: req.headers['user-agent'],
    isServerSideRequest: isServerSideRequest(req)
  }));
}

/**
 * Generates a new unique request ID
 * 
 * @returns {string} A new unique request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Gets the current request ID from headers or generates a new one
 * 
 * @param {Object} req - Express request object
 * @returns {string} The existing or new request ID
 */
function getRequestId(req) {
  return req.headers['x-request-id'] || 
         req.headers['x-vercel-id'] || 
         generateRequestId();
}

/**
 * Checks if the request appears to be from a server-side client
 * 
 * @param {Object} req - Express request object
 * @returns {boolean} Whether the request appears to be server-side
 */
function isServerSideRequest(req) {
  const userAgent = req.headers['user-agent'] || '';
  return userAgent.includes('axios') || 
         userAgent.includes('node-fetch') || 
         userAgent.includes('got') ||
         userAgent.includes('superagent') ||
         userAgent.includes('curl') ||
         (!req.headers.referer && userAgent.length < 50); // Heuristic for server requests
}

/**
 * Extracts or generates a session ID for the request
 * 
 * @param {Object} req - Express request object
 * @returns {Object} Session information including ID and source
 */
function extractSessionInfo(req) {
  // Check sources in priority order
  let sessionId = 
    req.query?.sessionId || 
    req.headers['x-session-id'] || 
    req.body?.sessionId;
  
  let source = sessionId ? 
    (req.query?.sessionId ? 'query_param' : 
     req.headers['x-session-id'] ? 'header' : 'body') : null;
  
  let wasGenerated = false;
  
  // Generate a session ID if none exists
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    source = 'generated';
    wasGenerated = true;
  }
  
  return { sessionId, source, wasGenerated };
}

/**
 * Sanitizes a session ID, handling various input formats
 * 
 * @param {any} sessionId - Raw session ID value from request
 * @returns {string|null} Sanitized session ID or null
 */
function sanitizeSessionId(sessionId) {
  if (!sessionId) {
    return null;
  }
  
  // Handle array case
  if (Array.isArray(sessionId)) {
    return sessionId[0] || null;
  }
  
  // Handle string case
  if (typeof sessionId === 'string') {
    return sessionId.trim() || null;
  }
  
  // For any other case, convert to string if possible
  return String(sessionId) || null;
}

/**
 * Logs session handling information
 * 
 * @param {Object} req - Express request object
 * @param {Object} sessionInfo - Session information object
 * @param {string} handlerName - Name of the handler using this function
 * @param {string} [requestId] - Optional request ID for tracking
 */
function logSessionHandling(req, sessionInfo, handlerName, requestId = null) {
  const reqId = requestId || getRequestId(req) || generateRequestId();
  
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: handlerName || 'common-utils',
    requestId: reqId,
    path: req.path || req.url,
    event: 'session_handling',
    session: {
      id: sessionInfo.sessionId,
      source: sessionInfo.source,
      wasGenerated: sessionInfo.wasGenerated
    },
    query: req.query?.query || null,
    referer: req.headers.referer,
    userAgent: req.headers['user-agent']
  }));
}

/**
 * Creates a standardized log event with consistent format
 * 
 * @param {string} level - Log level ('info', 'warn', 'error', 'debug')
 * @param {string} event - Event name/description
 * @param {string} handlerName - Name of the handler creating the log
 * @param {Object} data - Additional data to include
 * @returns {string} Stringified JSON log entry
 */
function createLogEntry(level, event, handlerName, data = {}) {
  const timestamp = new Date().toISOString();
  const requestId = data.requestId || 'unknown';
  const serverInfo = getServerInfo();
  
  const logEntry = {
    timestamp,
    service: handlerName,
    level,
    event,
    requestId,
    ...data,
    server: data.includeServerInfo ? serverInfo : undefined
  };
  
  // Remove undefined fields
  Object.keys(logEntry).forEach(key => {
    if (logEntry[key] === undefined) {
      delete logEntry[key];
    }
  });
  
  return JSON.stringify(logEntry);
}

/**
 * Logs an event using the standardized format
 * 
 * @param {string} level - Log level ('info', 'warn', 'error', 'debug')
 * @param {string} event - Event name/description
 * @param {string} handlerName - Name of the handler creating the log
 * @param {Object} data - Additional data to include
 */
function logEvent(level, event, handlerName, data = {}) {
  console.log(createLogEntry(level, event, handlerName, data));
}

/**
 * Gets standardized server information
 * 
 * @param {boolean} [detailed=false] - Whether to include detailed information
 * @returns {Object} Standardized server information
 */
function getServerInfo(detailed = false) {
  const basic = {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch()
  };
  
  if (detailed) {
    return {
      ...basic,
      cpus: os.cpus().length,
      memory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB',
      loadAvg: os.loadavg(),
      uptime: os.uptime()
    };
  }
  
  return basic;
}

/**
 * Extracts location data from request headers or provided object
 * 
 * @param {Object} req - Express request object
 * @param {Object} [locationData] - Optional explicit location data to use
 * @returns {Object} Standardized location data
 */
function extractLocationData(req, locationData = null) {
  if (locationData) {
    return {
      city: locationData.city || null,
      region: locationData.region || null,
      country: locationData.country || null,
      timezone: locationData.timezone || null,
      latitude: locationData.latitude || null,
      longitude: locationData.longitude || null
    };
  }
  
  // Extract from Vercel headers
  return {
    city: req.headers['x-vercel-ip-city'] ? 
          decodeURIComponent(req.headers['x-vercel-ip-city']) : null,
    region: req.headers['x-vercel-ip-country-region'] || null,
    country: req.headers['x-vercel-ip-country'] || null,
    timezone: req.headers['x-vercel-ip-timezone'] || null,
    latitude: req.headers['x-vercel-ip-latitude'] || null,
    longitude: req.headers['x-vercel-ip-longitude'] || null
  };
}

/**
 * Adds common error handling and provides useful context
 * 
 * @param {Error} error - The error object
 * @param {string} handlerName - Name of the handler where error occurred
 * @param {string} context - Additional context about the error
 * @param {string} [requestId] - Optional request ID for tracking
 * @returns {Object} Structured error information
 */
function formatError(error, handlerName, context, requestId = null) {
  const reqId = requestId || 'unknown';
  
  const errorInfo = {
    timestamp: new Date().toISOString(),
    service: handlerName,
    requestId: reqId,
    context,
    error: {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }
  };
  
  // Log the error
  console.error(JSON.stringify(errorInfo));
  
  // Return a client-safe version
  return {
    error: true,
    message: error.message,
    context,
    requestId: reqId,
    status: error.status || 500
  };
}

/**
 * Sets consistent CORS headers for all responses
 * 
 * @param {Object} res - Express response object
 * @param {boolean} [isAnalyticsEndpoint=false] - Whether endpoint is an analytics endpoint
 */
function setCorsHeaders(res, isAnalyticsEndpoint = false) {
  // Base CORS headers for all endpoints
  res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  
  // Add analytics-specific headers if needed
  if (isAnalyticsEndpoint) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Origin');
  } else {
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Origin');
  }
}

module.exports = {
  extractClientIp,
  logIpDetection,
  generateRequestId,
  getRequestId,
  isServerSideRequest,
  extractSessionInfo,
  sanitizeSessionId,
  logSessionHandling,
  createLogEntry,
  logEvent,
  getServerInfo,
  extractLocationData,
  formatError,
  setCorsHeaders
};
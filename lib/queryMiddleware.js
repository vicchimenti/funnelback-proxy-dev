/**
 * @fileoverview Query Middleware for Funnelback Proxy
 * 
 * This middleware integrates the query analytics system with your existing
 * Funnelback proxy servers. It extracts relevant information from requests
 * and responses to track search behavior without modifying your existing handlers.
 * 
 * Features:
 * - Non-intrusive integration with existing handlers
 * - Captures query data and response metrics
 * - Handles errors gracefully
 * - Configurable tracking options
 * - Enhanced IP detection and session tracking
 * - Detailed logging of request sources and context
 * 
 * @author Victor Chimenti
 * @version 2.0.1
 * @namespace queryMiddleware
 * @license MIT
 * @lastmodified 2025-04-22
 */

const { recordQuery } = require('./queryAnalytics');

/**
 * Extracts the most reliable client IP from request headers
 * Uses a consistent priority order to ensure deterministic results
 * 
 * @param {Object} req - Express request object
 * @returns {string} The best available client IP address
 * @private
 */
function extractClientIp(req) {
  // Priority order for IP sources
  const clientIp = 
    req.headers['x-original-client-ip'] ||                          // Trust middleware value if available
    req.headers['x-real-ip'] ||                                     // Vercel real IP
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||  // First in the x-forwarded-for chain
    req.headers['x-vercel-proxied-for'] ||                          // Vercel-specific header
    req.headers['x-vercel-forwarded-for'] ||                        // Another Vercel-specific header
    req.socket.remoteAddress ||                                     // Direct socket connection
    'unknown';                                                      // Fallback value
  
  return clientIp;
}

/**
 * Logs detailed information about IP detection
 * 
 * @param {Object} req - Express request object 
 * @param {string} clientIp - The determined client IP
 * @param {string} handlerName - Name of the handler using this middleware
 * @private
 */
function logIpDetection(req, clientIp, handlerName) {
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'query-middleware',
    handler: handlerName,
    requestId,
    path: req.path,
    event: 'ip_detection',
    ipSources: {
      determinedClientIp: clientIp,
      xOriginalClientIp: req.headers['x-original-client-ip'],
      xRealIp: req.headers['x-real-ip'],
      xForwardedFor: req.headers['x-forwarded-for'],
      xVercelProxiedFor: req.headers['x-vercel-proxied-for'],
      xVercelForwardedFor: req.headers['x-vercel-forwarded-for'],
      socketRemoteAddress: req.socket.remoteAddress
    },
    middlewareProcessed: req.headers['x-middleware-processed'] === 'true',
    userAgent: req.headers['user-agent'],
    isServerSideRequest: isServerSideRequest(req)
  }));
}

/**
 * Checks if the request appears to be from a server-side client
 * 
 * @param {Object} req - Express request object
 * @returns {boolean} Whether the request appears to be server-side
 * @private
 */
function isServerSideRequest(req) {
  const userAgent = req.headers['user-agent'] || '';
  return userAgent.includes('axios') || 
         userAgent.includes('node-fetch') || 
         userAgent.includes('got') ||
         userAgent.includes('superagent') ||
         (!req.headers.referer && userAgent.length < 50); // Heuristic for server requests
}

/**
 * Extracts or generates a session ID for the request
 * 
 * @param {Object} req - Express request object
 * @returns {Object} Session information including ID and source
 * @private
 */
function extractSessionId(req) {
  // Check sources in priority order
  let sessionId = 
    req.query.sessionId || 
    req.headers['x-session-id'] || 
    req.body?.sessionId;
  
  let source = sessionId ? 
    (req.query.sessionId ? 'query_param' : 
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
 * Logs session handling information
 * 
 * @param {Object} req - Express request object
 * @param {Object} sessionInfo - Session information object
 * @param {string} handlerName - Name of the handler using this middleware
 * @private
 */
function logSessionHandling(req, sessionInfo, handlerName) {
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'query-middleware',
    handler: handlerName,
    requestId,
    path: req.path,
    event: 'session_handling',
    session: {
      id: sessionInfo.sessionId,
      source: sessionInfo.source,
      wasGenerated: sessionInfo.wasGenerated
    },
    query: req.query.query || null,
    referer: req.headers.referer,
    userAgent: req.headers['user-agent']
  }));
}

/**
 * Middleware function to track query analytics
 * This should be added to each handler
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.handler - Name of the handler using this middleware
 * @returns {Function} Express middleware function
 */
function trackQuery(options = {}) {
  const handlerName = options.handler || 'unknown';
  
  return async (req, res, next) => {
    const startTime = Date.now();
    const originalSend = res.send;
    let resultCount = 0;
    let responseData = null;
    let errorOccurred = false;
    let errorMessage = '';
    let errorStatus = 0;
    
    // Generate a request ID if not already set by middleware
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Extract client IP with consistent logic
    const clientIp = extractClientIp(req);
    logIpDetection(req, clientIp, handlerName);
    
    // Extract or generate session ID
    const sessionInfo = extractSessionId(req);
    logSessionHandling(req, sessionInfo, handlerName);
    
    // Log basic request information
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'query-middleware',
      handler: handlerName,
      requestId,
      event: 'request_received',
      method: req.method,
      path: req.path,
      query: req.query.query || null,
      isServerSide: isServerSideRequest(req)
    }));
    
    // Extract relevant request data
    const queryData = {
      handler: handlerName,
      query: req.query.query || '',
      collection: req.query.collection || 'seattleu~sp-search',
      userAgent: req.headers['user-agent'],
      referer: req.headers.referer,
      city: decodeURIComponent(req.headers['x-vercel-ip-city'] || ''),
      region: req.headers['x-vercel-ip-country-region'],
      country: req.headers['x-vercel-ip-country'],
      timezone: req.headers['x-vercel-ip-timezone'],
      isProgramTab: !!req.query['f.Tabs|programMain'],
      isStaffTab: !!req.query['f.Tabs|seattleu~ds-staff'],
      sessionId: sessionInfo.sessionId,
      tabs: [],
      clientIp: clientIp,
      requestId: requestId,
      isServerSideRequest: isServerSideRequest(req)
    };
    
    // Add tabs information
    if (queryData.isProgramTab) queryData.tabs.push('program-main');
    if (queryData.isStaffTab) queryData.tabs.push('Faculty & Staff');
    
    // Add filter information
    queryData.filters = {};
    Object.keys(req.query).forEach(key => {
      if (key.startsWith('f.')) {
        queryData.filters[key] = req.query[key];
      }
    });
    
    // Check if this is a refinement query
    if (req.headers.referer && req.headers.referer.includes('query=')) {
      queryData.isRefinement = true;
      try {
        const refererUrl = new URL(req.headers.referer);
        queryData.originalQuery = refererUrl.searchParams.get('query') || '';
      } catch (e) {
        // Ignore errors in parsing referer
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'query-middleware',
          handler: handlerName,
          requestId,
          event: 'referer_parse_error',
          error: e.message,
          referer: req.headers.referer
        }));
      }
    }
    
    // Override res.send to capture response data
    res.send = function(data) {
      responseData = data;
      
      // Try to determine result count from response based on handler type
      try {
        if (handlerName === 'suggest' || handlerName === 'suggestPeople') {
          // For suggestion endpoints, the response is usually an array
          if (Array.isArray(data)) {
            resultCount = data.length;
          } else if (typeof data === 'string') {
            // Try to parse if it's a JSON string
            const parsed = JSON.parse(data);
            resultCount = Array.isArray(parsed) ? parsed.length : 0;
          }
        } else if (handlerName === 'suggestPrograms') {
          // For program suggestions, check the programs array
          if (typeof data === 'string') {
            const parsed = JSON.parse(data);
            resultCount = parsed.programs ? parsed.programs.length : 0;
          } else if (data.programs) {
            resultCount = data.programs.length;
          }
        } else if (handlerName === 'search' || handlerName === 'server') {
          // For search endpoints, try to extract from HTML response
          // This is more complex and might need regex patterns
          if (typeof data === 'string' && data.includes('resultsSummary')) {
            const match = data.match(/totalMatching">([0-9,]+)</);
            if (match && match[1]) {
              resultCount = parseInt(match[1].replace(/,/g, ''), 10);
            }
          }
        }
      } catch (error) {
        console.error('Error parsing response data for analytics:', error);
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'query-middleware',
          handler: handlerName,
          requestId,
          event: 'response_parse_error',
          error: error.message
        }));
      }
      
      // Complete analytics data
      queryData.responseTime = Date.now() - startTime;
      queryData.resultCount = resultCount;
      queryData.error = {
        occurred: errorOccurred,
        message: errorMessage,
        status: errorStatus
      };
      
      // Log response data
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'query-middleware',
        handler: handlerName,
        requestId,
        event: 'response_processed',
        query: queryData.query,
        responseTime: queryData.responseTime,
        resultCount,
        hasError: errorOccurred
      }));
      
      // Record the query asynchronously (don't wait for it)
      recordQuery(queryData).catch(err => {
        console.error('Error recording query analytics:', err);
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'query-middleware',
          handler: handlerName,
          requestId,
          event: 'analytics_record_error',
          error: err.message
        }));
      });
      
      // Call the original send
      return originalSend.call(this, data);
    };
    
    // Override res.status to capture error status
    const originalStatus = res.status;
    res.status = function(code) {
      if (code >= 400) {
        errorOccurred = true;
        errorStatus = code;
        
        console.log(JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'query-middleware',
          handler: handlerName,
          requestId,
          event: 'error_status',
          status: code,
          query: queryData.query
        }));
      }
      return originalStatus.call(this, code);
    };
    
    // Continue with the request
    try {
      next();
    } catch (error) {
      errorOccurred = true;
      errorMessage = error.message;
      errorStatus = 500;
      
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'query-middleware',
        handler: handlerName,
        requestId,
        event: 'handler_error',
        error: error.message,
        stack: error.stack
      }));
      
      throw error; // Re-throw to be handled by your error handler
    }
  };
}

module.exports = {
  trackQuery
};
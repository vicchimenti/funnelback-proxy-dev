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
 * 
 * @author Victor Chimenti
 * @version 1.1.0
 * @namespace queryMiddleware
 * @license MIT
 * @lastmodified 2025-03-18
 */

const { recordQuery } = require('./queryAnalytics');

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
      tabs: [],
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
      }
      
      // Complete analytics data
      queryData.responseTime = Date.now() - startTime;
      queryData.resultCount = resultCount;
      queryData.error = {
        occurred: errorOccurred,
        message: errorMessage,
        status: errorStatus
      };
      
      // Record the query asynchronously (don't wait for it)
      recordQuery(queryData).catch(err => {
        console.error('Error recording query analytics:', err);
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
      throw error; // Re-throw to be handled by your error handler
    }
  };
}

module.exports = {
  trackQuery
};
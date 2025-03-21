/**
 * @fileoverview Edge Middleware for Funnelback Search Integration
 * 
 * This middleware intercepts requests before they reach the API handlers and
 * provides critical infrastructure-level functionality:
 * 
 * - Rate limiting to prevent abuse and DDoS attacks
 * - IP address preservation for accurate analytics
 * - Session ID generation and tracking
 * - Request header augmentation
 * 
 * The middleware uses different rate limits for different endpoint types,
 * with higher limits for suggestion endpoints that are called during typing
 * and lower limits for admin dashboard functions. It preserves the original
 * client IP in a custom header and ensures every request has a session ID
 * either from URL parameters or by generating a new one.
 * 
 * For security and scalability reasons, all rate limiting is performed
 * at the edge before requests reach serverless functions.
 * 
 * @author Victor Chimenti
 * @version 2.1.1
 * @environment development
 * @status in-progress
 * @lastModified 2025-03-21
 * @module middleware
 * @license MIT
 */

/**
 * In-memory cache mapping IP addresses to their rate limiting data
 * @type {Map<string, Object>}
 * @private
 */
const ipCache = new Map();

/**
 * Time window for rate limiting in milliseconds
 * @type {number}
 * @constant
 * @private
 */
const WINDOW_MS = 60 * 1000; // 1 minute

/**
 * Rate limits for different endpoint types (requests per minute)
 * @type {Object}
 * @property {number} search - Limit for search endpoints
 * @property {number} suggest - Limit for suggestion endpoints (higher to support typing)
 * @property {number} suggestPeople - Limit for people suggestion endpoints 
 * @property {number} suggestPrograms - Limit for programs suggestion endpoints
 * @property {number} analytics - Limit for analytics collection endpoints
 * @property {number} default - Default limit for all other endpoints
 * @constant
 * @private
 */
const LIMITS = {
  search: 60,           // Search endpoints
  suggest: 60,          // General suggestion endpoints
  suggestPeople: 60,    // People suggestion endpoints
  suggestPrograms: 60,  // Program suggestion endpoints
  analytics: 50,        // Analytics endpoints
  default: 30           // Default for any other endpoints
};

/**
 * Cleans up expired entries from the IP cache
 * This helps prevent memory leaks in long-running edge functions
 * 
 * @private
 * @function
 * @returns {void}
 */
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of ipCache.entries()) {
    if (now > value.resetTime) {
      ipCache.delete(key);
    }
  }
}

/**
 * Middleware function that processes requests at the edge
 * 
 * @param {Request} request - The incoming request object
 * @returns {Promise<Response>} The modified response
 */
export default async function middleware(request) {
  // Clean up expired entries
  cleanupCache();
  
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Handle OPTIONS requests specially to maintain CORS
  if (request.method === 'OPTIONS') {
    return fetch(request);
  }

  // Extract client IP from various headers, prioritizing the most likely to be accurate
  const clientIp = request.headers.get('x-real-ip') || 
                   request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 
                   'unknown';
  
  const now = Date.now();
  
  // Determine appropriate rate limit based on endpoint type
  let rateLimit = LIMITS.default;

  if (path.includes('/proxy/funnelback/suggest')) {
    rateLimit = LIMITS.suggest;
  } else if (path.includes('/proxy/suggestPeople')) {
    rateLimit = LIMITS.suggestPeople;
  } else if (path.includes('/proxy/suggestPrograms')) {
    rateLimit = LIMITS.suggestPrograms;
  } else if (path.includes('/proxy/funnelback/search') || path.includes('/proxy/funnelback/spelling')) {
    rateLimit = LIMITS.search;
  } else if (path.includes('/proxy/analytics') || path.includes('/api/analytics')) {
    rateLimit = LIMITS.analytics;
  }

  // Initialize or get current rate limit data
  if (!ipCache.has(clientIp)) {
    ipCache.set(clientIp, {
      count: 0,
      resetTime: now + WINDOW_MS
    });
  }
  
  const rateData = ipCache.get(clientIp);
  
  // Reset counter if time window has elapsed
  if (now > rateData.resetTime) {
    rateData.count = 0;
    rateData.resetTime = now + WINDOW_MS;
  }
  
  // Increment counter
  rateData.count++;
  
  // Check if rate limit is exceeded
  if (rateData.count > rateLimit) {
    const response = new Response(JSON.stringify({
      error: 'Too many requests',
      retryAfter: Math.ceil((rateData.resetTime - now) / 1000)
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil((rateData.resetTime - now) / 1000).toString()
      }
    });
    
    // Add CORS headers to error responses
    if (path.includes('/proxy/analytics')) {
      response.headers.set('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
      response.headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
      response.headers.set('Access-Control-Allow-Credentials', 'true');
      response.headers.set('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Origin');
    } else {
      // Default CORS headers for other paths
      response.headers.set('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Origin');
    }
    
    return response;
  }
  
  // Clone the request with the original client IP preserved
  const requestHeaders = new Headers(request.headers);
  
  // Explicitly set clean headers for downstream functions
  requestHeaders.set('x-original-client-ip', clientIp);
  
  // Preserve any sessionId in the URL parameters
  if (url.searchParams.has('sessionId')) {
    requestHeaders.set('x-session-id', url.searchParams.get('sessionId'));
  } else if (!url.searchParams.has('sessionId')) {
    // Generate a unique session ID if one doesn't exist
    const generatedSessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;    
    requestHeaders.set('x-session-id', generatedSessionId);
  }
  
  // Create a new request with modified headers
  const newRequest = new Request(url, {
    method: request.method,
    headers: requestHeaders,
    body: request.body,
    redirect: request.redirect,
    signal: request.signal
  });
  
  // For successful requests, proceed with the modified request
  const response = await fetch(newRequest);
  
  // Clone the response to modify headers
  const newResponse = new Response(response.body, response);
  
  // Add rate limit information to headers
  newResponse.headers.set('X-RateLimit-Limit', rateLimit.toString());
  newResponse.headers.set('X-RateLimit-Remaining', (rateLimit - rateData.count).toString());
  newResponse.headers.set('X-RateLimit-Reset', rateData.resetTime.toString());
  
  return newResponse;
}

/**
 * Configuration for which paths the middleware should apply to
 * Uses Vercel's matcher syntax to specify path patterns
 * 
 * @type {Object}
 * @property {Array<string>} matcher - Array of path patterns to match
 */
export const config = {
  matcher: [
    // All API endpoints
    '/proxy/:path*',
    '/api/:path*'
  ]
};

// middleware.js
const ipCache = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute

// Different rate limits for different endpoint types
const LIMITS = {
  search: 30,     // Search endpoints
  suggest: 60,    // Suggestion endpoints (higher limit for typing)
  analytics: 50,  // Analytics endpoints
  dashboard: 20,  // Admin dashboard endpoints
  default: 30     // Default for any other endpoints
};

// We'll manually clean the cache after each request
// since we can't use setInterval in edge functions
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of ipCache.entries()) {
    if (now > value.resetTime) {
      ipCache.delete(key);
    }
  }
}

export default async function middleware(request) {
  // Clean up expired entries
  cleanupCache();
  
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Handle OPTIONS requests (preflight) specially to maintain CORS
  if (request.method === 'OPTIONS') {
    // Let the actual handlers deal with OPTIONS requests
    return fetch(request);
  }
  
  // Get client IP
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  
  // Determine appropriate rate limit based on endpoint type
  let rateLimit = LIMITS.default;
  
  if (path.includes('/proxy/funnelback/suggest') || path.includes('/proxy/suggestPeople') || path.includes('/proxy/suggestPrograms')) {
    rateLimit = LIMITS.suggest;
  } else if (path.includes('/proxy/funnelback/search') || path.includes('/proxy/funnelback/spelling')) {
    rateLimit = LIMITS.search;
  } else if (path.includes('/proxy/analytics') || path.includes('/api/analytics')) {
    rateLimit = LIMITS.analytics;
  } else if (path.includes('/dashboard') || path.includes('/api/queryCount')) {
    rateLimit = LIMITS.dashboard;
  }
  
  // Initialize or get current rate limit data
  if (!ipCache.has(ip)) {
    ipCache.set(ip, {
      count: 0,
      resetTime: now + WINDOW_MS
    });
  }
  
  const rateData = ipCache.get(ip);
  
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
  
  // For successful requests, proceed with the original request
  const response = await fetch(request);
  
  // Clone the response to be able to modify headers
  const newResponse = new Response(response.body, response);
  
  // Add rate limit information to headers without disturbing existing ones
  newResponse.headers.set('X-RateLimit-Limit', rateLimit.toString());
  newResponse.headers.set('X-RateLimit-Remaining', (rateLimit - rateData.count).toString());
  newResponse.headers.set('X-RateLimit-Reset', rateData.resetTime.toString());
  
  return newResponse;
}

// Configure which paths to apply the middleware to
export const config = {
  matcher: [
    // All API endpoints
    '/proxy/:path*',
    '/api/:path*',
    '/dashboard/:path*'
  ]
};
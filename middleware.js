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
 * @version 3.1.0
 * @environment development
 * @status in-progress
 * @lastModified 2025-04-25
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
  search: 60, // Search endpoints
  suggest: 60, // General suggestion endpoints
  suggestPeople: 60, // People suggestion endpoints
  suggestPrograms: 60, // Program suggestion endpoints
  analytics: 50, // Analytics endpoints
  default: 30, // Default for any other endpoints
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
 * Logs detailed information about IP sources for debugging
 *
 * @param {Request} request - The incoming request object
 * @param {string} clientIp - The determined client IP
 * @param {string} requestId - Unique identifier for the request
 * @private
 */
function logIpSources(request, clientIp, requestId) {
  const allHeaders = {};
  request.headers.forEach((value, key) => {
    if (
      key.toLowerCase().includes("ip") ||
      key.toLowerCase().includes("forward") ||
      key.toLowerCase().includes("real") ||
      key.toLowerCase().includes("client")
    ) {
      allHeaders[key] = value;
    }
  });

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "edge-middleware",
      requestId,
      path: new URL(request.url).pathname,
      ipSourceDetails: {
        clientIpDetermined: clientIp,
        ipSourcePriority: [
          "x-client-ip", // Some CDNs add this
          "cf-connecting-ip", // Cloudflare
          "x-real-ip", // Vercel, Nginx
          "x-forwarded-for", // Standard header, first value is client IP
          "x-vercel-proxied-for", // Vercel-specific header
          "x-vercel-forwarded-for", // Another Vercel-specific header
        ],
      },
      allIpHeaders: allHeaders,
      userAgent: request.headers.get("user-agent"),
    })
  );

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "edge-middleware",
    requestId,
    path: new URL(request.url).pathname,
    ipSources: {
      determinedClientIp: clientIp,
      headers: {
        xClientIp: request.headers.get('x-client-ip'),
        cfConnectingIp: request.headers.get('cf-connecting-ip'),
        xRealIp: request.headers.get('x-real-ip'),
        xForwardedFor: request.headers.get('x-forwarded-for'),
        xVercelProxiedFor: request.headers.get('x-vercel-proxied-for'),
        xVercelForwardedFor: request.headers.get('x-vercel-forwarded-for'),
        socketRemoteAddress: request.socket?.remoteAddress
      },
      userAgent: request.headers.get('user-agent')
    }
  }));


}

/**
 * Extracts the client IP from the request headers with improved extraction logic
 *
 * @param {Request} request - The incoming request
 * @returns {string} The extracted client IP
 * @private
 */
function extractClientIp(request) {
  // Enhanced extraction with clear priority order
  // This is critical - we must extract the true client IP, not server IPs
  const clientIp =
    request.headers.get("x-client-ip") || // Some CDNs add this
    request.headers.get("cf-connecting-ip") || // Cloudflare
    request.headers.get("x-real-ip") || // Vercel, Nginx
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() || // Standard header, first value is client IP
    request.headers.get("x-vercel-proxied-for") || // Vercel-specific header
    request.headers.get("x-vercel-forwarded-for") || // Another Vercel-specific header
    "unknown";

  return clientIp;
}

/**
 * Logs session information for tracking
 *
 * @param {Request} request - The incoming request object
 * @param {string} sessionId - The session ID (existing or generated)
 * @param {boolean} wasGenerated - Whether the session ID was just generated
 * @param {string} requestId - Unique identifier for the request
 * @private
 */
function logSessionInfo(request, sessionId, wasGenerated, requestId) {
  const url = new URL(request.url);

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "edge-middleware",
      requestId,
      path: url.pathname,
      session: {
        id: sessionId,
        source: wasGenerated
          ? "generated"
          : url.searchParams.has("sessionId")
            ? "url_param"
            : request.headers.get("x-session-id")
              ? "header"
              : "unknown",
        wasGenerated,
      },
      referer: request.headers.get("referer"),
      userAgent: request.headers.get("user-agent"),
    })
  );
}

/**
 * Middleware function that processes requests at the edge
 *
 * @param {Request} request - The incoming request object
 * @returns {Promise<Response>} The modified response
 */
export default async function middleware(request) {
  // Generate request ID for tracing
  const requestId = `req_${Date.now()}_${Math.random()
    .toString(36)
    .substring(2, 10)}`;

  // Clean up expired entries
  cleanupCache();

  const url = new URL(request.url);
  const path = url.pathname;

  // Handle OPTIONS requests specially to maintain CORS
  if (request.method === "OPTIONS") {
    return fetch(request);
  }

  // Start with logging the incoming request
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "edge-middleware",
      requestId,
      event: "request_received",
      method: request.method,
      path,
      query: Object.fromEntries(url.searchParams),
    })
  );

  // CRITICAL: Extract the true client IP using enhanced extraction
  const clientIp = extractClientIp(request);

  // Log detailed IP source information
  logIpSources(request, clientIp, requestId);

  const now = Date.now();

  // Determine appropriate rate limit based on endpoint type
  let rateLimit = LIMITS.default;

  if (path.includes("/proxy/funnelback/suggest")) {
    rateLimit = LIMITS.suggest;
  } else if (path.includes("/proxy/suggestPeople")) {
    rateLimit = LIMITS.suggestPeople;
  } else if (path.includes("/proxy/suggestPrograms")) {
    rateLimit = LIMITS.suggestPrograms;
  } else if (
    path.includes("/proxy/funnelback/search") ||
    path.includes("/proxy/funnelback/spelling")
  ) {
    rateLimit = LIMITS.search;
  } else if (
    path.includes("/proxy/analytics") ||
    path.includes("/api/analytics")
  ) {
    rateLimit = LIMITS.analytics;
  }

  // Initialize or get current rate limit data
  if (!ipCache.has(clientIp)) {
    ipCache.set(clientIp, {
      count: 0,
      resetTime: now + WINDOW_MS,
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
    const response = new Response(
      JSON.stringify({
        error: "Too many requests",
        retryAfter: Math.ceil((rateData.resetTime - now) / 1000),
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": Math.ceil(
            (rateData.resetTime - now) / 1000
          ).toString(),
        },
      }
    );

    // Add CORS headers to error responses
    if (path.includes("/proxy/analytics")) {
      response.headers.set(
        "Access-Control-Allow-Origin",
        "https://www.seattleu.edu"
      );
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET,OPTIONS,PATCH,DELETE,POST,PUT"
      );
      response.headers.set("Access-Control-Allow-Credentials", "true");
      response.headers.set(
        "Access-Control-Allow-Headers",
        "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Origin"
      );
    } else {
      // Default CORS headers for other paths
      response.headers.set(
        "Access-Control-Allow-Origin",
        "https://www.seattleu.edu"
      );
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Origin"
      );
    }

    // Log rate limit exceeded
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "edge-middleware",
        requestId,
        event: "rate_limit_exceeded",
        clientIp,
        path,
        rateLimit,
        currentCount: rateData.count,
        resetTime: new Date(rateData.resetTime).toISOString(),
      })
    );

    return response;
  }

  // Clone the request with the original client IP preserved
  const requestHeaders = new Headers(request.headers);

  // CRITICAL: Set clean headers for downstream functions
  // This ensures consistent IP handling across all handlers
  requestHeaders.set("x-original-client-ip", clientIp);
  requestHeaders.set("x-middleware-processed", "true");
  requestHeaders.set("x-request-id", requestId);

  // Add redundant IP headers to ensure downstream functions have access
  // to the true client IP regardless of which header they check
  requestHeaders.set("x-client-ip", clientIp);
  requestHeaders.set("x-real-ip", clientIp);

  // Preserve the original x-forwarded-for header if it exists, but ensure
  // our actual client IP is always the first value
  const originalXForwardedFor = request.headers.get("x-forwarded-for");
  if (originalXForwardedFor) {
    // Preserve the chain but ensure our client IP is the first value
    if (!originalXForwardedFor.includes(clientIp)) {
      requestHeaders.set(
        "x-forwarded-for",
        `${clientIp}, ${originalXForwardedFor}`
      );
    } else {
      requestHeaders.set("x-forwarded-for", originalXForwardedFor);
    }
  } else {
    requestHeaders.set("x-forwarded-for", clientIp);
  }

  // Session ID management with logging
  let sessionId;
  let sessionGenerated = false;

  // Preserve any sessionId in the URL parameters
  if (url.searchParams.has("sessionId")) {
    sessionId = url.searchParams.get("sessionId");
    requestHeaders.set("x-session-id", sessionId);
  } else if (request.headers.has("x-session-id")) {
    // Use existing session ID from header if present
    sessionId = request.headers.get("x-session-id");
  } else {
    // Generate a unique session ID if one doesn't exist
    sessionId = `sess_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 10)}`;
    sessionGenerated = true;
    requestHeaders.set("x-session-id", sessionId);
  }

  // Log session handling information
  logSessionInfo(request, sessionId, sessionGenerated, requestId);

  // If request appears to be from server-side (axios, etc.), log it specially
  const userAgent = request.headers.get("user-agent") || "";
  if (
    userAgent.includes("axios") ||
    userAgent.includes("node-fetch") ||
    userAgent.includes("got") ||
    userAgent.includes("superagent")
  ) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "edge-middleware",
        requestId,
        event: "server_side_request_detected",
        userAgent,
        clientIp,
        sessionId,
        path,
      })
    );
  }

  // Create a new request with modified headers
  const newRequest = new Request(url, {
    method: request.method,
    headers: requestHeaders,
    body: request.body,
    redirect: request.redirect,
    signal: request.signal,
  });

  // Log the modified request
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "edge-middleware",
      requestId,
      event: "request_modified",
      modifiedHeaders: {
        "x-original-client-ip": clientIp,
        "x-client-ip": clientIp,
        "x-real-ip": clientIp,
        "x-middleware-processed": "true",
        "x-request-id": requestId,
        "x-session-id": sessionId,
      },
    })
  );

  // For successful requests, proceed with the modified request
  const response = await fetch(newRequest);

  // Log response status
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "edge-middleware",
      requestId,
      event: "response_received",
      status: response.status,
      path,
    })
  );

  // Clone the response to modify headers
  const newResponse = new Response(response.body, response);

  // Add rate limit information to headers
  newResponse.headers.set("X-RateLimit-Limit", rateLimit.toString());
  newResponse.headers.set(
    "X-RateLimit-Remaining",
    (rateLimit - rateData.count).toString()
  );
  newResponse.headers.set("X-RateLimit-Reset", rateData.resetTime.toString());
  newResponse.headers.set("X-Request-ID", requestId);

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
    "/proxy/:path*",
    "/api/:path*",
  ],
};

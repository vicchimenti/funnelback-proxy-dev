// rate limiter middleware
// This middleware limits the number of requests from a single IP address within a time window.
// It uses an in-memory store to keep track of the number of requests and the reset time for each IP address.
// If the rate limit is exceeded, it returns a 429 status code with a "Retry-After" header indicating the time until the next reset.


import { NextResponse } from 'next/server';

// Simple in-memory store with expiry
const ipCache = new Map();
const RATE_LIMIT = 30; // requests
const WINDOW_MS = 60 * 1000; // 1 minute

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of ipCache.entries()) {
    if (now > value.resetTime) {
      ipCache.delete(key);
    }
  }
}, WINDOW_MS);

export function middleware(request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const now = Date.now();
  
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
  if (rateData.count > RATE_LIMIT) {
    return new NextResponse(JSON.stringify({
      error: 'Too many requests',
      retryAfter: Math.ceil((rateData.resetTime - now) / 1000)
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil((rateData.resetTime - now) / 1000).toString()
      }
    });
  }
  
  return NextResponse.next();
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
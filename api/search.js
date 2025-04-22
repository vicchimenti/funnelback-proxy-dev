/**
 * @fileoverview Dedicated Search Results Proxy Server - Enhanced with Analytics
 * 
 * Handles specific search result requests for the Funnelback integration.
 * Enhanced with session tracking and improved analytics integration.
 * 
 * Features:
 * - CORS handling
 * - Search-specific parameter management
 * - Detailed logging of search requests
 * - Enhanced analytics with session tracking
 * - Click-through attribution
 * - Consistent schema handling
 * - GeoIP-based location tracking
 * 
 * @author Victor Chimenti
 * @namespace searchHandler
 * @version 4.1.3
 * @license MIT
 * @lastModified 2025-04-22
 */

const axios = require('axios');
const geoIpService = require('../lib/geoIpService');
const { recordQuery } = require('../lib/queryAnalytics');
const { 
    createStandardAnalyticsData, 
    sanitizeSessionId, 
    logAnalyticsData 
} = require('../lib/schemaHandler');

/**
 * Extracts the number of results from an HTML response
 * 
 * @param {string} htmlContent - The HTML response from Funnelback
 * @returns {number} The number of results, or 0 if not found
 */
function extractResultCount(htmlContent) {
    try {
        // Look for result count in HTML response
        const match = htmlContent.match(/totalMatching">([0-9,]+)</);
        if (match && match[1]) {
            return parseInt(match[1].replace(/,/g, ''), 10);
        }
    } catch (error) {
        console.error('Error extracting result count:', error);
    }
    return 0;
}

/**
 * Extracts client IP from request using consistent priority order
 * 
 * @param {Object} req - Express request object
 * @returns {string} Best available client IP
 */
function extractClientIp(req) {
    return req.headers['x-original-client-ip'] || 
           req.headers['x-real-ip'] || 
           (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 
           req.headers['x-vercel-proxied-for'] || 
           req.socket.remoteAddress || 
           'unknown';
}

/**
 * Handler for dedicated search requests.
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters from the request
 * @param {Object} req.headers - Request headers
 * @param {string} req.method - HTTP method of the request
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
async function handler(req, res) {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Get client IP using consistent extraction function
    const userIp = extractClientIp(req);

    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'search-handler',
        requestId,
        event: 'request_received',
        path: req.path,
        query: req.query.query || null,
        userIp
    }));

    // Log IP Headers for debugging
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'search-handler',
        requestId,
        event: 'ip_headers',
        headers: {
            originalClientIp: req.headers['x-original-client-ip'],
            forwardedFor: req.headers['x-forwarded-for'],
            realIp: req.headers['x-real-ip'],
            socketRemote: req.socket.remoteAddress,
            vercelIpCity: req.headers['x-vercel-ip-city'],
            finalUserIp: userIp
        }
    }));
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.html';

        // Get location data based on the user's IP
        let locationData = null;
        try {
            locationData = await geoIpService.getLocationData(userIp, requestId);
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'search-handler',
                requestId,
                event: 'geo_lookup_success',
                location: {
                    city: locationData.city,
                    region: locationData.region,
                    country: locationData.country
                }
            }));
        } catch (geoError) {
            console.error('Error getting location data:', geoError);
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'search-handler',
                requestId,
                event: 'geo_lookup_error',
                error: geoError.message
            }));
            // Set default location data
            locationData = {
                city: null,
                region: null,
                country: null,
                timezone: null
            };
        }

        const funnelbackHeaders = {
            'Accept': 'text/html',
            'X-Forwarded-For': userIp,
            'X-Geo-City': locationData.city || '',
            'X-Geo-Region': locationData.region || '',
            'X-Geo-Country': locationData.country || '',
            'X-Geo-Timezone': locationData.timezone || '',
            'X-Request-ID': requestId
        };

        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            service: 'search-handler',
            requestId,
            event: 'outgoing_request',
            url: funnelbackUrl,
            headers: funnelbackHeaders,
            params: req.query
        }));

        const response = await axios.get(funnelbackUrl, {
            params: req.query,
            headers: funnelbackHeaders
        });

        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            service: 'search-handler',
            requestId,
            event: 'response_received',
            status: response.status,
            contentLength: response.data?.length || 0
        }));
        
        // Extract the result count from the HTML response
        const resultCount = extractResultCount(response.data);
        const processingTime = Date.now() - startTime;
        
        // Record analytics data
        try {
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'search-handler',
                requestId,
                event: 'recording_analytics',
                query: req.query.query,
                resultCount
            }));
            
            if (process.env.MONGODB_URI) {
                // Extract and sanitize session ID
                const sessionId = sanitizeSessionId(req.query.sessionId || req.headers['x-session-id']);
                
                // Create raw analytics data
                const rawData = {
                    handler: 'search',
                    query: req.query.query || req.query.partial_query || '[empty query]',
                    searchCollection: req.query.collection || 'seattleu~sp-search',
                    userAgent: req.headers['user-agent'],
                    referer: req.headers.referer,
                    city: locationData.city || decodeURIComponent(req.headers['x-vercel-ip-city'] || ''),
                    region: locationData.region || req.headers['x-vercel-ip-country-region'],
                    country: locationData.country || req.headers['x-vercel-ip-country'],
                    timezone: locationData.timezone || req.headers['x-vercel-ip-timezone'],
                    responseTime: processingTime,
                    resultCount: resultCount,
                    hasResults: resultCount > 0,
                    isProgramTab: Boolean(req.query['f.Tabs|programMain']),
                    isStaffTab: Boolean(req.query['f.Tabs|seattleu~ds-staff']),
                    tabs: [],
                    sessionId: sessionId,
                    timestamp: new Date(),
                    clickedResults: [],
                    requestId
                };
                
                // Add tabs information
                if (rawData.isProgramTab) rawData.tabs.push('program-main');
                if (rawData.isStaffTab) rawData.tabs.push('Faculty & Staff');
                
                // Standardize data to ensure consistent schema
                const analyticsData = createStandardAnalyticsData(rawData);
                
                // Log data (excluding sensitive information)
                logAnalyticsData(analyticsData, 'search recording');
                
                // Record the analytics
                try {
                    const recordResult = await recordQuery(analyticsData);
                    console.log(JSON.stringify({
                        timestamp: new Date().toISOString(),
                        service: 'search-handler',
                        requestId,
                        event: 'analytics_recorded',
                        success: !!recordResult,
                        recordId: recordResult?._id?.toString()
                    }));
                } catch (recordError) {
                    console.error('Error recording analytics:', recordError);
                    console.log(JSON.stringify({
                        timestamp: new Date().toISOString(),
                        service: 'search-handler',
                        requestId,
                        event: 'analytics_record_error',
                        error: recordError.message
                    }));
                }
            } else {
                console.log(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    service: 'search-handler',
                    requestId,
                    event: 'analytics_skipped',
                    reason: 'mongodb_uri_not_defined'
                }));
            }
        } catch (analyticsError) {
            console.error('Analytics error:', analyticsError);
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'search-handler',
                requestId,
                event: 'analytics_error',
                error: analyticsError.message
            }));
        }
        
        res.send(response.data);
    } catch (error) {
        console.error('Error in search handler:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            service: 'search-handler',
            requestId,
            event: 'handler_error',
            error: error.message,
            status: error.response?.status || 500
        }));
        
        res.status(500).send('Search error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
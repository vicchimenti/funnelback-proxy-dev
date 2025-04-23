/**
 * @fileoverview Dedicated Search Results Proxy Server - Enhanced with Analytics
 * 
 * Handles specific search result requests for the Funnelback integration.
 * Enhanced with consistent IP tracking, session management, and improved analytics.
 * 
 * Features:
 * - CORS handling with standardized headers
 * - Search-specific parameter management
 * - Detailed logging using common utilities
 * - Enhanced analytics with consistent schema
 * - Click-through attribution
 * - Session tracking with consistent ID management
 * - GeoIP-based location tracking
 * - Consistent IP extraction across all request types
 * 
 * @author Victor Chimenti
 * @namespace searchHandler
 * @version 5.0.0
 * @license MIT
 * @lastModified 2025-04-23
 */

const axios = require('axios');
const { getLocationData } = require('../lib/geoIpService');
const { recordQuery } = require('../lib/queryAnalytics');
const commonUtils = require('../lib/commonUtils');
const {
    createStandardAnalyticsData,
    createRequestAnalytics,
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
    const requestId = commonUtils.getRequestId(req);
    const clientIp = commonUtils.extractClientIp(req);

    // Log full IP information for debugging
    commonUtils.logFullIpInfo(req, 'search-handler', requestId);

    // Standard log with redacted IP (for security/privacy)
    commonUtils.logEvent('info', 'request_received', 'search-handler', {
        requestId,
        path: req.path,
        query: req.query.query || null,
        clientIp // Will be redacted in standard logs
    });

    // Extract session information
    const sessionInfo = commonUtils.extractSessionInfo(req);
    commonUtils.logSessionHandling(req, sessionInfo, 'search-handler', requestId);

    // Set CORS headers
    commonUtils.setCorsHeaders(res);

    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
        commonUtils.logEvent('info', 'options_request', 'search-handler', { requestId });
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.html';

        // Get location data based on the user's IP
        let locationData = null;
        try {
            locationData = await getLocationData(clientIp);
            commonUtils.logEvent('debug', 'location_data_retrieved', 'search-handler', {
                requestId,
                location: {
                    city: locationData.city,
                    region: locationData.region,
                    country: locationData.country
                }
            });
        } catch (geoError) {
            commonUtils.logEvent('warn', 'location_data_failed', 'search-handler', {
                requestId,
                error: geoError.message
            });
            // Set default empty location data
            locationData = {
                city: null,
                region: null,
                country: null,
                timezone: null
            };
        }

        // Create outgoing headers with location data
        const funnelbackHeaders = {
            'Accept': 'text/html',
            'X-Forwarded-For': clientIp,
            'X-Geo-City': locationData.city || '',
            'X-Geo-Region': locationData.region || '',
            'X-Geo-Country': locationData.country || '',
            'X-Geo-Timezone': locationData.timezone || '',
            'X-Request-ID': requestId
        };

        // Log detailed headers for debugging
        console.log(`- Outgoing Headers to Funnelback:`, {
            funnelbackHeaders
        });

        // Log outgoing request
        commonUtils.logEvent('info', 'outgoing_request', 'search-handler', {
            requestId,
            url: funnelbackUrl,
            query: req.query.query || ''
        });

        const response = await axios.get(funnelbackUrl, {
            params: req.query,
            headers: funnelbackHeaders
        });

        // Log successful response
        commonUtils.logEvent('info', 'funnelback_response', 'search-handler', {
            requestId,
            status: response.status,
            contentLength: response.data?.length || 0
        });

        // Extract the result count from the HTML response
        const resultCount = extractResultCount(response.data);
        const processingTime = Date.now() - startTime;

        // Record analytics data
        try {
            commonUtils.logEvent('info', 'recording_analytics', 'search-handler', {
                requestId,
                query: req.query.query,
                resultCount
            });

            if (process.env.MONGODB_URI) {
                // Create base analytics data from request
                const baseData = createRequestAnalytics(req, locationData, 'search', startTime);

                // Add search-specific data
                const analyticsData = {
                    ...baseData,
                    resultCount: resultCount,
                    hasResults: resultCount > 0,
                    enrichmentData: {
                        searchParams: req.query,
                        resultCount: resultCount,
                        responseTime: processingTime
                    }
                };

                // Standardize and validate data
                const standardData = createStandardAnalyticsData(analyticsData);

                // Log analytics data (excluding sensitive information)
                logAnalyticsData(standardData, 'search-handler');

                // Record the analytics
                try {
                    const recordResult = await recordQuery(standardData);
                    commonUtils.logEvent('info', 'analytics_recorded', 'search-handler', {
                        requestId,
                        success: !!recordResult,
                        recordId: recordResult?._id?.toString()
                    });
                } catch (recordError) {
                    commonUtils.logEvent('error', 'analytics_record_error', 'search-handler', {
                        requestId,
                        error: recordError.message
                    });
                }
            } else {
                commonUtils.logEvent('info', 'analytics_skipped', 'search-handler', {
                    requestId,
                    reason: 'mongodb_uri_not_defined'
                });
            }
        } catch (analyticsError) {
            commonUtils.logEvent('error', 'analytics_error', 'search-handler', {
                requestId,
                error: analyticsError.message
            });
        }

        // Log complete response
        commonUtils.logEvent('info', 'request_completed', 'search-handler', {
            requestId,
            status: response.status,
            processingTime: `${processingTime}ms`,
            resultCount: resultCount
        });

        // Send response to client with request ID
        res.setHeader('X-Request-ID', requestId);
        res.send(response.data);
    } catch (error) {
        // Handle errors using common utils
        const errorInfo = commonUtils.formatError(error, 'search-handler', 'search_request_failed', requestId);

        // Log additional context for debugging
        commonUtils.logEvent('error', 'request_failed', 'search-handler', {
            requestId,
            query: req.query.query,
            status: error.response?.status || 500,
            errorDetails: {
                message: error.message,
                responseStatus: error.response?.status,
                axiosError: error.isAxiosError
            }
        });

        // Send error response
        res.status(errorInfo.status).send('Search error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
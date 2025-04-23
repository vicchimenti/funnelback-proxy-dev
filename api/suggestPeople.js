/**
 * @fileoverview Suggestion Handler for Funnelback Search Integration (People)
 * 
 * Handles autocomplete suggestion requests for faculty and staff searches with
 * structured logging for Vercel serverless environment. Returns detailed information
 * including affiliation, college, department, and position data.
 * Enhanced with consistent IP tracking, session management, and improved error handling.
 * 
 * Features:
 * - Consistent IP tracking using commonUtils
 * - Redis caching for fast response times 
 * - CORS handling for Seattle University domain
 * - Structured JSON logging for Vercel
 * - Request/Response tracking with detailed headers
 * - Enhanced response format with rich metadata
 * - Title cleaning and formatting
 * - Comprehensive error handling with detailed logging
 * - Analytics integration
 * 
 * @author Victor Chimenti
 * @version 5.0.1
 * @namespace suggestPeople
 * @lastmodified 2025-04-24
 * @license MIT
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
const {
    getCachedData,
    setCachedData,
    isCachingEnabled,
    logCacheHit,
    logCacheMiss,
    logCacheError,
    logCacheSet
} = require('../lib/cacheService');

/**
 * Cleans a title string by removing HTML tags and taking only the first part before any pipe character
 * 
 * @param {string} title - The raw title string to clean
 * @returns {string} The cleaned title
 */
function cleanTitle(title = '') {
    return title
        .replace(/<\/?[^>]+(>|$)/g, '') // Remove HTML tags
        .split('|')[0]                   // Take first part before pipe
        .trim();                         // Clean up whitespace
}

/**
 * Records analytics data for people search
 * 
 * @param {Object} req - The request object
 * @param {Object} locationData - Geo location data
 * @param {number} startTime - Request start time
 * @param {Array} formattedResults - The formatted results
 * @param {boolean} cacheHit - Whether response was served from cache
 * @param {boolean} cacheResult - Whether caching was successful
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Object>} The result of the analytics recording
 */
async function recordQueryAnalytics(req, locationData, startTime, formattedResults, cacheHit, cacheResult, requestId) {
    try {
        if (!process.env.MONGODB_URI) {
            commonUtils.logEvent('info', 'analytics_skipped', 'suggest-people', {
                requestId,
                reason: 'mongodb_uri_not_configured'
            });
            return null;
        }

        // Create base analytics data from request
        const baseData = createRequestAnalytics(req, locationData, 'suggestPeople', startTime);

        // Add people-specific data
        const analyticsData = {
            ...baseData,
            resultCount: formattedResults ? formattedResults.length : 0,
            hasResults: formattedResults && formattedResults.length > 0,
            cacheHit,
            cacheSet: cacheResult,
            isStaffTab: true,
            tabs: ['Faculty & Staff'],
            enrichmentData: {
                resultCount: formattedResults ? formattedResults.length : 0,
                staffData: formattedResults ? formattedResults.slice(0, 3).map(staff => ({
                    title: staff.title || '',
                    position: staff.position || staff.affiliation || '',
                    department: staff.department || staff.college || '',
                    url: staff.url || ''
                })) : [],
                cacheHit: cacheHit || false,
                cacheSet: cacheResult || false,
            }
        };

        // Standardize and validate data
        const standardData = createStandardAnalyticsData(analyticsData);

        // Log analytics data (excluding sensitive information)
        logAnalyticsData(standardData, 'suggest-people');

        // Record in database
        try {
            const recordResult = await recordQuery(standardData);

            commonUtils.logEvent('info', 'analytics_recorded', 'suggest-people', {
                requestId,
                recordId: recordResult?._id?.toString(),
                success: !!recordResult
            });

            return recordResult;
        } catch (recordError) {
            commonUtils.logEvent('error', 'analytics_record_failed', 'suggest-people', {
                requestId,
                error: recordError.message,
                query: req.query.query
            });
            return null;
        }
    } catch (analyticsError) {
        commonUtils.logEvent('error', 'analytics_processing_failed', 'suggest-people', {
            requestId,
            error: analyticsError.message,
            stack: analyticsError.stack
        });
        return null;
    }
}

/**
 * Handler for people/faculty/staff suggestion requests to Funnelback
 * Enhanced with consistent IP tracking, session management, and error handling
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handler(req, res) {
    const startTime = Date.now();
    const requestId = commonUtils.getRequestId(req);
    const clientIp = commonUtils.extractClientIp(req);

    // Log request received with detailed IP information for debugging
    commonUtils.logFullIpInfo(req, 'suggest-people', requestId);

    // Standard log with redacted IP (for security/privacy)
    commonUtils.logEvent('info', 'request_received', 'suggest-people', {
        requestId,
        path: req.path,
        query: req.query.query,
        clientIp // Will be redacted in standard logs
    });

    // Extract session information
    const sessionInfo = commonUtils.extractSessionInfo(req);
    commonUtils.logSessionHandling(req, sessionInfo, 'suggest-people', requestId);

    // Set CORS headers
    commonUtils.setCorsHeaders(res);

    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
        commonUtils.logEvent('info', 'options_request', 'suggest-people', { requestId });
        res.status(200).end();
        return;
    }

    // Check caching capability
    let cachingEnabled = false;
    try {
        cachingEnabled = await isCachingEnabled();
    } catch (cacheError) {
        commonUtils.logEvent('warn', 'cache_check_failed', 'suggest-people', {
            requestId,
            error: cacheError.message
        });
    }

    // Only use caching for queries with 3 or more characters
    const canUseCache = cachingEnabled &&
        req.query.query &&
        req.query.query.length >= 3;

    // Log cache parameters
    commonUtils.logEvent('debug', 'cache_parameters', 'suggest-people', {
        requestId,
        cachingEnabled,
        queryExists: !!req.query.query,
        queryLength: req.query.query?.length || 0,
        canUseCache
    });

    let cacheHit = false;
    let cacheResult = null;
    let formattedResults = null;

    // Get location data as early as possible
    let locationData = null;
    try {
        locationData = await getLocationData(clientIp);
        commonUtils.logEvent('debug', 'location_data_retrieved', 'suggest-people', {
            requestId,
            location: {
                city: locationData.city,
                region: locationData.region,
                country: locationData.country
            }
        });
    } catch (geoError) {
        commonUtils.logEvent('warn', 'location_data_failed', 'suggest-people', {
            requestId,
            error: geoError.message
        });
        // Use default empty location data
        locationData = {
            city: null,
            region: null,
            country: null,
            timezone: null
        };
    }

    // Try to get data from cache first
    if (canUseCache) {
        try {
            const cachedData = await getCachedData('people', req.query, requestId);
            if (cachedData) {
                cacheHit = true;
                formattedResults = cachedData;

                // Calculate processing time
                const processingTime = Date.now() - startTime;

                // Log cache hit with standard event logging
                commonUtils.logEvent('info', 'cache_hit', 'suggest-people', {
                    requestId,
                    status: 200,
                    processingTime: `${processingTime}ms`,
                    resultCount: formattedResults.length || 0,
                    query: req.query.query
                });

                // Send cached response
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('X-Request-ID', requestId);
                res.send(formattedResults);

                // Record analytics in background
                recordQueryAnalytics(
                    req,
                    locationData,
                    startTime,
                    formattedResults,
                    true,
                    null,
                    requestId
                );

                return; // Exit early since response already sent
            } else {
                commonUtils.logEvent('debug', 'cache_miss', 'suggest-people', {
                    requestId,
                    query: req.query.query
                });
            }
        } catch (cacheError) {
            commonUtils.logEvent('error', 'cache_error', 'suggest-people', {
                requestId,
                error: cacheError.message
            });
        }
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.json';

        // Keep params for logging
        const params = new URLSearchParams();
        params.append('form', 'partial');
        params.append('profile', '_default');
        params.append('query', req.query.query || '');
        params.append('f.Tabs|seattleu|Eds-staff', 'Faculty & Staff');
        params.append('collection', 'seattleu~sp-search');
        params.append('num_ranks', '5');

        // Use correctly encoded queryString for request
        const queryString = [
            'form=partial',
            'profile=_default',
            `query=${encodeURIComponent(req.query.query || '')}`,
            'f.Tabs%7Cseattleu%7Eds-staff=Faculty+%26+Staff',
            'collection=seattleu~sp-search',
            'num_ranks=5'
        ].join('&');

        const url = `${funnelbackUrl}?${queryString}`;

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

        // Log outgoing request
        commonUtils.logEvent('info', 'outgoing_request', 'suggest-people', {
            requestId,
            url: url,
            query: req.query.query || ''
        });

        // Log detailed headers for debugging
        console.log(`- Outgoing Headers to Funnelback:`, {
            funnelbackHeaders
        });

        // Make request to Funnelback
        const response = await axios.get(url, {
            headers: funnelbackHeaders
        });

        // Log successful response
        commonUtils.logEvent('info', 'funnelback_response', 'suggest-people', {
            requestId,
            status: response.status,
            resultCount: response.data?.response?.resultPacket?.results?.length || 0
        });

        // Format and prepare response
        formattedResults = (response.data?.response?.resultPacket?.results || []).map(result => {
            // Extract and clean metadata fields
            const affiliation = result.listMetadata?.affiliation?.[0] ? cleanTitle(result.listMetadata.affiliation[0]) : null;
            const position = result.listMetadata?.peoplePosition?.[0] ? cleanTitle(result.listMetadata.peoplePosition[0]) : null;
            const department = result.listMetadata?.peopleDepartment?.[0] ? cleanTitle(result.listMetadata.peopleDepartment[0]) : null;
            const college = result.listMetadata?.college?.[0] ? cleanTitle(result.listMetadata.college[0]) : null;

            return {
                title: cleanTitle(result.title) || '',
                affiliation: affiliation,
                position: position,
                department: department,
                college: college,
                url: result.liveUrl || '',
                image: result.listMetadata?.image?.[0] || null
            };
        });

        // Check if we should cache the results
        if (canUseCache && formattedResults && formattedResults.length > 0) {
            try {
                cacheResult = await setCachedData('people', req.query, formattedResults, requestId);

                commonUtils.logEvent('debug', 'cache_set_result', 'suggest-people', {
                    requestId,
                    success: cacheResult,
                    itemCount: formattedResults.length
                });
            } catch (cacheSetError) {
                commonUtils.logEvent('error', 'cache_set_error', 'suggest-people', {
                    requestId,
                    error: cacheSetError.message
                });
                cacheResult = false;
            }
        } else {
            commonUtils.logEvent('debug', 'cache_skipped', 'suggest-people', {
                requestId,
                canUseCache,
                resultCount: formattedResults?.length || 0
            });
        }

        // Process time for this request
        const processingTime = Date.now() - startTime;

        // Log complete response
        commonUtils.logEvent('info', 'request_completed', 'suggest-people', {
            requestId,
            status: response.status,
            processingTime: `${processingTime}ms`,
            resultCount: formattedResults.length || 0,
            query: req.query.query,
            cacheHit: false
        });

        // Send response to client with request ID
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Request-ID', requestId);
        res.send(formattedResults);

        // Record analytics in background
        recordQueryAnalytics(
            req,
            locationData,
            startTime,
            formattedResults,
            false,
            cacheResult,
            requestId
        );
    } catch (error) {
        // Handle errors comprehensively
        const errorInfo = commonUtils.formatError(error, 'suggest-people', 'people_suggestion_request_failed', requestId);

        // Log additional context for debugging
        commonUtils.logEvent('error', 'request_failed', 'suggest-people', {
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
        res.status(errorInfo.status).json({
            error: 'People search error',
            message: error.message,
            requestId: requestId
        });
    }
}

module.exports = handler;
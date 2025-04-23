/**
 * @fileoverview Suggestion Handler for Funnelback Search Integration (Programs)
 * 
 * Handles academic program search requests for the "seattleu~ds-programs" collection.
 * Provides optimized search results for academic programs, returning the top 5 matches
 * with cleaned and formatted data ready for frontend consumption. Maps to Funnelback's
 * native response structure following the correct path: response -> resultPacket -> results.
 * Enhanced with consistent IP tracking, session management, and improved error handling.
 * 
 * Features:
 * - Consistent IP tracking using commonUtils
 * - Redis caching for improved performance
 * - JSON endpoint integration with Funnelback
 * - Limited to top 5 most relevant results
 * - Correct response path traversal
 * - Title cleaning and HTML tag removal
 * - CORS handling for Seattle University domain
 * - Structured JSON logging with proper query tracking
 * - Request/Response tracking with detailed headers
 * - Comprehensive error handling
 * - Enhanced analytics with standardized approach
 * - Session tracking
 * 
 * @author Victor Chimenti
 * @version 5.0.0
 * @namespace suggestPrograms
 * @license MIT
 * @lastModified 2025-04-24
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
    logCacheError
} = require('../lib/cacheService');

/**
 * Cleans program titles by removing HTML tags and selecting first pipe-separated value
 * 
 * @param {string} title - Raw title from Funnelback
 * @returns {string} Cleaned title without HTML tags and additional metadata
 */
function cleanProgramTitle(title) {
    if (!title) return '';

    // Get first pipe-separated value
    const firstTitle = title.split('|')[0];

    // Remove HTML tags and trim whitespace
    return firstTitle
        .replace(/<[^>]+>/g, '')  // Remove HTML tags
        .trim();                   // Clean up whitespace
}

/**
 * Records analytics data for program queries
 * 
 * @param {Object} req - The request object
 * @param {Object} locationData - Geo location data
 * @param {number} startTime - Request start time
 * @param {Object} formattedResponse - The formatted response data
 * @param {boolean} cacheHit - Whether response was served from cache
 * @param {boolean} cacheResult - Whether response was cached successfully
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Object>} The analytics record result
 */
async function recordQueryAnalytics(req, locationData, startTime, formattedResponse, cacheHit, cacheResult, requestId) {
    try {
        if (!process.env.MONGODB_URI) {
            commonUtils.logEvent('info', 'analytics_skipped', 'suggest-programs', {
                requestId,
                reason: 'mongodb_uri_not_configured'
            });
            return null;
        }

        // Create base analytics data from request
        const baseData = createRequestAnalytics(req, locationData, 'suggestPrograms', startTime);

        // Add program-specific data
        const analyticsData = {
            ...baseData,
            resultCount: (formattedResponse && formattedResponse.programs) ?
                formattedResponse.programs.length : 0,
            hasResults: formattedResponse && formattedResponse.programs &&
                formattedResponse.programs.length > 0,
            cacheHit,
            cacheSet: cacheResult,
            isProgramTab: true,
            isStaffTab: false,
            tabs: ['program-main'],
            enrichmentData: {
                totalResults: (formattedResponse && formattedResponse.metadata) ?
                    formattedResponse.metadata.totalResults : 0,
                programData: formattedResponse && formattedResponse.programs ?
                    formattedResponse.programs.slice(0, 3).map(prog => ({
                        title: prog.title || '',
                        type: prog.details?.type || '',
                        school: prog.details?.school || '',
                        url: prog.url || ''
                    })) : [],
                queryTime: (formattedResponse && formattedResponse.metadata) ?
                    formattedResponse.metadata.queryTime : 0,
                cacheHit: cacheHit || false,
                cacheSet: cacheResult || false,
            }
        };

        // Standardize data to ensure consistent schema
        const standardData = createStandardAnalyticsData(analyticsData);

        // Log analytics data (excluding sensitive information)
        logAnalyticsData(standardData, 'suggest-programs');

        // Record in database
        try {
            const recordResult = await recordQuery(standardData);

            commonUtils.logEvent('info', 'analytics_recorded', 'suggest-programs', {
                requestId,
                recordId: recordResult?._id?.toString(),
                success: !!recordResult
            });

            return recordResult;
        } catch (recordError) {
            commonUtils.logEvent('error', 'analytics_record_failed', 'suggest-programs', {
                requestId,
                error: recordError.message,
                query: req.query.query
            });
            return null;
        }
    } catch (analyticsError) {
        commonUtils.logEvent('error', 'analytics_processing_failed', 'suggest-programs', {
            requestId,
            error: analyticsError.message,
            stack: analyticsError.stack
        });
        return null;
    }
}

/**
 * Handler for program search requests to Funnelback search service
 * Enhanced with consistent IP tracking, session management, and error handling
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
async function handler(req, res) {
    const startTime = Date.now();
    const requestId = commonUtils.getRequestId(req);
    const clientIp = commonUtils.extractClientIp(req);

    // Log request received with detailed IP information for debugging
    commonUtils.logFullIpInfo(req, 'suggest-programs', requestId);

    // Standard log with redacted IP (for security/privacy)
    commonUtils.logEvent('info', 'request_received', 'suggest-programs', {
        requestId,
        path: req.path,
        query: req.query.query,
        clientIp // Will be redacted in standard logs
    });

    // Extract session information
    const sessionInfo = commonUtils.extractSessionInfo(req);
    commonUtils.logSessionHandling(req, sessionInfo, 'suggest-programs', requestId);

    // Set CORS headers
    commonUtils.setCorsHeaders(res);

    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
        commonUtils.logEvent('info', 'options_request', 'suggest-programs', { requestId });
        res.status(200).end();
        return;
    }

    const query = {
        ...req.query,
        collection: 'seattleu~ds-programs',
        profile: '_default',
        num_ranks: 5,
        form: 'partial'
    };

    // Check caching capability
    let cachingEnabled = false;
    try {
        cachingEnabled = await isCachingEnabled();
    } catch (cacheError) {
        commonUtils.logEvent('warn', 'cache_check_failed', 'suggest-programs', {
            requestId,
            error: cacheError.message
        });
    }

    // Only use caching for queries with 3 or more characters
    const canUseCache = cachingEnabled &&
        req.query.query &&
        req.query.query.length >= 3;

    // Log cache parameters
    commonUtils.logEvent('debug', 'cache_parameters', 'suggest-programs', {
        requestId,
        cachingEnabled,
        queryExists: !!req.query.query,
        queryLength: req.query.query?.length || 0,
        canUseCache
    });

    let cacheHit = false;
    let cacheResult = null;
    let formattedResponse = null;

    // Get location data as early as possible
    let locationData = null;
    try {
        locationData = await getLocationData(clientIp);
        commonUtils.logEvent('debug', 'location_data_retrieved', 'suggest-programs', {
            requestId,
            location: {
                city: locationData.city,
                region: locationData.region,
                country: locationData.country
            }
        });
    } catch (geoError) {
        commonUtils.logEvent('warn', 'location_data_failed', 'suggest-programs', {
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
            const cachedData = await getCachedData('programs', req.query, requestId);
            if (cachedData) {
                cacheHit = true;
                formattedResponse = cachedData;

                // Calculate processing time
                const processingTime = Date.now() - startTime;

                // Log cache hit with standard event logging
                commonUtils.logEvent('info', 'cache_hit', 'suggest-programs', {
                    requestId,
                    status: 200,
                    processingTime: `${processingTime}ms`,
                    responseContent: formattedResponse,
                    cacheHit: true,
                });

                // Send cached response
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('X-Request-ID', requestId);
                res.send(formattedResponse);

                // Record analytics in background
                recordQueryAnalytics(
                    req,
                    locationData,
                    startTime,
                    formattedResponse,
                    true,
                    null,
                    requestId
                );

                return; // Exit early since response already sent
            } else {
                commonUtils.logEvent('debug', 'cache_miss', 'suggest-programs', {
                    requestId,
                    query: req.query.query
                });
            }
        } catch (cacheError) {
            commonUtils.logEvent('error', 'cache_error', 'suggest-programs', {
                requestId,
                error: cacheError.message
            });
        }
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.json';

        // Create outgoing headers with location data
        const funnelbackHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Forwarded-For': clientIp,
            'X-Geo-City': locationData.city || '',
            'X-Geo-Region': locationData.region || '',
            'X-Geo-Country': locationData.country || '',
            'X-Geo-Timezone': locationData.timezone || '',
            'X-Request-ID': requestId
        };

        // Log detailed headers for debugging
        console.log(`- Outgoing Headers to Funnelback:`, funnelbackHeaders);

        // Log outgoing request
        commonUtils.logEvent('info', 'outgoing_request', 'suggest-programs', {
            requestId,
            url: funnelbackUrl,
            query: req.query.query || ''
        });

        // Make request to Funnelback
        const response = await axios.get(funnelbackUrl, {
            params: query,
            headers: funnelbackHeaders
        });

        // Log successful response
        commonUtils.logEvent('info', 'funnelback_response', 'suggest-programs', {
            requestId,
            status: response.status,
            resultCount: response.data?.response?.resultPacket?.results?.length || 0
        });

        // Format response for frontend consumption with correct path traversal
        formattedResponse = {
            metadata: {
                totalResults: response.data.response?.resultPacket?.resultsSummary?.totalMatching || 0,
                queryTime: response.data.response?.resultPacket?.resultsSummary?.queryTime || 0,
                searchTerm: query.query || ''
            },
            programs: (response.data.response?.resultPacket?.results || []).map(result => ({
                id: result.rank,
                title: cleanProgramTitle(result.title),
                url: result.liveUrl,
                details: {
                    type: result.listMetadata?.programCredentialType?.[0] || null,
                    school: result.listMetadata?.provider?.[0] || null,
                    credits: result.listMetadata?.credits?.[0] || null,
                    area: result.listMetadata?.areaOfStudy?.[0] || null,
                    level: result.listMetadata?.category?.[0] || null,
                    mode: result.listMetadata?.programMode?.[0] || null
                },
                image: result.listMetadata?.image?.[0] || null,
                description: result.listMetadata?.c?.[0] || null
            }))
        };

        // Check if we should cache the results
        if (canUseCache && formattedResponse && formattedResponse.programs && formattedResponse.programs.length > 0) {
            try {
                cacheResult = await setCachedData('programs', req.query, formattedResponse, requestId);

                commonUtils.logEvent('debug', 'cache_set_result', 'suggest-programs', {
                    requestId,
                    success: cacheResult,
                    itemCount: formattedResponse.programs.length
                });
            } catch (cacheSetError) {
                commonUtils.logEvent('error', 'cache_set_error', 'suggest-programs', {
                    requestId,
                    error: cacheSetError.message
                });
                cacheResult = false;
            }
        } else {
            commonUtils.logEvent('debug', 'cache_skipped', 'suggest-programs', {
                requestId,
                canUseCache,
                resultCount: formattedResponse?.programs?.length || 0
            });
        }

        // Process time for this request
        const processingTime = Date.now() - startTime;

        // Log complete response
        commonUtils.logEvent('info', 'request_completed', 'suggest-programs', {
            requestId,
            status: response.status,
            processingTime: `${processingTime}ms`,
            resultCount: formattedResponse.programs.length || 0,
            query: req.query.query,
            cacheHit: false
        });

        // Send response to client with request ID
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Request-ID', requestId);
        res.send(formattedResponse);

        // Record analytics in background
        recordQueryAnalytics(
            req,
            locationData,
            startTime,
            formattedResponse,
            false,
            cacheResult,
            requestId
        );
    } catch (error) {
        // Handle errors comprehensively
        const errorInfo = commonUtils.formatError(error, 'suggest-programs', 'program_suggestion_request_failed', requestId);

        // Log additional context for debugging
        commonUtils.logEvent('error', 'request_failed', 'suggest-programs', {
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
            error: 'Program search error',
            message: error.message,
            requestId: requestId
        });
    }
}

module.exports = handler;
/**
 * @fileoverview Suggestion Handler for Funnelback Search Integration
 * 
 * Handles autocomplete suggestion requests for the Funnelback integration.
 * Provides real-time search suggestions as users type, with structured logging
 * for Vercel serverless environment. Enhanced with consistent IP tracking,
 * session management, and improved error handling.
 * 
 * Features:
 * - Consistent IP tracking using commonUtils
 * - CORS handling for Seattle University domain
 * - Redis Caching for improved performance and reduced latency
 * - Structured JSON logging for Vercel
 * - Request/Response tracking with detailed headers
 * - Query parameter tracking
 * - Session-based analytics tracking
 * - Enrichment data recording
 * - Comprehensive error handling with detailed logging
 * - Query analytics integration
 * 
 * @author Victor Chimenti
 * @version 5.0.0
 * @namespace suggestionHandler
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
    logCacheCheck,
    logCacheHit,
    logCacheMiss,
    logCacheError,
    logCacheSet
} = require('../lib/cacheService');

/**
 * Enriches suggestions with metadata based on content and tab parameters
 * 
 * @param {Array<string>} suggestions - Raw suggestions from Funnelback
 * @param {Object} query - Query parameters including tab information
 * @param {string} requestId - Request ID for tracking
 * @returns {Array<Object>} Enriched suggestions with metadata
 */
function enrichSuggestions(suggestions, query, requestId) {
    if (!Array.isArray(suggestions)) {
        commonUtils.logEvent('warn', 'invalid_suggestions_format', 'suggest-handler', {
            requestId,
            suggestionsType: typeof suggestions
        });
        return [];
    }
    
    // Extract tab information
    const isProgramTab = Boolean(query['f.Tabs|programMain']);
    const isStaffTab = Boolean(query['f.Tabs|seattleu~ds-staff']);
    
    // Log enrichment process
    commonUtils.logEvent('debug', 'enriching_suggestions', 'suggest-handler', {
        requestId,
        isProgramTab,
        isStaffTab,
        suggestionCount: suggestions.length
    });

    const enrichedSuggestions = suggestions.map(suggestion => {
        let metadata = {
            tabs: []
        };
        
        // Add tab information based on the source of the request
        if (isProgramTab) {
            metadata.tabs.push('program-main');
        }
        if (isStaffTab) {
            metadata.tabs.push('Faculty & Staff');
        }

        return {
            display: suggestion,
            metadata
        };
    });

    // Log completion
    commonUtils.logEvent('debug', 'suggestions_enriched', 'suggest-handler', {
        requestId,
        totalEnriched: enrichedSuggestions.length
    });

    return enrichedSuggestions;
}

/**
 * Records analytics data for the query
 * 
 * @param {Object} req - The request object
 * @param {Object} locationData - Geo location data
 * @param {number} startTime - Request start time
 * @param {Array} enrichedResponse - The response data
 * @param {boolean} cacheHit - Whether the response was served from cache
 * @param {boolean} cacheResult - Whether the response was cached successfully
 * @param {string} requestId - Request ID for tracking
 * @returns {Promise<Object>} Analytics record result
 */
async function recordQueryAnalytics(req, locationData, startTime, enrichedResponse, cacheHit, cacheResult, requestId) {
    try {
        if (!process.env.MONGODB_URI) {
            commonUtils.logEvent('info', 'analytics_skipped', 'suggest-handler', {
                requestId,
                reason: 'mongodb_uri_not_configured'
            });
            return null;
        }
        
        // Create base analytics data from request
        const baseData = createRequestAnalytics(req, locationData, 'suggest', startTime);
        
        // Add suggestion-specific data
        const analyticsData = {
            ...baseData,
            resultCount: enrichedResponse ? enrichedResponse.length : 0,
            hasResults: enrichedResponse && enrichedResponse.length > 0,
            cacheHit,
            cacheSet: cacheResult,
            enrichmentData: {
                totalSuggestions: enrichedResponse ? enrichedResponse.length : 0,
                suggestionsData: enrichedResponse ? enrichedResponse.map(s => ({
                    display: s.display || '',
                    tabs: s.metadata?.tabs || []
                })) : [],
                cacheHit: cacheHit || false,
                cacheSet: cacheResult || false
            }
        };
        
        // Standardize and validate data
        const standardData = createStandardAnalyticsData(analyticsData);
        
        // Log analytics data (excluding sensitive information)
        logAnalyticsData(standardData, 'suggest-handler');
        
        // Record in database
        try {
            const recordResult = await recordQuery(standardData);
            
            commonUtils.logEvent('info', 'analytics_recorded', 'suggest-handler', {
                requestId,
                recordId: recordResult?._id?.toString(),
                success: !!recordResult
            });
            
            return recordResult;
        } catch (recordError) {
            commonUtils.logEvent('error', 'analytics_record_failed', 'suggest-handler', {
                requestId,
                error: recordError.message,
                query: req.query.query
            });
            return null;
        }
    } catch (analyticsError) {
        commonUtils.logEvent('error', 'analytics_processing_failed', 'suggest-handler', {
            requestId,
            error: analyticsError.message,
            stack: analyticsError.stack
        });
        return null;
    }
}

/**
 * Handler for suggestion requests to Funnelback search service
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
    
    // Log request received
    commonUtils.logEvent('info', 'request_received', 'suggest-handler', {
        requestId,
        path: req.path,
        query: req.query.query || req.query.partial_query,
        clientIp: 'REDACTED' // Redacted for privacy in logs
    });
    
    // Log detailed IP information for debugging
    commonUtils.logIpDetection(req, clientIp, 'suggest-handler', requestId);
    
    // Set CORS headers
    commonUtils.setCorsHeaders(res);

    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
        commonUtils.logEvent('info', 'options_request', 'suggest-handler', { requestId });
        res.status(200).end();
        return;
    }

    // Extract session information
    const sessionInfo = commonUtils.extractSessionInfo(req);
    commonUtils.logSessionHandling(req, sessionInfo, 'suggest-handler', requestId);
    
    // Check caching capability
    let cachingEnabled = false;
    try {
        cachingEnabled = await isCachingEnabled();
    } catch (cacheError) {
        commonUtils.logEvent('warn', 'cache_check_failed', 'suggest-handler', {
            requestId,
            error: cacheError.message
        });
    }
    
    // Only use caching for queries with 3 or more characters
    const canUseCache = cachingEnabled && 
                      (req.query.query || req.query.partial_query) && 
                      (req.query.query?.length >= 3 || req.query.partial_query?.length >= 3);

    // Log cache parameters
    commonUtils.logEvent('debug', 'cache_parameters', 'suggest-handler', {
        requestId,
        cachingEnabled,
        queryExists: !!(req.query.query || req.query.partial_query),
        queryLength: (req.query.query?.length || req.query.partial_query?.length || 0),
        canUseCache
    });

    // Create stable variables for tracking
    const willUseCache = canUseCache;
    let cacheHit = false;
    let enrichedResponse = null;
    let cacheResult = null;
    
    // Get location data as early as possible
    let locationData = null;
    try {
        locationData = await getLocationData(clientIp);
        commonUtils.logEvent('debug', 'location_data_retrieved', 'suggest-handler', {
            requestId,
            location: {
                city: locationData.city,
                region: locationData.region,
                country: locationData.country
            }
        });
    } catch (geoError) {
        commonUtils.logEvent('warn', 'location_data_failed', 'suggest-handler', {
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
            const cachedData = await getCachedData('suggestions', req.query, requestId);
            
            if (cachedData) {
                cacheHit = true;
                enrichedResponse = cachedData;
                
                // Calculate processing time
                const processingTime = Date.now() - startTime;
                
                // Log cache hit with standard event logging
                commonUtils.logEvent('info', 'cache_hit', 'suggest-handler', {
                    requestId,
                    status: 200,
                    processingTime: `${processingTime}ms`,
                    suggestionsCount: enrichedResponse.length || 0,
                    query: req.query.query || req.query.partial_query
                });
                
                // Send cached response
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('X-Request-ID', requestId);
                res.json(enrichedResponse);
                
                // Record analytics in background
                recordQueryAnalytics(
                    req, 
                    locationData, 
                    startTime, 
                    enrichedResponse, 
                    true, 
                    null, 
                    requestId
                );
                
                return; // Exit early since response already sent
            } else {
                commonUtils.logEvent('debug', 'cache_miss', 'suggest-handler', {
                    requestId,
                    query: req.query.query || req.query.partial_query
                });
            }
        } catch (cacheError) {
            commonUtils.logEvent('error', 'cache_error', 'suggest-handler', {
                requestId,
                error: cacheError.message
            });
        }
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/suggest.json';

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
        commonUtils.logEvent('info', 'outgoing_request', 'suggest-handler', {
            requestId,
            url: funnelbackUrl,
            query: req.query.query || req.query.partial_query
        });

        // Make request to Funnelback
        const response = await axios.get(funnelbackUrl, {
            params: req.query,
            headers: funnelbackHeaders
        });

        // Log successful response
        commonUtils.logEvent('info', 'funnelback_response', 'suggest-handler', {
            requestId,
            status: response.status,
            resultCount: Array.isArray(response.data) ? response.data.length : 0
        });

        // Ensure response data is an array (handle API inconsistencies)
        const responseData = Array.isArray(response.data) ? response.data : [];

        // Enrich suggestions with metadata
        enrichedResponse = enrichSuggestions(responseData, req.query, requestId);

        // Check if we should cache the results
        if (willUseCache && enrichedResponse && enrichedResponse.length > 0) {
            try {
                cacheResult = await setCachedData('suggestions', req.query, enrichedResponse, requestId);
                
                commonUtils.logEvent('debug', 'cache_set_result', 'suggest-handler', {
                    requestId,
                    success: cacheResult,
                    itemCount: enrichedResponse.length
                });
            } catch (cacheSetError) {
                commonUtils.logEvent('error', 'cache_set_error', 'suggest-handler', {
                    requestId,
                    error: cacheSetError.message
                });
                cacheResult = false;
            }
        } else {
            commonUtils.logEvent('debug', 'cache_skipped', 'suggest-handler', {
                requestId,
                willUseCache,
                resultCount: enrichedResponse?.length || 0
            });
        }

        // Process time for this request
        const processingTime = Date.now() - startTime;

        // Log complete response
        commonUtils.logEvent('info', 'request_completed', 'suggest-handler', {
            requestId,
            status: response.status,
            processingTime: `${processingTime}ms`,
            suggestionsCount: enrichedResponse.length || 0,
            query: req.query.query || req.query.partial_query,
            cacheHit: false
        });

        // Send response to client with request ID
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('X-Request-ID', requestId);
        res.json(enrichedResponse);
        
        // Record analytics in background
        recordQueryAnalytics(
            req, 
            locationData, 
            startTime, 
            enrichedResponse, 
            false, 
            cacheResult, 
            requestId
        );
    } catch (error) {
        // Handle errors comprehensively
        const errorInfo = commonUtils.formatError(error, 'suggest-handler', 'suggestion_request_failed', requestId);
        
        // Log additional context for debugging
        commonUtils.logEvent('error', 'request_failed', 'suggest-handler', {
            requestId,
            query: req.query.query || req.query.partial_query,
            status: error.response?.status || 500,
            errorDetails: {
                message: error.message,
                responseStatus: error.response?.status,
                axiosError: error.isAxiosError
            }
        });
        
        // Send error response
        res.status(errorInfo.status).json({
            error: 'Suggestion error',
            message: error.message,
            requestId: requestId
        });
    }
}

// Export a single function as required by Vercel
module.exports = handler;
/**
 * @fileoverview Suggestion Handler for Funnelback Search Integration (Programs)
 * 
 * Handles academic program search requests for the "seattleu~ds-programs" collection.
 * Provides optimized search results for academic programs, returning the top 5 matches
 * with cleaned and formatted data ready for frontend consumption. Maps to Funnelback's
 * native response structure following the correct path: response -> resultPacket -> results.
 * Now includes Redis caching for faster response times.
 * 
 * Features:
 * - Redis caching for improved performance
 * - JSON endpoint integration with Funnelback
 * - Limited to top 5 most relevant results
 * - Correct response path traversal
 * - Title cleaning and HTML tag removal
 * - CORS handling for Seattle University domain
 * - Structured JSON logging with proper query tracking
 * - Request/Response tracking with detailed headers
 * - Comprehensive error handling
 * - Enhanced analytics with GeoIP integration
 * - Session tracking
 * 
 * @author Victor Chimenti, Team
 * @version 4.2.2
 * @namespace suggestPrograms
 * @license MIT
 * @lastModified 2025-03-19
 */

const axios = require('axios');
const os = require('os');
const { getLocationData } = require('../lib/geoIpService');
const { recordQuery } = require('../lib/queryAnalytics');
const { 
    createStandardAnalyticsData, 
    sanitizeSessionId, 
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
        .trim();
}

/**
 * Creates a standardized log entry for Vercel environment with enhanced program metadata
 * 
 * @param {string} level - Log level ('info', 'warn', 'error')
 * @param {string} message - Main log message/action
 * @param {Object} data - Additional data to include in log
 * @param {Object} [data.query] - Query parameters
 * @param {Object} [data.headers] - Request headers
 * @param {number} [data.status] - HTTP status code
 * @param {string} [data.processingTime] - Request processing duration
 * @param {Object} [data.responseContent] - Response content with program data
 * @param {string} [data.error] - Error message if applicable
 * @param {boolean} [data.cacheHit] - Whether data was served from cache
 */
function logEvent(level, message, data = {}) {
    const userIp = data.headers?.['x-forwarded-for'] || 
                   data.headers?.['x-real-ip'] || 
                   data.headers?.['x-vercel-proxied-for'] || 
                   'unknown';

    // Format server info more concisely
    const serverInfo = {
        host: os.hostname(),
        platform: `${os.platform()}-${os.arch()}`,
        resources: {
            cpus: os.cpus().length,
            memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`
        }
    };

    // Format location data if available
    const locationInfo = data.headers ? {
        city: decodeURIComponent(data.headers['x-vercel-ip-city'] || ''),
        region: data.headers['x-vercel-ip-country-region'],
        country: data.headers['x-vercel-ip-country'],
        timezone: data.headers['x-vercel-ip-timezone'],
        coordinates: {
            lat: data.headers['x-vercel-ip-latitude'],
            long: data.headers['x-vercel-ip-longitude']
        }
    } : null;

    // Format query parameters more concisely
    const queryInfo = data.query ? {
        searchTerm: data.query.query || '',
        collection: 'seattleu~ds-programs',
        profile: data.query.profile || '_default'
    } : null;

    // Format request metadata
    const requestMeta = data.headers ? {
        origin: data.headers.origin,
        referer: data.headers.referer,
        userAgent: data.headers['user-agent'],
        deploymentUrl: data.headers['x-vercel-deployment-url'],
        vercelId: data.headers['x-vercel-id']
    } : null;

    const logEntry = {
        service: 'suggest-programs',
        version: '4.2.0',
        timestamp: new Date().toISOString(),
        level,
        message,
        userIp,
        request: {
            query: queryInfo,
            meta: requestMeta
        },
        location: locationInfo,
        server: serverInfo,
        performance: data.processingTime ? {
            duration: data.processingTime,
            status: data.status,
            cacheHit: data.cacheHit
        } : null
    };

    // For errors, add error information
    if (level === 'error' && data.error) {
        logEntry.error = {
            message: data.error,
            status: data.status || 500
        };
    }

    // For successful responses with content
    if (data.responseContent) {
        const responsePreview = {
            totalResults: data.responseContent.metadata.totalResults,
            queryTime: data.responseContent.metadata.queryTime,
            programs: data.responseContent.programs.map(program => ({
                rank: program.id,
                title: program.title,
                type: program.details.type,
                school: program.details.school
            }))
        };

        logEntry.response = {
            preview: responsePreview,
            contentType: typeof data.responseContent,
            cacheHit: data.cacheHit
        };
    }

    // Clean up null values for cleaner logs
    Object.keys(logEntry).forEach(key => {
        if (logEntry[key] === null || logEntry[key] === undefined) {
            delete logEntry[key];
        }
    });

    console.log(JSON.stringify(logEntry, null, process.env.NODE_ENV === 'development' ? 2 : 0));
}

/**
 * Records analytics data for program queries
 * 
 * @param {Object} req - The request object
 * @param {Object} locationData - Geo location data
 * @param {number} startTime - Request start time
 * @param {Object} formattedResponse - The formatted response data
 * @param {boolean} cacheHit - Whether response was served from cache
 */
async function recordQueryAnalytics(req, locationData, startTime, formattedResponse, cacheHit) {
    try {
        console.log('MongoDB URI defined:', !!process.env.MONGODB_URI);
        
        if (process.env.MONGODB_URI) {
            // Extract and sanitize session ID
            const sessionId = sanitizeSessionId(req.query.sessionId || req.headers['x-session-id']);
            console.log('Session ID sources:', {
                fromQueryParam: req.query.sessionId,
                fromHeader: req.headers['x-session-id'],
                fromBody: req.body?.sessionId,
                afterSanitization: sessionId
            });

            const processingTime = Date.now() - startTime;
            const resultCount = formattedResponse.programs.length;
            
            // Create raw analytics data
            const rawData = {
                handler: 'suggestPrograms',
                query: req.query.query || '[empty query]',
                searchCollection: 'seattleu~ds-programs',
                userAgent: req.headers['user-agent'],
                referer: req.headers.referer,
                city: locationData.city || decodeURIComponent(req.headers['x-vercel-ip-city'] || ''),
                region: locationData.region || req.headers['x-vercel-ip-country-region'],
                country: locationData.country || req.headers['x-vercel-ip-country'],
                timezone: locationData.timezone || req.headers['x-vercel-ip-timezone'],
                responseTime: processingTime,
                resultCount: resultCount,
                hasResults: resultCount > 0,
                isProgramTab: true,  // This is specifically for program searches
                isStaffTab: false,
                tabs: ['program-main'],
                sessionId: sessionId,
                timestamp: new Date(),
                clickedResults: [], // Initialize empty array to ensure field exists
                enrichmentData: {
                    cacheHit,
                    totalResults: formattedResponse.metadata.totalResults,
                    queryTime: formattedResponse.metadata.queryTime
                }
            };
            
            // Standardize data to ensure consistent schema
            const analyticsData = createStandardAnalyticsData(rawData);
            
            // Log data (excluding sensitive information)
            logAnalyticsData(analyticsData, 'suggestPrograms recording');
            
            // Record the analytics
            try {
                const recordResult = await recordQuery(analyticsData);
                console.log('Analytics record result:', recordResult ? 'Saved' : 'Not saved');
                if (recordResult && recordResult._id) {
                    console.log('Analytics record ID:', recordResult._id.toString());
                }
            } catch (recordError) {
                console.error('Error recording analytics:', recordError.message);
                if (recordError.name === 'ValidationError') {
                    console.error('Validation errors:', Object.keys(recordError.errors).join(', '));
                }
            }
        } else {
            console.log('No MongoDB URI defined, skipping analytics recording');
        }
    } catch (analyticsError) {
        console.error('Analytics error:', analyticsError);
    }
}

/**
 * Handler for program search requests to Funnelback search service
 * Processes requests through JSON endpoint and returns top 5 results
 * with cleaned and formatted data optimized for frontend consumption.
 * Now includes Redis caching for improved performance.
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters from the request
 * @param {Object} req.headers - Request headers
 * @param {string} req.method - HTTP method of the request
 * @param {Object} res - Express response object
 * @returns {Promise<void>} - Resolves when the response has been sent
 */
async function handler(req, res) {
    const startTime = Date.now();
    const requestId = req.headers['x-vercel-id'] || Date.now().toString();
    
    // Get client IP from custom header or fallback methods
    const userIp = req.headers['x-original-client-ip'] || 
               (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 
               (req.headers['x-real-ip']) || 
               req.socket.remoteAddress;

    // Add debug logging
    console.log('IP Headers:', {
        originalClientIp: req.headers['x-original-client-ip'],
        forwardedFor: req.headers['x-forwarded-for'],
        realIp: req.headers['x-real-ip'],
        socketRemote: req.socket.remoteAddress,
        vercelIpCity: req.headers['x-vercel-ip-city'],
        finalUserIp: userIp
    });

    const query = { 
        ...req.query, 
        collection: 'seattleu~ds-programs',
        profile: '_default',
        num_ranks: 5,
        form: 'partial'
    };
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only use caching for queries with 3 or more characters
    const canUseCache = isCachingEnabled() && 
                     req.query.query && 
                     req.query.query.length >= 3;
    
    let cacheHit = false;
    let formattedResponse = null;
    
    // Try to get data from cache first
    if (canUseCache) {
        try {
            // Pass requestId to track cache operations through the request lifecycle
            const cachedData = await getCachedData('programs', req.query, requestId); // For suggestPrograms.js
            if (cachedData) {
                cacheHit = true;
                formattedResponse = cachedData;
                
                // Calculate processing time
                const processingTime = Date.now() - startTime;
                
                // Log cache hit with standard event logging
                logEvent('info', 'Cache hit for suggestions', {
                    status: 200,
                    processingTime: `${processingTime}ms`,
                    suggestionsCount: enrichedResponse.length || 0,
                    query: req.query,
                    headers: req.headers,
                    cacheHit: true
                });
                
                // Send cached response and continue with analytics recording
                res.json(formattedResults);
            }
        } catch (cacheError) {
            // Log cache error with standardized format
            logCacheError('programs', null, {
                requestId,
                query: req.query,
                errorType: cacheError.name,
                errorMessage: cacheError.message
            });
            console.error('Cache error:', cacheError);
            // Continue with normal request flow
        }
    }

    // Get location data based on the user's IP
    const locationData = await getLocationData(userIp);
    console.log('GeoIP location data:', locationData);

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.json';

        console.log('DEBUG - About to make Funnelback API request with params:', {
            url: funnelbackUrl,
            query: req.query,
            userIp
        });
        
        // Log the request
        logEvent('info', 'Programs search request received', {
            query: query,
            headers: req.headers
        });

        const funnelbackHeaders = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Forwarded-For': userIp,
            'X-Geo-City': locationData.city,
            'X-Geo-Region': locationData.region,
            'X-Geo-Country': locationData.country,
            'X-Geo-Timezone': locationData.timezone
        };
        console.log('- Outgoing Headers to Funnelback:', funnelbackHeaders);

        const response = await axios.get(funnelbackUrl, {
            params: query,
            headers: funnelbackHeaders
        });

        // Log the actual URL we're hitting
        console.log('Funnelback URL:', `${funnelbackUrl}?${new URLSearchParams(query)}`);

        console.log('DEBUG - Funnelback API response status:', response.status);
        console.log('DEBUG - Funnelback API response data type:', typeof response.data);
        console.log('DEBUG - Funnelback API response structure:', {
            hasResponse: !!response.data?.response,
            hasResultPacket: !!response.data?.response?.resultPacket,
            hasResults: !!response.data?.response?.resultPacket?.results,
            resultCount: response.data?.response?.resultPacket?.results?.length || 0
        });

        // Log raw response structure for debugging
        console.log('Raw Response Path Check:', {
            hasQuestion: !!response.data.question,
            hasResponse: !!response.data.response,
            hasResultPacket: !!response.data.response?.resultPacket,
            hasResults: !!response.data.response?.resultPacket?.results,
            resultCount: response.data.response?.resultPacket?.results?.length || 0
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

        // Store in cache if appropriate
        if (canUseCache && enrichedResponse.length > 0) {
            await setCachedData('programs', req.query, enrichedResponse, requestId);
        }
        const processingTime = Date.now() - startTime;

        // Log the successful response
        logEvent('info', 'Programs search completed', {
            query: query,
            status: response.status,
            processingTime: `${processingTime}ms`,
            responseContent: formattedResponse,
            headers: req.headers,
            cacheHit: false
        });

        // Send the formatted response
        res.setHeader('Content-Type', 'application/json');
        res.send(formattedResponse);
        
        // Record analytics in background
        recordQueryAnalytics(req, locationData, startTime, formattedResponse, false);
        
    } catch (error) {
        const errorResponse = {
            error: true,
            message: error.message,
            status: error.response?.status || 500
        };

        logEvent('error', 'Programs search failed', {
            query: query,
            error: error.message,
            status: errorResponse.status,
            processingTime: `${Date.now() - startTime}ms`,
            headers: req.headers
        });

        console.error('DEBUG - Funnelback API request error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            isAxiosError: error.isAxiosError,
            status: error.response?.status,
            statusText: error.response?.statusText,
            responseData: error.response?.data ? JSON.stringify(error.response.data).substring(0, 500) : null
        });
        
        res.status(errorResponse.status).json(errorResponse);
    }
}

module.exports = handler;
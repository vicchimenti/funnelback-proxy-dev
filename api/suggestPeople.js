/**
 * @fileoverview Suggestion Handler for Funnelback Search Integration (People)
 * 
 * Handles autocomplete suggestion requests for faculty and staff searches with
 * structured logging for Vercel serverless environment. Returns detailed information
 * including affiliation, college, department, and position data.
 * Includes Vercel native Redis caching for improved performance.
 * 
 * Features:
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
 * @version 4.3.6
 * @namespace suggestPeople
 * @lastmodified 2025-03-25
 * @license MIT
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
 * Creates a standardized log entry for Vercel environment
 * 
 * @param {string} level - Log level ('info', 'warn', 'error')
 * @param {string} message - Main log message/action
 * @param {Object} data - Additional data to include in log
 * @param {boolean} [data.cacheHit] - Whether data was served from cache
 */
function logEvent(level, message, data = {}) {
    const serverInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB'
    };

    // Extract relevant request headers
    const requestInfo = data.headers ? {
        'Request Headers': {
            'x-forwarded-host': data.headers['x-forwarded-host'],
            'x-vercel-ip-timezone': data.headers['x-vercel-ip-timezone'],
            'referer': data.headers.referer,
            'x-vercel-ip-as-number': data.headers['x-vercel-ip-as-number'],
            'sec-fetch-mode': data.headers['sec-fetch-mode'],
            'x-vercel-proxied-for': data.headers['x-vercel-proxied-for'],
            'x-real-ip': data.headers['x-real-ip'],
            'x-vercel-ip-postal-code': data.headers['x-vercel-ip-postal-code'],
            'host': data.headers.host,
            'sec-fetch-dest': data.headers['sec-fetch-dest'],
            'sec-fetch-site': data.headers['sec-fetch-site'],
            'x-forwarded-for': data.headers['x-forwarded-for'],
            'origin': data.headers.origin,
            'sec-ch-ua': data.headers['sec-ch-ua'],
            'user-agent': data.headers['user-agent'],
            'sec-ch-ua-platform': data.headers['sec-ch-ua-platform'],
            'x-vercel-ip-longitude': data.headers['x-vercel-ip-longitude'],
            'accept': data.headers.accept,
            'x-vercel-forwarded-for': data.headers['x-vercel-forwarded-for'],
            'x-vercel-ip-latitude': data.headers['x-vercel-ip-latitude'],
            'x-forwarded-proto': data.headers['x-forwarded-proto'],
            'x-vercel-ip-country-region': data.headers['x-vercel-ip-country-region'],
            'x-vercel-deployment-url': data.headers['x-vercel-deployment-url'],
            'accept-encoding': data.headers['accept-encoding'],
            'x-vercel-id': data.headers['x-vercel-id'],
            'accept-language': data.headers['accept-language'],
            'x-vercel-ip-city': decodeURIComponent(data.headers['x-vercel-ip-city'] || ''),
            'x-vercel-ip-country': data.headers['x-vercel-ip-country']
        }
    } : null;

    const logEntry = {
        service: 'suggest-people',
        logVersion: '4.3.6',
        timestamp: new Date().toISOString(),
        event: {
            level,
            action: message,
            query: data.query || null,
            response: data.status ? {
                status: data.status,
                processingTime: data.processingTime,
                contentPreview: data.responseContent ? 
                    data.responseContent.substring(0, 500) + '...' : null,
                cacheHit: data.cacheHit
            } : null,
            error: data.error || null
        },
        client: {
            origin: data.headers?.origin || null,
            userAgent: data.headers?.['user-agent'] || null
        },
        server: serverInfo,
        request: requestInfo
    };
    
    console.log(JSON.stringify(logEntry));
}

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
 * @returns {Promise<Object>} The result of the analytics recording
 */
async function recordQueryAnalytics(req, locationData, startTime, formattedResults, cacheHit, cacheResult) {
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
            const resultCount = formattedResults.length;
            
            // Create raw analytics data
            const rawData = {
                handler: 'suggestPeople',
                query: req.query.query || '[empty query]',
                searchCollection: 'seattleu~sp-search',
                userAgent: req.headers['user-agent'],
                referer: req.headers.referer,
                city: locationData.city || decodeURIComponent(req.headers['x-vercel-ip-city'] || ''),
                region: locationData.region || req.headers['x-vercel-ip-country-region'],
                country: locationData.country || req.headers['x-vercel-ip-country'],
                timezone: locationData.timezone || req.headers['x-vercel-ip-timezone'],
                responseTime: processingTime,
                resultCount: resultCount,
                hasResults: resultCount > 0,
                cacheHit: cacheHit,
                cacheSet: cacheResult,
                isStaffTab: true,
                tabs: ['Faculty & Staff'],
                sessionId: sessionId,
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
                },
                timestamp: new Date()
            };
                        
            // Log the enrichment data explicitly
            console.log('Enrichment data for MongoDB:', JSON.stringify(rawData.enrichmentData));
            
            // Standardize data to ensure consistent schema
            const analyticsData = createStandardAnalyticsData(rawData);
            
            // Log data (excluding sensitive information)
            logAnalyticsData(analyticsData, 'suggestPeople recording');
            
            // Record the analytics
            try {
                const recordResult = await recordQuery(analyticsData);
                console.log('Analytics record result:', recordResult ? 'Saved' : 'Not saved');
                if (recordResult && recordResult._id) {
                    console.log('Analytics record ID:', recordResult._id.toString());
                }
                return recordResult;
            } catch (recordError) {
                console.error('Error recording analytics:', recordError.message);
                if (recordError.name === 'ValidationError') {
                    console.error('Validation errors:', Object.keys(recordError.errors).join(', '));
                }
                return null;
            }
        } else {
            console.log('No MongoDB URI defined, skipping analytics recording');
            return null;
        }
    } catch (analyticsError) {
        console.error('Analytics error:', analyticsError);
        return null;
    }
}

/**
 * Handler for people/faculty/staff suggestion requests to Funnelback
 * Now includes Redis caching for improved performance
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handler(req, res) {
    const startTime = Date.now();
    const requestId = req.headers['x-vercel-id'] || Date.now().toString();
    const userIp = req.headers['x-original-client-ip'] || 
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 
        (req.headers['x-real-ip']) || 
        req.socket.remoteAddress;

    console.log(`[RequestID: ${requestId}] Processing request for ${userIp}`);


    // CORS handling for Seattle University domain
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
    let cacheResult = null;
    let formattedResults = null;
    const locationData = await getLocationData(userIp);
    console.log('GeoIP location data:', locationData);
    
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
                logEvent('info', 'Cache hit for people suggestions', {
                    status: 200,
                    processingTime: `${processingTime}ms`,
                    query: req.query,
                    headers: req.headers,
                    cacheHit: true,
                    requestId: requestId
                });
                
                // Send cached response
                res.setHeader('Content-Type', 'application/json');
                res.send(formattedResults);
                
                // Get location data and record analytics (in background)
                recordQueryAnalytics(req, locationData, startTime, formattedResults, true, null);
                return; // Exit early since response already sent
            }
        } catch (cacheError) {
            // Log cache error but continue with normal flow
            console.error('Cache error in people handler:', cacheError);
        }
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.json';

        console.log('DEBUG - About to make Funnelback API request with params:', {
            url: funnelbackUrl,
            query: req.query,
            userIp
        });
        
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

        // Log the exact URL for debugging
        console.log('DEBUG - Exact Funnelback URL:', url);

        // Log request details
        logEvent('debug', 'Outgoing request details', {
            service: 'suggest-people',
            url: url,
            query: Object.fromEntries(params),
            headers: req.headers,
            requestId: requestId
        });

        console.log('DEBUG - Making request to Funnelback with URL:', url);

        const funnelbackHeaders = {
            'Accept': 'text/html',
            'X-Forwarded-For': userIp,
            'X-Geo-City': locationData.city,
            'X-Geo-Region': locationData.region,
            'X-Geo-Country': locationData.country,
            'X-Geo-Timezone': locationData.timezone
        };
        console.log('- Outgoing Headers to Funnelback:', funnelbackHeaders);

        const response = await axios.get(url, {
            headers: funnelbackHeaders
        });

        console.log('DEBUG - Response status:', response.status);
        console.log('DEBUG - Response data type:', response.data?.response?.resultPacket?.results ? 'Has results' : 'No results');
        console.log('DEBUG - Number of results:', response.data?.response?.resultPacket?.results?.length || 0);

        console.log('DEBUG - Funnelback API response status:', response.status);
        console.log('DEBUG - Funnelback API response data type:', typeof response.data);
        console.log('DEBUG - Funnelback API response structure:', {
            hasResponse: !!response.data?.response,
            hasResultPacket: !!response.data?.response?.resultPacket,
            hasResults: !!response.data?.response?.resultPacket?.results,
            resultCount: response.data?.response?.resultPacket?.results?.length || 0
        });

        // Get result count for analytics
        const resultCount = response.data?.response?.resultPacket?.results?.length || 0;
        const processingTime = Date.now() - startTime;

        // Log the successful response
        logEvent('info', 'Response received', {
            service: 'suggest-people',
            query: Object.fromEntries(params),
            status: response.status,
            processingTime: `${processingTime}ms`,
            responseContent: JSON.stringify(response.data).substring(0, 500) + '...',
            headers: req.headers,
            cacheHit: false,
            requestId: requestId
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

        if (canUseCache && formattedResults && formattedResults.length > 0) {
            console.log(`DEBUG - Storing people results in cache, count: ${formattedResults.length}`);
            
            try {
                // Log the exact parameters to help with debugging
                console.log(`DEBUG - People cache key parameters:`, {
                    endpoint: 'people',
                    query: req.query.query,
                    collection: 'seattleu~sp-search',
                    staffTab: true,
                    requestId: requestId
                });
                
                cacheResult = await setCachedData('people', req.query, formattedResults, requestId);
                console.log(`DEBUG - People cache set result: ${cacheResult}`);
            } catch (cacheSetError) {
                console.error('DEBUG - Error setting people cache:', cacheSetError);
                cacheResult = false;
            }
        }

        // Send response
        res.setHeader('Content-Type', 'application/json');
        res.send(formattedResults);
        
        // Record analytics (in background)
        recordQueryAnalytics(req, locationData, startTime, formattedResults, false, cacheResult);

    } catch (error) {
        // Log detailed error information
        logEvent('error', 'Handler error', {
            service: 'suggest-people',
            query: req.query,
            error: {
                message: error.message,
                stack: error.stack,
                response: error.response?.data,
                status: error.response?.status
            },
            status: error.response?.status || 500,
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
        
        res.status(error.response?.status || 500).json({
            error: 'Error fetching results',
            message: error.message,
            details: error.response?.data
        });
    }
}

module.exports = handler;
/**
* @fileoverview Suggestion Handler for Funnelback Search Integration
* 
* Handles autocomplete suggestion requests for the Funnelback integration.
* Provides real-time search suggestions as users type, with structured logging
* for Vercel serverless environment. Added caching with Vercel native Redis.
* 
* Features:
* - CORS handling for Seattle University domain
* - Redis Caching for improved performance and reduced latency
* - Structured JSON logging for Vercel
* - Request/Response tracking with detailed headers
* - Query parameter tracking
* - Session-based analytics tracking
* - Enrichment data recording
* - Comprehensive error handling with detailed logging
* - Query analytics integration
* - Consistent schema handling
* 
* @author Victor Chimenti
* @version 4.3.5
* @namespace suggestionHandler
* @license MIT
* @lastModified 2025-03-20
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
    logCacheCheck,
    logCacheHit,
    logCacheMiss,
    logCacheError,
    logCacheSet
} = require('../lib/cacheService');

/**
* Creates a standardized log entry for Vercel environment
* 
* @param {string} level - Log level ('info', 'warn', 'error')
* @param {string} message - Main log message/action
* @param {Object} data - Additional data to include in log
* @param {Object} [data.query] - Query parameters
* @param {Object} [data.headers] - Request headers
* @param {number} [data.status] - HTTP status code
* @param {string} [data.processingTime] - Request processing duration
* @param {number} [data.suggestionsCount] - Number of suggestions returned
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

   // Format query parameters in the preferred style
   const queryParams = data.query ? {
       'Query Parameters': {
           ...data.query,
           collection: data.query.collection || 'seattleu~sp-search',
           profile: data.query.profile || '_default',
           form: data.query.form || 'partial'
       }
   } : null;

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
       service: 'suggest-handler',
       level,
       ...queryParams,
       action: message,
       ...requestInfo,
       response: data.status ? {
           status: data.status,
           processingTime: data.processingTime,
           suggestionsCount: data.suggestionsCount,
           cacheHit: data.cacheHit
       } : null,
       serverInfo,
       timestamp: new Date().toISOString()
   };
   
   console.log(JSON.stringify(logEntry));
}

/**
* Enriches suggestions with metadata based on content and tab parameters
* 
* @param {Array<string>} suggestions - Raw suggestions from Funnelback
* @param {Object} query - Query parameters including tab information
* @returns {Array<Object>} Enriched suggestions with metadata
*/
function enrichSuggestions(suggestions, query) {
    if (!Array.isArray(suggestions)) {
        console.log('No suggestions to enrich or invalid format');
        return [];
    }
    
    // Log incoming request parameters
    console.log('Enrichment Request Parameters:', {
        isProgramTab: Boolean(query['f.Tabs|programMain']),
        isStaffTab: Boolean(query['f.Tabs|seattleu~ds-staff']),
        tabParameters: {
            program: query['f.Tabs|programMain'],
            staff: query['f.Tabs|seattleu~ds-staff']
        },
        suggestionCount: suggestions.length
    });

    // Determine which tab made the request
    const isProgramTab = Boolean(query['f.Tabs|programMain']);
    const isStaffTab = Boolean(query['f.Tabs|seattleu~ds-staff']);

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

        // Log each suggestion enrichment
        console.log('Enriching suggestion:', {
            original: suggestion,
            tabs: metadata.tabs,
            isProgramTab,
            isStaffTab
        });

        return {
            display: suggestion,
            metadata
        };
    });

    // Log final enriched results
    console.log('Enrichment complete:', {
        totalSuggestions: suggestions.length,
        enrichedSuggestions: enrichedSuggestions.map(s => ({
            display: s.display,
            tabs: s.metadata.tabs
        }))
    });

    return enrichedSuggestions;
}

/**
* Handler for suggestion requests to Funnelback search service
* Now includes enhanced analytics tracking with session support and Redis caching
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
   const requestId = req.headers['x-vercel-id'] || Date.now().toString();
   
   console.log(`DEBUG - suggest.js handler called with requestId: ${requestId}`);
   console.log(`DEBUG - Request query:`, req.query);
   
   // Set CORS headers
   res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

   const userIp = req.headers['x-original-client-ip'] || 
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 
    (req.headers['x-real-ip']) || 
    req.socket.remoteAddress;

   console.log(`[RequestID: ${requestId}] Processing request for ${userIp}`);


   // Add debug logging
   console.log('IP Headers:', {
       originalClientIp: req.headers['x-original-client-ip'],
       forwardedFor: req.headers['x-forwarded-for'],
       realIp: req.headers['x-real-ip'],
       socketRemote: req.socket.remoteAddress,
       vercelIpCity: req.headers['x-vercel-ip-city'],
       finalUserIp: userIp
   });

   if (req.method === 'OPTIONS') {
       logEvent('info', 'OPTIONS request', { 
           requestId,
           headers: req.headers
       });
       res.status(200).end();
       return;
   }

   // Check caching capability
   console.log(`DEBUG - About to check if caching is enabled, requestId: ${requestId}`);
   
   // Added await here - this is critical
   const cachingEnabled = await isCachingEnabled();
   console.log(`DEBUG - Caching enabled result: ${cachingEnabled}`);
   
   // Only use caching for queries with 3 or more characters
    const canUseCache = cachingEnabled && 
                    (req.query.query || req.query.partial_query) && 
                    (req.query.query?.length >= 3 || req.query.partial_query?.length >= 3);

    console.log(`DEBUG - Cache parameters check:`, {
        cachingEnabled,
        queryExists: !!(req.query.query || req.query.partial_query),
        queryLength: (req.query.query?.length || req.query.partial_query?.length || 0),
        canUseCache
    });

    // Create a stable copy
    const willUseCache = canUseCache; 
    console.log(`DEBUG - Cache decision locked: ${willUseCache}`);
   let cacheHit = false;
   let enrichedResponse = null;
   
   // Try to get data from cache first
   if (canUseCache) {
       console.log(`DEBUG - Attempting cache lookup for suggestQuery: ${req.query.query}`);
       try {
           // Pass requestId to track cache operations through the request lifecycle
           console.log(`DEBUG - Calling getCachedData with requestId: ${requestId}`);
           const cachedData = await getCachedData('suggestions', req.query, requestId);
           console.log(`DEBUG - getCachedData returned: ${cachedData ? 'data found' : 'no data'}`);
           
           if (cachedData) {
               cacheHit = true;
               enrichedResponse = cachedData;
               
               // Calculate processing time
               const processingTime = Date.now() - startTime;
               
               // Log success explicitly here
               console.log(`DEBUG - Cache hit successful for suggestions endpoint. Processing time: ${processingTime}ms`);
               
               // Add extra cache hit log
               logCacheHit('suggestions', `suggestions:${JSON.stringify(req.query)}`, {
                   requestId,
                   query: req.query,
                   processingTime: `${processingTime}ms`,
                   dataSize: `${JSON.stringify(enrichedResponse).length} chars`
               });
               
               // Log cache hit with standard event logging
               logEvent('info', 'Cache hit for suggestions', {
                   status: 200,
                   processingTime: `${processingTime}ms`,
                   suggestionsCount: enrichedResponse.length || 0,
                   query: req.query,
                   headers: req.headers,
                   cacheHit: true,
                   requestId: requestId
               });
               
               // Send cached response and continue with analytics recording
               res.json(enrichedResponse);
           } else {
               console.log(`DEBUG - Cache miss for suggestions endpoint`);
               logCacheMiss('suggestions', `suggestions:${JSON.stringify(req.query)}`, {
                   requestId,
                   query: req.query
               });
           }
       } catch (cacheError) {
           // Added more detailed error logging
           console.error('DEBUG - Cache error details:', {
               message: cacheError.message,
               stack: cacheError.stack,
               name: cacheError.name
           });
           
           // Log cache error with standardized format
           logCacheError('suggestions', `suggestions:${JSON.stringify(req.query)}`, {
               requestId,
               query: req.query,
               errorType: cacheError.name,
               errorMessage: cacheError.message
           });
           
           console.error('Cache error:', cacheError);
           // Continue with normal request flow
       }
   }

   // If we got a cache hit, we only need to record analytics
   if (cacheHit) {
       console.log(`DEBUG - Cache hit handling - skipping Funnelback request`);
       const locationData = await getLocationData(userIp);
       recordQueryAnalytics(req, locationData, startTime, enrichedResponse, true);
       return; // Exit early since response already sent
   }

   const locationData = await getLocationData(userIp);
   console.log('GeoIP location data:', locationData);

   try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/suggest.json';

        const funnelbackHeaders = {
            'Accept': 'text/html',
            'X-Forwarded-For': userIp,
            'X-Geo-City': locationData.city,
            'X-Geo-Region': locationData.region,
            'X-Geo-Country': locationData.country,
            'X-Geo-Timezone': locationData.timezone
        };
        console.log('- Outgoing Headers to Funnelback:', funnelbackHeaders);

        console.log(`DEBUG - Making Funnelback API request to ${funnelbackUrl}`);
        const response = await axios.get(funnelbackUrl, {
            params: req.query,
            headers: funnelbackHeaders
        });
        console.log(`DEBUG - Funnelback API response status: ${response.status}`);

        // Ensure response data is an array (handle API inconsistencies)
        const responseData = Array.isArray(response.data) ? response.data : [];
        console.log(`DEBUG - Funnelback returned ${responseData.length} results`);

        // Enrich suggestions with metadata
        console.log(`DEBUG - Enriching suggestions`);
        enrichedResponse = enrichSuggestions(responseData, req.query);

        if (willUseCache && enrichedResponse && enrichedResponse.length > 0) {
            console.log(`DEBUG - Storing enriched response in cache, length: ${enrichedResponse.length}`);
            
            try {
                // Add logging for the exact key being used
                console.log(`DEBUG - Cache key parameters:`, {
                    endpoint: 'suggestions',
                    collection: req.query.collection || 'seattleu~sp-search',
                    profile: req.query.profile || '_default',
                    query: req.query.query || req.query.partial_query,
                    requestId: requestId
                });
                
                // Use the suggestions endpoint identifier to match with the retrieval
                const cacheResult = await setCachedData('suggestions', req.query, enrichedResponse, requestId);
                console.log(`DEBUG - Cache set result: ${cacheResult}`);
            } catch (cacheSetError) {
                console.error('DEBUG - Error setting cache:', cacheSetError);
            }
        } else {
            console.log(`DEBUG - Skipping cache storage, willUseCache: ${willUseCache}, resultsLength: ${enrichedResponse.length}`);
        }

        // Process time for this request
        const processingTime = Date.now() - startTime;

        logEvent('info', 'Response enriched', {
            status: response.status,
            processingTime: `${processingTime}ms`,
            suggestionsCount: enrichedResponse.length || 0,
            query: req.query,
            headers: req.headers,
            cacheHit: false,
            requestId: requestId
        });

        // Record analytics data
        console.log(`DEBUG - Recording analytics`);
        await recordQueryAnalytics(req, locationData, startTime, enrichedResponse, false);
  
        // Send response to client
        console.log(`DEBUG - Sending response to client, length: ${enrichedResponse.length}`);
        res.json(enrichedResponse);
   } catch (error) {
       console.error('DEBUG - Handler error details:', {
           message: error.message,
           stack: error.stack, 
           name: error.name,
           responseStatus: error.response?.status,
           responseData: error.response?.data
       });
       
       logEvent('error', 'Handler error', {
           query: req.query,
           error: error.message,
           status: error.response?.status || 500,
           processingTime: `${Date.now() - startTime}ms`,
           headers: req.headers
       });
       
       res.status(500).json({
           error: 'Suggestion error',
           details: error.response?.data || error.message
       });
   }
}

/**
 * Records analytics data for the query
 * 
 * @param {Object} req - The request object
 * @param {Object} locationData - Geo location data
 * @param {number} startTime - Request start time
 * @param {Array} enrichedResponse - The response data
 * @param {boolean} cacheHit - Whether the response was served from cache
 */
async function recordQueryAnalytics(req, locationData, startTime, enrichedResponse, cacheHit) {
    try {
        // Log MongoDB URI presence (not the actual value for security)
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

            // Create raw analytics data
            const rawData = {
                handler: 'suggest',
                query: req.query.query || req.query.partial_query || '[empty query]',
                collection: req.query.collection || 'seattleu~sp-search',
                userAgent: req.headers['user-agent'],
                referer: req.headers.referer,
                city: locationData.city || decodeURIComponent(req.headers['x-vercel-ip-city'] || ''),
                region: locationData.region || req.headers['x-vercel-ip-country-region'],
                country: locationData.country || req.headers['x-vercel-ip-country'],
                timezone: locationData.timezone || req.headers['x-vercel-ip-timezone'],
                responseTime: processingTime,
                resultCount: enrichedResponse.length || 0,
                hasResults: enrichedResponse.length > 0,
                isProgramTab: Boolean(req.query['f.Tabs|programMain']),
                isStaffTab: Boolean(req.query['f.Tabs|seattleu~ds-staff']),
                tabs: [],
                sessionId: sessionId,
                clickedResults: [], // Ensure field exists
                enrichmentData: {
                    totalSuggestions: enrichedResponse ? enrichedResponse.length : 0,
                    suggestionsData: enrichedResponse ? enrichedResponse.map(s => ({
                        display: s.display,
                        tabs: s.metadata.tabs
                    })) : [],
                    cacheHit: cacheHit || false
                },
                timestamp: new Date()
            };

            // Add tabs information
            if (rawData.isProgramTab) rawData.tabs.push('program-main');
            if (rawData.isStaffTab) rawData.tabs.push('Faculty & Staff');
            
            // Standardize data to ensure consistent schema
            const analyticsData = createStandardAnalyticsData(rawData);
            
            // Log analytics data (excluding sensitive info)
            logAnalyticsData(analyticsData, 'suggest recording');
            
            // Record the analytics with better error handling
            try {
                const recordResult = await recordQuery(analyticsData);
                console.log('Analytics record result:', recordResult ? 'Saved' : 'Not saved');
                if (recordResult && recordResult._id) {
                    console.log('Analytics record ID:', recordResult._id.toString());
                }
            } catch (recordError) {
                console.error('Error recording analytics:', recordError.message);
                console.error('Full error:', recordError);
                
                // Try to provide more specific error information
                if (recordError.name === 'ValidationError') {
                    console.error('Validation errors:', Object.keys(recordError.errors).join(', '));
                } else if (recordError.name === 'MongooseError') {
                    console.error('Mongoose error type:', recordError.name);
                } else if (recordError.name === 'MongoServerError') {
                    console.error('MongoDB server error code:', recordError.code);
                }
            }
        } else {
            console.log('No MongoDB URI defined, skipping analytics recording');
        }
    } catch (analyticsError) {
        // Log analytics error but don't fail the request
        console.error('Analytics preparation error:', analyticsError);
    }
}

// Export a single function as required by Vercel
module.exports = handler;
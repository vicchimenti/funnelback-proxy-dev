/**
 * @fileoverview Suggestion Handler for Funnelback Search Integration (People)
 * 
 * Handles autocomplete suggestion requests for faculty and staff searches with
 * structured logging for Vercel serverless environment. Returns detailed information
 * including affiliation, college, department, and position data.
 * 
 * Features:
 * - CORS handling for Seattle University domain
 * - Structured JSON logging for Vercel
 * - Request/Response tracking with detailed headers
 * - Enhanced response format with rich metadata
 * - Title cleaning and formatting
 * - Comprehensive error handling with detailed logging
 * 
 * @author Victor Chimenti
 * @version 2.0.2
 * @license MIT
 */

const axios = require('axios');
const os = require('os');

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
 * @param {string} [data.responseContent] - Preview of response content
 * @param {Object} [data.error] - Error details if applicable
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
        logVersion: '2.0.2',
        timestamp: new Date().toISOString(),
        event: {
            level,
            action: message,
            query: data.query ? {
                searchTerm: data.query.query || '',
                collection: data.query.collection,
                profile: data.query.profile
            } : null,
            response: data.status ? {
                status: data.status,
                processingTime: data.processingTime,
                contentPreview: data.responseContent ? 
                    data.responseContent.substring(0, 500) + '...' : null
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
        .split('|')[0]                    // Get first part before pipe
        .replace(/<\/?[^>]+(>|$)/g, '')   // Remove HTML tags
        .trim();                          // Remove extra whitespace
}

/**
 * Handler for suggestion requests to Funnelback search service
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters from the request
 * @param {string} [req.query.query] - Search query string
 * @param {Object} req.headers - Request headers
 * @param {string} req.method - HTTP method of the request
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
async function handler(req, res) {
    const startTime = Date.now();
    const requestId = req.headers['x-vercel-id'] || Date.now().toString();
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // CORS handling for Seattle University domain
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.json';
        const queryParams = { 
            form: 'partial',
            profile: '_default',
            query: req.query.query,
            'f.Tabs|seattleu|ds-staff': 'Faculty & Staff',
            collection: 'seattleu~sp-search',
            numranks: 5
        };

        // Log detailed request info
        logEvent('debug', 'Outgoing request details', {
            service: 'suggest-people',
            url: `${funnelbackUrl}?${new URLSearchParams(queryParams)}`,
            query: queryParams,
            headers: req.headers
        });

        // Log the actual URL we're hitting
        console.log('Funnelback URL:', `${funnelbackUrl}?${new URLSearchParams(queryParams)}`);

        const response = await axios.get(funnelbackUrl, {
            params: queryParams,
            headers: {
                'Accept': 'application/json',
                'X-Forwarded-For': userIp
            }
        });

        // Log raw response for debugging
        logEvent('debug', 'Raw Funnelback response', {
            service: 'suggest-people',
            query: queryParams,
            status: response.status,
            processingTime: `${Date.now() - startTime}ms`,
            responseContent: JSON.stringify(response.data),
            headers: req.headers,
        });

        // Extract and format results
        const results = response.data?.response?.resultPacket?.results || [];
        
        // Clean and format the results
        const formattedResults = results.map(result => ({
            ...result,
            title: cleanTitle(result.title),
            profileUrl: result.liveUrl || '',
            college: result.listMetadata?.college?.[0] || '',
            image: result.listMetadata?.image?.[0] || '',
            affiliation: result.listMetadata?.affiliation?.[0] || '',
            department: result.listMetadata?.peopleDepartment?.[0] || '',
            position: result.listMetadata?.peoplePosition?.[0] || ''
        }));

        // Log the successful response
        logEvent('info', 'Response received', {
            service: 'suggest-people',
            query: queryParams,
            status: response.status,
            processingTime: `${Date.now() - startTime}ms`,
            responseContent: JSON.stringify(formattedResults).substring(0, 500) + '...',
            headers: req.headers,
        });

        // Set JSON content type header and send response
        res.setHeader('Content-Type', 'application/json');
        res.send(formattedResults);

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
        
        // Send error response
        res.status(error.response?.status || 500).json({
            error: 'Error fetching results',
            message: error.message,
            details: error.response?.data
        });
    }
}

module.exports = handler;
/**
 * @fileoverview Suggestion Handler for Funnelback Search Integration (Programs)
 * 
 * Handles autocomplete suggestion requests for the "seattleu~ds-programs" collection.
 * Provides real-time search suggestions for academic programs with
 * structured logging for Vercel serverless environment.
 * 
 * Features:
 * - CORS handling for Seattle University domain
 * - Structured JSON logging for Vercel
 * - Request/Response tracking with detailed headers
 * - Query parameter tracking
 * - Comprehensive error handling with detailed logging
 * 
 * @author Victor Chimenti
 * @version 1.3.3
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
 * @param {number} [data.suggestionsCount] - Number of suggestions returned
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
            collection: 'seattleu~ds-programs',
            profile: data.query.profile || '_default',
            form: data.query.form || 'simple'
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
        service: data.service || 'suggest-programs',
        logVersion: 'v3',
        timestamp: new Date().toISOString(),
        event: {  // Nest under 'event' to make the change more obvious
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
            } : null
        },
        client: {  // Group client info together
            origin: data.headers?.origin || null,
            userAgent: data.headers?.['user-agent'] || null
        }
    };
    
    console.log(JSON.stringify(logEntry));
}

/**
 * Handler for suggestion requests to Funnelback search service
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters from the request
 * @param {Object} req.headers - Request headers
 * @param {string} req.method - HTTP method of the request
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
// suggestPeople.js
async function handler(req, res) {
    const startTime = Date.now();
    const requestId = req.headers['x-vercel-id'] || Date.now().toString();
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Keep your existing CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.html';
        const queryParams = { 
            ...req.query, 
            collection: 'seattleu~ds-programs',
            profile: '_default',
            form: 'simple'
        };
        
        // Log the request
        logEvent('info', 'Request received', {
            service: 'suggest-programs',
            query: queryParams,
            headers: req.headers
        });

        // Just pass through the response text
        const response = await axios.get(funnelbackUrl, {
            params: queryParams,
            headers: {
                'Accept': 'text/html',
                'X-Forwarded-For': userIp
            }
        });

        // Log the successful response
        logEvent('info', 'Response received', {
            service: 'suggest-programs',
            query: queryParams,
            status: response.status,
            processingTime: `${Date.now() - startTime}ms`,
            responseContent: response.data,
            headers: req.headers
        });

        res.send(response.data);
    } catch (error) {
        logEvent('error', 'Handler error', {
            service: 'suggest-programs',
            query: req.query,
            error: error.message,
            status: error.response?.status || 500,
            processingTime: `${Date.now() - startTime}ms`,
            headers: req.headers
        });
        
        res.status(500).send('Error fetching results');
    }
}

module.exports = handler;
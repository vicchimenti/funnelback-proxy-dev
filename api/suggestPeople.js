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
 * @version 2.2.1
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
        logVersion: '2.2.1',
        timestamp: new Date().toISOString(),
        event: {
            level,
            action: message,
            query: data.query || null,
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
        
        // Keep params for logging
        const params = new URLSearchParams();
        params.append('form', 'partial');
        params.append('profile', '_default');
        params.append('query', req.query.query);
        params.append('f.Tabs|seattleu|Eds-staff', 'Faculty & Staff');
        params.append('collection', 'seattleu~sp-search');
        params.append('num_ranks', '5');

        // Use correctly encoded queryString for request
        const queryString = [
            'form=partial',
            'profile=_default',
            `query=${encodeURIComponent(req.query.query)}`,
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
            headers: req.headers
        });

        console.log('DEBUG - Making request to Funnelback with URL:', url);
        const response = await axios.get(url, {
            headers: {
                'Accept': 'application/json',
                'X-Forwarded-For': userIp
            }
        });
        console.log('DEBUG - Response status:', response.status);
        console.log('DEBUG - Response data type:', response.data?.response?.resultPacket?.results ? 'Has results' : 'No results');
        console.log('DEBUG - Number of results:', response.data?.response?.resultPacket?.results?.length || 0);

        // Log the successful response
        logEvent('info', 'Response received', {
            service: 'suggest-people',
            query: Object.fromEntries(params),
            status: response.status,
            processingTime: `${Date.now() - startTime}ms`,
            responseContent: JSON.stringify(response.data).substring(0, 500) + '...',
            headers: req.headers,
        });

        // Format and send response
        const formattedResults = (response.data?.response?.resultPacket?.results || []).map(result => ({
            title: result.title || '',
            metadata: result.listMetadata?.affiliation?.[0] || result.listMetadata?.peoplePosition?.[0] || 'Faculty/Staff',
            department: result.listMetadata?.peopleDepartment?.[0] || result.listMetadata?.college?.[0] || '',
            url: result.liveUrl || '', // Only use liveUrl for direct profile links
            image: result.listMetadata?.image?.[0] || null
        }));
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
        
        res.status(error.response?.status || 500).json({
            error: 'Error fetching results',
            message: error.message,
            details: error.response?.data
        });
    }
}

module.exports = handler;
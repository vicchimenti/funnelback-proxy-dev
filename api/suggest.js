const axios = require('axios');
const os = require('os');

// Helper function for structured logging
function logEvent(level, message, data = {}) {
    // Vercel automatically collects console output and makes it searchable
    const serverInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB'
    };

    const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        service: 'suggest-handler',
        serverInfo,
        message,
        ...data
    };
    
    switch (level) {
        case 'error':
            console.error(JSON.stringify(logEntry));
            break;
        case 'warn':
            console.warn(JSON.stringify(logEntry));
            break;
        default:
            console.log(JSON.stringify(logEntry));
    }
}

async function handler(req, res) {
    const startTime = Date.now();
    const requestId = req.headers['x-vercel-id'] || Date.now().toString();
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const region = req.headers['x-vercel-ip-country'] || 'unknown';

    const requestInfo = {
        requestId,
        region,
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        ip: userIp,
        query: req.query,
        headers: req.headers,
        userAgent: req.headers['user-agent']
    };

    // Log incoming request with full details
    logEvent('info', 'Suggestion request received', requestInfo);

    if (req.method === 'OPTIONS') {
        logEvent('info', 'OPTIONS request handled', { requestId });
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/suggest.json';
        
        logEvent('info', 'Forwarding to Funnelback', {
            requestId,
            url: funnelbackUrl,
            query: req.query
        });

        const response = await axios.get(funnelbackUrl, {
            params: req.query,
            headers: {
                'Accept': 'application/json',
                'X-Forwarded-For': userIp
            }
        });

        const responseInfo = {
            requestId,
            status: response.status,
            processingTime: `${Date.now() - startTime}ms`,
            dataSize: `${JSON.stringify(response.data).length} bytes`,
            suggestionsCount: response.data.length || 0
        };

        // Log successful response
        logEvent('info', 'Suggestion response received', responseInfo);

        res.json(response.data);
    } catch (error) {
        const errorInfo = {
            requestId,
            message: error.message,
            status: error.response?.status || 500,
            data: error.response?.data,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            timestamp: new Date().toISOString(),
            processingTime: `${Date.now() - startTime}ms`,
            query: req.query.query || null
        };

        // Log error with full context
        logEvent('error', 'Suggestion handler error', errorInfo);
        
        res.status(500).json({
            error: 'Suggestion error',
            details: error.response?.data || error.message
        });
    }
}

module.exports = handler;
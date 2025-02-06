const axios = require('axios');
const os = require('os');

async function handler(req, res) {
    const startTime = Date.now();
    const serverInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB'
    };

    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const requestInfo = {
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        ip: userIp,
        query: req.query,
        headers: req.headers,
        userAgent: req.headers['user-agent']
    };

    console.log('=== Suggestion Request ===');
    console.log('Server Information:', JSON.stringify(serverInfo, null, 2));
    console.log('Request Details:', JSON.stringify(requestInfo, null, 2));

    if (req.method === 'OPTIONS') {
        console.log('Handling OPTIONS request');
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/suggest.json';
        console.log('Forwarding to Funnelback:', funnelbackUrl);
        console.log('Query Parameters:', JSON.stringify(req.query, null, 2));

        const response = await axios.get(funnelbackUrl, {
            params: req.query,
            headers: {
                'Accept': 'application/json',
                'X-Forwarded-For': userIp
            }
        });

        const processingTime = Date.now() - startTime;
        console.log('Response received:', {
            status: response.status,
            processingTime: processingTime + 'ms',
            dataSize: JSON.stringify(response.data).length + ' bytes'
        });

        res.json(response.data);
    } catch (error) {
        const errorInfo = {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            processingTime: Date.now() - startTime + 'ms'
        };

        console.error('Suggestion handler error:', JSON.stringify(errorInfo, null, 2));
        
        res.status(500).json({
            error: 'Suggestion error',
            details: error.response?.data || error.message
        });
    }
}

module.exports = handler;
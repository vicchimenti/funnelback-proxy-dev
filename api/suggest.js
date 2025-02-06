const axios = require('axios');

async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log('Suggestion Request:', {
        ip: userIp,
        query: req.query,
        headers: req.headers
    });

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/suggest.json';

        const response = await axios.get(funnelbackUrl, {
            params: req.query,
            headers: {
                'Accept': 'application/json',
                'X-Forwarded-For': userIp
            }
        });

        console.log('Suggestion response received');
        res.json(response.data);
    } catch (error) {
        console.error('Suggestion handler error:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        res.status(500).json({
            error: 'Suggestion error',
            details: error.response?.data || error.message
        });
    }
}

module.exports = handler;
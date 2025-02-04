const axios = require('axios');

async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s';
        
        // Ensure form=partial is included
        const params = {
            ...req.query,
            form: 'partial'
        };
        
        const response = await axios.get(funnelbackUrl, {
            params: params,
            headers: {
                'Accept': 'text/html',
                'X-Forwarded-For': userIp
            }
        });

        res.send(response.data);
    } catch (error) {
        res.status(500).send('Spelling error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
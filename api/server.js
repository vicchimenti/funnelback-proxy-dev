const axios = require('axios');

async function handler(req, res) {
    // Enable CORS for Seattle University domain
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Log IP address information
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log('User IP:', userIp);
    console.log('Full Headers:', req.headers);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.html';
        
        const params = {
            collection: 'seattleu~sp-search',
            profile: '_default',
            form: 'partial',
            ...req.query
        };

        console.log('Making request to Funnelback with IP:', userIp);
        
        const response = await axios.get(funnelbackUrl, {
            params: params,
            headers: {
                'Accept': 'text/html',
                'X-Forwarded-For': userIp  // Forward the user's IP to Funnelback
            }
        });

        // Log the response headers from Funnelback
        console.log('Funnelback Response Headers:', response.headers);

        res.send(response.data);
    } catch (error) {
        console.error('Error details:', {
            message: error.message,
            status: error.response?.status,
            headers: error.response?.headers,
            data: error.response?.data
        });
        res.status(500).send('Search error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
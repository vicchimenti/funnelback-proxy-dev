const axios = require('axios');

async function handler(req, res) {
    // Enable CORS for Seattle University domain
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

        const response = await axios.get(funnelbackUrl, {
            params: params,
            headers: {
                'Accept': 'text/html'
            }
        });

        // Send as text instead of JSON
        res.send(response.data);
    } catch (error) {
        console.error('Error details:', error.response?.data || error.message);
        res.status(500).send('Search error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
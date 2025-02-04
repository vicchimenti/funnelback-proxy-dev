const axios = require('axios');

async function handler(req, res) {
    try {
        console.log('Function called');
        console.log('Request query:', req.query);
        
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.html';
        
        // Combine default parameters with any additional query parameters
        const params = {
            collection: 'seattleu~sp-search',
            profile: '_default',
            form: 'partial',
            ...req.query  // This allows overriding defaults if needed
        };

        console.log('Making request to Funnelback with params:', params);

        const response = await axios.get(funnelbackUrl, {
            params: params,
            headers: {
                'Accept': 'application/json'
            }
        });

        res.status(200).json(response.data);
    } catch (error) {
        console.error('Error details:', error.response ? error.response.data : error.message);
        res.status(500).json({ 
            error: error.message,
            details: error.response ? error.response.data : null,
            query: req.query
        });
    }
}

module.exports = handler;
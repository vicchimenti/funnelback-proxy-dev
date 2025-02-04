async function handler(req, res) {
    // Enable CORS for Seattle University domain
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.html';
        
        // Log the request details
        console.log('Query parameters:', req.query);
        console.log('Request headers:', req.headers);
        
        // Add required Funnelback parameters
        const params = {
            ...req.query,
            collection: req.query.collection || 'seattleu-meta',  // Add default collection if not provided
            form: req.query.form || 'simple'  // Add default form if not provided
        };

        console.log('Funnelback URL:', funnelbackUrl);
        console.log('Params being sent:', params);

        const response = await axios.get(funnelbackUrl, {
            params: params,
            headers: { 
                'X-Forwarded-For': userIp,
                'Accept': 'application/json'  // Request JSON response
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Detailed error:', error.response ? error.response.data : error);
        res.status(500).json({ 
            error: error.message,
            details: error.response ? error.response.data : null,
            query: req.query
        });
    }
}
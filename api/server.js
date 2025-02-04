async function handler(req, res) {
    try {
        // Basic response to test if function works
        console.log('Function called');
        console.log('Request path:', req.url);
        console.log('Request query:', req.query);
        
        // Send a test response
        res.status(200).json({
            message: 'Function is working',
            path: req.url,
            query: req.query
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ 
            error: 'Server error',
            details: error.message 
        });
    }
}

module.exports = handler;
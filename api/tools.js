/**
 * @fileoverview Search Tools Proxy Server
 * 
 * Handles search tool-specific requests for the Funnelback integration.
 * Manages requests to Funnelback's tool endpoints, such as faceted search
 * and advanced search features.
 * 
 * Features:
 * - CORS handling
 * - Tool-specific parameter management
 * - Request path handling
 * 
 * @author Victor Chimenti
 * @version 1.0.0
 * @license MIT
 */

const axios = require('axios');

/**
 * Handler for search tools requests.
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters from the request
 * @param {Object} req.headers - Request headers
 * @param {string} req.method - HTTP method of the request
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Log request details
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log('Tools Request:');
    console.log('- User IP:', userIp);
    console.log('- Query Parameters:', req.query);
    console.log('- Request Headers:', req.headers);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s';
        const toolPath = req.query.path || '';
        
        console.log('Making Funnelback tools request:');
        console.log('- Base URL:', funnelbackUrl);
        console.log('- Tool Path:', toolPath);

        const response = await axios.get(`${funnelbackUrl}/${toolPath}`, {
            params: req.query,
            headers: {
                'Accept': 'text/html',
                'X-Forwarded-For': userIp
            }
        });

        console.log('Tools response received successfully');
        res.send(response.data);
    } catch (error) {
        console.error('Error in tools handler:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        res.status(500).send('Tools error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
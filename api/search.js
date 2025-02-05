/**
 * @fileoverview Dedicated Search Results Proxy Server
 * 
 * Handles specific search result requests for the Funnelback integration.
 * This server is optimized for handling pure search queries separate from
 * other functionality like spelling suggestions or tools.
 * 
 * Features:
 * - CORS handling
 * - Search-specific parameter management
 * - Detailed logging of search requests
 * 
 * @author Victor Chimenti
 * @version 1.1.0
 * @license MIT
 */

const axios = require('axios');

/**
 * Handler for dedicated search requests.
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
    console.log('Search Request:');
    console.log('- User IP:', userIp);
    console.log('- Query Parameters:', req.query);
    console.log('- Request Headers:', req.headers);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/suggest.json';
        
        console.log('Making Funnelback search request:');
        console.log('- URL:', funnelbackUrl);
        console.log('- Parameters:', req.query);

        const response = await axios.get(funnelbackUrl, {
            params: req.query,
            headers: {
                'Accept': 'text/html',
                'X-Forwarded-For': userIp
            }
        });

        console.log('Search response received successfully');
        res.send(response.data);
    } catch (error) {
        console.error('Error in search handler:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        res.status(500).send('Search error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
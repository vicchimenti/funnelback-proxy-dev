/**
 * @fileoverview Primary Funnelback Search Proxy Server
 * 
 * Handles the main search functionality for the Funnelback integration.
 * Acts as a proxy between client-side requests and Funnelback's search API,
 * managing CORS, request forwarding, and IP handling.
 * 
 * Features:
 * - CORS handling for Seattle University domain
 * - IP forwarding to Funnelback
 * - Query parameter management
 * - Error handling and logging
 * 
 * @author Victor Chimenti
 * @version 1.0.0
 * @license MIT
 */

const axios = require('axios');

/**
 * Main request handler for search functionality.
 * 
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters from the request
 * @param {Object} req.headers - Request headers
 * @param {string} req.method - HTTP method of the request
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
async function handler(req, res) {
    // Enable CORS for Seattle University domain
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Log request details
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log('Main Search Request:');
    console.log('- User IP:', userIp);
    console.log('- Query Parameters:', req.query);
    console.log('- Request Headers:', req.headers);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.html';
        
        // Add default parameters if not provided
        const params = {
            collection: 'seattleu~sp-search',
            profile: '_default',
            form: 'partial',
            ...req.query
        };

        console.log('Making Funnelback request:');
        console.log('- URL:', funnelbackUrl);
        console.log('- Parameters:', params);

        const response = await axios.get(funnelbackUrl, {
            params: params,
            headers: {
                'Accept': 'text/html',
                'X-Forwarded-For': userIp
            }
        });

        console.log('Funnelback response received successfully');
        res.send(response.data);
    } catch (error) {
        console.error('Error in main search handler:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        res.status(500).send('Search error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
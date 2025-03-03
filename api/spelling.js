/**
 * @fileoverview Spelling Suggestions Proxy Server
 * 
 * Handles spelling suggestion requests for the Funnelback integration.
 * Ensures proper formatting of spelling-specific requests and manages
 * the 'form=partial' parameter required for spelling suggestions.
 * 
 * Features:
 * - CORS handling
 * - Spelling-specific parameter management
 * - Detailed request logging
 * 
 * @author Victor Chimenti
 * @version 1.0.1
 * @license MIT
 */

const axios = require('axios');

/**
 * Handler for spelling suggestion requests.
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
    console.log('Spelling Request:');
    console.log('- User IP:', userIp);
    console.log('- Query Parameters:', req.query);
    console.log('- Request Headers:', req.headers);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.html';
        
        const params = new URLSearchParams({
            ...req.query,
            collection: 'seattleu~sp-search',
            profile: '_default',
            form: 'partial'
        });

        console.log('Making Funnelback spelling request:');
        console.log('- URL:', `${funnelbackUrl}?${params.toString()}`);

        const response = await axios.get(funnelbackUrl, {
            params: params,
            headers: {
                'Accept': 'text/html',
                'X-Forwarded-For': userIp
            }
        });

        console.log('Spelling response received successfully');
        res.send(response.data);
    } catch (error) {
        console.error('Error in spelling handler:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        res.status(500).send('Spelling error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
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
 * - Analytics integration
 * 
 * @author Victor Chimenti
 * @version 2.0.2
 * @license MIT
 */

const axios = require('axios');
const { recordQuery } = require('../lib/queryAnalytics');

/**
 * Extracts the number of results from an HTML response
 * 
 * @param {string} htmlContent - The HTML response from Funnelback
 * @returns {number} The number of results, or 0 if not found
 */
function extractResultCount(htmlContent) {
    try {
        // Look for result count in HTML response
        const match = htmlContent.match(/totalMatching">([0-9,]+)</);
        if (match && match[1]) {
            return parseInt(match[1].replace(/,/g, ''), 10);
        }
    } catch (error) {
        console.error('Error extracting result count:', error);
    }
    return 0;
}

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
    const startTime = Date.now();
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
        
        // Extract the result count from the HTML response
        const resultCount = extractResultCount(response.data);
        const processingTime = Date.now() - startTime;
        
        // Record analytics data
        try {
            console.log('MongoDB URI defined:', !!process.env.MONGODB_URI);
            
            if (process.env.MONGODB_URI) {
                // Extract query from query parameters - looking at both query and partial_query
                console.log('Raw query parameters:', req.query);
                console.log('Looking for query in:', req.query.query, req.query.partial_query);
                
                const analyticsData = {
                    handler: 'server',
                    query: req.query.query || req.query.partial_query || '[empty query]',
                    searchCollection: params.collection,
                    userIp: userIp,
                    userAgent: req.headers['user-agent'],
                    referer: req.headers.referer,
                    city: decodeURIComponent(req.headers['x-vercel-ip-city'] || ''),
                    region: req.headers['x-vercel-ip-country-region'],
                    country: req.headers['x-vercel-ip-country'],
                    timezone: req.headers['x-vercel-ip-timezone'],
                    latitude: req.headers['x-vercel-ip-latitude'],
                    longitude: req.headers['x-vercel-ip-longitude'],
                    responseTime: processingTime,
                    resultCount: resultCount,
                    isProgramTab: Boolean(req.query['f.Tabs|programMain']),
                    isStaffTab: Boolean(req.query['f.Tabs|seattleu~ds-staff']),
                    tabs: [],
                    timestamp: new Date()
                };
                
                // Add tabs information
                if (analyticsData.isProgramTab) analyticsData.tabs.push('program-main');
                if (analyticsData.isStaffTab) analyticsData.tabs.push('Faculty & Staff');
                
                // Log analytics data (excluding sensitive info)
                const loggableData = { ...analyticsData };
                delete loggableData.userIp;
                console.log('Analytics data prepared for recording:', loggableData);
                
                // Record the analytics
                try {
                    const recordResult = await recordQuery(analyticsData);
                    console.log('Analytics record result:', recordResult ? 'Saved' : 'Not saved');
                    if (recordResult && recordResult._id) {
                        console.log('Analytics record ID:', recordResult._id.toString());
                    }
                } catch (recordError) {
                    console.error('Error recording analytics:', recordError.message);
                    if (recordError.name === 'ValidationError') {
                        console.error('Validation errors:', Object.keys(recordError.errors).join(', '));
                    }
                }
            } else {
                console.log('No MongoDB URI defined, skipping analytics recording');
            }
        } catch (analyticsError) {
            console.error('Analytics error:', analyticsError);
        }
        
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
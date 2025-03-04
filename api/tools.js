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
 * - Analytics integration
 * 
 * @author Victor Chimenti
 * @version 2.0.2
 * @license MIT
 */

const axios = require('axios');
const { recordQuery } = require('../lib/queryAnalytics');

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
    const startTime = Date.now();
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Log request details
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
        
        // Calculate processing time for analytics
        const processingTime = Date.now() - startTime;
        
        // Record analytics data
        try {
            console.log('MongoDB URI defined:', !!process.env.MONGODB_URI);
            
            if (process.env.MONGODB_URI) {
                console.log('Raw query parameters:', req.query);
                
                const analyticsData = {
                    handler: 'tools',
                    query: req.query.query || req.query.partial_query || '[empty query]',
                    searchCollection: req.query.collection || 'seattleu~sp-search',
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
                    resultCount: 0, // Can't easily extract this from tools responses
                    isProgramTab: Boolean(req.query['f.Tabs|programMain']),
                    isStaffTab: Boolean(req.query['f.Tabs|seattleu~ds-staff']),
                    tabs: [],
                    // Additional tools-specific data
                    toolPath: toolPath,
                    toolParams: req.query,
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
        console.error('Error in tools handler:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        res.status(500).send('Tools error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
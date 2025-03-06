/**
 * @fileoverview Dedicated Search Results Proxy Server - Enhanced with Analytics
 * 
 * Handles specific search result requests for the Funnelback integration.
 * Enhanced with session tracking and improved analytics integration.
 * 
 * Features:
 * - CORS handling
 * - Search-specific parameter management
 * - Detailed logging of search requests
 * - Enhanced analytics with session tracking
 * - Click-through attribution
 * 
 * @author Victor Chimenti
 * @version 2.2.0
 * @license MIT
 * @lastModified 2025-03-06
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
 * Extract session ID from request query parameters
 * Handles both string and array formats
 * 
 * @param {Object} query - The request query parameters
 * @returns {string|null} The session ID as a string or null if not found
 */
function extractSessionId(query) {
    if (!query.sessionId) {
        return null;
    }
    
    // If sessionId is an array, take the first value
    if (Array.isArray(query.sessionId)) {
        console.log('Session ID is an array, using first value:', query.sessionId[0]);
        return query.sessionId[0];
    }
    
    // Otherwise, use it as is
    return query.sessionId;
}

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
    const startTime = Date.now();
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Log request details
    console.log('Search Request:');
    console.log('- User IP:', userIp);
    console.log('- Query Parameters:', req.query);
    console.log('- Request Headers:', req.headers);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.html';

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
                
                // Extract session ID if provided by the client
                const sessionId = extractSessionId(req.query);
                console.log('Extracted session ID:', sessionId);
                
                const analyticsData = {
                    handler: 'search',
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
                    resultCount: resultCount,
                    hasResults: resultCount > 0,
                    isProgramTab: Boolean(req.query['f.Tabs|programMain']),
                    isStaffTab: Boolean(req.query['f.Tabs|seattleu~ds-staff']),
                    tabs: [],
                    // Include session ID if available
                    sessionId: sessionId,
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
        console.error('Error in search handler:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        res.status(500).send('Search error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
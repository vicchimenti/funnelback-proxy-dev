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
 * - Consistent schema handling
 * 
 * @author Victor Chimenti
 * @version 3.1.1
 * @license MIT
 * @lastModified 2025-03-13
 */

const axios = require('axios');
const { recordQuery } = require('../lib/queryAnalytics');
const { 
    createStandardAnalyticsData, 
    sanitizeSessionId, 
    logAnalyticsData 
} = require('../lib/schemaHandler');

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
    // const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // const userIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;

    const userIp = req.headers['x-original-client-ip'] || 
               (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 
               (req.headers['x-real-ip']) || 
               req.socket.remoteAddress;

    // Add debug logging
    console.log('IP Headers:', {
    originalClientIp: req.headers['x-original-client-ip'],
    forwardedFor: req.headers['x-forwarded-for'],
    realIp: req.headers['x-real-ip'],
    socketRemote: req.socket.remoteAddress,
    vercelIpCity: req.headers['x-vercel-ip-city'],
    finalUserIp: userIp
    });

    
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
                
                // Extract and sanitize session ID
                const sessionId = sanitizeSessionId(req.query.sessionId);
                console.log('Extracted session ID:', sessionId);

                // Add detailed session ID debugging AFTER extraction
                console.log('Session ID sources:', {
                    fromQueryParam: req.query.sessionId,
                    fromHeader: req.headers['x-session-id'],
                    fromBody: req.body?.sessionId,
                    afterSanitization: sessionId
                });
                
                // Create raw analytics data
                const rawData = {
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
                    sessionId: sessionId,
                    timestamp: new Date(),
                    clickedResults: [] // Initialize empty array to ensure field exists
                };
                
                // Add tabs information
                if (rawData.isProgramTab) rawData.tabs.push('program-main');
                if (rawData.isStaffTab) rawData.tabs.push('Faculty & Staff');
                
                // Standardize data to ensure consistent schema
                const analyticsData = createStandardAnalyticsData(rawData);
                
                // Log data (excluding sensitive information)
                logAnalyticsData(analyticsData, 'search recording');
                
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
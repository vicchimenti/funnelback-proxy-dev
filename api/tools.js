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
 * - Enhanced analytics integration
 * - GeoIP-based location tracking
 * - Session tracking
 * 
 * @author Victor Chimenti
 * @version 4.1.0
 * @namespace toolsHandler
 * @license MIT
 * @lastModified 2025-03-18
 */

const axios = require('axios');
const { getLocationData } = require('../lib/geoIpService');
const { recordQuery } = require('../lib/queryAnalytics');
const { 
    createStandardAnalyticsData, 
    sanitizeSessionId, 
    logAnalyticsData 
} = require('../lib/schemaHandler');

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
    
    // Get client IP from custom header or fallback methods
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

        // Get location data based on the user's IP
        const locationData = await getLocationData(userIp);
        console.log('GeoIP location data:', locationData);

        const funnelbackHeaders = {
            'Accept': 'text/html',
            'X-Forwarded-For': userIp,
            'X-Geo-City': locationData.city,
            'X-Geo-Region': locationData.region,
            'X-Geo-Country': locationData.country,
            'X-Geo-Timezone': locationData.timezone
        };
        console.log('- Outgoing Headers to Funnelback:', funnelbackHeaders);

        const response = await axios.get(`${funnelbackUrl}/${toolPath}`, {
            params: req.query,
            headers: funnelbackHeaders
        });

        console.log('Tools response received successfully');
        
        // Calculate processing time for analytics
        const processingTime = Date.now() - startTime;
        
        // Extract and sanitize session ID
        const sessionId = sanitizeSessionId(req.query.sessionId || req.headers['x-session-id']);
        console.log('Extracted session ID:', sessionId);

        // Add detailed session ID debugging
        console.log('Session ID sources:', {
            fromQueryParam: req.query.sessionId,
            fromHeader: req.headers['x-session-id'],
            fromBody: req.body?.sessionId,
            afterSanitization: sessionId
        });
        
        // Record analytics data
        try {
            console.log('MongoDB URI defined:', !!process.env.MONGODB_URI);
            
            if (process.env.MONGODB_URI) {
                console.log('Raw query parameters:', req.query);
                
                // Create raw analytics data
                const rawData = {
                    handler: 'tools',
                    query: req.query.query || req.query.partial_query || '[empty query]',
                    searchCollection: req.query.collection || 'seattleu~sp-search',
                    userAgent: req.headers['user-agent'],
                    referer: req.headers.referer,
                    city: locationData.city || decodeURIComponent(req.headers['x-vercel-ip-city'] || ''),
                    region: locationData.region || req.headers['x-vercel-ip-country-region'],
                    country: locationData.country || req.headers['x-vercel-ip-country'],
                    timezone: locationData.timezone || req.headers['x-vercel-ip-timezone'],
                    responseTime: processingTime,
                    resultCount: 0, // Can't easily extract this from tools responses
                    hasResults: false, // Default for tools endpoints
                    isProgramTab: Boolean(req.query['f.Tabs|programMain']),
                    isStaffTab: Boolean(req.query['f.Tabs|seattleu~ds-staff']),
                    tabs: [],
                    sessionId: sessionId,
                    // Additional tools-specific data
                    toolPath: toolPath,
                    timestamp: new Date(),
                    clickedResults: [] // Initialize empty array to ensure field exists
                };
                
                // Add tabs information
                if (rawData.isProgramTab) rawData.tabs.push('program-main');
                if (rawData.isStaffTab) rawData.tabs.push('Faculty & Staff');
                
                // Standardize data to ensure consistent schema
                const analyticsData = createStandardAnalyticsData(rawData);
                
                // Log data (excluding sensitive information)
                logAnalyticsData(analyticsData, 'tools recording');
                
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
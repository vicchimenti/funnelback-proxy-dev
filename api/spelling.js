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
 * - Enhanced analytics integration
 * - GeoIP-based location tracking
 * - Session tracking
 * 
 * @author Victor Chimenti
 * @version 4.1.0
 * @namespace spellingHandler
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
 * Extracts spelling suggestions from HTML response
 * 
 * @param {string} htmlContent - The HTML response from Funnelback
 * @returns {Array} Array of spelling suggestions, or empty array if none found
 */
function extractSpellingSuggestions(htmlContent) {
    try {
        // Simple regex to extract spelling suggestions
        const regex = /class="spelling">Did you mean:([^<]+)</g;
        const matches = [];
        let match;
        
        while ((match = regex.exec(htmlContent)) !== null) {
            if (match[1]) {
                matches.push(match[1].trim());
            }
        }
        
        return matches;
    } catch (error) {
        console.error('Error extracting spelling suggestions:', error);
        return [];
    }
}

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

        const response = await axios.get(funnelbackUrl, {
            params: params,
            headers: funnelbackHeaders
        });

        console.log('Spelling response received successfully');
        
        // Extract spelling suggestions
        const suggestions = extractSpellingSuggestions(response.data);
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
                    handler: 'spelling',
                    query: req.query.query || req.query.partial_query || '[empty query]',
                    searchCollection: 'seattleu~sp-search',
                    userAgent: req.headers['user-agent'],
                    referer: req.headers.referer,
                    city: locationData.city || decodeURIComponent(req.headers['x-vercel-ip-city'] || ''),
                    region: locationData.region || req.headers['x-vercel-ip-country-region'],
                    country: locationData.country || req.headers['x-vercel-ip-country'],
                    timezone: locationData.timezone || req.headers['x-vercel-ip-timezone'],
                    responseTime: processingTime,
                    resultCount: suggestions.length,
                    hasResults: suggestions.length > 0,
                    isProgramTab: Boolean(req.query['f.Tabs|programMain']),
                    isStaffTab: Boolean(req.query['f.Tabs|seattleu~ds-staff']),
                    tabs: [],
                    sessionId: sessionId,
                    // Additional spelling-specific data
                    hasSuggestions: suggestions.length > 0,
                    suggestions: suggestions,
                    timestamp: new Date(),
                    clickedResults: [] // Initialize empty array to ensure field exists
                };
                
                // Add tabs information
                if (rawData.isProgramTab) rawData.tabs.push('program-main');
                if (rawData.isStaffTab) rawData.tabs.push('Faculty & Staff');
                
                // Standardize data to ensure consistent schema
                const analyticsData = createStandardAnalyticsData(rawData);
                
                // Log data (excluding sensitive information)
                logAnalyticsData(analyticsData, 'spelling recording');
                
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
        console.error('Error in spelling handler:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        res.status(500).send('Spelling error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
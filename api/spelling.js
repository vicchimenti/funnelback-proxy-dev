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
 * - Analytics integration
 * 
 * @author Victor Chimenti
 * @version 2.0.2
 * @license MIT
 */

const axios = require('axios');
const { recordQuery } = require('../lib/queryAnalytics');

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
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Log request details
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
        
        // Extract spelling suggestions
        const suggestions = extractSpellingSuggestions(response.data);
        const processingTime = Date.now() - startTime;
        
        // Record analytics data
        try {
            console.log('MongoDB URI defined:', !!process.env.MONGODB_URI);
            
            if (process.env.MONGODB_URI) {
                console.log('Raw query parameters:', req.query);
                
                const analyticsData = {
                    handler: 'spelling',
                    query: req.query.query || req.query.partial_query || '[empty query]',
                    searchCollection: 'seattleu~sp-search',
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
                    resultCount: suggestions.length,
                    isProgramTab: Boolean(req.query['f.Tabs|programMain']),
                    isStaffTab: Boolean(req.query['f.Tabs|seattleu~ds-staff']),
                    tabs: [],
                    // Additional spelling-specific data
                    hasSuggestions: suggestions.length > 0,
                    suggestions: suggestions,
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
        console.error('Error in spelling handler:', {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data
        });
        res.status(500).send('Spelling error: ' + (error.response?.data || error.message));
    }
}

module.exports = handler;
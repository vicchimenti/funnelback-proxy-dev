/**
 * @fileoverview Analytics API Click Endpoint for Funnelback Search Integration
 * 
 * This file contains API handler for tracking various search analytics events
 * including click tracking data.
 * 
 * @author Victor Chimenti
 * @version 2.0.2
 * @module api/analytics/click
 * @lastModified 2025-03-07
 */

// api/analytics/click.js
module.exports = async (req, res) => {
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only accept POST
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }
    
    try {
        const { recordClick } = require('../../lib/queryAnalytics');
        const { sanitizeSessionId, createStandardClickData } = require('../../lib/schemaHandler');
        const clickData = req.body || {};
        
        // Validate required fields
        if (!clickData.originalQuery) {
            return res.status(400).json({ error: 'Missing required field: originalQuery' });
        }
        
        if (!clickData.clickedUrl) {
            return res.status(400).json({ error: 'Missing required field: clickedUrl' });
        }
        
        // Add server-side data
        clickData.userIp = userIp;
        clickData.userAgent = req.headers['user-agent'];
        clickData.referer = req.headers.referer;
        clickData.city = decodeURIComponent(req.headers['x-vercel-ip-city'] || '');
        clickData.region = req.headers['x-vercel-ip-country-region'];
        clickData.country = req.headers['x-vercel-ip-country'];
        
        // Sanitize session ID
        clickData.sessionId = sanitizeSessionId(clickData.sessionId);
        
        // Log what we're recording
        console.log('Recording click data:', {
            query: clickData.originalQuery,
            url: clickData.clickedUrl,
            title: clickData.clickedTitle || '(no title)',
            position: clickData.clickPosition || 'unknown',
            sessionId: clickData.sessionId || 'null'
        });
        
        // Create standardized click data
        const standardClickData = createStandardClickData(clickData);
        console.log('Standardized click data:', standardClickData);
        
        // Record click in database
        const result = await recordClick(clickData);
        console.log('Click recorded:', result ? 'Success' : 'Failed');
        
        if (result && result._id) {
            console.log('Updated record ID:', result._id.toString());
        }
        
        // Send minimal response for performance
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error recording click:', error);
        res.status(500).json({ error: error.message });
    }
}
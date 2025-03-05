/**
 * @fileoverview Analytics API Click Endpoint for Funnelback Search Integration
 * 
 * This file contains API handler for tracking various search analytics events
 * including click tracking data.
 * 
 * @author Victor Chimenti
 * @version 1.1.1
 * @module api/analytics/click
 * @lastModified 2025-03-05
 */

// api/analytics/click.js
module.exports = async (req, res) => {
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
        const clickData = req.body;
        
        // Add server-side data
        clickData.userIp = userIp;
        clickData.userAgent = req.headers['user-agent'];
        clickData.referer = req.headers.referer;
        clickData.city = decodeURIComponent(req.headers['x-vercel-ip-city'] || '');
        clickData.region = req.headers['x-vercel-ip-country-region'];
        clickData.country = req.headers['x-vercel-ip-country'];
        
        console.log('Recording click data:', {
            query: clickData.originalQuery,
            url: clickData.clickedUrl,
            position: clickData.clickPosition
        });
        
        // Record click in database
        const result = await recordClick(clickData);
        console.log('Click recorded:', result ? 'Success' : 'Failed');
        
        // Send minimal response for performance
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error recording click:', error);
        res.status(500).json({ error: error.message });
    }
};
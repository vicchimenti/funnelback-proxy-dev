/**
 * @fileoverview Analytics API Click Batch Endpoint for Funnelback Search Integration
 * 
 * This file contains the API handler for tracking various search analytics events
 * including batch click tracking data.
 * 
 * @author Victor Chimenti
 * @version 1.1.0
 * @module api/analytics/clicks-batch
 * @lastModified 2025-03-05
 */

// api/analytics/clicks-batch.js
module.exports = async (req, res) => {
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }
    
    try {
        const { recordClicks } = require('../../lib/queryAnalytics');
        
        // Get clicks from request body
        const { clicks } = req.body;
        
        if (!Array.isArray(clicks) || clicks.length === 0) {
            return res.status(400).json({ error: 'No clicks provided' });
        }
        
        console.log(`Processing batch of ${clicks.length} clicks`);
        
        // Add server-side data to each click
        const processedClicks = clicks.map(click => ({
            ...click,
            userIp: userIp,
            userAgent: req.headers['user-agent'],
            referer: req.headers.referer,
            city: decodeURIComponent(req.headers['x-vercel-ip-city'] || ''),
            region: req.headers['x-vercel-ip-country-region'],
            country: req.headers['x-vercel-ip-country']
        }));
        
        // Record clicks in database
        const result = await recordClicks(processedClicks);
        
        // Send response
        res.status(200).json(result);
    } catch (error) {
        console.error('Error processing clicks batch:', error);
        res.status(500).json({ error: error.message });
    }
};
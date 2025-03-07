/**
 * @fileoverview Analytics API Click Batch Endpoint for Funnelback Search Integration
 * 
 * This file contains the API handler for tracking various search analytics events
 * including batch click tracking data.
 * 
 * @author Victor Chimenti
 * @version 2.0.2
 * @module api/analytics/clicks-batch
 * @lastModified 2025-03-07
 */

// api/analytics/clicks-batch.js
module.exports = async (req, res) => {
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }
    
    try {
        const { recordClicks } = require('../../lib/queryAnalytics');
        const { sanitizeSessionId, createStandardClickData } = require('../../lib/schemaHandler');
        
        // Get clicks from request body
        const { clicks } = req.body || {};
        
        if (!Array.isArray(clicks) || clicks.length === 0) {
            return res.status(400).json({ error: 'No clicks provided' });
        }
        
        console.log(`Processing batch of ${clicks.length} clicks`);
        
        // Add server-side data to each click and validate
        const processedClicks = clicks.map(click => {
            // Validate required fields
            if (!click.originalQuery || !click.clickedUrl) {
                console.warn('Skipping click with missing required fields:', click);
                return null;
            }
            
            // Process valid click
            const processedClick = {
                ...click,
                userIp: userIp,
                userAgent: req.headers['user-agent'],
                referer: req.headers.referer,
                city: decodeURIComponent(req.headers['x-vercel-ip-city'] || ''),
                region: req.headers['x-vercel-ip-country-region'],
                country: req.headers['x-vercel-ip-country'],
                sessionId: sanitizeSessionId(click.sessionId)
            };
            
            // Apply standard schema to click
            const standardizedClick = createStandardClickData(processedClick);
            console.log('Standardized click data:', {
                query: processedClick.originalQuery,
                url: processedClick.clickedUrl,
                title: processedClick.clickedTitle || '(no title)',
                position: standardizedClick.position || 0
            });
            
            return processedClick;
        }).filter(Boolean); // Remove any null entries (invalid clicks)
        
        if (processedClicks.length === 0) {
            return res.status(400).json({ error: 'No valid clicks provided' });
        }
        
        // Record clicks in database
        const result = await recordClicks(processedClicks);
        
        console.log('Batch processing complete:', {
            processed: result.processed,
            total: processedClicks.length,
            skipped: clicks.length - processedClicks.length
        });
        
        // Send response
        res.status(200).json({
            ...result,
            skipped: clicks.length - processedClicks.length
        });
    } catch (error) {
        console.error('Error processing clicks batch:', error);
        res.status(500).json({ error: error.message });
    }
};
/**
 * @fileoverview Analytics API Click Endpoint for Funnelback Search Integration
 * 
 * This file contains API handler for tracking various search analytics events
 * including click tracking data.
 * 
 * @author Victor Chimenti
 * @version 2.3.3
 * @module api/analytics/click
 * @lastModified 2025-04-14
 */

// api/analytics/click.js
module.exports = async (req, res) => {
    // Get client IP from custom header or fallback methods
    const userIp = req.headers['x-original-client-ip'] || 
               (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 
               (req.headers['x-real-ip']) || 
               req.socket.remoteAddress;

    // Add IP debug logging
    console.log('IP Headers:', {
        originalClientIp: req.headers['x-original-client-ip'],
        forwardedFor: req.headers['x-forwarded-for'],
        realIp: req.headers['x-real-ip'],
        socketRemote: req.socket.remoteAddress,
        vercelIpCity: req.headers['x-vercel-ip-city'],
        finalUserIp: userIp
    });
    
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
        const { getLocationData } = require('../../lib/geoIpService');

        const clickData = req.body || {};

        console.log('Raw request body:', req.body);
        console.log('Request content type:', req.headers['content-type']);

        // Log received fields for debugging
        console.log('Received click data fields:', Object.keys(clickData));

        // Extract session ID from various sources
        const rawSessionId = clickData.sessionId || req.query.sessionId || req.headers['x-session-id'];
        
        // Sanitize session ID ONCE
        const sessionId = sanitizeSessionId(rawSessionId);
        
        // Add detailed session ID debugging AFTER extraction
        console.log('Session ID sources:', {
            fromQueryParam: req.query.sessionId,
            fromHeader: req.headers['x-session-id'],
            fromBody: clickData.sessionId,
            rawSessionId: rawSessionId,
            afterSanitization: sessionId
        });
                
        // Normalize field names to handle variations from different frontend components
        const normalizedClickData = {
            ...clickData,
            // Handle both 'originalQuery' and 'query' field names
            originalQuery: clickData.originalQuery || clickData.query || '',
            // Handle both 'clickedUrl' and 'url' field names
            clickedUrl: clickData.clickedUrl || clickData.url || '',
            // Handle both 'clickedTitle' and 'title' field names
            clickedTitle: clickData.clickedTitle || clickData.title || '',
            // Handle both 'clickPosition' and 'position' field names
            clickPosition: clickData.clickPosition || clickData.position || -1,
            // Handle both 'clickType' and 'type' field names
            clickType: clickData.clickType || clickData.type || 'search'
        };
        
        console.log('Normalized click data:', {
            originalQuery: normalizedClickData.originalQuery,
            clickedUrl: normalizedClickData.clickedUrl,
            title: normalizedClickData.clickedTitle,
            position: normalizedClickData.clickPosition
        });
        
        // Enhanced validation with more detailed error responses
        if (!normalizedClickData.originalQuery) {
            console.warn('Request missing query value after normalization');
            return res.status(400).json({ 
                error: 'Missing required field: originalQuery/query',
                receivedFields: Object.keys(clickData)
            });
        }
        
        if (normalizedClickData.originalQuery === '') {
            console.warn('Empty query value received');
            return res.status(400).json({ error: 'Empty value for required field: originalQuery/query' });
        }
        
        if (!normalizedClickData.clickedUrl) {
            console.warn('Request missing URL value after normalization');
            return res.status(400).json({ 
                error: 'Missing required field: clickedUrl/url',
                receivedFields: Object.keys(clickData)
            });
        }
        
        if (normalizedClickData.clickedUrl === '') {
            console.warn('Empty URL value received');
            return res.status(400).json({ error: 'Empty value for required field: clickedUrl/url' });
        }

        // Validate and set click type
        if (!normalizedClickData.clickType) {
            // Default to 'search' if not specified
            normalizedClickData.clickType = 'search';
        } else {
            // Ensure it's a supported type
            const validTypes = ['search', 'staff', 'program', 'suggestion'];
            if (!validTypes.includes(normalizedClickData.clickType)) {
                normalizedClickData.clickType = 'search'; // Default if invalid
            }
        }
                
        // Get location data based on the user's IP
        const locationData = await getLocationData(userIp);
        console.log('GeoIP location data:', locationData);
        
        // Add server-side data
        normalizedClickData.userIp = userIp;
        normalizedClickData.userAgent = req.headers['user-agent'];
        normalizedClickData.referer = req.headers.referer;
        
        // Use GeoIP location data with Vercel headers as fallback
        normalizedClickData.city = locationData.city || decodeURIComponent(req.headers['x-vercel-ip-city'] || '');
        normalizedClickData.region = locationData.region || req.headers['x-vercel-ip-country-region'];
        normalizedClickData.country = locationData.country || req.headers['x-vercel-ip-country'];
        normalizedClickData.latitude = locationData.latitude || req.headers['x-vercel-ip-latitude'];
        normalizedClickData.longitude = locationData.longitude || req.headers['x-vercel-ip-longitude'];
        
        // Update with the sanitized session ID - ONLY ONCE
        normalizedClickData.sessionId = sessionId;
        
        // Log what we're recording
        console.log('Recording click data:', {
            query: normalizedClickData.originalQuery,
            url: normalizedClickData.clickedUrl,
            title: normalizedClickData.clickedTitle || '(no title)',
            position: normalizedClickData.clickPosition || 'unknown',
            clickType: normalizedClickData.clickType,
            sessionId: normalizedClickData.sessionId || 'null'
        });
        
        // Create standardized click data
        const standardClickData = createStandardClickData(normalizedClickData);
        console.log('Standardized click data:', standardClickData);
        
        // Record click in database
        const result = await recordClick(normalizedClickData);
        console.log('Click recorded:', result ? 'Success' : 'Failed');
        
        if (result && result._id) {
            console.log('Updated record ID:', result._id.toString());
        }
        
        // Send minimal response for performance
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error recording click:', error);
        // Provide more detailed error for troubleshooting
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            type: error.name 
        });
    }
}
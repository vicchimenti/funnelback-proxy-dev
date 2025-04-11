/**
 * @fileoverview Analytics API Click Supplement Endpoint for Funnelback Search Integration
 * 
 * This file contains API handler for tracking various search analytics events
 * including supplementary analytics data.
 * 
 * @author Victor Chimenti
 * @version 2.1.1
 * @module api/analytics/supplement
 * @lastModified 2025-04-11
 */

// api/analytics/supplement.js
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
        // Import only the exported functions from queryAnalytics
        const { recordQuery } = require('../../lib/queryAnalytics');
        const { sanitizeSessionId } = require('../../lib/schemaHandler');
        const data = req.body || {};
        
        if (!data.query) {
            return res.status(400).json({ error: 'No query provided' });
        }
        
        console.log('Processing supplementary analytics for query:', data.query);
        
        // Get sessionId from request
        const sessionId = sanitizeSessionId(data.sessionId);
        
        // Prepare query data object
        const queryData = {
            handler: 'supplement',
            query: data.query,
            userIp: userIp,
            userAgent: req.headers['user-agent'],
            referer: req.headers.referer,
            sessionId: sessionId,
            city: decodeURIComponent(req.headers['x-vercel-ip-city'] || ''),
            region: req.headers['x-vercel-ip-country-region'],
            country: req.headers['x-vercel-ip-country'],
            timestamp: new Date()
        };
        
        // Add result count if provided
        if (data.resultCount !== undefined) {
            queryData.resultCount = data.resultCount;
            queryData.hasResults = data.resultCount > 0;
        }
        
        // Add enrichment data if provided
        if (data.enrichmentData) {
            queryData.enrichmentData = data.enrichmentData;
        }
        
        console.log('Query data being recorded:', {
            query: queryData.query,
            sessionId: queryData.sessionId || '[none]',
            hasEnrichment: !!queryData.enrichmentData
        });
        
        // Use recordQuery to create or update the record
        const result = await recordQuery(queryData);
        
        if (!result) {
            console.error('Failed to record supplementary analytics');
            return res.status(500).json({ error: 'Failed to record analytics data' });
        }
        
        console.log('Supplementary data recorded successfully. Record ID:', result._id.toString());
        res.status(200).json({ success: true, recordId: result._id.toString() });
    } catch (error) {
        console.error('Error recording supplementary analytics:', error);
        // Provide more detailed error information
        const errorDetails = {
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            type: error.name
        };
        res.status(500).json(errorDetails);
    }
};
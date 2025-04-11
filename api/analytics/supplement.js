/**
 * @fileoverview Analytics API Click Supplement Endpoint for Funnelback Search Integration
 * 
 * This file contains API handler for tracking various search analytics events
 * including supplementary analytics data.
 * 
 * @author Victor Chimenti
 * @version 2.1.0
 * @module api/analytics/supplement
 * @lastModified 2025-04-11
 */

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
        // Import queryAnalytics to ensure proper model initialization and DB connection
        const { recordQuery, Query, connectToMongoDB } = require('../../lib/queryAnalytics');
        const { sanitizeSessionId, createStandardAnalyticsData } = require('../../lib/schemaHandler');
        const data = req.body || {};
        
        if (!data.query) {
            return res.status(400).json({ error: 'No query provided' });
        }
        
        console.log('Processing supplementary analytics for query:', data.query);
        
        // Ensure MongoDB connection is established before proceeding
        await connectToMongoDB();
        
        // Find the most recent query with matching information
        const filters = {
            query: data.query
        };
        
        // Add sessionId to filter if available (properly sanitized)
        const sessionId = sanitizeSessionId(data.sessionId);
        if (sessionId) {
            filters.sessionId = sessionId;
            console.log('Using session ID for matching:', sessionId);
        } else {
            // Fall back to IP address
            filters.userIp = userIp;
            console.log('Using IP address for matching:', userIp);
        }
        
        // Prepare update based on provided data
        const update = {};
        
        // Add result count if provided
        if (data.resultCount !== undefined) {
            update.resultCount = data.resultCount;
            update.hasResults = data.resultCount > 0;
        }
        
        // Add enrichment data if provided
        if (data.enrichmentData) {
            update.enrichmentData = data.enrichmentData;
        }
        
        console.log('Update filters:', filters);
        console.log('Update data:', update);
        
        // Verify Query model is available
        if (!Query) {
            console.error('Query model is not initialized');
            return res.status(500).json({ error: 'Database model initialization failed' });
        }
        
        // Update the query document
        const result = await Query.findOneAndUpdate(
            filters,
            { $set: update },
            { 
                new: true,
                sort: { timestamp: -1 }
            }
        );
        
        if (!result) {
            console.log('No matching query found for supplementary data, creating new record');
            
            // Create standardized data object for new record
            const newQueryData = {
                handler: 'supplement-only',
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
            
            // Add enrichment data if provided
            if (data.enrichmentData) {
                newQueryData.enrichmentData = data.enrichmentData;
            }
            
            // Add result count if provided
            if (data.resultCount !== undefined) {
                newQueryData.resultCount = data.resultCount;
                newQueryData.hasResults = data.resultCount > 0;
            }
            
            // Create and save new record
            const newQuery = new Query(newQueryData);
            await newQuery.save();
            
            console.log('Created new record for supplementary data. Record ID:', newQuery._id.toString());
            return res.status(200).json({ success: true, recordId: newQuery._id.toString(), created: true });
        }
        
        console.log('Supplementary data recorded successfully. Record ID:', result._id.toString());
        res.status(200).json({ success: true, recordId: result._id.toString(), updated: true });
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
/**
 * @fileoverview Analytics API Click Supplement Endpoint for Funnelback Search Integration
 * 
 * This file contains API handler for tracking various search analytics events
 * including supplementary analytics data.
 * 
 * @author Victor Chimenti
 * @version 1.1.0
 * @module api/analytics/supplement
 * @lastModified 2025-03-05
 */

// api/analytics/supplement.js
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
        const { Query } = require('mongoose').models;
        const data = req.body;
        
        if (!data.query) {
            return res.status(400).json({ error: 'No query provided' });
        }
        
        console.log('Processing supplementary analytics for query:', data.query);
        
        // Find the most recent query with matching information
        const filters = {
            query: data.query
        };
        
        // Add sessionId to filter if available
        if (data.sessionId) {
            filters.sessionId = data.sessionId;
        } else {
            // Fall back to IP address
            filters.userIp = userIp;
        }
        
        // Prepare update based on provided data
        const update = {};
        
        // Add result count if provided
        if (data.resultCount !== undefined) {
            update.resultCount = data.resultCount;
            update.hasResults = data.resultCount > 0;
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
            console.log('No matching query found for supplementary data');
            return res.status(404).json({ error: 'Query not found' });
        }
        
        console.log('Supplementary data recorded successfully');
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error recording supplementary analytics:', error);
        res.status(500).json({ error: error.message });
    }
};
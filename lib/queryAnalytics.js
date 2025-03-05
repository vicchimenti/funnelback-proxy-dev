/**
 * @fileoverview Enhanced Query Analytics for Funnelback Search Integration
 * 
 * This module provides MongoDB integration for tracking search queries and
 * click-through data. It supports finding, creating, and updating query records
 * with associated click data.
 * 
 * Features:
 * - Search query tracking
 * - Click-through tracking with position, title, and URL
 * - Session-based tracking
 * - Query attribution
 * - Automatic MongoDB connection handling
 * 
 * @author Victor Chimenti
 * @version 3.0.0
 * @lastModified 2025-03-05
 * @license MIT
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// Connect to MongoDB if not already connected
async function connectToMongoDB() {
    if (mongoose.connection.readyState === 0) {
        console.log('Connecting to MongoDB...');
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
            console.log('Connected to MongoDB successfully');
        } catch (error) {
            console.error('MongoDB connection error:', error);
            throw error;
        }
    }
}

// Define Schema for search queries with click tracking
const QuerySchema = new Schema({
    // Base query information
    handler: { type: String, required: true },
    query: { type: String, required: true },
    searchCollection: { type: String },
    
    // User information
    userIp: { type: String },
    userAgent: { type: String },
    referer: { type: String },
    sessionId: { type: String },
    
    // Location information
    city: { type: String },
    region: { type: String },
    country: { type: String },
    timezone: { type: String },
    latitude: { type: String },
    longitude: { type: String },
    
    // Search results information
    responseTime: { type: Number },
    resultCount: { type: Number, default: 0 },
    hasResults: { type: Boolean, default: false },
    
    // Tab-specific information
    isProgramTab: { type: Boolean, default: false },
    isStaffTab: { type: Boolean, default: false },
    tabs: [{ type: String }],
    
    // Click tracking
    clickedResults: [{ 
        url: { type: String, required: true },
        title: { type: String },
        position: { type: Number },
        timestamp: { type: Date, default: Date.now }
    }],
    
    // Timestamps
    timestamp: { type: Date, default: Date.now },
    lastClickTimestamp: { type: Date }
});

// Create indexes for common queries
QuerySchema.index({ query: 1, timestamp: -1 });
QuerySchema.index({ userIp: 1, timestamp: -1 });
QuerySchema.index({ timestamp: -1 });

// Define or get models
let Query;
try {
    Query = mongoose.model('Query');
} catch (error) {
    Query = mongoose.model('Query', QuerySchema);
}

/**
 * Records a search query in the database
 * 
 * @param {Object} queryData - Data about the search query
 * @returns {Promise<Object>} The saved query object or null if not saved
 */
async function recordQuery(queryData) {
    try {
        if (!process.env.MONGODB_URI) {
            console.log('MongoDB URI not defined, skipping analytics');
            return null;
        }
        
        await connectToMongoDB();
        
        // Set hasResults based on resultCount
        if (queryData.resultCount !== undefined) {
            queryData.hasResults = queryData.resultCount > 0;
        }
        
        // Create and save the query
        const query = new Query(queryData);
        await query.save();
        
        console.log(`Query recorded: "${queryData.query}" (ID: ${query._id})`);
        return query;
    } catch (error) {
        console.error('Error recording query:', error);
        return null;
    }
}

/**
 * Records a click on a search result
 * 
 * @param {Object} clickData - Data about the clicked result
 * @returns {Promise<Object>} The updated query object or null if not updated
 */
async function recordClick(clickData) {
    try {
        if (!process.env.MONGODB_URI) {
            console.log('MongoDB URI not defined, skipping click analytics');
            return null;
        }
        
        await connectToMongoDB();
        
        // Prepare filters to find the matching query
        const filters = {
            query: clickData.originalQuery
        };
        
        // Add sessionId to filter if available (more reliable than IP)
        if (clickData.sessionId) {
            filters.sessionId = clickData.sessionId;
        } 
        // Otherwise use IP address as fallback
        else if (clickData.userIp) {
            filters.userIp = clickData.userIp;
        }
        
        // Create click record
        const clickRecord = {
            url: clickData.clickedUrl,
            title: clickData.clickedTitle || '',
            position: parseInt(clickData.clickPosition, 10) || 0,
            timestamp: new Date()
        };
        
        console.log('Looking for query to update with click:', filters);
        
        // Find the most recent matching query and update it
        const result = await Query.findOneAndUpdate(
            filters,
            { 
                $push: { clickedResults: clickRecord },
                $set: { lastClickTimestamp: new Date() }
            },
            { 
                new: true,  // Return the updated document
                sort: { timestamp: -1 } // Get the most recent one
            }
        );
        
        if (!result) {
            console.log('No matching query found for click, creating new record');
            
            // If no matching query, create a new one with this click
            const newQueryData = {
                handler: 'click-only',
                query: clickData.originalQuery,
                userIp: clickData.userIp,
                userAgent: clickData.userAgent,
                referer: clickData.referer,
                sessionId: clickData.sessionId,
                city: clickData.city,
                region: clickData.region,
                country: clickData.country,
                clickedResults: [clickRecord],
                lastClickTimestamp: new Date(),
                timestamp: new Date()
            };
            
            return await recordQuery(newQueryData);
        }
        
        console.log(`Click recorded for query "${result.query}" (ID: ${result._id})`);
        return result;
    } catch (error) {
        console.error('Error recording click:', error);
        return null;
    }
}

/**
 * Batch record multiple clicks
 * 
 * @param {Array} clicksData - Array of click data objects
 * @returns {Promise<Object>} Result with count of processed clicks
 */
async function recordClicks(clicksData) {
    if (!Array.isArray(clicksData) || clicksData.length === 0) {
        return { processed: 0 };
    }
    
    try {
        if (!process.env.MONGODB_URI) {
            console.log('MongoDB URI not defined, skipping batch click analytics');
            return { processed: 0 };
        }
        
        await connectToMongoDB();
        
        console.log(`Processing batch of ${clicksData.length} clicks`);
        
        // Process each click
        const results = await Promise.allSettled(
            clicksData.map(clickData => recordClick(clickData))
        );
        
        // Count successful operations
        const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
        
        console.log(`Batch processing complete: ${successful}/${clicksData.length} successful`);
        
        return {
            processed: successful,
            total: clicksData.length
        };
    } catch (error) {
        console.error('Error in batch click processing:', error);
        return { processed: 0, error: error.message };
    }
}

module.exports = {
    recordQuery,
    recordClick,
    recordClicks
};
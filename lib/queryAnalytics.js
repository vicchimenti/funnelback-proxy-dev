/**
 * @fileoverview Query Analytics Collection System
 * 
 * A centralized system for collecting, storing, and organizing search queries
 * across all Funnelback proxy handlers. This enables analysis of user search patterns
 * to improve search functionality and user experience.
 * 
 * Features:
 * - Unified query collection across all handlers
 * - Structured storage in MongoDB
 * - Real-time analytics dashboard
 * - Search term trend analysis
 * - Zero-result query tracking
 * - Query success metrics
 * 
 * @author [Your Name]
 * @version 1.0.0
 * @license MIT
 */

const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

// Schema definition for query analytics
const QuerySchema = new mongoose.Schema({
  // Basic query information
  query: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  
  // Source information
  handler: { type: String, required: true, index: true }, // which handler processed the query
  collection: { type: String, index: true }, // which Funnelback collection was queried
  
  // User context
  userIp: String,
  userAgent: String,
  referer: String,
  
  // Location data (from Vercel headers)
  location: {
    city: String,
    region: String,
    country: String,
    timezone: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Query performance
  responseTime: Number, // in milliseconds
  resultCount: Number, // number of results returned
  hasResults: Boolean, // whether any results were found
  
  // Tab/filter information
  filters: {
    tabs: [String], // which tabs were active
    programTab: Boolean,
    staffTab: Boolean,
    otherFilters: Object // other filter parameters
  },
  
  // Query refinement tracking
  isRefinement: Boolean, // whether this query refines a previous query
  originalQuery: String, // the original query if this is a refinement
  
  // Result interaction (to be populated by frontend)
  clickedResults: [Number], // ranks of clicked results
  selectedSuggestion: Boolean, // whether user selected a suggestion
  
  // Error tracking
  error: {
    occurred: Boolean,
    message: String,
    status: Number
  }
});

// Create model
const Query = mongoose.model('Query', QuerySchema);

/**
 * Centralized function to record query analytics
 * Can be called from any handler
 * 
 * @param {Object} queryData - Data about the query to be recorded
 * @returns {Promise<Object>} The saved query document
 */
async function recordQuery(queryData) {
  try {
    // Create new query document
    const queryRecord = new Query({
      query: queryData.query || '',
      handler: queryData.handler || 'unknown',
      collection: queryData.collection || 'seattleu~sp-search',
      userIp: queryData.userIp,
      userAgent: queryData.userAgent,
      referer: queryData.referer,
      location: {
        city: queryData.city,
        region: queryData.region,
        country: queryData.country,
        timezone: queryData.timezone,
        coordinates: {
          latitude: queryData.latitude,
          longitude: queryData.longitude
        }
      },
      responseTime: queryData.responseTime,
      resultCount: queryData.resultCount,
      hasResults: queryData.resultCount > 0,
      filters: {
        tabs: queryData.tabs || [],
        programTab: !!queryData.isProgramTab,
        staffTab: !!queryData.isStaffTab,
        otherFilters: queryData.filters || {}
      },
      isRefinement: !!queryData.isRefinement,
      originalQuery: queryData.originalQuery || '',
      error: {
        occurred: !!queryData.error,
        message: queryData.errorMessage || '',
        status: queryData.errorStatus || 0
      }
    });

    // Save to database
    return await queryRecord.save();
  } catch (error) {
    console.error('Error recording query analytics:', error);
    // Don't fail the main operation if analytics recording fails
    return null;
  }
}

/**
 * Get query statistics for a given timeframe
 * 
 * @param {Object} options - Options for the statistics query
 * @param {Date} options.startDate - Start date for the query range
 * @param {Date} options.endDate - End date for the query range
 * @param {String} options.handler - Filter by specific handler
 * @returns {Promise<Object>} Statistics object
 */
async function getQueryStatistics(options = {}) {
  const query = {};
  
  // Add date range if provided
  if (options.startDate || options.endDate) {
    query.timestamp = {};
    if (options.startDate) query.timestamp.$gte = options.startDate;
    if (options.endDate) query.timestamp.$lte = options.endDate;
  }
  
  // Add handler filter if provided
  if (options.handler) query.handler = options.handler;
  
  try {
    const stats = await Query.aggregate([
      { $match: query },
      { $group: {
          _id: null,
          totalQueries: { $sum: 1 },
          averageResponseTime: { $avg: '$responseTime' },
          queriesWithResults: { $sum: { $cond: ['$hasResults', 1, 0] } },
          queriesWithErrors: { $sum: { $cond: ['$error.occurred', 1, 0] } },
          averageResultCount: { $avg: '$resultCount' }
        }
      }
    ]);
    
    // Get most common queries
    const topQueries = await Query.aggregate([
      { $match: query },
      { $group: {
          _id: '$query',
          count: { $sum: 1 },
          avgResults: { $avg: '$resultCount' },
          avgResponseTime: { $avg: '$responseTime' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);
    
    // Get queries with zero results
    const zeroResultQueries = await Query.aggregate([
      { $match: { ...query, hasResults: false } },
      { $group: {
          _id: '$query',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);
    
    return {
      summary: stats[0] || {
        totalQueries: 0,
        averageResponseTime: 0,
        queriesWithResults: 0,
        queriesWithErrors: 0,
        averageResultCount: 0
      },
      topQueries,
      zeroResultQueries
    };
  } catch (error) {
    console.error('Error getting query statistics:', error);
    throw error;
  }
}

/**
 * Database connection setup
 * 
 * @param {string} connectionString - MongoDB connection string
 * @returns {Promise<void>}
 */
async function connectToDatabase(connectionString) {
  try {
    await mongoose.connect(connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB for query analytics');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}

module.exports = {
  recordQuery,
  getQueryStatistics,
  connectToDatabase,
  Query // Export the model for direct use
};
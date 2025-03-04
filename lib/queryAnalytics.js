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
 * @author Victor Chimenti
 * @version 2.0.0
 * @license MIT
 */

const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');
let isConnected = false;

// Schema definition for query analytics
const QuerySchema = new mongoose.Schema({
  // Basic query information
  query: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  
  // Source information
  handler: { type: String, required: true, index: true }, // which handler processed the query
  searchCollection: { type: String, index: true }, // renamed from 'collection' as this is reserved in MongoDB

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
 * Ensure database connection is established before recording
 * @param {string} connectionString - MongoDB connection string
 * @returns {Promise<boolean>} Connection success
 */
async function ensureConnection(connectionString) {
  if (isConnected && mongoose.connection.readyState === 1) {
    return true;
  }
  
  try {
    if (mongoose.connection.readyState !== 0) {
      // If there's an existing connection in a non-connected state, close it
      await mongoose.connection.close();
    }
    
    await mongoose.connect(connectionString, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000
    });
    
    isConnected = true;
    console.log('MongoDB connection established for query analytics');
    return true;
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    return false;
  }
}

/**
 * Centralized function to record query analytics
 * Can be called from any handler
 * 
 * @param {Object} queryData - Data about the query to be recorded
 * @returns {Promise<Object>} The saved query document
 */
  async function recordQuery(queryData) {
    console.log('recordQuery called with query:', queryData.query);
    console.log('Handler:', queryData.handler);
    
    try {
      // Check if we have a mongoose connection
      console.log('MongoDB connection state:', mongoose.connection.readyState);
      
      // If not connected (0), try to connect
      if (mongoose.connection.readyState === 0) {
        console.log('Connecting to MongoDB...');
        try {
          await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000
          });
          console.log('MongoDB connection established');
        } catch (connError) {
          console.error('MongoDB connection failed:', connError.message);
          // Try to log more details about the connection error
          if (connError.name === 'MongoServerSelectionError') {
            console.error('Server selection timed out. Check network or MongoDB Atlas whitelist');
          }
          throw connError;
        }
      }
      
      // Validate required fields before creating the document
      if (!queryData.query) {
        console.warn('Query field is empty, setting to "[empty query]"');
        queryData.query = '[empty query]';
      }
      
      if (!queryData.handler) {
        console.warn('Handler field is empty, setting to "unknown"');
        queryData.handler = 'unknown';
      }
      
      // Create query document with explicit field mapping
      console.log('Creating Query document...');
      const queryRecord = new Query({
        query: queryData.query || '',
        timestamp: queryData.timestamp || new Date(),
        handler: queryData.handler || 'unknown',
        searchCollection: queryData.searchCollection || queryData.collection || 'seattleu~sp-search',
        userIp: queryData.userIp || '',
        userAgent: queryData.userAgent || '',
        referer: queryData.referer || '',
        location: {
          city: queryData.city || '',
          region: queryData.region || '',
          country: queryData.country || '',
          timezone: queryData.timezone || '',
          coordinates: {
            latitude: queryData.latitude ? parseFloat(queryData.latitude) : null,
            longitude: queryData.longitude ? parseFloat(queryData.longitude) : null
          }
        },
        responseTime: queryData.responseTime || 0,
        resultCount: queryData.resultCount || 0,
        hasResults: !!(queryData.resultCount && queryData.resultCount > 0),
        filters: {
          tabs: Array.isArray(queryData.tabs) ? queryData.tabs : [],
          programTab: !!queryData.isProgramTab,
          staffTab: !!queryData.isStaffTab,
          otherFilters: queryData.filters || {}
        },
        isRefinement: !!queryData.isRefinement,
        originalQuery: queryData.originalQuery || '',
        error: {
          occurred: !!queryData.error,
          message: queryData.error?.message || '',
          status: queryData.error?.status || 0
        }
      });

      // Save to database with detailed error logging
      console.log('Saving Query document...');
      try {
        const savedRecord = await queryRecord.save();
        console.log('Query saved successfully. ID:', savedRecord._id.toString());
        return savedRecord;
      } catch (saveError) {
        console.error('Error saving query document:', saveError.message);
        if (saveError.name === 'ValidationError') {
          // Log each validation error
          Object.keys(saveError.errors).forEach(field => {
            console.error(`Validation error in field "${field}":`, saveError.errors[field].message);
          });
        }
        throw saveError;
      }
    } catch (error) {
      console.error('Error in recordQuery:', error.message);
      console.error('Error type:', error.name);
      // Return null so the caller knows it failed
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
/**
 * @fileoverview Database Migration Script for TTL Implementation
 * 
 * One-time migration script to add expiration dates to existing records
 * based on the new TTL policy. Records will be processed in batches to
 * minimize database load.
 * 
 * - Suggestion records (suggest, suggestPeople, suggestPrograms): 30-day TTL
 * - All other records (search, clicks, etc.): 60-day TTL
 * 
 * @author [Your Name]
 * @version 1.0.0
 * @lastModified 2025-05-16
 */

const mongoose = require('mongoose');
const { connectToMongoDB, Query } = require('../lib/queryAnalytics');

// TTL values in seconds (should match those in queryAnalytics.js)
const SUGGESTION_TTL = 60 * 60 * 24 * 30; // 30 days in seconds
const SEARCH_CLICK_TTL = 60 * 60 * 24 * 60; // 60 days in seconds

// Authentication key for secure access
const AUTH_KEY = process.env.MIGRATION_AUTH_KEY || 'your-secure-key-here';

// Process records in batches to avoid overwhelming the database
const BATCH_SIZE = 1000;

/**
 * Migrates existing records by adding expiration dates based on handler type
 * 
 * @param {string} authKey - Authentication key for security
 * @returns {Promise<Object>} Migration results
 */
async function migrateExistingRecords(authKey) {
  if (!authKey || authKey !== AUTH_KEY) {
    return { success: false, error: 'Unauthorized access' };
  }
  
  if (!process.env.MONGODB_URI) {
    return { success: false, error: 'MongoDB URI not defined' };
  }
  
  try {
    // Connect to MongoDB
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
    }
    
    const now = new Date();
    const results = {
      suggestionRecordsUpdated: 0,
      otherRecordsUpdated: 0,
      errors: 0
    };
    
    // Process suggestion service records in batches
    let processed = 0;
    let hasMore = true;
    
    console.log('Starting migration of suggestion service records...');
    
    while (hasMore) {
      // Find a batch of suggestion records without expiresAt
      const suggestionRecords = await Query.find({
        handler: { $in: ['suggest', 'suggestPeople', 'suggestPrograms'] },
        expiresAt: { $exists: false }
      }).limit(BATCH_SIZE);
      
      if (suggestionRecords.length === 0) {
        hasMore = false;
        continue;
      }
      
      // Set expiresAt for each record
      for (const record of suggestionRecords) {
        record.expiresAt = new Date(now.getTime() + (SUGGESTION_TTL * 1000));
        try {
          await record.save();
          results.suggestionRecordsUpdated++;
        } catch (err) {
          console.error(`Error updating suggestion record ${record._id}:`, err);
          results.errors++;
        }
      }
      
      processed += suggestionRecords.length;
      console.log(`Processed ${processed} suggestion records so far...`);
    }
    
    // Process other records in batches
    processed = 0;
    hasMore = true;
    
    console.log('Starting migration of search and click records...');
    
    while (hasMore) {
      // Find a batch of other records without expiresAt
      const otherRecords = await Query.find({
        handler: { $nin: ['suggest', 'suggestPeople', 'suggestPrograms'] },
        expiresAt: { $exists: false }
      }).limit(BATCH_SIZE);
      
      if (otherRecords.length === 0) {
        hasMore = false;
        continue;
      }
      
      // Set expiresAt for each record
      for (const record of otherRecords) {
        record.expiresAt = new Date(now.getTime() + (SEARCH_CLICK_TTL * 1000));
        try {
          await record.save();
          results.otherRecordsUpdated++;
        } catch (err) {
          console.error(`Error updating record ${record._id}:`, err);
          results.errors++;
        }
      }
      
      processed += otherRecords.length;
      console.log(`Processed ${processed} search/click records so far...`);
    }
    
    const totalUpdated = results.suggestionRecordsUpdated + results.otherRecordsUpdated;
    console.log(`Migration completed. Updated ${totalUpdated} records.`);
    
    return {
      success: true,
      ...results,
      totalUpdated,
      completedAt: new Date()
    };
  } catch (error) {
    console.error('Migration error:', error);
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  } finally {
    // Don't close the connection if it was already established elsewhere
    if (mongoose.connection.readyState === 1 && process.env.NODE_ENV !== 'production') {
      await mongoose.connection.close();
    }
  }
}

/**
 * API handler for the migration endpoint
 * 
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @returns {Promise<void>}
 */
module.exports = async (req, res) => {
  // Only allow GET for simplicity (could use POST for more security)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Check authorization key from query parameter
  const authKey = req.query.key;
  
  // Run migration
  const results = await migrateExistingRecords(authKey);
  
  if (results.success) {
    res.status(200).json(results);
  } else {
    res.status(400).json(results);
  }
};
/**
 * @fileoverview Database Migration API for TTL Implementation (Optimized for Vercel)
 * 
 * This API processes small batches of records to avoid timeouts.
 * It returns progress information so the migration can be continued with multiple calls.
 * 
 * @author Victor Chimenti
 * @version 1.0.2
 * @lastModified 2025-05-16
 */

const mongoose = require('mongoose');

// TTL values in seconds (should match those in queryAnalytics.js)
const SUGGESTION_TTL = 60 * 60 * 24 * 30; // 30 days in seconds
const SEARCH_CLICK_TTL = 60 * 60 * 24 * 60; // 60 days in seconds

// Security key (use a random string)
const AUTH_KEY = process.env.MIGRATION_AUTH_KEY || 'secure-migration-key';

// Very small batch size to avoid timeouts
const BATCH_SIZE = 10000;

// API handler
module.exports = async (req, res) => {
  // Log the request start
  console.log('Migration function triggered', {
    query: req.query,
    method: req.method
  });

  // Basic security check
  if (req.query.key !== AUTH_KEY) {
    return res.status(401).json({ 
      success: false,
      error: "Unauthorized access" 
    });
  }

  // Connect to MongoDB
  if (!process.env.MONGODB_URI) {
    return res.status(500).json({ 
      success: false,
      error: 'MongoDB URI not defined' 
    });
  }

  try {
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState === 0) {
      console.log('Connecting to MongoDB...');
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }

    // Define minimal schema needed for this function
    const QuerySchema = new mongoose.Schema({
      handler: String,
      expiresAt: Date
    }, { strict: false });
    
    // Get or create the model
    const Query = mongoose.models.Query || mongoose.model('Query', QuerySchema);

    // Get batch parameters from query string
    const batchType = req.query.type || 'suggestion';
    const skip = parseInt(req.query.skip, 10) || 0;
    
    const now = new Date();
    let result;
    
    if (batchType === 'suggestion') {
      // Get a small batch of suggestion records without expiresAt
      const suggestionRecords = await Query.find({
        handler: { $in: ['suggest', 'suggestPeople', 'suggestPrograms'] },
        expiresAt: { $exists: false }
      })
      .skip(skip)
      .limit(BATCH_SIZE)
      .select('_id');
      
      if (suggestionRecords.length > 0) {
        // Just update the records by ID to avoid schema issues
        const ids = suggestionRecords.map(record => record._id);
        
        result = await Query.updateMany(
          { _id: { $in: ids } },
          { $set: { expiresAt: new Date(now.getTime() + (SUGGESTION_TTL * 1000)) } }
        );
        
        // Count remaining records
        const remaining = await Query.countDocuments({
          handler: { $in: ['suggest', 'suggestPeople', 'suggestPrograms'] },
          expiresAt: { $exists: false }
        });
        
        return res.status(200).json({
          success: true,
          type: 'suggestion',
          processed: result.modifiedCount,
          batchSize: suggestionRecords.length,
          skip: skip,
          remaining: remaining,
          nextBatch: remaining > 0 ? `?key=${AUTH_KEY}&type=suggestion&skip=${skip + BATCH_SIZE}` : null,
          switchToOther: remaining === 0 ? `?key=${AUTH_KEY}&type=other&skip=0` : null
        });
      } else {
        // No more suggestion records, switch to other type
        return res.status(200).json({
          success: true,
          type: 'suggestion',
          processed: 0,
          message: 'No more suggestion records to process',
          switchToOther: `?key=${AUTH_KEY}&type=other&skip=0`
        });
      }
    } else {
      // Get a small batch of other records without expiresAt
      const otherRecords = await Query.find({
        handler: { $nin: ['suggest', 'suggestPeople', 'suggestPrograms'] },
        expiresAt: { $exists: false }
      })
      .skip(skip)
      .limit(BATCH_SIZE)
      .select('_id');
      
      if (otherRecords.length > 0) {
        // Just update the records by ID to avoid schema issues
        const ids = otherRecords.map(record => record._id);
        
        result = await Query.updateMany(
          { _id: { $in: ids } },
          { $set: { expiresAt: new Date(now.getTime() + (SEARCH_CLICK_TTL * 1000)) } }
        );
        
        // Count remaining records
        const remaining = await Query.countDocuments({
          handler: { $nin: ['suggest', 'suggestPeople', 'suggestPrograms'] },
          expiresAt: { $exists: false }
        });
        
        return res.status(200).json({
          success: true,
          type: 'other',
          processed: result.modifiedCount,
          batchSize: otherRecords.length,
          skip: skip,
          remaining: remaining,
          nextBatch: remaining > 0 ? `?key=${AUTH_KEY}&type=other&skip=${skip + BATCH_SIZE}` : null,
          complete: remaining === 0
        });
      } else {
        // No more records to process, migration complete
        return res.status(200).json({
          success: true,
          type: 'other',
          processed: 0,
          message: 'Migration complete! All records have been processed.',
          complete: true
        });
      }
    }
  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    // Close the connection
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
    }
  }
};
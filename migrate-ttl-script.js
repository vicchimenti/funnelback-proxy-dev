/**
 * @fileoverview Standalone TTL Migration Script
 * 
 * Run this script directly with Node.js to migrate existing records.
 * Usage: node migrate-ttl-script.js
 */

const mongoose = require('mongoose');
require('dotenv').config(); // Load environment variables from .env file

// TTL values in seconds
const SUGGESTION_TTL = 60 * 60 * 24 * 30; // 30 days in seconds
const SEARCH_CLICK_TTL = 60 * 60 * 24 * 60; // 60 days in seconds

// Define the Query schema directly in this script to avoid circular dependencies
const QuerySchema = new mongoose.Schema({
  handler: { type: String, required: true },
  query: { type: String, required: true },
  expiresAt: { type: Date },
  // Add other fields as needed, but not necessary for the migration
});

// Define the model
const Query = mongoose.model('Query', QuerySchema);

// Process records in batches
const BATCH_SIZE = 1000;

async function migrateRecords() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected successfully');

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
        console.log('No more suggestion records to process');
        continue;
      }
      
      console.log(`Found ${suggestionRecords.length} suggestion records to update`);
      
      // Update all records in the batch with a single operation
      const suggestUpdateResult = await Query.updateMany(
        { 
          _id: { $in: suggestionRecords.map(r => r._id) }
        },
        {
          $set: { expiresAt: new Date(now.getTime() + (SUGGESTION_TTL * 1000)) }
        }
      );
      
      results.suggestionRecordsUpdated += suggestUpdateResult.modifiedCount;
      processed += suggestionRecords.length;
      console.log(`Updated ${suggestUpdateResult.modifiedCount} suggestion records. Total: ${processed}`);
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
        console.log('No more search/click records to process');
        continue;
      }
      
      console.log(`Found ${otherRecords.length} search/click records to update`);
      
      // Update all records in the batch with a single operation
      const otherUpdateResult = await Query.updateMany(
        { 
          _id: { $in: otherRecords.map(r => r._id) }
        },
        {
          $set: { expiresAt: new Date(now.getTime() + (SEARCH_CLICK_TTL * 1000)) }
        }
      );
      
      results.otherRecordsUpdated += otherUpdateResult.modifiedCount;
      processed += otherRecords.length;
      console.log(`Updated ${otherUpdateResult.modifiedCount} search/click records. Total: ${processed}`);
    }
    
    const totalUpdated = results.suggestionRecordsUpdated + results.otherRecordsUpdated;
    console.log(`\nMigration completed successfully!`);
    console.log(`Total records updated: ${totalUpdated}`);
    console.log(`- Suggestion records: ${results.suggestionRecordsUpdated}`);
    console.log(`- Search/click records: ${results.otherRecordsUpdated}`);
    console.log(`Errors: ${results.errors}`);

  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    // Close the connection
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the migration
migrateRecords();
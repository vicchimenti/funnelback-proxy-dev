/**
 * @fileoverview MongoDB Schema Compatibility Tester
 * 
 * This module provides a diagnostic endpoint that tests MongoDB connectivity,
 * schema compatibility, and performs basic CRUD operations to verify the
 * database is correctly configured and accessible. It's designed for
 * monitoring and deployment verification.
 * 
 * Features:
 * - Connection testing with timeout protection
 * - Schema validation through test document creation
 * - Document count verification
 * - Recent queries retrieval
 * - Connection state reporting
 * - Comprehensive error handling
 * 
 * Used during deployment processes and by monitoring systems to verify
 * that database models and schemas are correctly functioning.
 * 
 * @author Victor Chimenti
 * @version 1.2.0
 * @namespace mongoTest
 * @module api/mongoTest
 * @license MIT
 * @lastModified 2025-03-23
 */

// api/mongoTest.js
const mongoose = require('mongoose');
const { Query } = require('../lib/queryAnalytics');

/**
 * API handler for MongoDB schema compatibility testing
 * 
 * @async
 * @function handler
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>} - Resolves when response has been sent
 */
async function handler(req, res) {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    // Add a timeout to the MongoDB connection attempt
    const connectPromise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 5000
    });
    
    // Set a timeout for the entire operation
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timed out')), 5000)
    );
    
    // Race the connection against the timeout
    await Promise.race([connectPromise, timeoutPromise]);
    
    // Try to insert a test document
    const testQuery = new Query({
      query: 'test-diagnostic-query',
      handler: 'mongoTest',
      collection: 'test'
    });
    
    let saveResult = null;
    try {
      saveResult = await testQuery.save();
      console.log('Test document saved:', saveResult._id);
    } catch (saveError) {
      console.error('Error saving test document:', saveError);
    }
    
    // Try to count the documents
    const count = await Query.countDocuments({});
    
    // Try to fetch the most recent queries
    const recentQueries = await Query.find({})
      .sort({ timestamp: -1 })
      .limit(5)
      .lean();
    
    // Get connection status
    const connectionState = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState];
    
    // Basic stats without trying to access documents
    const stats = {
      status: 'success',
      database: {
        connected: mongoose.connection.readyState === 1,
        connectionState,
        databaseName: mongoose.connection.db?.databaseName || 'not connected',
      },
      queries: {
        totalCount: count,
        testDocumentSaved: !!saveResult,
        testDocumentId: saveResult?._id?.toString(),
        recentQueries: recentQueries.map(q => ({
          id: q._id.toString(),
          query: q.query,
          handler: q.handler,
          timestamp: q.timestamp,
          resultCount: q.resultCount
        }))
      }
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Diagnostic error:', error);
    res.status(500).json({ 
      status: 'error',
      message: error.message,
      type: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      connected: mongoose.connection?.readyState === 1
    });
  } finally {
    // Always close the connection to prevent hanging
    try {
      if (mongoose.connection?.readyState !== 0) {
        await mongoose.connection.close();
      }
    } catch (e) {
      console.error('Error closing connection:', e);
    }
  }
}

module.exports = handler;
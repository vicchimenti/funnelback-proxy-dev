// api/queryCount.js
const mongoose = require('mongoose');
const { Query } = require('../lib/queryAnalytics');

async function handler(req, res) {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI, {});
      console.log('Connected to MongoDB for diagnostics');
    }
    
    // Get connection status
    const connectionState = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState];
    
    // Count documents
    const count = await Query.countDocuments();
    
    // Get a sample of recent queries if there are any
    const recentQueries = count > 0 
      ? await Query.find().sort({timestamp: -1}).limit(5).lean()
      : [];
    
    // Clean up sensitive information
    const sampleQueries = recentQueries.map(q => ({
      query: q.query,
      timestamp: q.timestamp,
      handler: q.handler,
      resultCount: q.resultCount,
      hasResults: q.hasResults
    }));
    
    res.json({ 
      status: 'success',
      database: {
        connected: mongoose.connection.readyState === 1,
        connectionState,
        databaseName: mongoose.connection.db?.databaseName || 'not connected'
      },
      queries: {
        count,
        sampleQueries
      }
    });
  } catch (error) {
    console.error('Diagnostic error:', error);
    res.status(500).json({ 
      status: 'error',
      message: error.message,
      connected: mongoose.connection.readyState === 1
    });
  }
}

module.exports = handler;
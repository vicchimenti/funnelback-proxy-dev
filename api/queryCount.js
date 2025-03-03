// api/queryCount.js
const mongoose = require('mongoose');

async function handler(req, res) {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    // Add a timeout to the MongoDB connection attempt
    const connectPromise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // 5 seconds timeout for server selection
      connectTimeoutMS: 5000,        // 5 seconds timeout for initial connection
      socketTimeoutMS: 5000          // 5 seconds timeout for socket operations
    });
    
    // Set a timeout for the entire operation
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Connection timed out')), 5000)
    );
    
    // Race the connection against the timeout
    await Promise.race([connectPromise, timeoutPromise]);
    
    // Get connection status
    const connectionState = ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState];
    
    // Instead of using the Query model which may not be properly imported,
    // use the raw MongoDB driver to check collection existence
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    // Check if queries collection exists
    const hasQueriesCollection = collectionNames.includes('queries');
    
    // Basic stats without trying to access documents
    const stats = {
      status: 'success',
      database: {
        connected: mongoose.connection.readyState === 1,
        connectionState,
        databaseName: mongoose.connection.db?.databaseName || 'not connected',
        collections: collectionNames
      },
      queries: {
        collectionExists: hasQueriesCollection
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
      connected: mongoose.connection.readyState === 1
    });
  } finally {
    // Always close the connection to prevent hanging
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    } catch (e) {
      console.error('Error closing connection:', e);
    }
  }
}

module.exports = handler;
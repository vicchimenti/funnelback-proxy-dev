/**
 * @fileoverview Query Analytics Dashboard API
 * 
 * Provides API endpoints for the query analytics dashboard.
 * This API allows frontend applications to access query statistics,
 * trends, and detailed query information.
 * 
 * Features:
 * - Endpoints for various analytics views
 * - Date range filtering
 * - Handler-specific analytics
 * - Export functionality
 * 
 * @author Victor Chimenti
 * @version 1.0.1
 * @license MIT
 */

const express = require('express');
const cors = require('cors');
const { getQueryStatistics, Query } = require('../lib/queryAnalytics');

// Create router
const router = express.Router();

// CORS configuration - restrict to your admin dashboard domain
router.use(cors({
  origin: process.env.DASHBOARD_ORIGIN || 'https://admin.seattleu.edu',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Basic authentication middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
  const [username, password] = credentials.split(':');
  
  // Simple authentication - replace with more secure method in production
  if (username === process.env.DASHBOARD_USERNAME && 
      password === process.env.DASHBOARD_PASSWORD) {
    next();
  } else {
    res.status(403).json({ error: 'Invalid credentials' });
  }
}

/**
 * GET /api/analytics/summary
 * Get summary statistics for all queries
 */
router.get('/summary', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, handler } = req.query;
    
    // Parse dates if provided
    const options = {};
    if (startDate) options.startDate = new Date(startDate);
    if (endDate) options.endDate = new Date(endDate);
    if (handler) options.handler = handler;
    
    const statistics = await getQueryStatistics(options);
    res.json(statistics);
  } catch (error) {
    console.error('Error getting summary statistics:', error);
    res.status(500).json({ error: 'Failed to retrieve statistics' });
  }
});

/**
 * GET /api/analytics/trends
 * Get query trends over time
 */
router.get('/trends', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, interval = 'day', handler } = req.query;
    
    // Build query
    const query = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    if (handler) query.handler = handler;
    
    // Determine group format based on interval
    let dateFormat;
    if (interval === 'hour') {
      dateFormat = {
        year: { $year: "$timestamp" },
        month: { $month: "$timestamp" },
        day: { $dayOfMonth: "$timestamp" },
        hour: { $hour: "$timestamp" }
      };
    } else if (interval === 'day') {
      dateFormat = {
        year: { $year: "$timestamp" },
        month: { $month: "$timestamp" },
        day: { $dayOfMonth: "$timestamp" }
      };
    } else if (interval === 'week') {
      dateFormat = {
        year: { $year: "$timestamp" },
        week: { $week: "$timestamp" }
      };
    } else if (interval === 'month') {
      dateFormat = {
        year: { $year: "$timestamp" },
        month: { $month: "$timestamp" }
      };
    }
    
    // Perform aggregation
    const trends = await Query.aggregate([
      { $match: query },
      { $group: {
          _id: dateFormat,
          count: { $sum: 1 },
          queriesWithResults: { $sum: { $cond: ['$hasResults', 1, 0] } },
          queriesWithoutResults: { $sum: { $cond: [{ $not: '$hasResults' }, 1, 0] } },
          averageResponseTime: { $avg: '$responseTime' },
          averageResultCount: { $avg: '$resultCount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
    ]);
    
    res.json(trends);
  } catch (error) {
    console.error('Error getting query trends:', error);
    res.status(500).json({ error: 'Failed to retrieve trends' });
  }
});

/**
 * GET /api/analytics/handlers
 * Get statistics broken down by handler
 */
router.get('/handlers', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build query
    const query = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    // Perform aggregation by handler
    const handlerStats = await Query.aggregate([
      { $match: query },
      { $group: {
          _id: '$handler',
          count: { $sum: 1 },
          queriesWithResults: { $sum: { $cond: ['$hasResults', 1, 0] } },
          queriesWithoutResults: { $sum: { $cond: [{ $not: '$hasResults' }, 1, 0] } },
          averageResponseTime: { $avg: '$responseTime' },
          averageResultCount: { $avg: '$resultCount' },
          errorCount: { $sum: { $cond: ['$error.occurred', 1, 0] } }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    res.json(handlerStats);
  } catch (error) {
    console.error('Error getting handler statistics:', error);
    res.status(500).json({ error: 'Failed to retrieve handler statistics' });
  }
});

/**
 * GET /api/analytics/zero-results
 * Get queries that returned zero results
 */
router.get('/zero-results', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, limit = 100, handler } = req.query;
    
    // Build query
    const query = { hasResults: false };
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    if (handler) query.handler = handler;
    
    // Get zero-result queries with their frequency
    const zeroResultQueries = await Query.aggregate([
      { $match: query },
      { $group: {
          _id: '$query',
          count: { $sum: 1 },
          lastSearched: { $max: '$timestamp' },
          handlers: { $addToSet: '$handler' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: parseInt(limit, 10) }
    ]);
    
    res.json(zeroResultQueries);
  } catch (error) {
    console.error('Error getting zero-result queries:', error);
    res.status(500).json({ error: 'Failed to retrieve zero-result queries' });
  }
});

/**
 * GET /api/analytics/top-queries
 * Get most frequent queries
 */
router.get('/top-queries', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, limit = 100, handler } = req.query;
    
    // Build query
    const query = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    if (handler) query.handler = handler;
    
    // Get top queries with their statistics
    const topQueries = await Query.aggregate([
      { $match: query },
      { $group: {
          _id: '$query',
          count: { $sum: 1 },
          averageResponseTime: { $avg: '$responseTime' },
          averageResultCount: { $avg: '$resultCount' },
          successRate: { 
            $avg: { $cond: ['$hasResults', 1, 0] }
          },
          handlers: { $addToSet: '$handler' },
          lastSearched: { $max: '$timestamp' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: parseInt(limit, 10) }
    ]);
    
    res.json(topQueries);
  } catch (error) {
    console.error('Error getting top queries:', error);
    res.status(500).json({ error: 'Failed to retrieve top queries' });
  }
});

/**
 * GET /api/analytics/locations
 * Get query statistics by geographic location
 */
router.get('/locations', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, handler } = req.query;
    
    // Build query
    const query = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    if (handler) query.handler = handler;
    
    // Get statistics by country
    const countryStats = await Query.aggregate([
      { $match: query },
      { $group: {
          _id: '$location.country',
          count: { $sum: 1 },
          averageResponseTime: { $avg: '$responseTime' },
          averageResultCount: { $avg: '$resultCount' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);
    
    // Get statistics by city (for top countries)
    const cityStats = await Query.aggregate([
      { $match: query },
      { $group: {
          _id: {
            country: '$location.country',
            city: '$location.city'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 50 }
    ]);
    
    res.json({
      countries: countryStats,
      cities: cityStats
    });
  } catch (error) {
    console.error('Error getting location statistics:', error);
    res.status(500).json({ error: 'Failed to retrieve location statistics' });
  }
});

/**
 * GET /api/analytics/export
 * Export query data as CSV
 */
router.get('/export', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, handler, format = 'csv' } = req.query;
    
    // Build query
    const query = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    if (handler) query.handler = handler;
    
    // Get queries
    const queries = await Query.find(query)
      .sort({ timestamp: -1 })
      .limit(10000) // Limit export size
      .lean();
    
    if (format === 'json') {
      res.json(queries);
    } else {
      // Convert to CSV
      const csvHeader = 'Query,Timestamp,Handler,Result Count,Response Time,Has Results,Error\n';
      const csvRows = queries.map(q => 
        `"${q.query.replace(/"/g, '""')}",` +
        `"${q.timestamp}",` +
        `"${q.handler}",` +
        `${q.resultCount},` +
        `${q.responseTime},` +
        `${q.hasResults},` +
        `${q.error?.occurred || false}`
      );
      
      const csv = csvHeader + csvRows.join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=query-export.csv');
      res.send(csv);
    }
  } catch (error) {
    console.error('Error exporting query data:', error);
    res.status(500).json({ error: 'Failed to export query data' });
  }
});

// Main handler for all API requests
module.exports = (req, res) => {
  // Use router to handle all requests
  return router(req, res);
};
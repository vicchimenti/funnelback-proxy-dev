// api/testAnalytics.js
const mongoose = require('mongoose');
const { recordQuery } = require('../lib/queryAnalytics');

async function handler(req, res) {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    // Extract user data from request
    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Create a test analytics entry with rich user data
    const testData = {
      query: req.query.query || 'test-analytics-query',
      handler: 'testAnalytics',
      collection: req.query.collection || 'seattleu~sp-search',
      userIp: userIp,
      userAgent: req.headers['user-agent'],
      referer: req.headers.referer,
      city: decodeURIComponent(req.headers['x-vercel-ip-city'] || ''),
      region: req.headers['x-vercel-ip-country-region'],
      country: req.headers['x-vercel-ip-country'],
      timezone: req.headers['x-vercel-ip-timezone'],
      latitude: req.headers['x-vercel-ip-latitude'],
      longitude: req.headers['x-vercel-ip-longitude'],
      responseTime: 123, // mock value
      resultCount: 5,    // mock value
      isProgramTab: Boolean(req.query['f.Tabs|programMain']),
      isStaffTab: Boolean(req.query['f.Tabs|seattleu~ds-staff']),
      tabs: []
    };
    
    // Add tabs information
    if (testData.isProgramTab) testData.tabs.push('program-main');
    if (testData.isStaffTab) testData.tabs.push('Faculty & Staff');
    
    // Record the analytics
    const savedRecord = await recordQuery(testData);
    
    // Connect to MongoDB to fetch the saved record with all fields
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    
    // Get the Query model directly
    const Query = mongoose.models.Query || 
      mongoose.model('Query', require('../lib/queryAnalytics').Query.schema);
    
    // Find the most recently saved record
    const fullRecord = await Query.findOne({
      handler: 'testAnalytics',
      query: testData.query
    }).sort({ timestamp: -1 }).lean();
    
    // Return results of the test
    res.json({
      status: 'success',
      saved: !!savedRecord,
      savedId: savedRecord?._id?.toString(),
      dataSubmitted: testData,
      savedRecord: fullRecord,
      demographicsComplete: {
        hasCity: !!fullRecord?.location?.city,
        hasRegion: !!fullRecord?.location?.region,
        hasCountry: !!fullRecord?.location?.country,
        hasTimezone: !!fullRecord?.location?.timezone,
        hasCoordinates: !!(fullRecord?.location?.coordinates?.latitude && 
                           fullRecord?.location?.coordinates?.longitude),
        hasUserAgent: !!fullRecord?.userAgent,
        hasReferer: !!fullRecord?.referer,
        hasIp: !!fullRecord?.userIp
      }
    });
  } catch (error) {
    console.error('Analytics test error:', error);
    res.status(500).json({ 
      status: 'error',
      message: error.message,
      type: error.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
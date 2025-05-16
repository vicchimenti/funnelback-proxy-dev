/**
 * @fileoverview Enhanced Query Analytics for Funnelback Search Integration
 *
 * This module provides MongoDB integration for tracking search queries and
 * click-through data. It supports finding, creating, and updating query records
 * with associated click data.
 *
 * Features:
 * - Search query tracking
 * - Click-through tracking with position, title, and URL
 * - Session-based tracking
 * - Query attribution
 * - Automatic MongoDB connection handling
 * - Enhanced IP tracking for consistency
 *
 * @author Victor Chimenti
 * @version 4.3.0
 * @namespace queryAnalytics
 * @lastModified 2025-05-16
 * @license MIT
 */

const mongoose = require("mongoose");
const { Schema } = mongoose;

// Connect to MongoDB if not already connected
async function connectToMongoDB() {
  if (mongoose.connection.readyState === 0) {
    console.log("Connecting to MongoDB...");
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log("Connected to MongoDB successfully");
    } catch (error) {
      console.error("MongoDB connection error:", error);
      throw error;
    }
  }
}

// Define Schema for search queries with click tracking
const QuerySchema = new Schema({
  // Base query information
  handler: { type: String, required: true },
  query: { type: String, required: true },
  searchCollection: { type: String },

  // User information
  userAgent: { type: String },
  referer: { type: String },
  sessionId: { type: String },

  // IP tracking information - CRITICAL for consistency
  clientIp: { type: String }, // Explicitly defined field for client IP

  // Location information (anonymized)
  city: { type: String },
  region: { type: String },
  country: { type: String },
  timezone: { type: String },
  latitude: { type: String },
  longitude: { type: String },

  // Search results information
  responseTime: { type: Number },
  resultCount: { type: Number, default: 0 },
  hasResults: { type: Boolean, default: false },
  cacheHit: { type: Boolean, default: null },
  cacheSet: { type: Boolean, default: null },

  // Tab-specific information
  isProgramTab: { type: Boolean, default: false },
  isStaffTab: { type: Boolean, default: false },
  tabs: [{ type: String }],

  // Add enrichmentData field explicitly to the schema
  enrichmentData: {
    type: Schema.Types.Mixed,
  },

  // Click tracking
  clickedResults: [
    {
      url: { type: String, required: true },
      title: { type: String },
      position: { type: Number },
      timestamp: { type: Date, default: Date.now },
    },
  ],

  // Request-specific information
  requestId: { type: String }, // Track specific request IDs
  isServerSideRequest: { type: Boolean }, // Flag for server-side requests

  expiresAt: { type: Date },

  // Timestamps
  timestamp: { type: Date, default: Date.now },
  lastClickTimestamp: { type: Date },
});

// Create indexes for common queries
QuerySchema.index({ query: 1, timestamp: -1 });
QuerySchema.index({ sessionId: 1, timestamp: -1 });
QuerySchema.index({ timestamp: -1 });
QuerySchema.index({ clientIp: 1 });
QuerySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });


// Calculate TTLs in seconds
const SUGGESTION_TTL = 60 * 60 * 24 * 30; // 30 days in seconds
const SEARCH_CLICK_TTL = 60 * 60 * 24 * 60; // 60 days in seconds

// Create a pre-save hook to calculate expiration time based on handler type
QuerySchema.pre('save', function (next) {
  const now = new Date();

  // Set TTL based on handler type
  if (this.handler === 'suggest' ||
    this.handler === 'suggestPeople' ||
    this.handler === 'suggestPrograms') {
    // 30-day TTL for suggestion services
    this.expiresAt = new Date(now.getTime() + (SUGGESTION_TTL * 1000));
  } else {
    // 60-day TTL for search and click data
    this.expiresAt = new Date(now.getTime() + (SEARCH_CLICK_TTL * 1000));
  }

  next();
});


// Define or get models
let Query;
try {
  Query = mongoose.model("Query");
} catch (error) {
  Query = mongoose.model("Query", QuerySchema);
}

/**
 * Records a search query in the database
 * Enhanced with explicit logging for IP tracking
 *
 * @param {Object} queryData - Data about the search query
 * @returns {Promise<Object>} The saved query object or null if not saved
 */
async function recordQuery(queryData) {
  try {
    if (!process.env.MONGODB_URI) {
      console.log("MongoDB URI not defined, skipping analytics");
      return null;
    }

    await connectToMongoDB();

    // Set hasResults based on resultCount
    if (queryData.resultCount !== undefined) {
      queryData.hasResults = queryData.resultCount > 0;
    }

    // CRITICAL: Log the IP we're about to save to verify consistency
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "query-analytics",
        event: "recording_query_with_ip",
        handler: queryData.handler || "unknown",
        query: queryData.query?.substring(0, 50) || "[empty]",
        clientIp: queryData.clientIp || "missing",
        hasClientIp: !!queryData.clientIp,
        requestId: queryData.requestId || "unknown",
      })
    );

    // Create and save the query
    const query = new Query(queryData);
    await query.save();

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "query-analytics",
        event: "query_recorded",
        query: queryData.query?.substring(0, 50) || "[empty]",
        id: query._id.toString(),
        clientIpSaved: !!queryData.clientIp,
        requestId: queryData.requestId || "unknown",
      })
    );

    return query;
  } catch (error) {
    console.error("Error recording query:", error);
    return null;
  }
}

// Helper function to escape regular expression special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Records a click on a search result
 * Enhanced with consistent IP tracking
 *
 * @param {Object} clickData - Data about the clicked result
 * @returns {Promise<Object>} The updated query object or null if not updated
 */
async function recordClick(clickData) {
  try {
    if (!process.env.MONGODB_URI) {
      console.log("MongoDB URI not defined, skipping click analytics");
      return null;
    }

    await connectToMongoDB();

    // Make sure original query is properly sanitized
    const originalQuery = (clickData.originalQuery || "").trim();

    // CRITICAL: Log the IP we're about to use for finding the query
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "query-analytics",
        event: "finding_query_for_click",
        originalQuery: originalQuery.substring(0, 50) || "[empty]",
        clientIp: clickData.clientIp || "missing",
        hasClientIp: !!clickData.clientIp,
        sessionId: clickData.sessionId || "missing",
        requestId: clickData.requestId || "unknown",
      })
    );

    // Prepare filters to find the matching query - make it case-insensitive
    // and add a time-based filter to get recent queries
    const filters = {
      query: new RegExp("^" + escapeRegExp(originalQuery) + "$", "i"),
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
    };

    // Use sessionId for filtering if available
    if (clickData.sessionId) {
      filters.sessionId = clickData.sessionId;
    }

    // Add clientIp filter if available for more accurate matching
    if (clickData.clientIp) {
      filters.clientIp = clickData.clientIp;
    }

    // Create click record
    const clickRecord = {
      title: clickData.clickedTitle || "",
      url: clickData.clickedUrl,
      position: clickData.clickPosition || -1,
      type: clickData.clickType || "search",
      timestamp: new Date(),
    };

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "query-analytics",
        event: "looking_for_query",
        query: originalQuery.substring(0, 50) || "[empty]",
        sessionId: clickData.sessionId || "unknown",
        clientIp: clickData.clientIp || "unknown",
        filters: JSON.stringify(filters).substring(0, 100) + "...",
      })
    );

    // Find the most recent matching query and update it
    const result = await Query.findOneAndUpdate(
      filters,
      {
        $push: { clickedResults: clickRecord },
        $set: { lastClickTimestamp: new Date() },
      },
      {
        new: true, // Return the updated document
        sort: { timestamp: -1 }, // Get the most recent one
      }
    );

    if (!result) {
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          service: "query-analytics",
          event: "no_matching_query_found",
          originalQuery: originalQuery.substring(0, 50) || "[empty]",
          creating: "new_click_only_record",
        })
      );

      const newQueryData = {
        handler: "click-only",
        query: originalQuery,
        userAgent: clickData.userAgent,
        referer: clickData.referer,
        sessionId: clickData.sessionId,
        clientIp: clickData.clientIp, // CRITICAL: Include the client IP
        city: clickData.city,
        region: clickData.region,
        country: clickData.country,
        latitude: clickData.latitude,
        longitude: clickData.longitude,
        clickedResults: [clickRecord],
        lastClickTimestamp: new Date(),
        timestamp: new Date(),
        requestId: clickData.requestId || "unknown",
      };

      return await recordQuery(newQueryData);
    }

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "query-analytics",
        event: "click_recorded",
        query: result.query.substring(0, 50) || "[empty]",
        id: result._id.toString(),
        hasClientIp: !!result.clientIp,
      })
    );

    return result;
  } catch (error) {
    console.error("Error recording click:", error);
    return null;
  }
}

/**
 * Batch record multiple clicks
 * Enhanced with consistent IP tracking
 *
 * @param {Array} clicksData - Array of click data objects
 * @returns {Promise<Object>} Result with count of processed clicks
 */
async function recordClicks(clicksData) {
  if (!Array.isArray(clicksData) || clicksData.length === 0) {
    return { processed: 0 };
  }

  try {
    if (!process.env.MONGODB_URI) {
      console.log("MongoDB URI not defined, skipping batch click analytics");
      return { processed: 0 };
    }

    await connectToMongoDB();

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "query-analytics",
        event: "processing_batch_clicks",
        count: clicksData.length,
        samplesWithIp: clicksData.filter((c) => !!c.clientIp).length,
        samplesWithSession: clicksData.filter((c) => !!c.sessionId).length,
      })
    );

    // Process each click
    const results = await Promise.allSettled(
      clicksData.map((clickData) => recordClick(clickData))
    );

    // Count successful operations
    const successful = results.filter(
      (r) => r.status === "fulfilled" && r.value
    ).length;

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "query-analytics",
        event: "batch_processing_complete",
        successful,
        total: clicksData.length,
        successRate: `${Math.round((successful / clicksData.length) * 100)}%`,
      })
    );

    return {
      processed: successful,
      total: clicksData.length,
    };
  } catch (error) {
    console.error("Error in batch click processing:", error);
    return { processed: 0, error: error.message };
  }
}

module.exports = {
  Query,
  recordQuery,
  recordClick,
  recordClicks,
};

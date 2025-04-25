/**
 * @fileoverview Analytics API Click Supplement Endpoint for Funnelback Search Integration
 *
 * This file contains API handler for tracking various search analytics events
 * including supplementary analytics data. Enhanced with consistent IP tracking,
 * session management, and improved error handling.
 *
 * Features:
 * - Consistent IP extraction using commonUtils
 * - Standardized CORS handling
 * - Enhanced session ID management
 * - Detailed structured logging
 * - Comprehensive error handling
 * - Standardized analytics schema
 *
 * @author Victor Chimenti
 * @version 3.1.0
 * @module api/analytics/supplement
 * @lastModified 2025-04-25
 */

// api/analytics/supplement.js
module.exports = async (req, res) => {
  // Use common utilities for consistent IP extraction
  const commonUtils = require("../../lib/commonUtils");

  // CRITICAL: Extract the true end-user IP with highest priority
  const clientIp = commonUtils.extractClientIp(req);
  const requestId = commonUtils.getRequestId(req);

  // Log full IP information for debugging including all potential IP sources
  commonUtils.logFullIpInfo(req, "supplement-analytics", requestId);

  // Standard log with redacted IP (for security/privacy)
  commonUtils.logEvent("info", "request_received", "supplement-analytics", {
    requestId,
    path: req.url,
    clientIp, // Will be redacted in standard logs
  });

  // Set CORS headers using common utilities
  commonUtils.setCorsHeaders(res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    commonUtils.logEvent("info", "options_request", "supplement-analytics", {
      requestId,
    });
    res.status(200).end();
    return;
  }

  // Only accept POST
  if (req.method !== "POST") {
    commonUtils.logEvent("warn", "method_not_allowed", "supplement-analytics", {
      requestId,
      method: req.method,
    });
    return res.status(405).send("Method Not Allowed");
  }

  try {
    // Import only the exported functions from queryAnalytics
    const { recordQuery } = require("../../lib/queryAnalytics");
    const { createStandardAnalyticsData } = require("../../lib/schemaHandler");
    const { getLocationData } = require("../../lib/geoIpService");

    const data = req.body || {};

    // Log received data
    commonUtils.logEvent(
      "debug",
      "received_supplement_data",
      "supplement-analytics",
      {
        requestId,
        receivedFields: Object.keys(data),
        contentType: req.headers["content-type"],
      }
    );

    if (!data.query) {
      commonUtils.logEvent("warn", "missing_query", "supplement-analytics", {
        requestId,
        receivedFields: Object.keys(data),
      });
      return res.status(400).json({ error: "No query provided" });
    }

    // Extract session information
    const sessionInfo = commonUtils.extractSessionInfo(req);
    commonUtils.logSessionHandling(
      req,
      sessionInfo,
      "supplement-analytics",
      requestId
    );

    // Get location data based on the ACTUAL USER IP - Critical for consistency
    let locationData = null;
    try {
      // Use true user IP for location lookup, not server/edge IPs
      locationData = await getLocationData(clientIp);
      commonUtils.logEvent(
        "debug",
        "location_data_retrieved",
        "supplement-analytics",
        {
          requestId,
          clientIp: clientIp, // Log which IP was used for lookup
          location: {
            city: locationData.city,
            region: locationData.region,
            country: locationData.country,
          },
        }
      );
    } catch (geoError) {
      commonUtils.logEvent(
        "warn",
        "location_data_failed",
        "supplement-analytics",
        {
          requestId,
          error: geoError.message,
        }
      );
      // Use default empty location data
      locationData = {
        city: null,
        region: null,
        country: null,
        timezone: null,
      };
    }

    commonUtils.logEvent(
      "info",
      "processing_supplementary_analytics",
      "supplement-analytics",
      {
        requestId,
        query: data.query,
        sessionId: sessionInfo.sessionId || "[none]",
        hasEnrichment: !!data.enrichmentData,
        clientIpSource: "extractClientIp", // Explicitly log the source of the IP
      }
    );

    // Prepare query data object - CRITICAL: Use the correct clientIp field
    const queryData = {
      handler: "supplement",
      query: data.query,
      clientIp: clientIp, // CRITICAL: This must be the actual user IP
      userAgent: req.headers["user-agent"],
      referer: req.headers.referer,
      sessionId: sessionInfo.sessionId,
      city:
        locationData?.city ||
        (req.headers["x-vercel-ip-city"]
          ? decodeURIComponent(req.headers["x-vercel-ip-city"])
          : null),
      region: locationData?.region || req.headers["x-vercel-ip-country-region"],
      country: locationData?.country || req.headers["x-vercel-ip-country"],
      timezone: locationData?.timezone || req.headers["x-vercel-ip-timezone"],
      requestId: requestId,
      timestamp: new Date(),
    };

    // Add result count if provided
    if (data.resultCount !== undefined) {
      queryData.resultCount = data.resultCount;
      queryData.hasResults = data.resultCount > 0;
    }

    // Add enrichment data if provided
    if (data.enrichmentData) {
      queryData.enrichmentData = data.enrichmentData;
    }

    // Add tab information if provided
    if (data.tabs) {
      queryData.tabs = Array.isArray(data.tabs) ? data.tabs : [];
    }

    // Add program/staff tab flags if provided
    if (data.isProgramTab !== undefined) {
      queryData.isProgramTab = !!data.isProgramTab;
    }

    if (data.isStaffTab !== undefined) {
      queryData.isStaffTab = !!data.isStaffTab;
    }

    // IMPORTANT: Log the exact data being passed to standardization
    commonUtils.logEvent(
      "debug",
      "pre_standardization_data",
      "supplement-analytics",
      {
        requestId,
        dataFields: Object.keys(queryData),
        clientIp: queryData.clientIp,
        userAgent: queryData.userAgent?.substring(0, 50),
      }
    );

    // Standardize and validate data
    const standardData = createStandardAnalyticsData(queryData);

    // IMPORTANT: Log the post-standardized data to verify IP preservation
    commonUtils.logEvent(
      "debug",
      "post_standardization_data",
      "supplement-analytics",
      {
        requestId,
        standardFields: Object.keys(standardData),
        clientIp: standardData.clientIp,
        hasClientIp: !!standardData.clientIp,
      }
    );

    // Log analytics data without sensitive information
    commonUtils.logEvent(
      "debug",
      "standardized_analytics_data",
      "supplement-analytics",
      {
        requestId,
        query: standardData.query,
        resultCount: standardData.resultCount,
        hasResults: standardData.hasResults,
        tabs: standardData.tabs,
        hasEnrichment: !!standardData.enrichmentData,
      }
    );

    // Use recordQuery to create or update the record
    const result = await recordQuery(standardData);

    if (!result) {
      commonUtils.logEvent("error", "record_failed", "supplement-analytics", {
        requestId,
        query: data.query,
      });
      return res.status(500).json({ error: "Failed to record analytics data" });
    }

    commonUtils.logEvent(
      "info",
      "supplement_recorded",
      "supplement-analytics",
      {
        requestId,
        recordId: result._id.toString(),
        query: data.query,
        clientIpRecorded: !!standardData.clientIp, // Verify IP was included in record
      }
    );

    res.status(200).json({
      success: true,
      recordId: result._id.toString(),
      clientIpUsed: !!standardData.clientIp, // Return this so we can verify IP handling
    });
  } catch (error) {
    // Handle errors using common utils
    const errorInfo = commonUtils.formatError(
      error,
      "supplement-analytics",
      "supplement_recording_failed",
      requestId
    );

    // Log additional context for debugging
    commonUtils.logEvent("error", "request_failed", "supplement-analytics", {
      requestId,
      errorDetails: {
        message: error.message,
        name: error.name,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
    });

    // Provide more detailed error for troubleshooting
    res.status(errorInfo.status).json({
      error: error.message,
      requestId: requestId,
      type: error.name,
    });
  }
};

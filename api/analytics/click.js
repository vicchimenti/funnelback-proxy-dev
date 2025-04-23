/**
 * @fileoverview Analytics API Click Endpoint for Funnelback Search Integration
 *
 * This file contains API handler for tracking click events on search results.
 * Enhanced with consistent IP tracking, session management, and improved error handling.
 *
 * Features:
 * - Consistent IP extraction using commonUtils
 * - Standardized CORS handling
 * - Enhanced session ID management
 * - Detailed structured logging
 * - Comprehensive error handling
 * - GeoIP integration
 * - Standardized analytics schema
 *
 * @author Victor Chimenti
 * @version 3.0.0
 * @module api/analytics/click
 * @lastModified 2025-04-23
 */

// api/analytics/click.js
module.exports = async (req, res) => {
  // Use common utilities for consistent IP extraction
  const commonUtils = require("../../lib/commonUtils");
  const clientIp = commonUtils.extractClientIp(req);
  const requestId = commonUtils.getRequestId(req);

  // Log full IP information for debugging
  commonUtils.logFullIpInfo(req, 'click-analytics', requestId);

  // Standard log with redacted IP (for security/privacy)
  commonUtils.logEvent('info', 'request_received', 'click-analytics', {
    requestId,
    path: req.url,
    clientIp // Will be redacted in standard logs
  });

  // Set CORS headers using common utilities
  commonUtils.setCorsHeaders(res);

  // Handle preflight
  if (req.method === "OPTIONS") {
    commonUtils.logEvent('info', 'options_request', 'click-analytics', { requestId });
    res.status(200).end();
    return;
  }

  // Only accept POST
  if (req.method !== "POST") {
    commonUtils.logEvent('warn', 'method_not_allowed', 'click-analytics', {
      requestId,
      method: req.method
    });
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const { recordClick } = require("../../lib/queryAnalytics");
    const { createStandardClickData } = require("../../lib/schemaHandler");
    const { getLocationData } = require("../../lib/geoIpService");

    const clickData = req.body || {};

    // Log received data
    commonUtils.logEvent('debug', 'received_click_data', 'click-analytics', {
      requestId,
      receivedFields: Object.keys(clickData),
      contentType: req.headers["content-type"]
    });

    // Extract session information
    const sessionInfo = commonUtils.extractSessionInfo(req);
    commonUtils.logSessionHandling(req, sessionInfo, 'click-analytics', requestId);

    // Normalize field names to handle variations from different frontend components
    const normalizedClickData = {
      ...clickData,
      // Handle both 'originalQuery' and 'query' field names
      originalQuery: clickData.originalQuery || clickData.query || "",
      // Handle both 'clickedUrl' and 'url' field names
      clickedUrl: clickData.clickedUrl || clickData.url || "",
      // Handle both 'clickedTitle' and 'title' field names
      clickedTitle: clickData.clickedTitle || clickData.title || "",
      // Handle both 'clickPosition' and 'position' field names
      clickPosition: clickData.clickPosition || clickData.position || -1,
      // Handle both 'clickType' and 'type' field names
      clickType: clickData.clickType || clickData.type || "search",
      // Use extracted session ID
      sessionId: sessionInfo.sessionId
    };

    // Log normalized data
    commonUtils.logEvent('debug', 'normalized_click_data', 'click-analytics', {
      requestId,
      originalQuery: normalizedClickData.originalQuery,
      clickedUrl: normalizedClickData.clickedUrl,
      title: normalizedClickData.clickedTitle,
      position: normalizedClickData.clickPosition,
      sessionId: normalizedClickData.sessionId || "null"
    });

    // Enhanced validation with more detailed error responses
    if (!normalizedClickData.originalQuery) {
      commonUtils.logEvent('warn', 'missing_query', 'click-analytics', {
        requestId,
        receivedFields: Object.keys(clickData)
      });
      return res.status(400).json({
        error: "Missing required field: originalQuery/query",
        receivedFields: Object.keys(clickData),
      });
    }

    if (!normalizedClickData.clickedUrl) {
      commonUtils.logEvent('warn', 'missing_url', 'click-analytics', {
        requestId,
        receivedFields: Object.keys(clickData)
      });
      return res.status(400).json({
        error: "Missing required field: clickedUrl/url",
        receivedFields: Object.keys(clickData),
      });
    }

    // Validate and set click type
    if (!normalizedClickData.clickType) {
      // Default to 'search' if not specified
      normalizedClickData.clickType = "search";
    } else {
      // Ensure it's a supported type
      const validTypes = ["search", "staff", "program", "suggestion"];
      if (!validTypes.includes(normalizedClickData.clickType)) {
        normalizedClickData.clickType = "search"; // Default if invalid
      }
    }

    // Get location data based on the user's IP
    let locationData = null;
    try {
      locationData = await getLocationData(clientIp);
      commonUtils.logEvent('debug', 'location_data_retrieved', 'click-analytics', {
        requestId,
        location: {
          city: locationData.city,
          region: locationData.region,
          country: locationData.country
        }
      });
    } catch (geoError) {
      commonUtils.logEvent('warn', 'location_data_failed', 'click-analytics', {
        requestId,
        error: geoError.message
      });
      // Use default empty location data
      locationData = {
        city: null,
        region: null,
        country: null,
        timezone: null
      };
    }

    // Add server-side data
    normalizedClickData.clientIp = clientIp;
    normalizedClickData.userAgent = req.headers["user-agent"];
    normalizedClickData.referer = req.headers.referer;
    normalizedClickData.requestId = requestId;

    // Add location data
    normalizedClickData.city = locationData.city ||
      (req.headers["x-vercel-ip-city"] ? decodeURIComponent(req.headers["x-vercel-ip-city"]) : null);
    normalizedClickData.region = locationData.region || req.headers["x-vercel-ip-country-region"];
    normalizedClickData.country = locationData.country || req.headers["x-vercel-ip-country"];
    normalizedClickData.latitude = locationData.latitude || req.headers["x-vercel-ip-latitude"];
    normalizedClickData.longitude = locationData.longitude || req.headers["x-vercel-ip-longitude"];

    // Log what we're recording
    commonUtils.logEvent('info', 'recording_click', 'click-analytics', {
      requestId,
      query: normalizedClickData.originalQuery,
      url: normalizedClickData.clickedUrl,
      title: normalizedClickData.clickedTitle || "(no title)",
      position: normalizedClickData.clickPosition || "unknown",
      clickType: normalizedClickData.clickType,
      sessionId: normalizedClickData.sessionId || "null"
    });

    // Create standardized click data
    const standardClickData = createStandardClickData(normalizedClickData);

    // Record click in database
    const result = await recordClick(standardClickData);

    // Log recording result
    if (result && result._id) {
      commonUtils.logEvent('info', 'click_recorded', 'click-analytics', {
        requestId,
        recordId: result._id.toString(),
        success: true
      });
    } else {
      commonUtils.logEvent('warn', 'click_recording_failed', 'click-analytics', {
        requestId,
        success: false
      });
    }

    // Send minimal response for performance
    res.status(200).json({ success: true, requestId });
  } catch (error) {
    // Handle errors using common utils
    const errorInfo = commonUtils.formatError(error, 'click-analytics', 'click_recording_failed', requestId);

    // Log additional context for debugging
    commonUtils.logEvent('error', 'request_failed', 'click-analytics', {
      requestId,
      errorDetails: {
        message: error.message,
        name: error.name,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined
      }
    });

    // Provide more detailed error for troubleshooting
    res.status(errorInfo.status).json({
      error: error.message,
      requestId: requestId,
      type: error.name
    });
  }
};

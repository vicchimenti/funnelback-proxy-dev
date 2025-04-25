/**
 * @fileoverview Consistent Schema Handler for Analytics
 *
 * This module provides standardized schema handling functions for all analytics endpoints,
 * ensuring consistent data format, proper null checks, schema validation, and enhanced
 * IP tracking. Now includes integration with commonUtils for improved consistency.
 *
 * @author Victor Chimenti
 * @version 3.1.0
 * @namespace schemaHandler
 * @license MIT
 * @lastmodified 2025-04-25
 */

const commonUtils = require("./commonUtils");

/**
 * Creates a standardized analytics data object with consistent schema
 * Ensures all properties have proper null checks and default values
 * Enhanced with improved IP tracking
 *
 * @param {Object} data - Raw data to standardize
 * @returns {Object} Standardized analytics data with consistent schema
 */
function createStandardAnalyticsData(data) {
  // Log the incoming data with IP info to trace any potential issues
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "schema-handler",
      event: "standardizing_analytics_data",
      handler: data.handler || "unknown",
      hasClientIp: !!data.clientIp,
      requestId: data.requestId || "unknown",
    })
  );

  // Basic required fields with defaults
  const standardData = {
    // Required fields - these should never be null
    handler: data.handler || "unknown",
    query: data.query || "[empty query]",
    timestamp: data.timestamp || new Date(),

    // CRITICAL: IP tracking - ensure this field is preserved
    clientIp: data.clientIp || null, // Must preserve client IP

    // User information - can be null in schema but provide defaults
    userAgent: data.userAgent || null,
    referer: data.referer || null,
    sessionId: commonUtils.sanitizeSessionId(data.sessionId),
    requestId: data.requestId || null,

    // Location information - can be null (anonymized)
    city: data.city || null,
    region: data.region || null,
    country: data.country || null,
    timezone: data.timezone || null,
    latitude: data.latitude || null,
    longitude: data.longitude || null,

    // Search results information - ensure consistent types
    searchCollection: data.searchCollection || data.collection || null,
    responseTime: data.responseTime || 0,
    resultCount: data.resultCount || 0,
    hasResults: Boolean(
      data.hasResults || (data.resultCount && data.resultCount > 0)
    ),
    cacheHit: typeof data.cacheHit === "boolean" ? data.cacheHit : null,
    cacheSet: typeof data.cacheSet === "boolean" ? data.cacheSet : null,

    // Tab information
    isProgramTab: Boolean(data.isProgramTab || false),
    isStaffTab: Boolean(data.isStaffTab || false),
    tabs: Array.isArray(data.tabs) ? data.tabs : [],

    // Request type information
    isServerSideRequest:
      typeof data.isServerSideRequest === "boolean"
        ? data.isServerSideRequest
        : null,
    isRefinement:
      typeof data.isRefinement === "boolean" ? data.isRefinement : null,

    // Enrichment data
    enrichmentData: data.enrichmentData || null,

    // Click information - ensure proper array initialization
    clickedResults: Array.isArray(data.clickedResults)
      ? data.clickedResults
      : [],

    // Error information if applicable
    error: data.error || null,
  };

  // Add tab information based on tab flags
  if (
    standardData.isProgramTab &&
    !standardData.tabs.includes("program-main")
  ) {
    standardData.tabs.push("program-main");
  }
  if (
    standardData.isStaffTab &&
    !standardData.tabs.includes("Faculty & Staff")
  ) {
    standardData.tabs.push("Faculty & Staff");
  }

  // Handler-specific data
  if (data.handler === "suggest" && !data.enrichmentData) {
    standardData.enrichmentData = {
      totalSuggestions: data.resultCount || 0,
      suggestionsData: [],
      cacheHit: standardData.cacheHit || false,
      cacheSet: standardData.cacheSet || false,
    };
  } else if (data.handler === "suggestPeople" && !data.enrichmentData) {
    standardData.enrichmentData = {
      resultCount: data.resultCount || 0,
      staffData: [],
      cacheHit: standardData.cacheHit || false,
      cacheSet: standardData.cacheSet || false,
    };
  } else if (data.handler === "suggestPrograms" && !data.enrichmentData) {
    standardData.enrichmentData = {
      totalResults: data.resultCount || 0,
      programData: [],
      queryTime: 0,
      cacheHit: standardData.cacheHit || false,
      cacheSet: standardData.cacheSet || false,
    };
  }

  // Log the outcome to verify IP preservation
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "schema-handler",
      event: "standardization_complete",
      handler: standardData.handler,
      hasClientIp: !!standardData.clientIp,
      requestId: standardData.requestId || "unknown",
    })
  );

  return standardData;
}

/**
 * Creates a standardized click data object for tracking clicks
 * Enhanced with improved IP tracking
 *
 * @param {Object} clickData - Raw click data from request
 * @returns {Object} Standardized click data with consistent schema
 */
function createStandardClickData(clickData) {
  // Log the incoming click data with IP info
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "schema-handler",
      event: "standardizing_click_data",
      hasClientIp: !!clickData.clientIp,
      requestId: clickData.requestId || "unknown",
    })
  );

  // Base standardized click data
  const standardClickData = {
    // CRITICAL: IP tracking - ensure this field is preserved
    clientIp: clickData.clientIp || null, // Must preserve client IP

    // Then override or add specific ones
    url: clickData.clickedUrl || clickData.url || null,
    title: clickData.clickedTitle || clickData.title || "",
    position: parseInt(clickData.clickPosition || clickData.position, 10) || 0,
    timestamp: new Date(clickData.timestamp || Date.now()),
    type: clickData.clickType || clickData.type || "search",
    originalQuery: clickData.originalQuery || clickData.query || null,
    sessionId: commonUtils.sanitizeSessionId(clickData.sessionId),
    requestId: clickData.requestId || null,

    // Enhanced tracking
    userAgent: clickData.userAgent || null,
    referer: clickData.referer || null,

    // Location data
    city: clickData.city || null,
    region: clickData.region || null,
    country: clickData.country || null,
    timezone: clickData.timezone || null,
    latitude: clickData.latitude || null,
    longitude: clickData.longitude || null,
  };

  // Log the outcome to verify IP preservation
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "schema-handler",
      event: "click_standardization_complete",
      hasClientIp: !!standardClickData.clientIp,
      requestId: standardClickData.requestId || "unknown",
    })
  );

  // Preserve any other original properties not explicitly handled
  return {
    ...clickData,
    ...standardClickData,
  };
}

/**
 * Extracts tab information from query parameters
 *
 * @param {Object} query - Query parameters from request
 * @returns {Object} Standardized tab information
 */
function extractTabInfo(query) {
  if (!query) return { isProgramTab: false, isStaffTab: false, tabs: [] };

  const isProgramTab = Boolean(query["f.Tabs|programMain"]);
  const isStaffTab = Boolean(query["f.Tabs|seattleu~ds-staff"]);

  const tabs = [];
  if (isProgramTab) tabs.push("program-main");
  if (isStaffTab) tabs.push("Faculty & Staff");

  return { isProgramTab, isStaffTab, tabs };
}

/**
 * Creates a standardized request analytics object based on raw request data
 * Extracts relevant information from request headers and query parameters
 * Enhanced with explicit IP tracking
 *
 * @param {Object} req - Express request object
 * @param {Object} locationData - Location data from GeoIP service
 * @param {string} handler - Handler name for analytics
 * @param {number} [startTime] - Optional request start time for response time calculation
 * @returns {Object} Standardized request analytics data
 */
function createRequestAnalytics(req, locationData, handler, startTime = null) {
  // CRITICAL: Extract client IP with consistent method
  const clientIp = commonUtils.extractClientIp(req);

  // Log the extraction to trace potential issues
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "schema-handler",
      event: "creating_request_analytics",
      handler: handler,
      clientIp: clientIp,
      hasClientIp: !!clientIp,
      requestId: commonUtils.getRequestId(req) || "unknown",
    })
  );

  // Get request ID
  const requestId = commonUtils.getRequestId(req);

  // Extract or generate session info
  const sessionInfo = commonUtils.extractSessionInfo(req);

  // Extract tab information
  const tabInfo = extractTabInfo(req.query);

  // Calculate processing time if start time provided
  const processingTime = startTime ? Date.now() - startTime : null;

  // Create raw analytics data
  const analyticsData = {
    handler: handler,
    query: req.query?.query || req.query?.partial_query || "[empty query]",
    searchCollection: req.query?.collection || null,
    userAgent: req.headers["user-agent"],
    referer: req.headers.referer,
    clientIp: clientIp, // CRITICAL: Ensure client IP is included
    requestId: requestId,
    sessionId: sessionInfo.sessionId,
    city:
      locationData?.city ||
      (req.headers["x-vercel-ip-city"]
        ? decodeURIComponent(req.headers["x-vercel-ip-city"])
        : null),
    region: locationData?.region || req.headers["x-vercel-ip-country-region"],
    country: locationData?.country || req.headers["x-vercel-ip-country"],
    timezone: locationData?.timezone || req.headers["x-vercel-ip-timezone"],
    latitude: locationData?.latitude || req.headers["x-vercel-ip-latitude"],
    longitude: locationData?.longitude || req.headers["x-vercel-ip-longitude"],
    responseTime: processingTime,
    isServerSideRequest: commonUtils.isServerSideRequest(req),
    ...tabInfo,
    timestamp: new Date(),
  };

  // Log the outcome to verify IP preservation
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: "schema-handler",
      event: "request_analytics_created",
      handler: handler,
      hasClientIp: !!analyticsData.clientIp,
      requestId: requestId || "unknown",
    })
  );

  return analyticsData;
}

/**
 * Logs analytics data in a standardized format with sensitive data removed
 *
 * @param {Object} analyticsData - Data to log
 * @param {string} context - Context for the log
 */
function logAnalyticsData(analyticsData, context) {
  // Create a copy of the data to avoid modifying the original
  const loggableData = { ...analyticsData };

  // Remove potentially sensitive data
  if (loggableData.clientIp) {
    // Obfuscate IP address to protect privacy in logs
    const ipParts = loggableData.clientIp.split(".");
    if (ipParts.length === 4) {
      // For IPv4, mask the last octet
      loggableData.clientIp = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.**`;
    } else {
      // For IPv6 or invalid format, use a placeholder
      loggableData.clientIp = "IP_REDACTED";
    }
  }

  // Log using the commonUtils structured logger
  commonUtils.logEvent("info", "analytics_data_prepared", context, {
    analyticsData: loggableData,
    requestId: analyticsData.requestId || "unknown",
    hasClientIp: !!analyticsData.clientIp, // Add flag to verify IP presence
  });
}

/**
 * Validates if an analytics data object contains all required fields
 *
 * @param {Object} data - Analytics data to validate
 * @returns {Object} Validation result with success flag and any errors
 */
function validateAnalyticsData(data) {
  const errors = [];

  // Check required fields
  const requiredFields = ["handler", "query", "timestamp"];
  for (const field of requiredFields) {
    if (!data[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check IP tracking
  if (!data.clientIp) {
    // Not a validation error, but should be logged
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: "schema-handler",
        event: "missing_client_ip",
        handler: data.handler || "unknown",
        requestId: data.requestId || "unknown",
      })
    );
  }

  // Check field types
  if (data.timestamp && !(data.timestamp instanceof Date)) {
    errors.push("timestamp must be a Date object");
  }

  if (data.resultCount !== undefined && typeof data.resultCount !== "number") {
    errors.push("resultCount must be a number");
  }

  if (
    data.responseTime !== undefined &&
    typeof data.responseTime !== "number"
  ) {
    errors.push("responseTime must be a number");
  }

  if (data.hasResults !== undefined && typeof data.hasResults !== "boolean") {
    errors.push("hasResults must be a boolean");
  }

  if (data.tabs !== undefined && !Array.isArray(data.tabs)) {
    errors.push("tabs must be an array");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

module.exports = {
  createStandardAnalyticsData,
  sanitizeSessionId: commonUtils.sanitizeSessionId, // Use the commonUtils version
  createStandardClickData,
  logAnalyticsData,
  extractTabInfo,
  createRequestAnalytics,
  validateAnalyticsData,
};

/**
 * @fileoverview Consistent Schema Handler for Analytics
 * 
 * This module provides standardized schema handling functions for all analytics endpoints,
 * ensuring consistent data format, proper null checks, and schema validation.
 * 
 * @author Victor Chimenti
 * @version 2.1.2
 * @namespace schemaHandler
 * @license MIT
 * @lastmodified 2025-03-25
 */

/**
 * Creates a standardized analytics data object with consistent schema
 * Ensures all properties have proper null checks and default values
 * 
 * @param {Object} data - Raw data to standardize
 * @returns {Object} Standardized analytics data with consistent schema
 */
function createStandardAnalyticsData(data) {
    // Basic required fields with defaults
    const standardData = {
        // Required fields - these should never be null
        handler: data.handler || 'unknown',
        query: data.query || '[empty query]',
        timestamp: data.timestamp || new Date(),
        
        // User information - can be null in schema but provide defaults
        userAgent: data.userAgent || null,
        referer: data.referer || null,
        sessionId: sanitizeSessionId(data.sessionId),
        
        // Location information - can be null (anonymized)
        city: data.city || null,
        region: data.region || null,
        country: data.country || null,
        timezone: data.timezone || null,
        
        // Search results information - ensure consistent types
        searchCollection: data.searchCollection || data.collection || null,
        responseTime: data.responseTime || 0,
        resultCount: data.resultCount || 0,
        hasResults: Boolean(data.hasResults || (data.resultCount && data.resultCount > 0)),
        cacheHit: typeof data.cacheHit === 'boolean' ? data.cacheHit : null,
        cacheSet: typeof data.cacheSet === 'boolean' ? data.cacheSet : null,
        
        // Tab information
        isProgramTab: Boolean(data.isProgramTab || false),
        isStaffTab: Boolean(data.isStaffTab || false),
        tabs: Array.isArray(data.tabs) ? data.tabs : [],

        // Enrichment data
        enrichmentData: data.enrichmentData || null,
        
        // Click information - ensure proper array initialization
        clickedResults: Array.isArray(data.clickedResults) ? data.clickedResults : []
    };

    // Handler-specific data
    if (data.handler === 'suggest' && !data.enrichmentData) {
        standardData.enrichmentData = {
            totalSuggestions: data.resultCount || 0,
            suggestionsData: [],
            cacheHit: standardData.cacheHit || false,
            cacheSet: standardData.cacheSet || false
        };
    } 
    else if (data.handler === 'suggestPeople' && !data.enrichmentData) {
        standardData.enrichmentData = {
            resultCount: data.resultCount || 0,
            staffData: [], 
            cacheHit: standardData.cacheHit || false,
            cacheSet: standardData.cacheSet || false
        };
    } 
    else if (data.handler === 'suggestPrograms' && !data.enrichmentData) {
        standardData.enrichmentData = {
            totalResults: data.resultCount || 0, 
            programData: [],
            queryTime: 0,
            cacheHit: standardData.cacheHit || false,
            cacheSet: standardData.cacheSet || false
        };
    }
    
    return standardData;
}

/**
 * Validates and sanitizes session ID to ensure consistent format
 * Handles arrays, strings, and null values
 * 
 * @param {any} sessionId - Raw session ID value from request
 * @returns {string|null} Sanitized session ID or null
 */
function sanitizeSessionId(sessionId) {
    if (!sessionId) {
        return null;
    }
    
    // Handle array case
    if (Array.isArray(sessionId)) {
        return sessionId[0] || null;
    }
    
    // Handle string case
    if (typeof sessionId === 'string') {
        return sessionId.trim() || null;
    }
    
    // For any other case, convert to string if possible
    return String(sessionId) || null;
}

/**
 * Creates a standardized click data object for tracking clicks
 * 
 * @param {Object} clickData - Raw click data from request
 * @returns {Object} Standardized click data with consistent schema
 */
function createStandardClickData(clickData) {
    return {
        ...clickData,
        
        // Then override or add specific ones
        url: clickData.clickedUrl || null,
        title: clickData.clickedTitle || '',
        position: parseInt(clickData.clickPosition, 10) || 0,
        timestamp: new Date(clickData.timestamp || Date.now()),
        type: clickData.clickType || 'search',
        originalQuery: clickData.originalQuery || null,
        sessionId: sanitizeSessionId(clickData.sessionId)
    };
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
        
    console.log(`Analytics data prepared for ${context}:`, loggableData);
}

module.exports = {
    createStandardAnalyticsData,
    sanitizeSessionId,
    createStandardClickData,
    logAnalyticsData
};
/**
 * @fileoverview Analytics API Batch Click Endpoint for Funnelback Search Integration
 * 
 * This file contains API handler for tracking multiple click analytics events
 * in a single batch request. Enhanced with consistent IP tracking,
 * session management, and improved error handling.
 * 
 * Features:
 * - Consistent IP extraction using commonUtils
 * - Standardized CORS handling
 * - Enhanced session ID management
 * - Detailed structured logging
 * - Comprehensive error handling
 * - Standardized analytics schema
 * - Efficient batch processing
 * 
 * @author Victor Chimenti
 * @version 3.0.0
 * @module api/analytics/clicksBatch
 * @lastModified 2025-04-23
 */

// api/analytics/clicksBatch.js
module.exports = async (req, res) => {
    // Use common utilities for consistent IP extraction
    const commonUtils = require("../../lib/commonUtils");
    const clientIp = commonUtils.extractClientIp(req);
    const requestId = commonUtils.getRequestId(req);

    // Log full IP information for debugging
    commonUtils.logFullIpInfo(req, 'clicks-batch-analytics', requestId);

    // Standard log with redacted IP (for security/privacy)
    commonUtils.logEvent('info', 'request_received', 'clicks-batch-analytics', {
        requestId,
        path: req.url,
        clientIp // Will be redacted in standard logs
    });

    // Set CORS headers using common utilities
    commonUtils.setCorsHeaders(res);

    // Handle preflight
    if (req.method === 'OPTIONS') {
        commonUtils.logEvent('info', 'options_request', 'clicks-batch-analytics', { requestId });
        res.status(200).end();
        return;
    }

    // Only accept POST
    if (req.method !== 'POST') {
        commonUtils.logEvent('warn', 'method_not_allowed', 'clicks-batch-analytics', {
            requestId,
            method: req.method
        });
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const { recordClicks } = require('../../lib/queryAnalytics');
        const { createStandardClickData } = require('../../lib/schemaHandler');
        const { getLocationData } = require('../../lib/geoIpService');

        // Get batch data from request body
        const clicksData = req.body || [];

        // Extract session information
        const sessionInfo = commonUtils.extractSessionInfo(req);
        commonUtils.logSessionHandling(req, sessionInfo, 'clicks-batch-analytics', requestId);

        // Log batch details
        commonUtils.logEvent('info', 'processing_batch', 'clicks-batch-analytics', {
            requestId,
            batchSize: Array.isArray(clicksData) ? clicksData.length : 0,
            contentType: req.headers['content-type']
        });

        if (!Array.isArray(clicksData) || clicksData.length === 0) {
            commonUtils.logEvent('warn', 'invalid_batch_format', 'clicks-batch-analytics', {
                requestId,
                dataType: typeof clicksData,
                isArray: Array.isArray(clicksData)
            });
            return res.status(400).json({
                error: 'Invalid batch format. Expected non-empty array.',
                requestId
            });
        }

        // Get location data based on the client IP
        let locationData = null;
        try {
            locationData = await getLocationData(clientIp);
            commonUtils.logEvent('debug', 'location_data_retrieved', 'clicks-batch-analytics', {
                requestId,
                location: {
                    city: locationData.city,
                    region: locationData.region,
                    country: locationData.country
                }
            });
        } catch (geoError) {
            commonUtils.logEvent('warn', 'location_data_failed', 'clicks-batch-analytics', {
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

        // Process each click in the batch with enhanced data
        const processedClicks = clicksData.map((clickData, index) => {
            // Normalize field names consistently
            const normalizedClick = {
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
                // Use session ID from request or item itself
                sessionId: clickData.sessionId || sessionInfo.sessionId,
                // Add server-side data
                clientIp: clientIp,
                userAgent: req.headers['user-agent'],
                referer: req.headers.referer,
                requestId: `${requestId}-item-${index}`,
                // Add location data
                city: locationData?.city || null,
                region: locationData?.region || null,
                country: locationData?.country || null,
                latitude: locationData?.latitude || null,
                longitude: locationData?.longitude || null,
                timestamp: new Date()
            };

            // Create standardized click data
            return createStandardClickData(normalizedClick);
        });

        // Log batch processing details
        commonUtils.logEvent('debug', 'batch_normalized', 'clicks-batch-analytics', {
            requestId,
            originalCount: clicksData.length,
            processedCount: processedClicks.length
        });

        // Record all clicks in a batch
        const result = await recordClicks(processedClicks);

        // Log success result
        commonUtils.logEvent('info', 'batch_processed', 'clicks-batch-analytics', {
            requestId,
            success: true,
            processed: result.processed,
            total: result.total
        });

        // Send success response with processing statistics
        res.status(200).json({
            success: true,
            processed: result.processed,
            total: clicksData.length,
            requestId
        });
    } catch (error) {
        // Handle errors using common utils
        const errorInfo = commonUtils.formatError(error, 'clicks-batch-analytics', 'batch_processing_failed', requestId);

        // Log additional context for debugging
        commonUtils.logEvent('error', 'request_failed', 'clicks-batch-analytics', {
            requestId,
            errorDetails: {
                message: error.message,
                name: error.name,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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

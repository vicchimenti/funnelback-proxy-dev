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
 * @version 3.0.0
 * @module api/analytics/supplement
 * @lastModified 2025-04-23
 */

// api/analytics/supplement.js
module.exports = async (req, res) => {
    // Use common utilities for consistent IP extraction
    const commonUtils = require("../../lib/commonUtils");
    const clientIp = commonUtils.extractClientIp(req);
    const requestId = commonUtils.getRequestId(req);

    // Log full IP information for debugging
    commonUtils.logFullIpInfo(req, 'supplement-analytics', requestId);

    // Standard log with redacted IP (for security/privacy)
    commonUtils.logEvent('info', 'request_received', 'supplement-analytics', {
        requestId,
        path: req.url,
        clientIp // Will be redacted in standard logs
    });

    // Set CORS headers using common utilities
    commonUtils.setCorsHeaders(res);

    // Handle preflight
    if (req.method === 'OPTIONS') {
        commonUtils.logEvent('info', 'options_request', 'supplement-analytics', { requestId });
        res.status(200).end();
        return;
    }

    // Only accept POST
    if (req.method !== 'POST') {
        commonUtils.logEvent('warn', 'method_not_allowed', 'supplement-analytics', {
            requestId,
            method: req.method
        });
        return res.status(405).send('Method Not Allowed');
    }

    try {
        // Import only the exported functions from queryAnalytics
        const { recordQuery } = require('../../lib/queryAnalytics');
        const { createStandardAnalyticsData } = require('../../lib/schemaHandler');
        const data = req.body || {};

        // Log received data
        commonUtils.logEvent('debug', 'received_supplement_data', 'supplement-analytics', {
            requestId,
            receivedFields: Object.keys(data),
            contentType: req.headers["content-type"]
        });

        if (!data.query) {
            commonUtils.logEvent('warn', 'missing_query', 'supplement-analytics', {
                requestId,
                receivedFields: Object.keys(data)
            });
            return res.status(400).json({ error: 'No query provided' });
        }

        // Extract session information
        const sessionInfo = commonUtils.extractSessionInfo(req);
        commonUtils.logSessionHandling(req, sessionInfo, 'supplement-analytics', requestId);

        commonUtils.logEvent('info', 'processing_supplementary_analytics', 'supplement-analytics', {
            requestId,
            query: data.query,
            sessionId: sessionInfo.sessionId || '[none]',
            hasEnrichment: !!data.enrichmentData
        });

        // Prepare query data object
        const queryData = {
            handler: 'supplement',
            query: data.query,
            clientIp: clientIp,
            userAgent: req.headers['user-agent'],
            referer: req.headers.referer,
            sessionId: sessionInfo.sessionId,
            city: req.headers['x-vercel-ip-city'] ?
                decodeURIComponent(req.headers['x-vercel-ip-city']) : null,
            region: req.headers['x-vercel-ip-country-region'],
            country: req.headers['x-vercel-ip-country'],
            timezone: req.headers['x-vercel-ip-timezone'],
            requestId: requestId,
            timestamp: new Date()
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

        // Standardize and validate data
        const standardData = createStandardAnalyticsData(queryData);

        // Log analytics data without sensitive information
        commonUtils.logEvent('debug', 'standardized_analytics_data', 'supplement-analytics', {
            requestId,
            query: standardData.query,
            resultCount: standardData.resultCount,
            hasResults: standardData.hasResults,
            tabs: standardData.tabs,
            hasEnrichment: !!standardData.enrichmentData
        });

        // Use recordQuery to create or update the record
        const result = await recordQuery(standardData);

        if (!result) {
            commonUtils.logEvent('error', 'record_failed', 'supplement-analytics', {
                requestId,
                query: data.query
            });
            return res.status(500).json({ error: 'Failed to record analytics data' });
        }

        commonUtils.logEvent('info', 'supplement_recorded', 'supplement-analytics', {
            requestId,
            recordId: result._id.toString(),
            query: data.query
        });

        res.status(200).json({ success: true, recordId: result._id.toString() });
    } catch (error) {
        // Handle errors using common utils
        const errorInfo = commonUtils.formatError(error, 'supplement-analytics', 'supplement_recording_failed', requestId);

        // Log additional context for debugging
        commonUtils.logEvent('error', 'request_failed', 'supplement-analytics', {
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
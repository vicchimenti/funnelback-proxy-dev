/**
 * @fileoverview Suggestion Handler for Funnelback Search Integration (People)
 * 
 * Handles autocomplete suggestion requests for the "seattleu~ds-staff" collection.
 * Provides real-time search suggestions for faculty and staff searches.
 * 
 * @author Victor Chimenti
 * @version 1.1.0
 * @license MIT
 */

const axios = require('axios');
const os = require('os');

function logEvent(level, message, data = {}) {
    const logEntry = {
        service: 'suggest-people',
        level,
        action: message,
        query: data.query || {},
        response: data.status ? {
            status: data.status,
            processingTime: data.processingTime,
            suggestionsCount: data.suggestionsCount
        } : null,
        serverInfo: {
            hostname: os.hostname(),
            platform: os.platform()
        },
        timestamp: new Date().toISOString()
    };
    console.log(JSON.stringify(logEntry));
}

async function handler(req, res) {
    const startTime = Date.now();
    const requestId = req.headers['x-vercel-id'] || Date.now().toString();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (req.method === 'OPTIONS') {
        logEvent('info', 'OPTIONS request', { requestId, headers: req.headers });
        res.status(200).end();
        return;
    }

    try {
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/suggest.json';
        const queryParams = { ...req.query, collection: 'seattleu~ds-staff' };

        logEvent('info', 'Request received', { requestId, query: queryParams, headers: req.headers });

        const response = await axios.get(funnelbackUrl, {
            params: queryParams,
            headers: {
                'Accept': 'application/json',
                'X-Forwarded-For': userIp
            }
        });

        logEvent('info', 'Response received', {
            status: response.status,
            processingTime: `${Date.now() - startTime}ms`,
            suggestionsCount: response.data.length || 0
        });

        res.json(response.data);
    } catch (error) {
        logEvent('error', 'Handler error', {
            query: req.query,
            error: error.message,
            status: error.response?.status || 500,
            processingTime: `${Date.now() - startTime}ms`
        });
        res.status(500).json({ error: 'Suggestion error', details: error.message });
    }
}

module.exports = handler;

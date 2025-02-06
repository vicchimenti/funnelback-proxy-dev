/**
* @fileoverview Suggestion Handler for Funnelback Search Integration
* 
* Handles autocomplete suggestion requests for the Funnelback integration.
* Provides real-time search suggestions as users type, with structured logging
* for Vercel serverless environment.
* 
* Features:
* - CORS handling for Seattle University domain
* - Structured JSON logging for Vercel
* - Request/Response tracking
* - Error handling with detailed logging
* 
* @author Victor Chimenti
* @version 1.2.0
* @license MIT
*/

const axios = require('axios');
const os = require('os');

/**
* Creates a standardized log entry for Vercel environment
* 
* @param {string} level - Log level ('info', 'warn', 'error')
* @param {string} message - Main log message/action
* @param {Object} data - Additional data to include in log
* @param {string} [data.query] - Search query being processed
* @param {number} [data.status] - HTTP status code
* @param {string} [data.processingTime] - Request processing duration
* @param {number} [data.suggestionsCount] - Number of suggestions returned
*/
function logEvent(level, message, data = {}) {
   const serverInfo = {
       hostname: os.hostname(),
       platform: os.platform(),
       arch: os.arch(),
       cpus: os.cpus().length,
       memory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + 'GB'
   };

   const logEntry = {
       service: 'suggest-handler',
       level,
       query: data.query?.query || null,
       action: message,
       response: data.status ? {
           status: data.status,
           processingTime: data.processingTime,
           suggestionsCount: data.suggestionsCount
       } : null,
       serverInfo,
       timestamp: new Date().toISOString()
   };
   
   console.log(JSON.stringify(logEntry));
}

/**
* Handler for suggestion requests to Funnelback search service
* 
* @param {Object} req - Express request object
* @param {Object} req.query - Query parameters from the request
* @param {Object} req.headers - Request headers
* @param {string} req.method - HTTP method of the request
* @param {Object} res - Express response object
* @returns {Promise<void>}
*/
async function handler(req, res) {
   const startTime = Date.now();
   const requestId = req.headers['x-vercel-id'] || Date.now().toString();
   
   // Set CORS headers
   res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

   const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

   if (req.method === 'OPTIONS') {
       logEvent('info', 'OPTIONS request', { requestId });
       res.status(200).end();
       return;
   }

   try {
       const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/suggest.json';
       
       logEvent('info', 'Request received', {
           query: req.query,
           requestId
       });

       const response = await axios.get(funnelbackUrl, {
           params: req.query,
           headers: {
               'Accept': 'application/json',
               'X-Forwarded-For': userIp
           }
       });

       logEvent('info', 'Response received', {
           status: response.status,
           processingTime: `${Date.now() - startTime}ms`,
           suggestionsCount: response.data.length || 0,
           query: req.query
       });

       res.json(response.data);
   } catch (error) {
       logEvent('error', 'Handler error', {
           query: req.query,
           error: error.message,
           status: error.response?.status || 500,
           processingTime: `${Date.now() - startTime}ms`
       });
       
       res.status(500).json({
           error: 'Suggestion error',
           details: error.response?.data || error.message
       });
   }
}

module.exports = handler;
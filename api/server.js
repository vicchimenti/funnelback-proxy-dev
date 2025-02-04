const express = require('express');
const axios = require('axios');
const cors = require('cors');

// Instead of creating an app, we'll export a handler function directly
async function handler(req, res) {
    // Enable CORS for Seattle University domain
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const userIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const funnelbackUrl = 'https://dxp-us-search.funnelback.squiz.cloud/s/search.html';

        const response = await axios.get(funnelbackUrl, {
            params: req.query,
            headers: { 'X-Forwarded-For': userIp }
        });

        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// Export the handler function directly
module.exports = handler;
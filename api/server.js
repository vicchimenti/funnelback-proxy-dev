const express = require('express');
const axios = require('axios');
const cors = require('cors');

async function handler(req, res) {
    // Add a basic health check
    if (req.url === '/api/server/health') {
        return res.json({ status: 'ok' });
    }

    // Enable CORS for Seattle University domain
    res.setHeader('Access-Control-Allow-Origin', 'https://www.seattleu.edu');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Rest of your code...
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

module.exports = handler;
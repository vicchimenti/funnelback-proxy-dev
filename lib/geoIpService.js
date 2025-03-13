/**
 * @fileoverview GeoIP Service for IP-based location lookup
 * 
 * Provides location data based on IP address using a third-party service.
 * 
 * @author Your Name
 * @version 1.0.0
 * @license MIT
 */

const axios = require('axios');

// Simple cache to avoid repeated lookups
const locationCache = new Map();
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Gets location data for an IP address
 * 
 * @param {string} ip - IP address to look up
 * @returns {Promise<Object>} Location data
 */
async function getLocationData(ip) {
    // Default values in case lookup fails
    const defaultData = {
        city: null,
        region: null,
        country: null,
        timezone: null,
        latitude: null,
        longitude: null
    };
    
    try {
        // Check cache first
        if (locationCache.has(ip)) {
            const cachedData = locationCache.get(ip);
            // Check if cache entry is still valid
            if (cachedData.timestamp > Date.now() - CACHE_EXPIRY) {
                return cachedData.data;
            }
            // Cache expired, remove it
            locationCache.delete(ip);
        }
        
        // Private IPs shouldn't be looked up
        if (ip === 'unknown' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            return defaultData;
        }
        
        // Call free IP API (no key required)
        const response = await axios.get(`http://ip-api.com/json/${ip}`, {
            timeout: 2000 // 2 second timeout
        });
        
        if (response.data && response.data.status === 'success') {
            const data = {
                city: response.data.city,
                region: response.data.regionName,
                country: response.data.countryCode,
                timezone: response.data.timezone,
                latitude: response.data.lat.toString(),
                longitude: response.data.lon.toString()
            };
            
            // Cache the result
            locationCache.set(ip, {
                data,
                timestamp: Date.now()
            });
            
            return data;
        }
        
        return defaultData;
    } catch (error) {
        console.error(`Error getting location data for IP ${ip}:`, error.message);
        return defaultData;
    }
}

module.exports = {
    getLocationData
};
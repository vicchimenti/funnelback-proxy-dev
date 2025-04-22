/**
 * @fileoverview GeoIP Service for IP-based location lookup
 * 
 * Provides location data based on IP address using a third-party service.
 * 
 * @author Victor Chimenti
 * @version 2.1.0
 * @lastModified 2025-04-22
 * @license MIT
 */

const axios = require('axios');

// Simple cache to avoid repeated lookups
const locationCache = new Map();
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if an IP address appears to be a private network IP
 * 
 * @param {string} ip - The IP address to check
 * @returns {boolean} Whether the IP appears to be from a private network
 * @private
 */
function isPrivateIP(ip) {
    if (!ip || ip === 'unknown') return true;
    
    // Check common private IP ranges
    return ip === '127.0.0.1' || 
           ip.startsWith('10.') || 
           ip.startsWith('172.16.') || 
           ip.startsWith('172.17.') || 
           ip.startsWith('172.18.') || 
           ip.startsWith('172.19.') || 
           ip.startsWith('172.20.') || 
           ip.startsWith('172.21.') || 
           ip.startsWith('172.22.') || 
           ip.startsWith('172.23.') || 
           ip.startsWith('172.24.') || 
           ip.startsWith('172.25.') || 
           ip.startsWith('172.26.') || 
           ip.startsWith('172.27.') || 
           ip.startsWith('172.28.') || 
           ip.startsWith('172.29.') || 
           ip.startsWith('172.30.') || 
           ip.startsWith('172.31.') || 
           ip.startsWith('192.168.') ||
           ip.startsWith('169.254.');
}

/**
 * Check if an IP address appears to be from a cloud provider
 * 
 * @param {string} ip - The IP address to check
 * @returns {boolean} Whether the IP appears to be from a major cloud provider
 * @private
 */
function isCloudProviderIP(ip) {
    if (!ip || ip === 'unknown') return false;
    
    // Common AWS IP ranges (this is not comprehensive)
    const awsPrefixes = ['3.', '13.', '18.', '23.', '34.', '35.', '50.', '52.', '54.', '64.', '68.', '72.', '75.', '76.', '84.', '87.', '99.', '100.', '108.', '116.', '118.', '157.', '168.', '174.', '175.', '176.', '177.', '178.', '184.', '204.', '216.', '100.20.', '100.24.'];
    
    // Check for AWS and other cloud provider IP patterns
    const isAws = awsPrefixes.some(prefix => ip.startsWith(prefix)) || ip.includes('amazonaws.com');
    const isVercel = ip.includes('vercel') || ip.includes('zeit');
    const isGcp = ip.startsWith('34.') || ip.startsWith('35.') || ip.includes('googleusercontent');
    const isAzure = ip.includes('azure') || ip.includes('microsoft');
    
    return isAws || isVercel || isGcp || isAzure;
}

/**
 * Gets location data for an IP address
 * 
 * @param {string} ip - IP address to look up
 * @returns {Promise<Object>} Location data
 */
async function getLocationData(ip) {
    // Generate tracking ID for this request
    const trackingId = `geo_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Default values in case lookup fails
    const defaultData = {
        city: null,
        region: null,
        country: null,
        timezone: null,
        latitude: null,
        longitude: null
    };
    
    // Log request for tracking
    console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        service: 'geo-ip-service',
        trackingId,
        event: 'location_lookup_attempt',
        ip: ip,
        isPrivate: isPrivateIP(ip),
        isCloudProvider: isCloudProviderIP(ip)
    }));
    
    try {
        // If IP is unknown or missing, return default data
        if (!ip || ip === 'unknown') {
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'geo-ip-service',
                trackingId,
                event: 'missing_ip',
                result: 'using_default_location'
            }));
            return defaultData;
        }
        
        // Check cache first
        if (locationCache.has(ip)) {
            const cachedData = locationCache.get(ip);
            // Check if cache entry is still valid
            if (cachedData.timestamp > Date.now() - CACHE_EXPIRY) {
                console.log(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    service: 'geo-ip-service',
                    trackingId,
                    event: 'cache_hit',
                    ip: ip,
                    age: Math.round((Date.now() - cachedData.timestamp) / 1000 / 60) + ' minutes'
                }));
                return cachedData.data;
            }
            // Cache expired, remove it
            locationCache.delete(ip);
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'geo-ip-service',
                trackingId,
                event: 'cache_expired',
                ip: ip
            }));
        }
        
        // Don't lookup private IPs
        if (isPrivateIP(ip)) {
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'geo-ip-service',
                trackingId,
                event: 'private_ip_detected',
                ip: ip,
                result: 'using_default_location'
            }));
            return defaultData;
        }

        // Log if IP appears to be from a cloud provider
        if (isCloudProviderIP(ip)) {
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'geo-ip-service',
                trackingId,
                event: 'cloud_provider_ip_detected',
                ip: ip,
                message: 'This IP likely belongs to a cloud provider and may not reflect true user location'
            }));
            // We still look up cloud IPs, but log a warning
        }
        
        // Call free IP API (no key required)
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            service: 'geo-ip-service',
            trackingId,
            event: 'api_request_sent',
            ip: ip,
            api: 'ip-api.com'
        }));
        
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
            
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'geo-ip-service',
                trackingId,
                event: 'api_success',
                ip: ip,
                location: {
                    city: data.city,
                    region: data.region,
                    country: data.country
                }
            }));
            
            return data;
        }
        
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            service: 'geo-ip-service',
            trackingId,
            event: 'api_returned_error',
            ip: ip,
            status: response.data?.status || 'unknown',
            message: response.data?.message || 'No error message provided',
            result: 'using_default_location'
        }));
        
        return defaultData;
    } catch (error) {
        console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            service: 'geo-ip-service',
            trackingId,
            event: 'error',
            ip: ip,
            error: error.message,
            result: 'using_default_location'
        }));
        
        return defaultData;
    }
}

// Keep the original export pattern
module.exports = {
    getLocationData
};
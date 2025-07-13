import { Request } from 'express';
import geoip from 'geoip-lite';

interface TimezoneInfo {
  timezone: string;
  country: string;
  city: string;
  ip: string;
  detectionMethod: 'geoip' | 'header' | 'fallback';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Extract client IP address from request, handling various proxy scenarios
 */
export function getClientIP(req: Request): string {
  // Check various headers for real IP (Replit, Cloudflare, etc.)
  const forwardedFor = req.headers['x-forwarded-for'];
  const realIP = req.headers['x-real-ip'];
  const cfConnectingIP = req.headers['cf-connecting-ip'];
  
  let clientIP: string;
  
  if (typeof forwardedFor === 'string') {
    // x-forwarded-for can contain multiple IPs, first one is client
    clientIP = forwardedFor.split(',')[0].trim();
  } else if (typeof realIP === 'string') {
    clientIP = realIP;
  } else if (typeof cfConnectingIP === 'string') {
    clientIP = cfConnectingIP;
  } else {
    clientIP = req.connection.remoteAddress || req.socket.remoteAddress || 'unknown';
  }
  
  // Clean up IPv6 mapped IPv4 addresses
  if (clientIP.startsWith('::ffff:')) {
    clientIP = clientIP.substring(7);
  }
  
  console.log(`🌍 Client IP Detection:`, {
    'x-forwarded-for': forwardedFor,
    'x-real-ip': realIP,
    'cf-connecting-ip': cfConnectingIP,
    'connection.remoteAddress': req.connection.remoteAddress,
    'extracted': clientIP
  });
  
  return clientIP;
}

/**
 * Detect user timezone based on IP geolocation
 */
export function detectTimezoneFromIP(req: Request): TimezoneInfo {
  const clientIP = getClientIP(req);
  
  // Skip detection for local/development IPs
  if (clientIP === 'unknown' || clientIP === '127.0.0.1' || clientIP === '::1' || clientIP.startsWith('192.168.') || clientIP.startsWith('10.')) {
    console.log(`🌍 Local/Development IP detected: ${clientIP}, using fallback timezone`);
    return {
      timezone: 'America/New_York', // Default fallback
      country: 'US',
      city: 'Development',
      ip: clientIP,
      detectionMethod: 'fallback',
      confidence: 'low'
    };
  }
  
  try {
    // Use geoip-lite for IP geolocation
    const geo = geoip.lookup(clientIP);
    
    if (geo && geo.timezone) {
      console.log(`🌍 GeoIP lookup successful:`, {
        ip: clientIP,
        country: geo.country,
        city: geo.city,
        timezone: geo.timezone,
        ll: geo.ll
      });
      
      return {
        timezone: geo.timezone,
        country: geo.country,
        city: geo.city,
        ip: clientIP,
        detectionMethod: 'geoip',
        confidence: 'high'
      };
    } else {
      console.log(`🌍 GeoIP lookup failed for IP: ${clientIP}`);
      
      // Fallback to common timezone based on Accept-Language header
      const acceptLanguage = req.headers['accept-language'];
      let fallbackTimezone = 'UTC';
      
      if (typeof acceptLanguage === 'string') {
        const lang = acceptLanguage.toLowerCase();
        if (lang.includes('en-us')) fallbackTimezone = 'America/New_York';
        else if (lang.includes('en-gb')) fallbackTimezone = 'Europe/London';
        else if (lang.includes('ja')) fallbackTimezone = 'Asia/Tokyo';
        else if (lang.includes('zh')) fallbackTimezone = 'Asia/Shanghai';
        else if (lang.includes('de')) fallbackTimezone = 'Europe/Berlin';
        else if (lang.includes('fr')) fallbackTimezone = 'Europe/Paris';
        else if (lang.includes('es')) fallbackTimezone = 'Europe/Madrid';
        else if (lang.includes('in')) fallbackTimezone = 'Asia/Kolkata';
      }
      
      return {
        timezone: fallbackTimezone,
        country: 'Unknown',
        city: 'Unknown',
        ip: clientIP,
        detectionMethod: 'header',
        confidence: 'medium'
      };
    }
  } catch (error) {
    console.error('🌍 Error detecting timezone from IP:', error);
    
    return {
      timezone: 'UTC',
      country: 'Unknown',
      city: 'Unknown',
      ip: clientIP,
      detectionMethod: 'fallback',
      confidence: 'low'
    };
  }
}

/**
 * Get timezone offset in hours for a given timezone
 */
export function getTimezoneOffset(timezone: string): number {
  try {
    const now = new Date();
    const utc = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
    const local = new Date(utc.toLocaleString('en-US', { timeZone: timezone }));
    return (local.getTime() - utc.getTime()) / (1000 * 60 * 60);
  } catch (error) {
    console.error(`Error calculating timezone offset for ${timezone}:`, error);
    return 0; // UTC fallback
  }
}

/**
 * Convert UTC time to user's local time
 */
export function convertToUserTimezone(utcTime: Date, timezone: string): Date {
  try {
    return new Date(utcTime.toLocaleString('en-US', { timeZone: timezone }));
  } catch (error) {
    console.error(`Error converting time to timezone ${timezone}:`, error);
    return utcTime; // Return original if conversion fails
  }
}
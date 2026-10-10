import { Request, Response } from 'express';
import axios from 'axios';

interface CacheEntry {
  data: any;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes cache
const MAX_CACHE_ENTRIES = 500;

function getCached(key: string): any | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key: string, data: any): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now > v.expiresAt) {
        cache.delete(k);
      }
    }
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Validation helpers
const CITY_REGEX = /^[a-zA-Z0-9\s,\.\-]{1,100}$/;

function validateCity(city: unknown): string | null {
  if (typeof city !== 'string') return null;
  const trimmed = city.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return null;
  if (!CITY_REGEX.test(trimmed)) return null;
  return trimmed;
}

function validateCoordinates(lat: unknown, lon: unknown): { lat: number; lon: number } | null {
  if (lat === undefined || lon === undefined || lat === null || lon === null) return null;
  const latNum = typeof lat === 'number' ? lat : parseFloat(String(lat));
  const lonNum = typeof lon === 'number' ? lon : parseFloat(String(lon));
  if (isNaN(latNum) || isNaN(lonNum)) return null;
  if (latNum < -90 || latNum > 90) return null;
  if (lonNum < -180 || lonNum > 180) return null;
  return { lat: latNum, lon: lonNum };
}

function validateLimit(limit: unknown): number {
  if (limit === undefined || limit === null) return 1;
  const num = typeof limit === 'number' ? limit : parseInt(String(limit), 10);
  if (isNaN(num) || num < 1) return 1;
  return Math.min(num, 5);
}

function getApiKey(): string | null {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key || key.trim() === '' || key === 'your-openweather-api-key-here') {
    return null;
  }
  return key.trim();
}

/**
 * GET /api/v1/weather/current
 * Query params: city (or q) OR lat + lon
 */
export async function getCurrentWeather(req: Request, res: Response): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(503).json({
      success: false,
      error: 'Weather service is unconfigured or unavailable.',
    });
    return;
  }

  const rawCity = req.query.city || req.query.q;
  const city = validateCity(rawCity);
  const coords = validateCoordinates(req.query.lat, req.query.lon);

  if (!city && !coords) {
    res.status(400).json({
      success: false,
      error: 'Invalid query parameters. Provide a valid city name (up to 100 alphanumeric characters) or lat/lon coordinates.',
    });
    return;
  }

  const cacheKey = city ? `current:city:${city.toLowerCase()}` : `current:coords:${coords!.lat.toFixed(4)},${coords!.lon.toFixed(4)}`;
  const cachedData = getCached(cacheKey);
  if (cachedData) {
    res.status(200).json(cachedData);
    return;
  }

  try {
    const params: Record<string, string | number> = {
      units: 'metric',
      appid: apiKey,
    };
    if (city) {
      params.q = city;
    } else if (coords) {
      params.lat = coords.lat;
      params.lon = coords.lon;
    }

    const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params,
      timeout: 5000,
    });

    setCached(cacheKey, response.data);
    res.status(200).json(response.data);
  } catch (error: any) {
    if (error.response?.status === 404) {
      res.status(404).json({ success: false, error: 'Location not found' });
      return;
    }
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      res.status(504).json({ success: false, error: 'Upstream weather service timed out' });
      return;
    }
    res.status(502).json({ success: false, error: 'Upstream weather service temporarily unavailable' });
  }
}

/**
 * GET /api/v1/weather/forecast
 * Query params: city (or q) OR lat + lon
 */
export async function getWeatherForecast(req: Request, res: Response): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(503).json({
      success: false,
      error: 'Weather service is unconfigured or unavailable.',
    });
    return;
  }

  const rawCity = req.query.city || req.query.q;
  const city = validateCity(rawCity);
  const coords = validateCoordinates(req.query.lat, req.query.lon);

  if (!city && !coords) {
    res.status(400).json({
      success: false,
      error: 'Invalid query parameters. Provide a valid city name or lat/lon coordinates.',
    });
    return;
  }

  const cacheKey = city ? `forecast:city:${city.toLowerCase()}` : `forecast:coords:${coords!.lat.toFixed(4)},${coords!.lon.toFixed(4)}`;
  const cachedData = getCached(cacheKey);
  if (cachedData) {
    res.status(200).json(cachedData);
    return;
  }

  try {
    const params: Record<string, string | number> = {
      units: 'metric',
      appid: apiKey,
    };
    if (city) {
      params.q = city;
    } else if (coords) {
      params.lat = coords.lat;
      params.lon = coords.lon;
    }

    const response = await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
      params,
      timeout: 5000,
    });

    setCached(cacheKey, response.data);
    res.status(200).json(response.data);
  } catch (error: any) {
    if (error.response?.status === 404) {
      res.status(404).json({ success: false, error: 'Location not found' });
      return;
    }
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      res.status(504).json({ success: false, error: 'Upstream weather service timed out' });
      return;
    }
    res.status(502).json({ success: false, error: 'Upstream weather service temporarily unavailable' });
  }
}

/**
 * GET /api/v1/weather/reverse-geocode
 * Query params: lat, lon, limit (optional, 1-5)
 */
export async function reverseGeocode(req: Request, res: Response): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    res.status(503).json({
      success: false,
      error: 'Weather service is unconfigured or unavailable.',
    });
    return;
  }

  const coords = validateCoordinates(req.query.lat, req.query.lon);
  if (!coords) {
    res.status(400).json({
      success: false,
      error: 'Invalid coordinates. Latitude must be between -90 and 90, Longitude between -180 and 180.',
    });
    return;
  }

  const limit = validateLimit(req.query.limit);
  const cacheKey = `geo:${coords.lat.toFixed(4)},${coords.lon.toFixed(4)},${limit}`;
  const cachedData = getCached(cacheKey);
  if (cachedData) {
    res.status(200).json(cachedData);
    return;
  }

  try {
    const response = await axios.get('https://api.openweathermap.org/geo/1.0/reverse', {
      params: {
        lat: coords.lat,
        lon: coords.lon,
        limit,
        appid: apiKey,
      },
      timeout: 5000,
    });

    setCached(cacheKey, response.data);
    res.status(200).json(response.data);
  } catch (error: any) {
    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      res.status(504).json({ success: false, error: 'Upstream reverse geocoding timed out' });
      return;
    }
    res.status(502).json({ success: false, error: 'Upstream reverse geocoding service temporarily unavailable' });
  }
}

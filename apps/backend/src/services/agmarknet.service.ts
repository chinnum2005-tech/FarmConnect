import axios from 'axios';
import { AppError } from '../middleware/errorHandler';
import prisma from '../database/prisma';

const API_KEY = process.env.AGMARKNET_API_KEY;
const BASE_URL = process.env.AGMARKNET_BASE_URL || 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070';

// Simple in-memory cache to avoid hitting the API too frequently
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 4; // 4 hours

export interface AgmarknetRecord {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  grade: string;
  arrival_date: string; // dd/mm/yyyy
  min_price: string;
  max_price: string;
  modal_price: string;
}

export const fetchLatestPrices = async (commodity: string, state?: string): Promise<AgmarknetRecord[]> => {
  const cacheKey = `latest_${commodity}_${state || 'all'}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const params: any = {
      'api-key': API_KEY,
      format: 'json',
      limit: 1000,
      'filters[commodity]': commodity,
    };
    
    if (state) {
      params['filters[state]'] = state;
    }

    const response = await axios.get(BASE_URL, { params });
    
    if (response.data && response.data.records) {
      cache.set(cacheKey, { data: response.data.records, timestamp: Date.now() });
      return response.data.records;
    }
    
    return [];
  } catch (error: any) {
    console.error("Agmarknet fetch error:", error.message);
    // If API fails, check if we have expired cache and return that as fallback
    if (cached) {
      return cached.data;
    }
    // Instead of throwing an error, return empty array so controller can use historical fallback
    return [];
  }
};

import api from './api';

export interface NearbyMandi {
  market: string;
  district: string;
  state: string;
  modalPrice: number;
  minPrice: number;
  maxPrice: number;
  arrivalDate: string;
}

export interface MarketPrediction {
  crop: string;
  state: string;
  district?: string;
  marketName?: string;
  currentMSP: number;
  currentModalPrice: number | null;
  minPrice?: number;
  maxPrice?: number;
  arrivalDate?: string;
  nearbyMandis?: NearbyMandi[];
  historicalSeries: { date: string; price: number }[];
  projectedSeries: { date: string; price: number }[];
  projectionMethod: string;
  dataSource: string;
  trendFitMetric: string;
  lastUpdated: string;
}

export const marketService = {
  getMarketPrediction: async (crop: string, address?: string, lat?: number, lng?: number): Promise<MarketPrediction> => {
    const params = new URLSearchParams();
    params.append('crop', crop);
    if (address) params.append('address', address);
    if (lat !== undefined) params.append('lat', String(lat));
    if (lng !== undefined) params.append('lng', String(lng));

    const response = await api.get(`/market/predictions?${params.toString()}`);
    return response.data;
  },
};

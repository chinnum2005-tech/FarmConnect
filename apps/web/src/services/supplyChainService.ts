import api from './api';

/**
 * Supply Chain Service
 * Handles product traceability and journey tracking
 */
export const supplyChainService = {
  /**
   * Get supply chain events for a product (traceability timeline)
   */
  getProductTraceability: async (productId: string) => {
    const response = await api.get(`/api/supply-chain/trace/${productId}`);
    return response.data;
  },

  /**
   * Add a supply chain event (distributor/farmer/consumer)
   */
  addSupplyChainEvent: async (eventData: {
    productId?: string;
    cropId?: string;
    batchId?: string;
    eventType: string;
    location?: string;
    description?: string;
    metadata?: any;
    latitude?: number;
    longitude?: number;
  }) => {
    const response = await api.post('/api/supply-chain/add', eventData);
    return response.data;
  },

  /**
   * Get recent supply chain events (for dashboards)
   */
  getRecentEvents: async (limit: number = 10) => {
    const response = await api.get(`/api/supply-chain/recent?limit=${limit}`);
    return response.data;
  },

  /**
   * Get ALL events for the Blockchain Explorer
   * Supports search, limit, and offset for pagination
   */
  getAllEvents: async (params?: { search?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.limit  !== undefined) query.set('limit',  String(params.limit));
    if (params?.offset !== undefined) query.set('offset', String(params.offset));
    const response = await api.get(`/api/supply-chain/all?${query.toString()}`);
    return response.data; // { success, total, data[] }
  },

  /**
   * Get events for farmer's products
   */
  getMyProductEvents: async () => {
    const response = await api.get('/api/supply-chain/my-products');
    return response.data;
  },
};

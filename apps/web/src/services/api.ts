import axios from 'axios';

// Dynamically match the backend URL from environment variables with fallback
const isLocalhost = 
  typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.hostname === '127.0.0.1' || 
   window.location.hostname === '[::1]' ||
   window.location.port === '5173');

const API_BASE_URL = 
  import.meta.env.VITE_BACKEND_URL || 
  import.meta.env.VITE_API_URL || 
  (isLocalhost ? `http://${window.location.hostname || 'localhost'}:3001` : 'https://agrotrace-backend.onrender.com');

const api = axios.create({
  baseURL: `${API_BASE_URL.replace(/\/$/, '')}/api/v1`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Fix for legacy /api/v1/ or /api/ prefixes and inject Bearer token
api.interceptors.request.use((config) => {
  if (config.url) {
    if (config.url.startsWith('/api/v1/')) {
      config.url = config.url.substring(7); // Remove '/api/v1'
    } else if (config.url.startsWith('/api/')) {
      config.url = config.url.substring(4); // Remove '/api'
    }
  }
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      // Don't wipe storage on login/register attempt failures or refresh token calls
      if (!url.includes('/login') && !url.includes('/register') && !url.includes('/refresh-token')) {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      }
    }
    if (error.response?.status === 409 && error.response.data?.serverData) {
      window.dispatchEvent(new CustomEvent('api-conflict', {
        detail: {
          url: error.config.url,
          method: error.config.method,
          data: JSON.parse(error.config.data || '{}'),
          serverData: error.response.data.serverData,
        }
      }));
    }
    return Promise.reject(error);
  }
);

export default api;

import axios from 'axios';

// Dynamically match the backend URL from environment variables with fallback
const API_BASE_URL = 
  import.meta.env.VITE_BACKEND_URL || 
  import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? 'https://agrotrace-backend.onrender.com' : `http://${window.location.hostname}:3001`);

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

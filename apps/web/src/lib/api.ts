import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('lumorius_access');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('lumorius_refresh');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${API_URL}/api/v1/auth/refresh`, { refreshToken });
          const access: string = data.data.accessToken;
          const refresh: string = data.data.refreshToken;
          localStorage.setItem('lumorius_access', access);
          localStorage.setItem('lumorius_refresh', refresh);
          document.cookie = `lumorius_access=${access}; path=/; max-age=${15 * 60}; SameSite=Strict`;
          original.headers.Authorization = `Bearer ${access}`;
          return api(original);
        } catch {
          localStorage.removeItem('lumorius_access');
          localStorage.removeItem('lumorius_refresh');
          document.cookie = 'lumorius_access=; path=/; max-age=0; SameSite=Strict';
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  },
);

export default api;

import axios, { type AxiosRequestConfig } from 'axios';

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

/**
 * One refresh at a time. Refresh tokens rotate, so when several requests hit a
 * 401 together they must share a single refresh; otherwise the second refresh
 * uses an already-rotated token, fails, and the user is logged out.
 */
let refreshing: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (refreshing) return refreshing;
  const refreshToken = localStorage.getItem('lumorius_refresh');
  if (!refreshToken) return Promise.reject(new Error('No refresh token'));
  refreshing = axios
    .post(`${API_URL}/api/v1/auth/refresh`, { refreshToken })
    .then(({ data }) => {
      const access: string = data.data.accessToken;
      const refresh: string = data.data.refreshToken;
      localStorage.setItem('lumorius_access', access);
      localStorage.setItem('lumorius_refresh', refresh);
      document.cookie = `lumorius_access=${access}; path=/; max-age=${15 * 60}; SameSite=Lax`;
      document.cookie = `lumorius_session=1; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
      return access;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function signOut() {
  localStorage.removeItem('lumorius_access');
  localStorage.removeItem('lumorius_refresh');
  document.cookie = 'lumorius_access=; path=/; max-age=0; SameSite=Lax';
  document.cookie = 'lumorius_session=; path=/; max-age=0; SameSite=Lax';
  if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isRefreshCall = String(original?.url ?? '').includes('/auth/refresh');
    if (err.response?.status === 401 && original && !original._retry && !isRefreshCall && typeof window !== 'undefined') {
      original._retry = true;
      if (!localStorage.getItem('lumorius_refresh')) return Promise.reject(err);
      try {
        const access = await refreshAccessToken();
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${access}` };
        return api(original);
      } catch (refreshError) {
        // Only a definitive rejection of the refresh token signs the user out;
        // a network blip or server error should not end the session.
        const status = (refreshError as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403 || status === 400) signOut();
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  },
);

export default api;

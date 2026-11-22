
import api from './api';

const ACCESS_KEY = 'lumorius_access';
const REFRESH_KEY = 'lumorius_refresh';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);

  // Sync access token to cookie so Next.js middleware can read it.
  document.cookie = `lumorius_access=${access}; path=/; max-age=${15 * 60}; SameSite=Strict`;
  // Session marker (no secret): lets page navigation through after the 15-minute access
  // token expires while the refresh token (7 days) is still valid. The API still checks every request.
  document.cookie = `lumorius_session=1; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Strict`;
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  document.cookie = 'lumorius_access=; path=/; max-age=0; SameSite=Strict';
  document.cookie = 'lumorius_session=; path=/; max-age=0; SameSite=Strict';
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  role: string;
  organizationId: string | null;
  emailVerified: boolean;
  onboardingCompleted: boolean;
  mfaEnabled: boolean;
}
export function getAuthDestination(
  user: Pick<AuthUser, 'emailVerified' | 'onboardingCompleted'>,
): string {
  if (!user.emailVerified) {
    return '/verify-email';
  }

  if (!user.onboardingCompleted) {
    return '/onboarding';
  }

  return '/dashboard';
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
  mfaRequired?: boolean;
}

export async function login(
  email: string,
  password: string,
  mfaCode?: string,
): Promise<AuthResult> {
  const res = await api.post<{ data: AuthResult }>('/auth/login', {
    email,
    password,
    mfaCode: mfaCode || undefined,
  });

  const result = res.data.data;

  if (!result.mfaRequired) {
    setTokens(result.accessToken, result.refreshToken);
  }

  return result;
}

export async function register(dto: {
  email: string;
  password: string;
  name: string;
  organizationName?: string;
}): Promise<AuthResult> {
  const res = await api.post<{ data: AuthResult }>('/auth/register', dto);
  const result = res.data.data;

  setTokens(result.accessToken, result.refreshToken);

  return result;
}

export async function logout(refreshToken?: string): Promise<void> {
  const token = refreshToken ?? getRefreshToken();

  if (token) {
    await api.post('/auth/logout', { refreshToken: token }).catch(() => null);
  }

  clearTokens();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = getAccessToken();

  if (!token) return null;

  const res = await api.get<{ data: AuthUser }>('/auth/me');

  return res.data.data;
}

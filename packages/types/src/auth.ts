export type UserRole = 'owner' | 'admin' | 'manager' | 'member' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  organizationId: string;
  mfaEnabled: boolean;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginDto {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  name: string;
  organizationName?: string;
}

export interface MagicLinkDto {
  email: string;
}

export interface Session {
  id: string;
  userId: string;
  deviceName?: string;
  deviceType?: string;
  ipAddress?: string;
  userAgent?: string;
  lastActiveAt: string;
  createdAt: string;
}

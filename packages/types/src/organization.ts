export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
  planId: string;
  ownerId: string;
  settings: OrganizationSettings;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationSettings {
  allowedDomains?: string[];
  defaultRole: string;
  mfaRequired: boolean;
  ssoEnabled: boolean;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  departmentId?: string;
  memberCount: number;
  createdAt: string;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  headUserId?: string;
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  invitedById: string;
  token: string;
  expiresAt: string;
  acceptedAt?: string;
  createdAt: string;
}

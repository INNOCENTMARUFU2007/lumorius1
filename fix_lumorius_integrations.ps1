$ErrorActionPreference = 'Stop'

# Run from C:\Users\HomePC\lumorius (repository root).
$root = (Get-Location).Path
$requiredPaths = @(
  '.\apps\api\src\app.module.ts',
  '.\apps\web\src\app\(dashboard)\integrations\page.tsx',
  '.\apps\api\src\database\database.module.ts',
  '.\database\schema',
  '.\.env.example'
)
foreach ($item in $requiredPaths) {
  if (-not (Test-Path -LiteralPath $item)) { throw "Required path not found: $item. Run this from the Lumorius repository root." }
}

$encoding = New-Object System.Text.UTF8Encoding($false)
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupDir = Join-Path $root ".integration-backups\$stamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

function Read-Normalized([string]$Path) {
  return [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Path).Path).Replace("`r`n", "`n")
}
function Write-Utf8([string]$Path, [string]$Content) {
  $full = [System.IO.Path]::GetFullPath($Path)
  $parent = Split-Path -Parent $full
  if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  [System.IO.File]::WriteAllText($full, $Content.Replace("`r`n", "`n").Replace("`n", "`r`n"), $encoding)
}
function Backup-IfExists([string]$Path) {
  if (Test-Path -LiteralPath $Path) {
    $dest = Join-Path $backupDir ($Path -replace '[\\/:*?"<>|]', '_')
    Copy-Item -LiteralPath $Path -Destination $dest -Force
  }
}

# Validate the AppModule insertion anchors before writing anything.
$appModulePath = '.\apps\api\src\app.module.ts'
$appModule = Read-Normalized $appModulePath
if ($appModule -notmatch "from './billing/billing\.module';") { throw 'Could not find the BillingModule import in app.module.ts; no project files were changed.' }
if ($appModule -notmatch '(?m)^\s+BillingModule,\s*$') { throw 'Could not find BillingModule in the AppModule imports array; no project files were changed.' }

# Select next numeric schema migration number to avoid overwriting existing migrations.
$schemaFiles = Get-ChildItem '.\database\schema' -File -Filter '*.sql' -ErrorAction SilentlyContinue
$maxVersion = 0
foreach ($f in $schemaFiles) {
  if ($f.Name -match '^(\d+)_') {
    $n = [int]$Matches[1]
    if ($n -gt $maxVersion) { $maxVersion = $n }
  }
}
$migrationPath = Join-Path '.\database\schema' (('{0:D3}_integrations.sql' -f ($maxVersion + 1)))
if (Test-Path -LiteralPath $migrationPath) { throw "Migration already exists: $migrationPath. No changes were made." }

# Backup files that this script edits.
Backup-IfExists $appModulePath
Backup-IfExists '.\apps\web\src\app\(dashboard)\integrations\page.tsx'
Backup-IfExists '.\.env.example'
Backup-IfExists '.\.env'
Backup-IfExists '.\apps\api\.env'

# Create tenant-scoped connection storage and one-time OAuth state storage.
$migration = @'
CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'error')),
  account_email text,
  encrypted_credentials text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  connected_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT integration_connections_org_provider_unique UNIQUE (organization_id, provider)
);

CREATE INDEX IF NOT EXISTS integration_connections_org_idx
  ON integration_connections (organization_id, provider);

CREATE TABLE IF NOT EXISTS integration_oauth_states (
  state_hash text PRIMARY KEY,
  provider text NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integration_oauth_states_expiry_idx
  ON integration_oauth_states (expires_at);
'@
Write-Utf8 $migrationPath $migration

$servicePath = '.\apps\api\src\integrations\integrations.service.ts'
$service = @'
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';

type OAuthVendor = 'google' | 'microsoft';
type IntegrationStatus = 'connected' | 'not_connected' | 'setup_required' | 'coming_soon' | 'managed';
interface ConnectorDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  emoji: string;
  vendor?: OAuthVendor;
  scopes?: string[];
  platformOnly?: boolean;
}
interface StoredConnection {
  provider: string;
  status: string;
  account_email: string | null;
  last_synced_at: Date | string | null;
}
interface OAuthStateRow {
  organization_id: string;
  user_id: string;
}

const CONNECTORS: ConnectorDefinition[] = [
  {
    id: 'google-drive', name: 'Google Drive', category: 'Storage', emoji: '📁', vendor: 'google',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.readonly'],
    description: 'Authorize read-only access to Drive. Account connection works after OAuth setup; indexing/sync still needs its connector worker.',
  },
  {
    id: 'gmail', name: 'Gmail', category: 'Email', emoji: '✉️', vendor: 'google',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly'],
    description: 'Authorize read-only mailbox access. This saves the connection securely; mailbox import/sync is a separate step.',
  },
  {
    id: 'onedrive', name: 'Microsoft OneDrive', category: 'Storage', emoji: '☁️', vendor: 'microsoft',
    scopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Files.Read.All'],
    description: 'Authorize Microsoft file access. Account connection works after OAuth setup; indexing/sync still needs its connector worker.',
  },
  {
    id: 'outlook-mail', name: 'Outlook / Microsoft 365 Email', category: 'Email', emoji: '📨', vendor: 'microsoft',
    scopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.Read'],
    description: 'Authorize read-only Microsoft 365 mail access. This saves the connection securely; mailbox import/sync is a separate step.',
  },
  { id: 'slack', name: 'Slack', category: 'Communication', emoji: '💬', description: 'Slack channel sync is not enabled yet.' },
  { id: 'notion', name: 'Notion', category: 'Knowledge', emoji: '📝', description: 'Notion sync is not enabled yet.' },
  { id: 'github', name: 'GitHub', category: 'Development', emoji: '🐙', description: 'GitHub repositories and pull-request sync are not enabled yet.' },
  { id: 'jira', name: 'Jira', category: 'Project Management', emoji: '📋', description: 'Jira sync is not enabled yet.' },
  { id: 'google-meet', name: 'Google Meet', category: 'Meetings', emoji: '📹', description: 'Google Meet import is not enabled yet.' },
  { id: 'zoom', name: 'Zoom', category: 'Meetings', emoji: '🎥', description: 'Zoom import is not enabled yet.' },
  { id: 'hubspot', name: 'HubSpot', category: 'CRM', emoji: '🧡', description: 'HubSpot sync is not enabled yet.' },
  { id: 'salesforce', name: 'Salesforce', category: 'CRM', emoji: '☁️', description: 'Salesforce sync is not enabled yet.' },
  { id: 'linear', name: 'Linear', category: 'Project Management', emoji: '📐', description: 'Linear sync is not enabled yet.' },
  { id: 'dropbox', name: 'Dropbox', category: 'Storage', emoji: '📦', description: 'Dropbox sync is not enabled yet.' },
  { id: 'zapier', name: 'Zapier', category: 'Automation', emoji: '⚡', description: 'Zapier actions are not enabled yet.' },
  { id: 'make', name: 'Make', category: 'Automation', emoji: '🔄', description: 'Make scenarios are not enabled yet.' },
  { id: 'intercom', name: 'Intercom', category: 'Support', emoji: '💭', description: 'Intercom sync is not enabled yet.' },
  { id: 'pagerduty', name: 'PagerDuty', category: 'Monitoring', emoji: '🚨', description: 'PagerDuty alerts are not enabled yet.' },
  { id: 'datadog', name: 'Datadog', category: 'Monitoring', emoji: '📊', description: 'Datadog ingestion is not enabled yet.' },
];

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  async listForUser(user: JwtPayload) {
    const connectionResult = await this.db.query<StoredConnection>(
      `SELECT provider, status, account_email, last_synced_at
       FROM integration_connections WHERE organization_id = $1`,
      [user.organizationId],
    );
    const connections = new Map(connectionResult.rows.map((row) => [row.provider, row]));
    const canManage = ['owner', 'admin'].includes(String(user.role || '').toLowerCase());

    const result = CONNECTORS.map((connector) => {
      const saved = connections.get(connector.id);
      const ready = connector.vendor ? this.oauthConfigured(connector.vendor) : false;
      let status: IntegrationStatus;
      let statusText: string;
      if (saved?.status === 'connected') {
        status = 'connected';
        statusText = 'Account authorised; content sync is not enabled yet.';
      } else if (connector.vendor && ready) {
        status = 'not_connected';
        statusText = canManage ? 'Ready to connect' : 'An organisation owner or admin must connect this account.';
      } else if (connector.vendor) {
        status = 'setup_required';
        statusText = 'Configure provider OAuth credentials and INTEGRATION_ENCRYPTION_KEY on the API server.';
      } else {
        status = 'coming_soon';
        statusText = 'This connector is listed for planning but is not implemented yet.';
      }
      return {
        ...connector,
        status,
        statusText,
        accountEmail: saved?.account_email ?? null,
        lastSyncedAt: saved?.last_synced_at ?? null,
        canManage,
        canConnect: Boolean(connector.vendor && ready && canManage && !saved),
        canDisconnect: Boolean(saved && canManage),
      };
    });

    // Stripe here means Lumorius's own subscription billing configuration, not a customer connector.
    // It is visible only to an owner/admin in the explicitly configured Lumorius platform organisation.
    const platformOrgId = String(process.env.LUMORIUS_PLATFORM_ORGANIZATION_ID || '').trim();
    if (platformOrgId && user.organizationId === platformOrgId && canManage) {
      const stripeConfigured = Boolean(this.config.get<string>('stripe.secretKey'));
      result.push({
        id: 'stripe',
        name: 'Stripe — Lumorius Platform Billing',
        category: 'Platform',
        description: 'Platform-level subscription payments are managed by the Lumorius API environment. This card is not a tenant Stripe connector.',
        emoji: '💳',
        status: stripeConfigured ? 'managed' as IntegrationStatus : 'setup_required' as IntegrationStatus,
        statusText: stripeConfigured ? 'Managed by Lumorius platform billing; cannot be disconnected here.' : 'Configure STRIPE_SECRET_KEY on the Lumorius API server.',
        accountEmail: null,
        lastSyncedAt: null,
        canManage: true,
        canConnect: false,
        canDisconnect: false,
        platformOnly: true,
      });
    }
    return result;
  }

  async beginConnect(user: JwtPayload, provider: string) {
    this.assertCanManage(user.role);
    const connector = this.getOAuthConnector(provider);
    if (!this.oauthConfigured(connector.vendor!)) {
      throw new ServiceUnavailableException('This connector requires OAuth client credentials and INTEGRATION_ENCRYPTION_KEY in the API environment.');
    }
    const { clientId } = this.getOAuthClient(connector.vendor!);
    const redirectUri = this.callbackUri(provider);
    const state = randomBytes(32).toString('base64url');
    await this.db.query('DELETE FROM integration_oauth_states WHERE expires_at <= NOW()');
    await this.db.query(
      `INSERT INTO integration_oauth_states (state_hash, provider, organization_id, user_id, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
      [this.hashState(state), provider, user.organizationId, user.sub],
    );

    const authorizeEndpoint = connector.vendor === 'google'
      ? 'https://accounts.google.com/o/oauth2/v2/auth'
      : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
    const url = new URL(authorizeEndpoint);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', (connector.scopes ?? []).join(' '));
    url.searchParams.set('state', state);
    if (connector.vendor === 'google') {
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('include_granted_scopes', 'true');
    } else {
      url.searchParams.set('response_mode', 'query');
    }
    return { authUrl: url.toString() };
  }

  async disconnect(user: JwtPayload, provider: string) {
    this.assertCanManage(user.role);
    if (provider === 'stripe' || provider === 'google-meet' || provider === 'email-notifications') {
      throw new BadRequestException('This is not a removable organisation-level connection.');
    }
    if (!CONNECTORS.some((item) => item.id === provider && item.vendor)) {
      throw new BadRequestException('This connector is not currently supported for connect/disconnect.');
    }
    const deleted = await this.db.query(
      `DELETE FROM integration_connections
       WHERE organization_id = $1 AND provider = $2
       RETURNING id`,
      [user.organizationId, provider],
    );
    return { disconnected: deleted.rowCount === 1, provider };
  }

  async completeOAuth(provider: string, code: string | undefined, state: string | undefined, providerError?: string) {
    if (!state) throw new BadRequestException('OAuth state is missing.');
    const connector = this.getOAuthConnector(provider);
    const stateResult = await this.db.query<OAuthStateRow>(
      `DELETE FROM integration_oauth_states
       WHERE state_hash = $1 AND provider = $2 AND expires_at > NOW()
       RETURNING organization_id, user_id`,
      [this.hashState(state), provider],
    );
    const savedState = stateResult.rows[0];
    if (!savedState) throw new BadRequestException('OAuth state is invalid or expired. Restart the connection flow.');
    if (providerError) throw new BadRequestException('The provider did not approve the connection.');
    if (!code) throw new BadRequestException('OAuth authorisation code is missing.');

    const client = this.getOAuthClient(connector.vendor!);
    const redirectUri = this.callbackUri(provider);
    const tokenEndpoint = connector.vendor === 'google'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const tokenBody = new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    if (connector.vendor === 'microsoft') {
      tokenBody.set('scope', (connector.scopes ?? []).join(' '));
    }
    const tokenResponse = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });
    const tokenPayload = await tokenResponse.json() as Record<string, unknown>;
    if (!tokenResponse.ok || typeof tokenPayload.access_token !== 'string') {
      this.logger.warn(`OAuth token exchange failed for ${provider} (HTTP ${tokenResponse.status}).`);
      throw new ServiceUnavailableException('The provider token exchange failed. Check OAuth credentials and redirect URI.');
    }

    const profileUrl = connector.vendor === 'google'
      ? 'https://www.googleapis.com/oauth2/v2/userinfo'
      : 'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName';
    const profileResponse = await fetch(profileUrl, {
      headers: { Authorization: `Bearer ${String(tokenPayload.access_token)}` },
    });
    if (!profileResponse.ok) {
      this.logger.warn(`OAuth profile lookup failed for ${provider} (HTTP ${profileResponse.status}).`);
      throw new ServiceUnavailableException('The provider account could not be verified. Try connecting again.');
    }
    const profile = await profileResponse.json() as Record<string, unknown>;
    const email = String(profile.email || profile.mail || profile.userPrincipalName || '').trim() || null;
    const encryptedCredentials = this.encrypt(JSON.stringify(tokenPayload));
    const scopes = typeof tokenPayload.scope === 'string'
      ? String(tokenPayload.scope).split(/\s+/).filter(Boolean)
      : (connector.scopes ?? []);

    await this.db.query(
      `INSERT INTO integration_connections
         (organization_id, provider, status, account_email, encrypted_credentials, scopes, connected_by_user_id, updated_at)
       VALUES ($1, $2, 'connected', $3, $4, $5, $6, NOW())
       ON CONFLICT (organization_id, provider) DO UPDATE SET
         status = 'connected', account_email = EXCLUDED.account_email,
         encrypted_credentials = EXCLUDED.encrypted_credentials, scopes = EXCLUDED.scopes,
         connected_by_user_id = EXCLUDED.connected_by_user_id, last_error = NULL, updated_at = NOW()`,
      [savedState.organization_id, provider, email, encryptedCredentials, scopes, savedState.user_id],
    );
    return this.resultRedirect(provider, 'connected');
  }

  resultRedirect(provider: string, status: 'connected' | 'error') {
    const appUrl = this.config.get<string>('appUrl', 'http://localhost:3000');
    const url = new URL('/integrations', appUrl);
    url.searchParams.set('integrationStatus', status);
    url.searchParams.set('provider', /^[a-z-]+$/.test(provider) ? provider : 'unknown');
    return url.toString();
  }

  private assertCanManage(role: string) {
    if (!['owner', 'admin'].includes(String(role || '').toLowerCase())) {
      throw new ForbiddenException('Only an organisation owner or admin can manage integrations.');
    }
  }

  private getOAuthConnector(provider: string): ConnectorDefinition & { vendor: OAuthVendor } {
    const connector = CONNECTORS.find((item) => item.id === provider && item.vendor);
    if (!connector || !connector.vendor) {
      throw new BadRequestException('This integration does not have a working OAuth connector yet.');
    }
    return connector as ConnectorDefinition & { vendor: OAuthVendor };
  }

  private getOAuthClient(vendor: OAuthVendor) {
    const clientId = vendor === 'google'
      ? this.config.get<string>('oauth.google.clientId', '')
      : this.config.get<string>('oauth.microsoft.clientId', '');
    const clientSecret = vendor === 'google'
      ? this.config.get<string>('oauth.google.clientSecret', '')
      : this.config.get<string>('oauth.microsoft.clientSecret', '');
    return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
  }

  private oauthConfigured(vendor: OAuthVendor) {
    const client = this.getOAuthClient(vendor);
    const key = process.env.INTEGRATION_ENCRYPTION_KEY || '';
    return Boolean(client.clientId && client.clientSecret && /^[a-fA-F0-9]{64}$/.test(key));
  }

  private callbackUri(provider: string) {
    const base = String(process.env.INTEGRATIONS_API_BASE_URL || 'http://localhost:3001/api/v1').replace(/\/+$/, '');
    return `${base}/integrations/${provider}/callback`;
  }

  private hashState(state: string) {
    return createHash('sha256').update(state).digest('hex');
  }

  private encrypt(plainText: string) {
    const keyHex = process.env.INTEGRATION_ENCRYPTION_KEY || '';
    if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) {
      throw new ServiceUnavailableException('INTEGRATION_ENCRYPTION_KEY must be a 64-character hex key on the API server.');
    }
    const key = Buffer.from(keyHex, 'hex');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }
}
'@

$controllerPath = '.\apps\api\src\integrations\integrations.controller.ts'
$controller = @'
import {
  Controller, Get, Post, Delete, Param, Query, UseGuards, Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { IntegrationsService } from './integrations.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get()
  @ApiOperation({ summary: 'List integration catalog and actual connection state for the current organisation' })
  list(@CurrentUser() user: JwtPayload) {
    return this.integrationsService.listForUser(user);
  }

  @Post(':provider/connect')
  @ApiOperation({ summary: 'Start an OAuth connection for a supported provider' })
  connect(@CurrentUser() user: JwtPayload, @Param('provider') provider: string) {
    return this.integrationsService.beginConnect(user, provider);
  }

  @Delete(':provider')
  @ApiOperation({ summary: 'Remove a saved organisation integration connection' })
  disconnect(@CurrentUser() user: JwtPayload, @Param('provider') provider: string) {
    return this.integrationsService.disconnect(user, provider);
  }
}

// OAuth callbacks must be reachable from the provider and are protected by one-time, expiring state.
@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsOAuthController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get(':provider/callback')
  @ApiOperation({ summary: 'Complete a provider OAuth callback' })
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Res() response: Response,
  ) {
    try {
      const url = await this.integrationsService.completeOAuth(provider, code, state, providerError);
      return response.redirect(302, url);
    } catch {
      return response.redirect(302, this.integrationsService.resultRedirect(provider, 'error'));
    }
  }
}
'@

$modulePath = '.\apps\api\src\integrations\integrations.module.ts'
$module = @'
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntegrationsController, IntegrationsOAuthController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [DatabaseModule],
  controllers: [IntegrationsController, IntegrationsOAuthController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
'@

# Replace the integrations page with API-backed states and actual OAuth redirects.
$pagePath = '.\apps\web\src\app\(dashboard)\integrations\page.tsx'
$page = @'
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AlertCircle, CheckCircle2, Loader2, PlugZap, Puzzle, RefreshCw, Search,
  ShieldCheck, Unplug,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

type IntegrationStatus = 'connected' | 'not_connected' | 'setup_required' | 'coming_soon' | 'managed';
interface IntegrationItem {
  id: string;
  name: string;
  category: string;
  description: string;
  emoji: string;
  status: IntegrationStatus;
  statusText: string;
  accountEmail?: string | null;
  lastSyncedAt?: string | null;
  canManage: boolean;
  canConnect: boolean;
  canDisconnect: boolean;
  platformOnly?: boolean;
}

function payload<T>(response: any): T {
  return (response?.data?.data ?? response?.data) as T;
}
function errorText(error: any) {
  const message = error?.response?.data?.message ?? error?.message;
  return typeof message === 'string' ? message : 'The integration request failed. Check the API logs and provider setup.';
}
function statusStyle(status: IntegrationStatus) {
  switch (status) {
    case 'connected': return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500';
    case 'managed': return 'border-blue-500/30 bg-blue-500/10 text-blue-500';
    case 'setup_required': return 'border-amber-500/30 bg-amber-500/10 text-amber-500';
    case 'coming_soon': return 'border-border bg-muted/40 text-muted-foreground';
    default: return 'border-border bg-muted/40 text-muted-foreground';
  }
}
function statusLabel(item: IntegrationItem) {
  if (item.status === 'connected') return 'Connected';
  if (item.status === 'managed') return 'Platform managed';
  if (item.status === 'setup_required') return 'Setup required';
  if (item.status === 'coming_soon') return 'Coming soon';
  return 'Not connected';
}

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const integrationsQuery = useQuery<IntegrationItem[]>({
    queryKey: ['integrations'],
    queryFn: async () => {
      const response = await api.get('/integrations');
      const result = payload<IntegrationItem[]>(response);
      if (!Array.isArray(result)) throw new Error('The integrations API returned an unexpected response.');
      return result;
    },
    retry: 1,
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const status = url.searchParams.get('integrationStatus');
    const provider = url.searchParams.get('provider');
    if (status === 'connected') {
      toast.success(`${provider ? provider.replaceAll('-', ' ') : 'Integration'} connected. Content sync is not enabled yet.`);
      qc.invalidateQueries({ queryKey: ['integrations'] });
      url.searchParams.delete('integrationStatus');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } else if (status === 'error') {
      toast.error('The provider connection was not completed. Check OAuth credentials, redirect URI and API logs.');
      url.searchParams.delete('integrationStatus');
      url.searchParams.delete('provider');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  }, [qc]);

  const connectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const response = await api.post(`/integrations/${provider}/connect`);
      const result = payload<{ authUrl?: string }>(response);
      if (!result?.authUrl || typeof result.authUrl !== 'string') {
        throw new Error('The API did not return an OAuth authorisation URL.');
      }
      return result;
    },
    onSuccess: (result) => window.location.assign(result.authUrl!),
    onError: (error) => toast.error(errorText(error)),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      await api.delete(`/integrations/${provider}`);
      return provider;
    },
    onSuccess: (provider) => {
      toast.success(`${provider.replaceAll('-', ' ')} disconnected from Lumorius.`);
      qc.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const items = integrationsQuery.data ?? [];
  const categories = useMemo(() => ['All', ...Array.from(new Set(items.map((i) => i.category)))], [items]);
  const filtered = useMemo(() => items.filter((item) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(q);
    return matchesSearch && (category === 'All' || item.category === category);
  }), [items, search, category]);
  const connectedCount = items.filter((item) => item.status === 'connected').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/10 p-2.5"><Puzzle className="h-6 w-6 text-indigo-500" /></div>
          <div>
            <h1 className="text-2xl font-bold">Integrations</h1>
            <p className="text-sm text-muted-foreground">{connectedCount} connected account(s). Connections are organisation-scoped.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void integrationsQuery.refetch()}
          disabled={integrationsQuery.isFetching}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${integrationsQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative block max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            aria-label="Search integrations"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search integrations…"
            className="w-full rounded-lg border border-border bg-muted/30 py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-violet-500/30"
          />
        </label>
        <div className="flex flex-wrap gap-1" aria-label="Integration categories">
          {categories.map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setCategory(value)}
              aria-pressed={category === value}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${category === value ? 'bg-violet-600 text-white' : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            >{value}</button>
          ))}
        </div>
      </div>

      {integrationsQuery.isLoading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading integrations…</div>
      )}
      {integrationsQuery.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
          <div className="flex items-center gap-2 font-medium"><AlertCircle className="h-5 w-5 text-red-500" /> Integrations could not be loaded</div>
          <p className="mt-2 text-sm text-muted-foreground">{errorText(integrationsQuery.error)}</p>
          <button type="button" onClick={() => void integrationsQuery.refetch()} className="mt-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">Try again</button>
        </div>
      )}

      {!integrationsQuery.isLoading && !integrationsQuery.isError && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item) => {
            const connectPending = connectMutation.isPending && connectMutation.variables === item.id;
            const disconnectPending = disconnectMutation.isPending && disconnectMutation.variables === item.id;
            return (
              <motion.article
                key={item.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex min-h-64 flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span aria-hidden="true" className="text-2xl">{item.emoji}</span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold leading-5">{item.name}</h2>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{item.category}</p>
                    </div>
                  </div>
                  {item.status === 'connected' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : item.status === 'managed' ? <ShieldCheck className="h-4 w-4 shrink-0 text-blue-500" /> : null}
                </div>
                <p className="flex-1 text-xs leading-relaxed text-muted-foreground">{item.description}</p>
                <div className="space-y-1.5">
                  <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-medium ${statusStyle(item.status)}`}>{statusLabel(item)}</span>
                  <p className="min-h-8 text-[11px] leading-relaxed text-muted-foreground">{item.accountEmail ? `Account: ${item.accountEmail}. ` : ''}{item.statusText}</p>
                </div>
                {item.canConnect ? (
                  <button
                    type="button"
                    disabled={connectMutation.isPending || disconnectMutation.isPending}
                    onClick={() => connectMutation.mutate(item.id)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >{connectPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}{connectPending ? 'Starting secure connection…' : 'Connect account'}</button>
                ) : item.canDisconnect ? (
                  <button
                    type="button"
                    disabled={disconnectMutation.isPending || connectMutation.isPending}
                    onClick={() => disconnectMutation.mutate(item.id)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-red-500/40 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >{disconnectPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}{disconnectPending ? 'Removing…' : 'Disconnect account'}</button>
                ) : item.status === 'coming_soon' ? (
                  <span className="inline-flex w-full items-center justify-center rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">Connector not implemented</span>
                ) : item.status === 'setup_required' ? (
                  <span className="inline-flex w-full items-center justify-center rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-500">Server setup required</span>
                ) : item.status === 'managed' ? (
                  <span className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-blue-500/30 px-3 py-2 text-xs text-blue-500"><ShieldCheck className="h-3.5 w-3.5" /> Platform-managed</span>
                ) : (
                  <span className="inline-flex w-full items-center justify-center rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">Owner/admin access required</span>
                )}
              </motion.article>
            );
          })}
        </div>
      )}
      {!integrationsQuery.isLoading && !integrationsQuery.isError && filtered.length === 0 && (
        <div className="py-16 text-center text-muted-foreground"><Puzzle className="mx-auto mb-3 h-10 w-10 opacity-20" /><p>No integrations match the current search.</p></div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">Only Google Drive, Gmail, OneDrive and Outlook have OAuth connection flows in this patch. A successful account authorisation does not mean files or emails are already syncing into Company Brain; sync workers are a separate implementation step. Other cards are explicitly marked as unavailable until their connector exists.</p>
    </div>
  );
}
'@

# Patch app.module.ts only at verified anchors. Use literal replacements so PowerShell
# does not expand the regex capture token `$1` while constructing import statements.
if ($appModule -notmatch "from './integrations/integrations\.module';") {
  $billingImport = "import { BillingModule } from './billing/billing.module';"
  if (-not $appModule.Contains($billingImport)) {
    throw 'BillingModule import anchor changed. New connector files/migration were staged, but app.module.ts was not written.'
  }
  $appModule = $appModule.Replace(
    $billingImport,
    "$billingImport`nimport { IntegrationsModule } from './integrations/integrations.module';"
  )
}
if ($appModule -notmatch '(?m)^\s+IntegrationsModule,\s*$') {
  $billingEntry = '    BillingModule,'
  if (-not $appModule.Contains($billingEntry)) {
    throw 'BillingModule imports-array anchor changed. app.module.ts was not written.'
  }
  $appModule = $appModule.Replace($billingEntry, "    BillingModule,`n    IntegrationsModule,")
}
if ($appModule -notmatch "from './integrations/integrations\.module';" -or $appModule -notmatch '(?m)^\s+IntegrationsModule,\s*$') {
  throw 'Could not safely register IntegrationsModule. New connector files and migration were created, but app.module.ts was not written.'
}

# Preserve any pre-existing integration implementation before replacing target files.
Backup-IfExists $servicePath
Backup-IfExists $controllerPath
Backup-IfExists $modulePath

Write-Utf8 $servicePath $service
Write-Utf8 $controllerPath $controller
Write-Utf8 $modulePath $module
Write-Utf8 $appModulePath $appModule
Write-Utf8 $pagePath $page

# Add documented environment settings to .env.example.
$examplePath = '.\.env.example'
$example = Read-Normalized $examplePath
if ($example -notmatch '(?m)^INTEGRATIONS_API_BASE_URL=') {
  $block = @'
# ---- Organisation integrations (OAuth account tokens are encrypted at rest) ----
INTEGRATIONS_API_BASE_URL=http://localhost:3001/api/v1
# Generate once and keep stable: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
INTEGRATION_ENCRYPTION_KEY=
# Exact UUID of the Lumorius platform organisation; leave blank to hide the platform Stripe card everywhere.
LUMORIUS_PLATFORM_ORGANIZATION_ID=
'@
  $example = $example.Replace("# ---- Email / SMTP ------------------------------------------------", "$block`n# ---- Email / SMTP ------------------------------------------------")
  if ($example -notmatch '(?m)^INTEGRATIONS_API_BASE_URL=') { $example += "`n$block`n" }
}
Write-Utf8 $examplePath $example

# Keep the encryption key consistent across whichever env files the API might load.
# Never silently rotate a valid existing key because that would make stored OAuth tokens unreadable.
$envTargets = @('.\.env', '.\apps\api\.env') | Where-Object { Test-Path -LiteralPath $_ }
if ($envTargets.Count -gt 0) {
  $existingKeys = @()
  foreach ($envTarget in $envTargets) {
    $envText = Read-Normalized $envTarget
    $keyMatch = [regex]::Match($envText, '(?m)^INTEGRATION_ENCRYPTION_KEY=([a-fA-F0-9]{64})\s*$')
    if ($keyMatch.Success) { $existingKeys += $keyMatch.Groups[1].Value.ToLowerInvariant() }
  }
  $uniqueKeys = @($existingKeys | Sort-Object -Unique)
  if ($uniqueKeys.Count -gt 1) {
    throw 'The root .env and apps/api/.env contain different valid INTEGRATION_ENCRYPTION_KEY values. Resolve this manually before connecting integrations; no existing key was changed.'
  }

  if ($uniqueKeys.Count -eq 1) {
    $integrationKey = $uniqueKeys[0]
  } else {
    $integrationKey = (& node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))").Trim()
    if ($LASTEXITCODE -ne 0 -or $integrationKey -notmatch '^[a-fA-F0-9]{64}$') {
      throw 'Could not generate INTEGRATION_ENCRYPTION_KEY using Node.js.'
    }
  }

  foreach ($envTarget in $envTargets) {
    $envText = Read-Normalized $envTarget
    $changedEnv = $false
    if ($envText -notmatch '(?m)^INTEGRATIONS_API_BASE_URL=') {
      $envText += "`nINTEGRATIONS_API_BASE_URL=http://localhost:3001/api/v1`n"
      $changedEnv = $true
    }
    if ($envText -match '(?m)^INTEGRATION_ENCRYPTION_KEY=') {
      $desiredKeyLine = "INTEGRATION_ENCRYPTION_KEY=$integrationKey"
      $currentKeyLine = [regex]::Match($envText, '(?m)^INTEGRATION_ENCRYPTION_KEY=.*$').Value
      if ($currentKeyLine -ne $desiredKeyLine) {
        $envText = [regex]::Replace($envText, '(?m)^INTEGRATION_ENCRYPTION_KEY=.*$', $desiredKeyLine)
        $changedEnv = $true
      }
    } else {
      $envText += "`nINTEGRATION_ENCRYPTION_KEY=$integrationKey`n"
      $changedEnv = $true
    }
    if ($envText -notmatch '(?m)^LUMORIUS_PLATFORM_ORGANIZATION_ID=') {
      $envText += "`nLUMORIUS_PLATFORM_ORGANIZATION_ID=`n"
      $changedEnv = $true
    }
    if ($changedEnv) { Write-Utf8 $envTarget $envText; Write-Host "Updated $envTarget integration settings (encryption key value not printed)." -ForegroundColor Green }
  }
} else {
  Write-Warning 'No root .env or apps/api/.env file found. Add the integration settings to whichever environment file the API loads; generate INTEGRATION_ENCRYPTION_KEY before connecting accounts.'
}

# Apply the table migration to the existing local Docker database, if it is running.
$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if ($dockerCmd) {
  $runningContainers = (& docker ps --format '{{.Names}}' 2>$null) -join "`n"
  if ($LASTEXITCODE -eq 0 -and $runningContainers -match '(?m)^lumorius_postgres$') {
    $resolvedMigration = (Resolve-Path -LiteralPath $migrationPath).Path
    & docker cp $resolvedMigration 'lumorius_postgres:/tmp/lumorius_integrations_migration.sql'
    if ($LASTEXITCODE -ne 0) { throw 'Could not copy the integrations migration into lumorius_postgres.' }
    & docker exec lumorius_postgres psql -v ON_ERROR_STOP=1 -U lumorius -d lumorius_db -f /tmp/lumorius_integrations_migration.sql
    if ($LASTEXITCODE -ne 0) { throw 'Database migration failed. Source files are backed up; inspect the SQL error before restarting the API.' }
    Write-Host "Applied database migration: $migrationPath" -ForegroundColor Green
  } else {
    Write-Warning "Container lumorius_postgres is not running. Migration saved at $migrationPath; start Docker and apply it before testing integrations."
  }
} else {
  Write-Warning "Docker CLI was not found. Migration saved at $migrationPath; apply it to PostgreSQL before testing integrations."
}

Write-Host "`n===== Building API =====" -ForegroundColor Cyan
& pnpm --filter @lumorius/api build
if ($LASTEXITCODE -ne 0) { throw 'API build failed. Backups are saved under .integration-backups; paste the first TypeScript error for a targeted fix.' }

Write-Host "`n===== Building Web =====" -ForegroundColor Cyan
& pnpm --filter @lumorius/web build
if ($LASTEXITCODE -ne 0) { throw 'Web build failed. Backups are saved under .integration-backups; paste the first build error for a targeted fix.' }

Write-Host "`nIntegrations patch and builds completed." -ForegroundColor Green
Write-Host "Backups: $backupDir"
Write-Host "Migration: $migrationPath"
Write-Host "`nOAuth callback URLs to register in Google/Microsoft developer consoles:" -ForegroundColor Cyan
Write-Host '  http://localhost:3001/api/v1/integrations/google-drive/callback'
Write-Host '  http://localhost:3001/api/v1/integrations/gmail/callback'
Write-Host '  http://localhost:3001/api/v1/integrations/onedrive/callback'
Write-Host '  http://localhost:3001/api/v1/integrations/outlook-mail/callback'
Write-Host "`nStripe platform card is hidden unless LUMORIUS_PLATFORM_ORGANIZATION_ID is set to the exact UUID of Lumorius's own organisation." -ForegroundColor Yellow

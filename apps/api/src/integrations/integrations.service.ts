import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { DocumentsService } from '../documents/documents.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { LuieEventPublisher } from '../luie/luie-event.publisher';
import { v4 as uuidv4 } from 'uuid';
import { PAID_PLANS, resolvePlan, WorkspacePlanRow } from '../billing/plan-policy';

type OAuthVendor =
  | 'google' | 'microsoft' | 'slack' | 'notion' | 'github' | 'jira'
  | 'zoom' | 'hubspot' | 'salesforce' | 'linear' | 'dropbox' | 'intercom' | 'pagerduty';
type AuthMode = 'oauth' | 'api_key' | 'webhook';
type IntegrationStatus = 'connected' | 'not_connected' | 'setup_required' | 'managed' | 'error';

interface ConnectorDefinition {
  id: string;
  name: string;
  category: string;
  description: string;
  emoji: string;
  vendor?: OAuthVendor;
  authMode: AuthMode;
  scopes?: string[];
  syncSupported: boolean;
  platformOnly?: boolean;
  /** Uses a Google restricted scope (annual CASA assessment): paid plans only, never during the trial. */
  paidOnly?: boolean;
}

export interface IntegrationListItem {
  id: string;
  name: string;
  category: string;
  description: string;
  emoji: string;
  status: IntegrationStatus;
  statusText: string;
  accountEmail: string | null;
  lastSyncedAt: Date | string | null;
  canManage: boolean;
  canConnect: boolean;
  canConfigure: boolean;
  canDisconnect: boolean;
  canSync: boolean;
  canTest?: boolean;
  callbackUrl?: string;
  requestedScopes?: string[];
  grantedScopes?: string[];
  authMode: AuthMode;
  platformOnly?: boolean;
  requiresPaidPlan?: boolean;
}

interface StoredConnection {
  provider: string;
  status: string;
  account_email: string | null;
  encrypted_credentials: string;
  connected_by_user_id: string | null;
  last_synced_at: Date | string | null;
  last_error?: string | null;
  authorization_revision?: string;
  scopes?: string[];
}
interface OAuthStateRow { organization_id: string; user_id: string; }
interface OAuthClient { clientId: string; clientSecret: string; }
interface OAuthSpec {
  authorizeUrl: string;
  tokenUrl: string;
  scopes?: string[];
  scopeDelimiter?: string;
  scopeParameter?: string;
  tokenMode: 'form' | 'json' | 'basic-form';
  extraAuthorizeParams?: Record<string, string>;
}
interface RemoteItem {
  externalId: string;
  title: string;
  text?: string;
  buffer?: Buffer;
  mimeType?: string;
  url?: string;
  updatedAt?: string | null;
  crm?: { kind:'deal'|'contact'; name:string; stage:string|null; lastActivity:string|null; closeDate:string|null; closed:boolean|null };
}

const CONNECTORS: ConnectorDefinition[] = [
  { id: 'google-drive', name: 'Google Drive', category: 'Storage', emoji: '📁', vendor: 'google', authMode: 'oauth', scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.readonly'], syncSupported: true, description: 'Import supported files and Google Docs into Company Brain.', paidOnly: true },
  { id: 'gmail', name: 'Gmail', category: 'Email', emoji: '✉️', vendor: 'google', authMode: 'oauth', scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly'], syncSupported: true, description: 'Import recent email messages as searchable Company Brain documents.', paidOnly: true },
  { id: 'google-meet', name: 'Google Meet / Calendar', category: 'Meetings', emoji: '📹', vendor: 'google', authMode: 'oauth', scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.readonly'], syncSupported: true, description: 'Import recent calendar meeting details and Meet links.' },
  { id: 'onedrive', name: 'Microsoft OneDrive', category: 'Storage', emoji: '☁️', vendor: 'microsoft', authMode: 'oauth', scopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Files.Read.All'], syncSupported: true, description: 'Import supported files from OneDrive into Company Brain.' },
  { id: 'outlook-mail', name: 'Outlook / Microsoft 365 Email', category: 'Email', emoji: '📨', vendor: 'microsoft', authMode: 'oauth', scopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.Read'], syncSupported: true, description: 'Import recent Outlook messages as searchable Company Brain documents.' },
  { id: 'slack', name: 'Slack', category: 'Communication', emoji: '💬', vendor: 'slack', authMode: 'oauth', scopes: ['channels:read', 'channels:history', 'groups:read', 'groups:history', 'users:read', 'users:read.email'], syncSupported: true, description: 'Import messages from channels the authorised Slack app can access.' },
  { id: 'notion', name: 'Notion', category: 'Knowledge', emoji: '📝', vendor: 'notion', authMode: 'oauth', scopes: [], syncSupported: true, description: 'Import pages shared with the authorised Notion integration.' },
  { id: 'github', name: 'GitHub', category: 'Development', emoji: '🐙', vendor: 'github', authMode: 'oauth', scopes: ['public_repo', 'read:user', 'user:email'], syncSupported: true, description: 'Import repository metadata and README content for accessible repositories.' },
  { id: 'jira', name: 'Jira Cloud', category: 'Project Management', emoji: '📋', vendor: 'jira', authMode: 'oauth', scopes: ['read:jira-work', 'read:jira-user', 'offline_access'], syncSupported: true, description: 'Import recent Jira issues from an authorised Jira Cloud site.' },
  { id: 'zoom', name: 'Zoom Meetings', category: 'Meetings', emoji: '🎥', vendor: 'zoom', authMode: 'oauth', scopes: ['user:read:user:admin', 'cloud_recording:read:list_user_recordings:admin'], syncSupported: true, description: 'Import recent meeting and cloud-recording metadata; transcripts are imported when available.' },
  { id: 'hubspot', name: 'HubSpot', category: 'CRM', emoji: '🧡', vendor: 'hubspot', authMode: 'oauth', scopes: ['crm.objects.contacts.read', 'crm.objects.deals.read', 'crm.objects.companies.read'], syncSupported: true, description: 'Import contacts, deals, and companies into searchable CRM snapshots.' },
  { id: 'linear', name: 'Linear', category: 'Project Management', emoji: '📐', vendor: 'linear', authMode: 'oauth', scopes: ['read'], syncSupported: true, description: 'Import recent issues and descriptions from Linear.' },
  { id: 'dropbox', name: 'Dropbox', category: 'Storage', emoji: '📦', vendor: 'dropbox', authMode: 'oauth', scopes: ['account_info.read', 'files.metadata.read', 'files.content.read'], syncSupported: true, description: 'Import supported files from the connected Dropbox account.' },
  { id: 'zapier', name: 'Zapier', category: 'Automation', emoji: '⚡', authMode: 'webhook', syncSupported: false, description: 'Configure a Zapier Catch Hook URL so Lumorius can deliver approved workflow events.' },
  { id: 'make', name: 'Make', category: 'Automation', emoji: '🔄', authMode: 'webhook', syncSupported: false, description: 'Configure a Make custom webhook URL so Lumorius can deliver approved workflow events.' },
];

const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
]);

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly documents: DocumentsService,
    private readonly luiePublisher: LuieEventPublisher,
  ) {}

  async listForUser(user: JwtPayload): Promise<IntegrationListItem[]> {
    const connectionResult = await this.db.query<StoredConnection>(
      `SELECT provider, status, account_email, encrypted_credentials,
              connected_by_user_id, last_synced_at, last_error, scopes
       FROM integration_connections WHERE organization_id = $1`,
      [user.organizationId],
    );
    const connections = new Map(connectionResult.rows.map((row) => [row.provider, row]));
    const canManage = ['owner', 'admin'].includes(String(user.role || '').toLowerCase());
    const onPaidPlan = await this.isOnPaidPlan(user.organizationId);

    const encryptedStorageReady = /^[a-f0-9]{64}$/i.test(process.env.INTEGRATION_ENCRYPTION_KEY ?? '');
    const result: IntegrationListItem[] = CONNECTORS.map((connector) => {
      const saved = connections.get(connector.id);
      const ready = connector.vendor ? this.oauthConfigured(connector.vendor) : false;
      let status: IntegrationStatus;
      let statusText: string;
      if (!encryptedStorageReady) {
        status = 'setup_required';
        statusText = 'Configure INTEGRATION_ENCRYPTION_KEY on the API server to store and use credentials.';
      } else if (connector.paidOnly && !onPaidPlan && !saved) {
        status = 'setup_required';
        statusText = 'Available on paid plans. Choose a plan in Billing to connect this account.';
      } else if (saved?.status === 'connected' && !saved.last_error) {
        status = 'connected';
        statusText = connector.syncSupported
          ? saved.last_synced_at ? `Connected. Last sync: ${new Date(saved.last_synced_at).toLocaleString()}.` : 'Connected. Run Sync now to import available content.'
          : 'Configured. It can deliver events when a workflow uses it.';
      } else if (saved?.status === 'error' || saved?.last_error) {
        status = 'error';
        statusText = 'Needs attention. Retry the connection or sync and inspect the API log if it persists.';
      } else if (connector.authMode === 'api_key' || connector.authMode === 'webhook') {
        status = 'not_connected';
        statusText = canManage ? 'Configure credentials to enable this integration.' : 'An organisation owner or admin must configure this integration.';
      } else if (connector.vendor && ready) {
        status = 'not_connected';
        statusText = canManage ? 'Ready to connect.' : 'An organisation owner or admin must connect this account.';
      } else {
        status = 'setup_required';
        statusText = `Set ${this.requiredEnvNames(connector)} and INTEGRATION_ENCRYPTION_KEY in the API environment.`;
      }
      return {
        id: connector.id,
        name: connector.name,
        category: connector.category,
        description: connector.description,
        emoji: connector.emoji,
        status,
        statusText,
        accountEmail: saved?.account_email ?? null,
        lastSyncedAt: saved?.last_synced_at ?? null,
        canManage,
        canConnect: Boolean(connector.vendor && ready && canManage && (!connector.paidOnly || onPaidPlan) && (!saved || saved.status !== 'connected' || Boolean(saved.last_error))),
        canConfigure: Boolean(connector.authMode !== 'oauth' && canManage && encryptedStorageReady),
        canTest: Boolean(saved && connector.authMode === 'webhook' && canManage && encryptedStorageReady),
        requestedScopes: connector.scopes ?? [],
        grantedScopes: canManage ? saved?.scopes ?? [] : undefined,
        callbackUrl: connector.vendor && canManage ? this.callbackUri(connector.id) : undefined,
        canDisconnect: Boolean(saved && canManage),
        canSync: Boolean(saved && ['connected', 'error'].includes(saved.status) && connector.syncSupported && canManage && encryptedStorageReady),
        authMode: connector.authMode,
        requiresPaidPlan: connector.paidOnly && !onPaidPlan ? true : undefined,
      };
    });

    // Stripe is Lumorius's own platform billing configuration, never a customer connector.
    const platformOrgId = String(process.env.LUMORIUS_PLATFORM_ORGANIZATION_ID || '').trim();
    if (platformOrgId && user.organizationId === platformOrgId && canManage) {
      const stripeConfigured = Boolean(this.config.get<string>('stripe.secretKey') || process.env.STRIPE_SECRET_KEY);
      result.push({
        id: 'stripe',
        name: 'Stripe — Lumorius Platform Billing',
        category: 'Platform',
        description: 'Platform-level subscription payments managed by Lumorius. This is not a tenant Stripe connector.',
        emoji: '💳',
        status: stripeConfigured ? 'managed' : 'setup_required',
        statusText: stripeConfigured ? 'Managed by Lumorius platform billing; cannot be disconnected here.' : 'Configure STRIPE_SECRET_KEY on the Lumorius API server.',
        accountEmail: null,
        lastSyncedAt: null,
        canManage: true,
        canConnect: false,
        canConfigure: false,
        canDisconnect: false,
        canSync: false,
        authMode: 'oauth',
        platformOnly: true,
      });
    }
    return result;
  }

  private async isOnPaidPlan(organizationId: string): Promise<boolean> {
    const res = await this.db.query<WorkspacePlanRow>(
      'SELECT plan_id::text AS plan_id, trial_ends_at, created_at FROM organizations WHERE id = $1',
      [organizationId],
    );
    return (PAID_PLANS as readonly string[]).includes(resolvePlan(res.rows[0]));
  }

  private async assertPlanAllows(organizationId: string, connector: ConnectorDefinition) {
    if (connector.paidOnly && !(await this.isOnPaidPlan(organizationId))) {
      throw new ForbiddenException({ code: 'upgrade_required', message: connector.name + ' is available on paid plans.', upgradeUrl: '/billing' });
    }
  }

  async beginConnect(user: JwtPayload, provider: string) {
    this.assertCanManage(user.role);
    const connector = this.getConnector(provider);
    await this.assertPlanAllows(user.organizationId, connector);
    if (!connector.vendor) throw new BadRequestException('This integration uses its Configure action, not OAuth.');
    if (!this.oauthConfigured(connector.vendor)) {
      throw new ServiceUnavailableException(`Configure ${this.requiredEnvNames(connector)} and INTEGRATION_ENCRYPTION_KEY on the API server first.`);
    }
    const spec = this.oauthSpec(connector.vendor);
    const client = this.getOAuthClient(connector.vendor);
    const redirectUri = this.callbackUri(provider);
    const state = randomBytes(32).toString('base64url');
    await this.db.query('DELETE FROM integration_oauth_states WHERE expires_at <= NOW()');
    await this.db.query(
      `INSERT INTO integration_oauth_states (state_hash, provider, organization_id, user_id, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
      [this.hashState(state), provider, user.organizationId, user.sub],
    );

    const url = new URL(spec.authorizeUrl);
    url.searchParams.set('client_id', client.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    if (connector.scopes?.length) url.searchParams.set(spec.scopeParameter || 'scope', connector.scopes.join(spec.scopeDelimiter || ' '));
    for (const [key, value] of Object.entries(spec.extraAuthorizeParams || {})) url.searchParams.set(key, value);
    if (connector.vendor === 'google') {
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      url.searchParams.set('include_granted_scopes', 'true');
    }
    if (connector.vendor === 'dropbox') url.searchParams.set('token_access_type', 'offline');
    return { authUrl: url.toString() };
  }

  async configureConnector(user: JwtPayload, provider: string, input: { apiKey?: string; appKey?: string; webhookUrl?: string }) {
    this.assertCanManage(user.role);
    const connector = this.getConnector(provider);
    let credentials: Record<string, unknown>;
    let accountName: string;

    if (provider === 'datadog') {
      const apiKey = String(input.apiKey || '').trim();
      const appKey = String(input.appKey || '').trim();
      if (!apiKey || !appKey) throw new BadRequestException('Datadog requires both an API key and an application key.');
      const site = this.datadogBaseUrl();
      const response = await fetch(`${site}/api/v1/validate`, { headers: { 'DD-API-KEY': apiKey, 'DD-APPLICATION-KEY': appKey }, signal: AbortSignal.timeout(8000) });
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok || body.valid !== true) throw new BadRequestException('Datadog rejected these credentials. Verify the API key, application key and site.');
      credentials = { apiKey, appKey, site };
      accountName = 'Datadog API credentials';
    } else if (provider === 'zapier' || provider === 'make') {
      const webhookUrl = String(input.webhookUrl || '').trim();
      this.validateWebhookUrl(provider, webhookUrl);
      credentials = { webhookUrl };
      accountName = `${provider === 'zapier' ? 'Zapier' : 'Make'} webhook configured`;
    } else {
      throw new BadRequestException('This integration does not accept API-key or webhook configuration.');
    }

    const encrypted = this.encrypt(JSON.stringify(credentials));
    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO integration_connections (organization_id, provider, status, account_email, encrypted_credentials, scopes, connected_by_user_id, updated_at, last_error)
         VALUES ($1, $2, 'connected', $3, $4, ARRAY[]::text[], $5, NOW(), NULL)
         ON CONFLICT (organization_id, provider) DO UPDATE SET
           status = 'connected', account_email = EXCLUDED.account_email, encrypted_credentials = EXCLUDED.encrypted_credentials,
           scopes = ARRAY[]::text[], connected_by_user_id = EXCLUDED.connected_by_user_id,
           last_error = NULL, updated_at = NOW()`,
        [user.organizationId, provider, accountName, encrypted, user.sub],
      );
      await client.query(
        `INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, 'security.integration.configured', 'integration', $3, $4)`,
        [user.organizationId, user.sub, provider, JSON.stringify({ provider })],
      );
    });
    return { configured: true, provider };
  }

  private validateWebhookUrl(provider: string, webhookUrl: string): URL {
    let url: URL;
    try { url = new URL(webhookUrl); } catch { throw new BadRequestException('Enter a valid HTTPS webhook URL.'); }
    const host = url.hostname.toLowerCase();
    const allowed = provider === 'zapier'
      ? host === 'hooks.zapier.com'
      : provider === 'make' && host.startsWith('hook.') && host.endsWith('.make.com');
    if (!allowed || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.pathname === '/') {
      throw new BadRequestException('Use the HTTPS webhook URL generated by your Zapier or Make account.');
    }
    return url;
  }

  async sendTestEvent(user: JwtPayload, provider: string) {
    this.assertCanManage(user.role);
    if (this.getConnector(provider).authMode !== 'webhook') {
      throw new BadRequestException('Test events are available for webhook connections.');
    }
    const stored = await this.db.query<{ encrypted_credentials: string }>(
      `SELECT encrypted_credentials FROM integration_connections
        WHERE organization_id = $1 AND provider = $2 AND status IN ('connected', 'error')`,
      [user.organizationId, provider],
    );
    const encrypted = stored.rows[0]?.encrypted_credentials;
    if (!encrypted) throw new BadRequestException('Configure the webhook before sending a test.');
    try {
      const credentials = this.decrypt(encrypted);
      const destination = this.validateWebhookUrl(provider, String(credentials.webhookUrl ?? ''));
      const response = await fetch(destination, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Lumorius-Integration/1.0' },
        body: JSON.stringify({ event: 'integration.test', occurredAt: new Date().toISOString(), data: { test: true, provider } }),
      });
      if (!response.ok) throw new Error('Webhook did not accept test event.');
    } catch {
      await this.db.query(`UPDATE integration_connections SET status = 'error', last_error = 'Test delivery failed.', updated_at = NOW()
        WHERE organization_id = $1 AND provider = $2 AND encrypted_credentials = $3`, [user.organizationId, provider, encrypted]);
      throw new ServiceUnavailableException('The webhook did not accept the test event. Check the URL and whether the receiving workflow is listening.');
    }
    await this.db.query(`UPDATE integration_connections SET status = 'connected', last_error = NULL, updated_at = NOW()
      WHERE organization_id = $1 AND provider = $2 AND encrypted_credentials = $3`, [user.organizationId, provider, encrypted]);
    return { delivered: true };
  }

  async disconnect(user: JwtPayload, provider: string) {
    this.assertCanManage(user.role);
    if (provider === 'stripe') throw new BadRequestException('Lumorius platform Stripe billing cannot be disconnected from the integrations page.');
    if (!CONNECTORS.some((item) => item.id === provider)) throw new BadRequestException('Unknown integration.');
    const deleted = await this.db.transaction(async (client) => {
      const result = await client.query(
        `DELETE FROM integration_connections
         WHERE organization_id = $1 AND provider = $2
         RETURNING id`,
        [user.organizationId, provider],
      );
      if (result.rowCount === 1) {
        await client.query(
          `INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
           VALUES ($1, $2, 'security.integration.disconnected', 'integration', $3, $4)`,
          [user.organizationId, user.sub, provider, JSON.stringify({ provider })],
        );
      }
      return result;
    });
    return { disconnected: deleted.rowCount === 1, provider };
  }

  async completeOAuth(provider: string, code: string | undefined, state: string | undefined, providerError?: string) {
    if (!state) throw new BadRequestException('OAuth state is missing.');
    const connector = this.getConnector(provider);
    if (!connector.vendor) throw new BadRequestException('This integration does not support OAuth.');
    const stateResult = await this.db.query<OAuthStateRow>(
      `DELETE FROM integration_oauth_states WHERE state_hash = $1 AND provider = $2 AND expires_at > NOW() RETURNING organization_id, user_id`,
      [this.hashState(state), provider],
    );
    const savedState = stateResult.rows[0];
    if (!savedState) throw new BadRequestException('OAuth state is invalid or expired. Restart the connection flow.');
    if (providerError) return this.resultRedirect(provider, 'error');
    if (!code) throw new BadRequestException('OAuth authorisation code is missing.');

    const client = this.getOAuthClient(connector.vendor);
    const tokenPayload = await this.exchangeOAuthToken(connector.vendor, code, this.callbackUri(provider), client, connector.scopes || []);
    if (typeof tokenPayload.access_token !== 'string' && typeof tokenPayload.accessToken !== 'string') {
      this.logger.warn(`OAuth token response did not include an access token for ${provider}.`);
      throw new ServiceUnavailableException('The provider did not return an access token. Check the OAuth application settings.');
    }
    if (typeof tokenPayload.expires_in === 'number') {
      tokenPayload.expires_at = Date.now() + Math.max(0, tokenPayload.expires_in - 60) * 1000;
    }

    const profile = await this.fetchProviderProfile(connector.vendor, tokenPayload).catch((error) => {
      this.logger.warn(`Could not verify profile for ${provider}: ${this.safeError(error)}`);
      return {} as Record<string, unknown>;
    });
    const email = this.accountIdentifier(connector.vendor, tokenPayload, profile);
    const scopes = typeof tokenPayload.scope === 'string'
      ? tokenPayload.scope.split(/[\s,]+/).filter(Boolean)
      : (connector.scopes ?? []);
    const encrypted = this.encrypt(JSON.stringify(tokenPayload));
    await this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO integration_connections (organization_id, provider, status, account_email, encrypted_credentials, scopes, connected_by_user_id, updated_at, last_error)
         VALUES ($1, $2, 'connected', $3, $4, $5, $6, NOW(), NULL)
         ON CONFLICT (organization_id, provider) DO UPDATE SET
           status = 'connected', account_email = EXCLUDED.account_email, encrypted_credentials = EXCLUDED.encrypted_credentials,
           scopes = EXCLUDED.scopes, connected_by_user_id = EXCLUDED.connected_by_user_id,
           last_error = NULL, updated_at = NOW(), authorization_revision = gen_random_uuid()`,
        [savedState.organization_id, provider, email, encrypted, scopes, savedState.user_id],
      );
      await client.query(
        `INSERT INTO audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, 'security.integration.connected', 'integration', $3, $4)`,
        [savedState.organization_id, savedState.user_id, provider, JSON.stringify({ provider })],
      );
    });
    return this.resultRedirect(provider, 'connected');
  }

  async syncForUser(user: JwtPayload, provider: string) {
    this.assertCanManage(user.role);
    const connector = this.getConnector(provider);
    await this.assertPlanAllows(user.organizationId, connector);
    if (!connector.syncSupported) throw new BadRequestException('This integration sends workflow events and does not sync content.');
    const connectionResult = await this.db.query<StoredConnection>(
      `SELECT provider, status, account_email, encrypted_credentials, connected_by_user_id, last_synced_at, last_error, authorization_revision
       FROM integration_connections WHERE organization_id = $1 AND provider = $2 LIMIT 1`,
      [user.organizationId, provider],
    );
    const connection = connectionResult.rows[0];
    if (!connection || !['connected', 'error'].includes(connection.status)) throw new BadRequestException('Connect this integration before syncing.');

    try {
      const credentials = await this.ensureFreshCredentials(provider, connection, user.organizationId);
      const items = await this.fetchRemoteItems(provider, credentials);
      let imported = 0;
      let skipped = 0;
      let unsupported = 0;
      const seen = new Set<string>();
      for (const item of items.slice(0, 100)) {
        if (!item.externalId || seen.has(item.externalId)) { skipped++; continue; }
        seen.add(item.externalId);
        const exists = await this.db.query(
          `SELECT id FROM integration_sync_items WHERE organization_id = $1 AND provider = $2 AND external_id = $3 LIMIT 1`,
          [user.organizationId, provider, item.externalId],
        );
        if (exists.rows.length) {
          if (item.crm) await this.storeCrmMetadata(user.organizationId,provider,item,connection.authorization_revision);
          skipped++; continue;
        }
        const file = this.toUploadFile(item);
        if (!file) { unsupported++; continue; }
        const uploaded = await this.documents.upload(
          file as any,
          user.organizationId,
          connection.connected_by_user_id || user.sub,
          { tags: [`integration:${provider}`, `source:${provider}`, `external:${createHash('sha256').update(item.externalId).digest('hex').slice(0, 20)}`] },
        );
        await this.db.query(
          `INSERT INTO integration_sync_items (organization_id, provider, external_id, document_id, external_url, source_updated_at, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW()) ON CONFLICT (organization_id, provider, external_id) DO NOTHING`,
          [user.organizationId, provider, item.externalId, uploaded.id, item.url ?? null, item.updatedAt ? new Date(item.updatedAt) : null],
        );
        if (item.crm) await this.storeCrmMetadata(user.organizationId,provider,item,connection.authorization_revision);
        imported++;
      }
      const syncId = uuidv4();
      const lastSyncedAt = new Date();
      await this.db.transaction(async (client) => {
        const updated = await client.query(
          `UPDATE integration_connections
              SET status = 'connected', last_synced_at = $3, last_error = NULL, updated_at = NOW()
            WHERE organization_id = $1 AND provider = $2
            RETURNING provider`,
          [user.organizationId, provider, lastSyncedAt],
        );
        if (!updated.rows[0]) {
          throw new ServiceUnavailableException('The integration connection disappeared before sync completion could be recorded.');
        }
        await this.luiePublisher.append(client, {
          organizationId: user.organizationId,
          eventKey: `integration.sync_completed:${provider}:${syncId}`,
          eventType: 'integration.sync_completed',
          aggregateType: 'integration_sync',
          aggregateId: syncId,
          actorId: user.sub,
          payload: { provider, fetched: items.length, imported, skipped, unsupported },
        }, ['luie.legacy-domain-bridge']);
      });
      return { provider, fetched: items.length, imported, skipped, unsupported, lastSyncedAt: lastSyncedAt.toISOString() };
    } catch (error) {
      await this.db.query(
        `UPDATE integration_connections SET status = 'error', last_error = $3, updated_at = NOW()
         WHERE organization_id = $1 AND provider = $2`,
        [user.organizationId, provider, this.safeError(error).slice(0, 400)],
      );
      throw error;
    }
  }

  private async storeCrmMetadata(org: string, provider: string, item: RemoteItem, revision?: string) {
    if (!revision || !item.crm) return;
    await this.db.query(`UPDATE integration_sync_items i SET crm_metadata=$4, crm_authorization_revision=$5, synced_at=now()
      FROM integration_connections c WHERE i.organization_id=$1 AND i.provider=$2 AND i.external_id=$3
      AND c.organization_id=i.organization_id AND c.provider=i.provider AND c.authorization_revision=$5`,
      [org,provider,item.externalId,JSON.stringify(item.crm),revision]);
  }

  private crmDate(value: unknown): string | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  // Send small, non-sensitive event envelopes to configured Zapier/Make webhooks.
  // This is intentionally allowlisted: source contents, credentials, and arbitrary objects are never forwarded.
  @OnEvent('task.assigned', { async: true })
  async onTaskAssigned(event: Record<string, unknown>) { await this.forwardWebhookEvent('task.assigned', event); }

  @OnEvent('task.completed', { async: true })
  async onTaskCompleted(event: Record<string, unknown>) { await this.forwardWebhookEvent('task.completed', event); }

  @OnEvent('workflow.completed', { async: true })
  async onWorkflowCompleted(event: Record<string, unknown>) { await this.forwardWebhookEvent('workflow.completed', event); }

  @OnEvent('workflow.failed', { async: true })
  async onWorkflowFailed(event: Record<string, unknown>) { await this.forwardWebhookEvent('workflow.failed', event); }

  @OnEvent('meeting.completed', { async: true })
  async onMeetingCompleted(event: Record<string, unknown>) { await this.forwardWebhookEvent('meeting.completed', event); }

  @OnEvent('document.indexed', { async: true })
  async onDocumentIndexed(event: Record<string, unknown>) { await this.forwardWebhookEvent('document.indexed', event); }

  @OnEvent('document.failed', { async: true })
  async onDocumentFailed(event: Record<string, unknown>) { await this.forwardWebhookEvent('document.failed', event); }

  @OnEvent('goal.achieved', { async: true })
  async onGoalAchieved(event: Record<string, unknown>) { await this.forwardWebhookEvent('goal.achieved', event); }

  @OnEvent('billing.subscription_attention', { async: true })
  async onBillingSubscriptionAttention(event: Record<string, unknown>) { await this.forwardWebhookEvent('billing.subscription_attention', event); }

  @OnEvent('ai.insight.created', { async: true })
  async onAIInsightCreated(event: Record<string, unknown>) { await this.forwardWebhookEvent('ai.insight.created', event); }

  @OnEvent('security.event.created', { async: true })
  async onSecurityEventCreated(event: Record<string, unknown>) { await this.forwardWebhookEvent('security.event.created', event); }

  @OnEvent('billing.payment_failed', { async: true })
  async onBillingPaymentFailed(event: Record<string, unknown>) { await this.forwardWebhookEvent('billing.payment_failed', event); }

  private async forwardWebhookEvent(eventName: string, event: Record<string, unknown>) {
    const organizationId = String(event.organizationId || event.organization_id || '').trim();
    if (!organizationId) return;
    try {
      const result = await this.db.query<{ provider: string; encrypted_credentials: string }>(
        `SELECT provider, encrypted_credentials FROM integration_connections
         WHERE organization_id = $1 AND provider = ANY($2::text[]) AND status IN ('connected', 'error')`,
        [organizationId, ['zapier', 'make']],
      );
      const allowedKeys = ['id', 'taskId', 'task_id', 'workflowId', 'workflow_id', 'meetingId', 'meeting_id', 'documentId', 'document_id', 'status', 'title', 'name', 'type', 'createdAt', 'created_at', 'updatedAt', 'updated_at'];
      const data: Record<string, string | number | boolean | null> = {};
      for (const key of allowedKeys) {
        const value = event[key];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          data[key] = value;
        }
      }
      for (const row of result.rows) {
        try {
          const credentials = this.decrypt(row.encrypted_credentials);
          const webhookUrl = String(credentials.webhookUrl || '');
          if (!webhookUrl) continue;
          const response = await fetch(this.validateWebhookUrl(row.provider, webhookUrl), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Lumorius-Integration/1.0' },
            body: JSON.stringify({ event: eventName, organizationId, occurredAt: new Date().toISOString(), data }),
            redirect: 'error',
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
          await this.db.query(
            `UPDATE integration_connections SET status = 'connected', last_error = NULL, updated_at = NOW() WHERE organization_id = $1 AND provider = $2`,
            [organizationId, row.provider],
          );
        } catch (error) {
          this.logger.warn(`Webhook delivery failed for ${row.provider}: ${this.safeError(error)}`);
          await this.db.query(
            `UPDATE integration_connections SET last_error = $3, status = 'error', updated_at = NOW() WHERE organization_id = $1 AND provider = $2`,
            [organizationId, row.provider, this.safeError(error).slice(0, 300)],
          ).catch(() => undefined);
        }
      }
    } catch (error) {
      this.logger.warn(`Integration webhook event ${eventName} could not be delivered: ${this.safeError(error)}`);
    }
  }

  resultRedirect(provider: string, status: 'connected' | 'error') {
    const appUrl = this.config.get<string>('appUrl', process.env.APP_URL || 'http://localhost:3000');
    const url = new URL('/integrations', appUrl);
    url.searchParams.set('integrationStatus', status);
    url.searchParams.set('provider', /^[a-z-]+$/.test(provider) ? provider : 'unknown');
    return url.toString();
  }

  private async fetchRemoteItems(provider: string, credentials: Record<string, any>): Promise<RemoteItem[]> {
    const token = String(credentials.access_token || credentials.accessToken || '');
    if (provider === 'google-drive') return this.syncGoogleDrive(token);
    if (provider === 'gmail') return this.syncGmail(token);
    if (provider === 'google-meet') return this.syncGoogleMeet(token);
    if (provider === 'onedrive') return this.syncOneDrive(token);
    if (provider === 'outlook-mail') return this.syncOutlookMail(token);
    if (provider === 'slack') return this.syncSlack(token);
    if (provider === 'notion') return this.syncNotion(token);
    if (provider === 'github') return this.syncGitHub(token);
    if (provider === 'jira') return this.syncJira(token);
    if (provider === 'zoom') return this.syncZoom(token);
    if (provider === 'hubspot') return this.syncHubSpot(token);
    if (provider === 'salesforce') return this.syncSalesforce(credentials);
    if (provider === 'linear') return this.syncLinear(token);
    if (provider === 'dropbox') return this.syncDropbox(token);
    if (provider === 'intercom') return this.syncIntercom(token);
    if (provider === 'pagerduty') return this.syncPagerDuty(token);
    if (provider === 'datadog') return this.syncDatadog(credentials);
    throw new BadRequestException('No content-sync handler exists for this integration.');
  }

  private async syncGoogleDrive(token: string): Promise<RemoteItem[]> {
    const params = new URLSearchParams({
      pageSize: '50', orderBy: 'modifiedTime desc',
      q: "trashed = false and mimeType != 'application/vnd.google-apps.folder'",
      fields: 'files(id,name,mimeType,modifiedTime,webViewLink,size)',
    });
    const data = await this.fetchJson(`https://www.googleapis.com/drive/v3/files?${params}`, token);
    const results: RemoteItem[] = [];
    for (const file of (data.files || []) as any[]) {
      let mimeType = String(file.mimeType || 'application/octet-stream');
      let buffer: Buffer | undefined;
      if (mimeType === 'application/vnd.google-apps.document') {
        mimeType = 'text/plain';
        buffer = await this.fetchBuffer(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text%2Fplain`, token);
      } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        mimeType = 'text/csv';
        buffer = await this.fetchBuffer(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text%2Fcsv`, token);
      } else if (mimeType === 'application/vnd.google-apps.presentation') {
        mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        buffer = await this.fetchBuffer(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(mimeType)}`, token);
      } else if (SUPPORTED_UPLOAD_MIME_TYPES.has(mimeType)) {
        buffer = await this.fetchBuffer(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, token);
      } else continue;
      results.push({ externalId: String(file.id), title: String(file.name || 'Google Drive file'), buffer, mimeType, url: file.webViewLink, updatedAt: file.modifiedTime });
    }
    return results;
  }

  private async syncGmail(token: string): Promise<RemoteItem[]> {
    const list = await this.fetchJson('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=25&q=newer_than:365d', token);
    const items: RemoteItem[] = [];
    for (const msg of (list.messages || []) as any[]) {
      const full = await this.fetchJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(msg.id)}?format=full`, token);
      const headers = (full.payload?.headers || []) as any[];
      const getHeader = (name: string) => headers.find((h) => String(h.name).toLowerCase() === name.toLowerCase())?.value || '';
      const subject = this.cleanText(String(getHeader('Subject') || '(No subject)'));
      const from = String(getHeader('From') || 'Unknown sender');
      const date = String(getHeader('Date') || '');
      const body = this.gmailBody(full.payload);
      const text = `Subject: ${subject}\nFrom: ${from}\nDate: ${date}\n\n${body || full.snippet || '(No readable message body)'}`;
      items.push({ externalId: String(msg.id), title: `Email - ${subject}`.slice(0, 180), text, mimeType: 'text/plain', url: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(msg.id)}`, updatedAt: full.internalDate ? new Date(Number(full.internalDate)).toISOString() : null });
    }
    return items;
  }

  private async syncGoogleMeet(token: string): Promise<RemoteItem[]> {
    const timeMin = new Date(Date.now() - 90 * 86400000).toISOString();
    const params = new URLSearchParams({ maxResults: '50', orderBy: 'startTime', singleEvents: 'true', timeMin });
    const data = await this.fetchJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, token);
    return ((data.items || []) as any[]).map((event) => ({
      externalId: String(event.id), title: `Meeting - ${event.summary || 'Untitled meeting'}`.slice(0, 180), mimeType: 'text/plain',
      url: event.htmlLink || event.hangoutLink || null,
      updatedAt: event.updated || event.start?.dateTime || null,
      text: [
        `Meeting: ${event.summary || 'Untitled meeting'}`, `Status: ${event.status || 'unknown'}`,
        `Start: ${event.start?.dateTime || event.start?.date || 'unknown'}`, `End: ${event.end?.dateTime || event.end?.date || 'unknown'}`,
        event.location ? `Location: ${event.location}` : '', event.hangoutLink ? `Meet link: ${event.hangoutLink}` : '',
        event.description || '', `Attendees: ${(event.attendees || []).map((a: any) => a.email).filter(Boolean).join(', ')}`,
      ].filter(Boolean).join('\n'),
    }));
  }

  private async syncOneDrive(token: string): Promise<RemoteItem[]> {
    const params = new URLSearchParams({ '$top': '50', '$select': 'id,name,file,folder,webUrl,lastModifiedDateTime,size' });
    const data = await this.fetchJson(`https://graph.microsoft.com/v1.0/me/drive/root/children?${params}`, token);
    const items: RemoteItem[] = [];
    for (const file of (data.value || []) as any[]) {
      if (!file.file || file.folder) continue;
      const mimeType = String(file.file.mimeType || this.mimeFromName(file.name));
      if (!SUPPORTED_UPLOAD_MIME_TYPES.has(mimeType)) continue;
      const downloadUrl = file['@microsoft.graph.downloadUrl'];
      if (!downloadUrl) continue;
      const buffer = await this.fetchBuffer(String(downloadUrl));
      items.push({ externalId: String(file.id), title: String(file.name), buffer, mimeType, url: file.webUrl, updatedAt: file.lastModifiedDateTime });
    }
    return items;
  }

  private async syncOutlookMail(token: string): Promise<RemoteItem[]> {
    const params = new URLSearchParams({ '$top': '25', '$orderby': 'receivedDateTime desc', '$select': 'id,subject,from,receivedDateTime,body,webLink' });
    const data = await this.fetchJson(`https://graph.microsoft.com/v1.0/me/messages?${params}`, token, { headers: { Prefer: 'outlook.body-content-type="text"' } });
    return ((data.value || []) as any[]).map((mail) => ({
      externalId: String(mail.id), title: `Email - ${mail.subject || '(No subject)'}`.slice(0, 180), mimeType: 'text/plain',
      url: mail.webLink || null, updatedAt: mail.receivedDateTime || null,
      text: `Subject: ${mail.subject || '(No subject)'}\nFrom: ${mail.from?.emailAddress?.address || 'Unknown sender'}\nReceived: ${mail.receivedDateTime || ''}\n\n${this.cleanText(String(mail.body?.content || '(No readable body)'))}`,
    }));
  }

  private async syncSlack(token: string): Promise<RemoteItem[]> {
    const channelData = await this.fetchJson('https://slack.com/api/conversations.list?limit=50&exclude_archived=true&types=public_channel,private_channel', token);
    if (channelData.ok === false) throw new ServiceUnavailableException(`Slack API error: ${String(channelData.error || 'request_failed')}`);
    const channels = ((channelData.channels || []) as any[]).slice(0, 20);
    const items: RemoteItem[] = [];
    const dayKey = new Date().toISOString().slice(0, 10);
    for (const channel of channels) {
      const history = await this.fetchJson(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(channel.id)}&limit=50`, token);
      if (history.ok === false) continue;
      const messages = ((history.messages || []) as any[]).filter((m) => String(m.text || '').trim());
      if (!messages.length) continue;
      const text = messages.reverse().map((m) => `[${m.ts || ''}] ${m.user ? `user:${m.user}` : 'message'}: ${m.text}`).join('\n\n');
      items.push({ externalId: `${channel.id}:${dayKey}`, title: `Slack #${channel.name || 'channel'} - ${dayKey}`, text: `Slack channel: #${channel.name}\nImported: ${new Date().toISOString()}\n\n${text}`, mimeType: 'text/plain', url: `https://app.slack.com/client/${channel.context_team_id || ''}/${channel.id}`, updatedAt: messages[messages.length - 1]?.ts ? new Date(Number(messages[messages.length - 1].ts) * 1000).toISOString() : null });
    }
    return items;
  }

  private async syncNotion(token: string): Promise<RemoteItem[]> {
    const search = await fetch('https://api.notion.com/v1/search', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' },
      body: JSON.stringify({ page_size: 50, sort: { direction: 'descending', timestamp: 'last_edited_time' }, filter: { property: 'object', value: 'page' } }),
    });
    const body = await search.json() as any;
    if (!search.ok) throw new ServiceUnavailableException('Notion search failed. Check the integration has access to the pages you want to sync.');
    const items: RemoteItem[] = [];
    for (const page of (body.results || []) as any[]) {
      const title = this.notionTitle(page);
      const content = await this.notionPageText(token, String(page.id), 0);
      items.push({ externalId: String(page.id), title: `Notion - ${title}`.slice(0, 180), text: `${title}\n\n${content || '(Page contains no readable text blocks)'}`, mimeType: 'text/plain', url: page.url, updatedAt: page.last_edited_time });
    }
    return items;
  }

  private async notionPageText(token: string, blockId: string, depth: number): Promise<string> {
    if (depth > 3) return '';
    const data = await this.fetchJson(`https://api.notion.com/v1/blocks/${encodeURIComponent(blockId)}/children?page_size=100`, token, { headers: { 'Notion-Version': '2022-06-28' } });
    const lines: string[] = [];
    for (const block of (data.results || []) as any[]) {
      const blockType = String(block.type || '');
      const value = block[blockType];
      const texts = (value?.rich_text || value?.title || []) as any[];
      const line = texts.map((x) => x.plain_text || x.text?.content || '').join('');
      if (line) lines.push(line);
      if (value?.checked !== undefined && line) lines[lines.length - 1] = `${value.checked ? '[x]' : '[ ]'} ${line}`;
      if (block.has_children) {
        const childText = await this.notionPageText(token, String(block.id), depth + 1);
        if (childText) lines.push(childText);
      }
    }
    return lines.join('\n');
  }

  private async syncGitHub(token: string): Promise<RemoteItem[]> {
    const data = await this.fetchJson('https://api.github.com/user/repos?per_page=30&sort=updated&affiliation=owner,collaborator,organization_member', token, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    const items: RemoteItem[] = [];
    for (const repo of (data || []) as any[]) {
      let readme = '';
      try {
        const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(repo.full_name)}/readme`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
        if (response.ok) {
          const readmePayload = await response.json() as any;
          readme = Buffer.from(String(readmePayload.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
        }
      } catch { /* A repository without a readable README is still represented by its metadata. */ }
      const details = `Repository: ${repo.full_name}\nDescription: ${repo.description || ''}\nDefault branch: ${repo.default_branch || ''}\nLanguage: ${repo.language || ''}\nUpdated: ${repo.updated_at || ''}\nURL: ${repo.html_url || ''}\n\nREADME\n${readme || '(No README accessible)'}`;
      items.push({ externalId: `repo:${repo.id}`, title: `GitHub - ${repo.full_name} README`, text: details, mimeType: 'text/markdown', url: repo.html_url, updatedAt: repo.updated_at });
    }
    return items;
  }

  private async syncJira(token: string): Promise<RemoteItem[]> {
    const sitesResponse = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const sites = await sitesResponse.json() as any;
    if (!sitesResponse.ok || !Array.isArray(sites) || !sites[0]?.id) throw new ServiceUnavailableException('No Jira Cloud site is accessible to this authorised account.');
    const cloudId = String(sites[0].id);
    const params = new URLSearchParams({ jql: 'ORDER BY updated DESC', maxResults: '50', fields: 'summary,description,updated,created,issuetype,project,status,assignee' });
    const result = await this.fetchJson(`https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3/search?${params}`, token);
    return ((result.issues || []) as any[]).map((issue) => ({
      externalId: `issue:${issue.id}`, title: `Jira - ${issue.key}: ${issue.fields?.summary || ''}`.slice(0, 180), mimeType: 'text/plain',
      url: `${sites[0].url}/browse/${issue.key}`, updatedAt: issue.fields?.updated,
      text: `Jira issue: ${issue.key}\nSummary: ${issue.fields?.summary || ''}\nProject: ${issue.fields?.project?.name || ''}\nType: ${issue.fields?.issuetype?.name || ''}\nStatus: ${issue.fields?.status?.name || ''}\nAssignee: ${issue.fields?.assignee?.displayName || ''}\nCreated: ${issue.fields?.created || ''}\nUpdated: ${issue.fields?.updated || ''}\n\nDescription:\n${this.adfText(issue.fields?.description)}`,
    }));
  }

  private async syncZoom(token: string): Promise<RemoteItem[]> {
    const now = new Date();
    const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    const data = await this.fetchJson(`https://api.zoom.us/v2/users/me/recordings?from=${from}&to=${to}&page_size=30`, token);
    const items: RemoteItem[] = [];
    for (const meeting of (data.meetings || []) as any[]) {
      const files = (meeting.recording_files || []) as any[];
      const transcript = files.find((f) => ['TRANSCRIPT', 'CC'].includes(String(f.file_type || '').toUpperCase()) && f.download_url);
      let transcriptText = '';
      if (transcript?.download_url) {
        try {
          const buf = await this.fetchBuffer(String(transcript.download_url), token);
          transcriptText = buf.toString('utf8').replace(/^WEBVTT.*$/m, '').replace(/^\d+$/gm, '').trim();
        } catch { transcriptText = ''; }
      }
      items.push({ externalId: `meeting:${meeting.uuid || meeting.id}`, title: `Zoom - ${meeting.topic || 'Meeting'}`.slice(0, 180), mimeType: 'text/plain',
        url: meeting.share_url || null, updatedAt: meeting.end_time || meeting.start_time,
        text: `Meeting: ${meeting.topic || 'Meeting'}\nHost: ${meeting.host_email || ''}\nStart: ${meeting.start_time || ''}\nDuration: ${meeting.duration || ''} minutes\nParticipants: ${meeting.participant_count || ''}\nRecording link: ${meeting.share_url || ''}\n\nTranscript\n${transcriptText || '(No transcript was available or the account does not have transcript access).'}` });
    }
    return items;
  }

  private async syncHubSpot(token: string): Promise<RemoteItem[]> {
    const definitions = [
      { kind: 'contacts', props: 'firstname,lastname,email,company,jobtitle,lifecyclestage,notes_last_contacted,createdate,lastmodifieddate' },
      { kind: 'deals', props: 'dealname,amount,dealstage,closedate,pipeline,notes_last_contacted,hs_is_closed,createdate,lastmodifieddate' },
      { kind: 'companies', props: 'name,domain,industry,city,country,createdate,hs_lastmodifieddate' },
    ];
    const items: RemoteItem[] = [];
    for (const definition of definitions) {
      const params = new URLSearchParams({ limit: '50', properties: definition.props });
      const data = await this.fetchJson(`https://api.hubapi.com/crm/v3/objects/${definition.kind}?${params}`, token);
      for (const record of (data.results || []) as any[]) {
        const properties = record.properties || {};
        const name = properties.dealname || properties.name || [properties.firstname, properties.lastname].filter(Boolean).join(' ') || record.id;
        items.push({ externalId: `${definition.kind}:${record.id}`, title: `HubSpot ${definition.kind.slice(0, -1)} - ${name}`.slice(0, 180), mimeType: 'text/plain', url: record.url || `https://app.hubspot.com/`, updatedAt: properties.lastmodifieddate || properties.hs_lastmodifieddate || null,
          crm: definition.kind === 'companies' ? undefined : { kind: definition.kind === 'deals' ? 'deal' : 'contact', name:String(name).slice(0,180),
            stage: String(properties.dealstage || properties.lifecyclestage || '').slice(0,80) || null,
            lastActivity:this.crmDate(properties.notes_last_contacted), closeDate:this.crmDate(properties.closedate),
            closed:properties.hs_is_closed === 'true' ? true : properties.hs_is_closed === 'false' ? false : null },
          text: `HubSpot record type: ${definition.kind}\nName: ${name}\nRecord ID: ${record.id}\n${Object.entries(properties).map(([k, v]) => `${k}: ${String(v ?? '')}`).join('\n')}` });
      }
    }
    return items;
  }

  private async syncSalesforce(credentials: Record<string, any>): Promise<RemoteItem[]> {
    const token = String(credentials.access_token || '');
    const base = String(credentials.instance_url || '');
    if (!token || !/^https:\/\//.test(base)) throw new ServiceUnavailableException('Salesforce connection does not contain a usable instance URL. Reconnect it.');
    const version = String(process.env.SALESFORCE_API_VERSION || 'v61.0');
    const queries = [
      { kind: 'Account', soql: 'SELECT Id,Name,Type,Industry,Website,LastModifiedDate FROM Account ORDER BY LastModifiedDate DESC LIMIT 25' },
      { kind: 'Opportunity', soql: 'SELECT Id,Name,StageName,Amount,CloseDate,LastActivityDate,IsClosed,LastModifiedDate FROM Opportunity ORDER BY LastModifiedDate DESC LIMIT 25' },
      { kind: 'Contact', soql: 'SELECT Id,Name,Email,Title,Department,LastActivityDate,LastModifiedDate FROM Contact ORDER BY LastModifiedDate DESC LIMIT 25' },
    ];
    const items: RemoteItem[] = [];
    for (const q of queries) {
      const data = await this.fetchJson(`${base}/services/data/${version}/query?q=${encodeURIComponent(q.soql)}`, token);
      for (const record of (data.records || []) as any[]) {
        const name = String(record.Name || record.Id);
        items.push({ externalId: `${q.kind}:${record.Id}`, title: `Salesforce ${q.kind} - ${name}`.slice(0, 180), mimeType: 'text/plain', url: `${base}/${record.Id}`, updatedAt: record.LastModifiedDate,
          crm: q.kind === 'Account' ? undefined : { kind:q.kind === 'Opportunity' ? 'deal' : 'contact', name:name.slice(0,180),
            stage:typeof record.StageName === 'string' ? record.StageName.slice(0,80) : null,
            lastActivity:this.crmDate(record.LastActivityDate), closeDate:this.crmDate(record.CloseDate), closed:typeof record.IsClosed === 'boolean' ? record.IsClosed : null },
          text: `Salesforce object: ${q.kind}\n${Object.entries(record).filter(([k]) => !k.startsWith('attributes')).map(([k, v]) => `${k}: ${String(v ?? '')}`).join('\n')}` });
      }
    }
    return items;
  }

  private async syncLinear(token: string): Promise<RemoteItem[]> {
    const response = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ issues(first: 50) { nodes { id identifier title description url updatedAt createdAt state { name } assignee { name } team { name } } } }' }) });
    const data = await response.json() as any;
    if (!response.ok || data.errors?.length) throw new ServiceUnavailableException('Linear API request failed. Check the connected workspace permissions.');
    return ((data.data?.issues?.nodes || []) as any[]).map((issue) => ({ externalId: `issue:${issue.id}`, title: `Linear - ${issue.identifier}: ${issue.title}`.slice(0, 180), mimeType: 'text/plain', url: issue.url, updatedAt: issue.updatedAt,
      text: `Linear issue: ${issue.identifier}\nTitle: ${issue.title}\nTeam: ${issue.team?.name || ''}\nState: ${issue.state?.name || ''}\nAssignee: ${issue.assignee?.name || ''}\nCreated: ${issue.createdAt || ''}\nUpdated: ${issue.updatedAt || ''}\n\n${issue.description || ''}` }));
  }

  private async syncDropbox(token: string): Promise<RemoteItem[]> {
    const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '', recursive: true, limit: 100 }) });
    const data = await response.json() as any;
    if (!response.ok) throw new ServiceUnavailableException('Dropbox file listing failed. Check access and file permissions.');
    const items: RemoteItem[] = [];
    for (const entry of (data.entries || []) as any[]) {
      if (entry['.tag'] !== 'file') continue;
      const mimeType = this.mimeFromName(entry.name);
      if (!SUPPORTED_UPLOAD_MIME_TYPES.has(mimeType)) continue;
      const download = await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Dropbox-API-Arg': JSON.stringify({ path: entry.path_lower }), 'Content-Type': 'application/octet-stream' } });
      if (!download.ok) continue;
      items.push({ externalId: String(entry.id || entry.path_lower), title: String(entry.name), buffer: Buffer.from(await download.arrayBuffer()), mimeType, url: null, updatedAt: entry.server_modified });
    }
    return items;
  }

  private async syncIntercom(token: string): Promise<RemoteItem[]> {
    const headers = { 'Intercom-Version': '2.11' };
    const contacts = await this.fetchJson('https://api.intercom.io/contacts?per_page=50', token, { headers });
    const conversations = await this.fetchJson('https://api.intercom.io/conversations?per_page=50', token, { headers });
    const items: RemoteItem[] = [];
    for (const contact of (contacts.data || []) as any[]) {
      const name = [contact.name, contact.email].filter(Boolean).join(' — ') || contact.id;
      items.push({ externalId: `contact:${contact.id}`, title: `Intercom contact - ${name}`.slice(0, 180), mimeType: 'text/plain', url: contact.id ? `https://app.intercom.com/a/apps/${contact.app_id || ''}/users/${contact.id}` : null, updatedAt: contact.updated_at ? new Date(Number(contact.updated_at) * 1000).toISOString() : null,
        text: `Intercom contact: ${name}\nID: ${contact.id}\nEmail: ${contact.email || ''}\nRole: ${contact.role || ''}\nCompany: ${contact.companies?.data?.map((c: any) => c.name).join(', ') || ''}\nLast seen: ${contact.last_seen_at || ''}` });
    }
    for (const conv of (conversations.conversations || conversations.data || []) as any[]) {
      items.push({ externalId: `conversation:${conv.id}`, title: `Intercom conversation - ${conv.title || conv.id}`.slice(0, 180), mimeType: 'text/plain', url: null, updatedAt: conv.updated_at ? new Date(Number(conv.updated_at) * 1000).toISOString() : null,
        text: `Intercom conversation: ${conv.title || ''}\nID: ${conv.id}\nState: ${conv.state || ''}\nCreated: ${conv.created_at || ''}\nUpdated: ${conv.updated_at || ''}\nPriority: ${conv.priority || ''}` });
    }
    return items;
  }

  private async syncPagerDuty(token: string): Promise<RemoteItem[]> {
    const data = await this.fetchJson('https://api.pagerduty.com/incidents?limit=50&sort_by=created_at:desc', token, { headers: { Accept: 'application/vnd.pagerduty+json;version=2' } });
    return ((data.incidents || []) as any[]).map((incident) => ({ externalId: `incident:${incident.id}`, title: `PagerDuty incident - ${incident.title || incident.id}`.slice(0, 180), mimeType: 'text/plain', url: incident.html_url, updatedAt: incident.last_status_change_at || incident.created_at,
      text: `PagerDuty incident: ${incident.title || ''}\nID: ${incident.id}\nStatus: ${incident.status || ''}\nUrgency: ${incident.urgency || ''}\nService: ${incident.service?.summary || ''}\nAssigned to: ${(incident.assignments || []).map((a: any) => a.assignee?.summary).filter(Boolean).join(', ')}\nCreated: ${incident.created_at || ''}\nLast status change: ${incident.last_status_change_at || ''}\n\n${incident.description || ''}` }));
  }

  private async syncDatadog(credentials: Record<string, any>): Promise<RemoteItem[]> {
    const from = new Date(Date.now() - 30 * 86400000).toISOString();
    const params = new URLSearchParams({ 'filter[from]': from, 'page[limit]': '50' });
    const data = await this.fetchJson(`${String(credentials.site || this.datadogBaseUrl())}/api/v2/events?${params}`, '', { headers: { 'DD-API-KEY': String(credentials.apiKey), 'DD-APPLICATION-KEY': String(credentials.appKey) } });
    return ((data.data || []) as any[]).map((event) => ({ externalId: `event:${event.id}`, title: `Datadog event - ${event.attributes?.title || event.id}`.slice(0, 180), mimeType: 'text/plain', url: event.attributes?.url, updatedAt: event.attributes?.timestamp,
      text: `Datadog event: ${event.attributes?.title || ''}\nID: ${event.id}\nDate: ${event.attributes?.timestamp || ''}\nSource: ${event.attributes?.source || ''}\nTags: ${(event.attributes?.tags || []).join(', ')}\n\n${event.attributes?.message || ''}` }));
  }

  private async fetchProviderProfile(vendor: OAuthVendor, tokenPayload: Record<string, any>): Promise<Record<string, unknown>> {
    const token = String(tokenPayload.access_token || tokenPayload.accessToken || '');
    if (vendor === 'notion') return tokenPayload;
    if (vendor === 'salesforce' && tokenPayload.id) {
      try { return await this.fetchJson(String(tokenPayload.id), token); } catch { return tokenPayload; }
    }
    if (vendor === 'dropbox') {
      const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: 'null' });
      if (!response.ok) return tokenPayload;
      return await response.json() as Record<string, unknown>;
    }
    if (vendor === 'linear') {
      const response = await fetch('https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: '{ viewer { id name email } }' }) });
      if (!response.ok) return tokenPayload;
      const data = await response.json() as any;
      return data.data?.viewer || tokenPayload;
    }
    if (vendor === 'jira') {
      const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return tokenPayload;
      const data = await response.json() as any;
      return Array.isArray(data) ? (data[0] || tokenPayload) : tokenPayload;
    }
    if (vendor === 'slack') return await this.fetchJson('https://slack.com/api/auth.test', token);
    if (vendor === 'github') return await this.fetchJson('https://api.github.com/user', token, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (vendor === 'zoom') return await this.fetchJson('https://api.zoom.us/v2/users/me', token);
    if (vendor === 'hubspot') return await this.fetchJson(`https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(token)}`, '');
    if (vendor === 'intercom') return await this.fetchJson('https://api.intercom.io/me', token, { headers: { 'Intercom-Version': '2.11' } });
    if (vendor === 'pagerduty') return await this.fetchJson('https://api.pagerduty.com/users/me', token, { headers: { Accept: 'application/vnd.pagerduty+json;version=2' } });
    const profileUrl = vendor === 'google'
      ? 'https://www.googleapis.com/oauth2/v2/userinfo'
      : 'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName';
    return this.fetchJson(profileUrl, token);
  }

  private accountIdentifier(vendor: OAuthVendor, token: Record<string, any>, profile: Record<string, any>): string | null {
    const email = profile.email || profile.mail || profile.userPrincipalName || profile.username;
    const fallback = vendor === 'notion'
      ? profile.workspace_name || profile.owner?.user?.person?.email
      : vendor === 'slack' ? profile.team || profile.team_id
      : vendor === 'jira' ? profile.name || profile.url
      : vendor === 'dropbox' ? profile.name?.display_name
      : vendor === 'salesforce' ? profile.username || token.instance_url
      : vendor === 'zoom' ? profile.email
      : profile.name || profile.login || profile.email;
    return String(email || fallback || '').trim() || null;
  }

  private async exchangeOAuthToken(vendor: OAuthVendor, code: string, redirectUri: string, client: OAuthClient, scopes: string[]): Promise<Record<string, any>> {
    const spec = this.oauthSpec(vendor);
    const form = new URLSearchParams({ code, grant_type: 'authorization_code', redirect_uri: redirectUri });
    if (vendor !== 'notion' && vendor !== 'zoom' && vendor !== 'dropbox' && vendor !== 'pagerduty') {
      form.set('client_id', client.clientId);
      form.set('client_secret', client.clientSecret);
    }
    if (vendor === 'microsoft') form.set('scope', scopes.join(' ') || 'openid profile email offline_access');
    let headers: Record<string, string> = { Accept: 'application/json' };
    let body: string;
    if (spec.tokenMode === 'json' && vendor !== 'notion') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ client_id: client.clientId, client_secret: client.clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri, ...(vendor === 'jira' ? { audience: 'api.atlassian.com' } : {}) });
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      if (spec.tokenMode === 'basic-form') {
        headers.Authorization = `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64')}`;
        form.delete('client_id'); form.delete('client_secret');
      }
      if (vendor === 'notion') {
        headers = { ...headers, Authorization: `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/json' };
        body = JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
      } else {
        if (vendor === 'slack') { form.set('client_id', client.clientId); form.set('client_secret', client.clientSecret); }
        if (vendor === 'zoom') form.set('grant_type', 'authorization_code');
        body = form.toString();
      }
    }
    const response = await fetch(spec.tokenUrl, { method: 'POST', headers, body: body! });
    const payload = await response.json().catch(() => ({})) as Record<string, any>;
    if (!response.ok || payload.error || payload.ok === false || (!payload.access_token && !payload.accessToken)) {
      this.logger.warn(`OAuth token exchange failed for ${vendor} (HTTP ${response.status}).`);
      throw new ServiceUnavailableException('Provider token exchange failed. Check client credentials, provider permissions and callback URL.');
    }
    return payload;
  }

  private oauthSpec(vendor: OAuthVendor): OAuthSpec {
    const specs: Record<OAuthVendor, OAuthSpec> = {
      google: { authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', tokenMode: 'form' },
      microsoft: { authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', tokenMode: 'form' },
      slack: { authorizeUrl: 'https://slack.com/oauth/v2/authorize', tokenUrl: 'https://slack.com/api/oauth.v2.access', tokenMode: 'form', scopeDelimiter: ',', extraAuthorizeParams: {} },
      notion: { authorizeUrl: 'https://api.notion.com/v1/oauth/authorize', tokenUrl: 'https://api.notion.com/v1/oauth/token', tokenMode: 'json', extraAuthorizeParams: { owner: 'user' } },
      github: { authorizeUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token', tokenMode: 'form' },
      jira: { authorizeUrl: 'https://auth.atlassian.com/authorize', tokenUrl: 'https://auth.atlassian.com/oauth/token', tokenMode: 'json', extraAuthorizeParams: { audience: 'api.atlassian.com', prompt: 'consent' } },
      zoom: { authorizeUrl: 'https://zoom.us/oauth/authorize', tokenUrl: 'https://zoom.us/oauth/token', tokenMode: 'basic-form' },
      hubspot: { authorizeUrl: 'https://app.hubspot.com/oauth/authorize', tokenUrl: 'https://api.hubapi.com/oauth/v1/token', tokenMode: 'form' },
      salesforce: { authorizeUrl: `${String(process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com').replace(/\/$/, '')}/services/oauth2/authorize`, tokenUrl: `${String(process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com').replace(/\/$/, '')}/services/oauth2/token`, tokenMode: 'form' },
      linear: { authorizeUrl: 'https://linear.app/oauth/authorize', tokenUrl: 'https://api.linear.app/oauth/token', tokenMode: 'form' },
      dropbox: { authorizeUrl: 'https://www.dropbox.com/oauth2/authorize', tokenUrl: 'https://api.dropboxapi.com/oauth2/token', tokenMode: 'basic-form' },
      intercom: { authorizeUrl: 'https://app.intercom.com/oauth', tokenUrl: 'https://api.intercom.io/auth/eagle/token', tokenMode: 'form' },
      pagerduty: { authorizeUrl: 'https://identity.pagerduty.com/oauth/authorize', tokenUrl: 'https://identity.pagerduty.com/oauth/token', tokenMode: 'basic-form' },
    };
    return { ...specs[vendor], scopes: this.scopesForVendor(vendor) };
  }

  private scopesForVendor(vendor: OAuthVendor): string[] {
    const connector = CONNECTORS.find((item) => item.vendor === vendor);
    // OAuth clients shared by multiple connectors may request different scopes. Request the union so a single saved app config can support both.
    const scopes = CONNECTORS.filter((item) => item.vendor === vendor).flatMap((item) => item.scopes || []);
    return Array.from(new Set(scopes.length ? scopes : (connector?.scopes || [])));
  }

  private getConnector(provider: string): ConnectorDefinition {
    const connector = CONNECTORS.find((item) => item.id === provider);
    if (!connector) throw new BadRequestException('Unknown integration.');
    return connector;
  }

  private getOAuthClient(vendor: OAuthVendor): OAuthClient {
    const envPrefix: Record<OAuthVendor, string> = {
      google: 'GOOGLE', microsoft: 'MICROSOFT', slack: 'SLACK', notion: 'NOTION', github: 'GITHUB',
      jira: 'ATLASSIAN', zoom: 'ZOOM', hubspot: 'HUBSPOT', salesforce: 'SALESFORCE', linear: 'LINEAR',
      dropbox: 'DROPBOX', intercom: 'INTERCOM', pagerduty: 'PAGERDUTY',
    };
    const prefix = envPrefix[vendor];
    const configPath = vendor === 'google' || vendor === 'microsoft' ? vendor : '';
    const clientId = (configPath ? this.config.get<string>(`oauth.${configPath}.clientId`) : '') || process.env[`${prefix}_CLIENT_ID`] || '';
    const clientSecret = (configPath ? this.config.get<string>(`oauth.${configPath}.clientSecret`) : '') || process.env[`${prefix}_CLIENT_SECRET`] || '';
    return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
  }

  private oauthConfigured(vendor: OAuthVendor) {
    const client = this.getOAuthClient(vendor);
    return Boolean(client.clientId && client.clientSecret && /^[a-fA-F0-9]{64}$/.test(process.env.INTEGRATION_ENCRYPTION_KEY || ''));
  }

  private requiredEnvNames(connector: ConnectorDefinition) {
    if (connector.vendor) {
      const prefixes: Record<OAuthVendor, string> = { google: 'GOOGLE', microsoft: 'MICROSOFT', slack: 'SLACK', notion: 'NOTION', github: 'GITHUB', jira: 'ATLASSIAN', zoom: 'ZOOM', hubspot: 'HUBSPOT', salesforce: 'SALESFORCE', linear: 'LINEAR', dropbox: 'DROPBOX', intercom: 'INTERCOM', pagerduty: 'PAGERDUTY' };
      return `${prefixes[connector.vendor]}_CLIENT_ID and ${prefixes[connector.vendor]}_CLIENT_SECRET`;
    }
    return connector.authMode === 'api_key' ? 'Datadog API/app keys' : 'a provider webhook URL';
  }

  private callbackUri(provider: string) {
    const base = String(process.env.INTEGRATIONS_API_BASE_URL || 'http://localhost:3001/api/v1').replace(/\/+$/, '');
    return `${base}/integrations/${provider}/callback`;
  }
  private assertCanManage(role: string | undefined | null) {
    if (!['owner', 'admin'].includes(String(role || '').toLowerCase())) throw new ForbiddenException('Only an organisation owner or admin can manage integrations.');
  }
  private hashState(state: string) { return createHash('sha256').update(state).digest('hex'); }

  private encrypt(plainText: string) {
    const keyHex = process.env.INTEGRATION_ENCRYPTION_KEY || '';
    if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) throw new ServiceUnavailableException('INTEGRATION_ENCRYPTION_KEY must be a 64-character hex key on the API server.');
    const key = Buffer.from(keyHex, 'hex');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  private decrypt(payload: string) {
    const keyHex = process.env.INTEGRATION_ENCRYPTION_KEY || '';
    if (!/^[a-fA-F0-9]{64}$/.test(keyHex)) throw new ServiceUnavailableException('Integration encryption key is not configured.');
    const [ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) throw new ServiceUnavailableException('Saved integration credentials are invalid. Reconnect this integration.');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]);
    return JSON.parse(plain.toString('utf8')) as Record<string, any>;
  }

  private async ensureFreshCredentials(provider: string, connection: StoredConnection, organizationId: string): Promise<Record<string, any>> {
    const credentials = this.decrypt(connection.encrypted_credentials);
    const expiry = Number(credentials.expires_at || 0);
    if (!expiry || expiry > Date.now()) return credentials;
    if (!credentials.refresh_token) throw new BadRequestException('This connection has expired. Reconnect the provider and retry.');
    const connector = this.getConnector(provider);
    if (!connector.vendor) return credentials;
    const vendor = connector.vendor;
    const client = this.getOAuthClient(vendor);
    let tokenPayload: Record<string, any> = {};
    const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: String(credentials.refresh_token) });
    const spec = this.oauthSpec(vendor);
    let headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    if (vendor === 'notion' || vendor === 'intercom' || vendor === 'pagerduty' || vendor === 'linear') return credentials;
    if (vendor === 'jira') {
      headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
      const response = await fetch(spec.tokenUrl, { method: 'POST', headers, body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: credentials.refresh_token, client_id: client.clientId, client_secret: client.clientSecret }) });
      tokenPayload = await response.json().catch(() => ({})) as any;
      if (!response.ok || !tokenPayload.access_token) throw new ServiceUnavailableException('Jira OAuth token expired. Reconnect Jira and try again.');
    } else {
      if (vendor === 'google' || vendor === 'microsoft' || vendor === 'slack' || vendor === 'hubspot' || vendor === 'salesforce' || vendor === 'github') {
        form.set('client_id', client.clientId); form.set('client_secret', client.clientSecret);
      }
      if (vendor === 'microsoft') form.set('scope', (this.getConnector(provider).scopes || []).join(' '));
      if (vendor === 'zoom' || vendor === 'dropbox') {
        headers.Authorization = `Basic ${Buffer.from(`${client.clientId}:${client.clientSecret}`).toString('base64')}`;
      }
      const response = await fetch(spec.tokenUrl, { method: 'POST', headers, body: form.toString() });
      tokenPayload = await response.json().catch(() => ({})) as any;
      if (!response.ok || !tokenPayload.access_token) throw new ServiceUnavailableException(`${provider} OAuth token expired. Reconnect and try again.`);
    }
    const refreshed = { ...credentials, ...tokenPayload };
    if (typeof refreshed.expires_in === 'number') refreshed.expires_at = Date.now() + Math.max(0, refreshed.expires_in - 60) * 1000;
    const encrypted = this.encrypt(JSON.stringify(refreshed));
    await this.db.query('UPDATE integration_connections SET encrypted_credentials = $3, updated_at = NOW() WHERE organization_id = $1 AND provider = $2', [organizationId, provider, encrypted]);
    return refreshed;
  }

  private async fetchJson(url: string, token: string, init: RequestInit = {}): Promise<any> {
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    const response = await fetch(url, { ...init, headers });
    const data = await response.json().catch(() => ({})) as any;
    if (!response.ok) {
      const detail = data?.error?.message || data?.message || data?.error || `HTTP ${response.status}`;
      throw new ServiceUnavailableException(`Connector API request failed (${String(detail).slice(0, 140)}). Check granted scopes and provider setup.`);
    }
    return data;
  }

  private async fetchBuffer(url: string, token?: string): Promise<Buffer> {
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { headers });
    if (!response.ok) throw new ServiceUnavailableException(`Source file download failed (HTTP ${response.status}).`);
    return Buffer.from(await response.arrayBuffer());
  }

  private toUploadFile(item: RemoteItem): { originalname: string; mimetype: string; size: number; buffer: Buffer } | null {
    let mimeType = item.mimeType || 'text/plain';
    let buffer = item.buffer;
    if (!buffer) {
      if (typeof item.text !== 'string') return null;
      buffer = Buffer.from(item.text, 'utf8');
      mimeType = item.mimeType || 'text/plain';
    }
    if (!SUPPORTED_UPLOAD_MIME_TYPES.has(mimeType)) return null;
    if (buffer.length === 0 || buffer.length > 15 * 1024 * 1024) return null;
    let name = this.cleanFilename(item.title || 'Imported content');
    const extension = this.extensionForMime(mimeType);
    if (!name.toLowerCase().endsWith(`.${extension}`)) name += `.${extension}`;
    return { originalname: name.slice(0, 180), mimetype: mimeType, size: buffer.length, buffer };
  }

  private extensionForMime(mimeType: string) {
    const map: Record<string, string> = {
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'text/csv': 'csv',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'text/markdown': 'md',
      'text/plain': 'txt',
    };
    return map[mimeType] || 'txt';
  }
  private mimeFromName(name: string) {
    const ext = String(name || '').split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', md: 'text/markdown', txt: 'text/plain',
    };
    return map[ext || ''] || 'application/octet-stream';
  }
  private cleanFilename(value: string) { return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Imported content'; }
  private cleanText(value: string) { return value.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); }
  private gmailBody(payload: any): string {
    const collect = (part: any): string[] => {
      const output: string[] = [];
      const mime = String(part?.mimeType || '');
      const data = part?.body?.data;
      if (data && mime === 'text/plain') output.push(Buffer.from(String(data), 'base64url').toString('utf8'));
      for (const child of (part?.parts || []) as any[]) output.push(...collect(child));
      if (!output.length && data && mime === 'text/html') output.push(this.cleanText(Buffer.from(String(data), 'base64url').toString('utf8')));
      return output;
    };
    return collect(payload).join('\n\n').slice(0, 150000);
  }
  private notionTitle(page: any) {
    const props = page.properties || {};
    for (const value of Object.values(props) as any[]) {
      if (value?.type === 'title' && Array.isArray(value.title)) return value.title.map((t: any) => t.plain_text || '').join('') || 'Untitled page';
    }
    return 'Untitled page';
  }
  private adfText(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map((v) => this.adfText(v)).filter(Boolean).join('\n');
    const own = typeof value.text === 'string' ? value.text : '';
    const children = value.content ? this.adfText(value.content) : '';
    return [own, children].filter(Boolean).join(' ');
  }
  private datadogBaseUrl() {
    let site = String(process.env.DATADOG_SITE || 'datadoghq.com').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (site.startsWith('api.')) return `https://${site}`;
    return `https://api.${site}`;
  }
  private safeError(error: unknown) {
    if (error instanceof Error) return error.message.replace(/(access_token|refresh_token|client_secret|apiKey|appKey)[=: ][^\s&]+/gi, '$1=[redacted]');
    return String(error);
  }
}

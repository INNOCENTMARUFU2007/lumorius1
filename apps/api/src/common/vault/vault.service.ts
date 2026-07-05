import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as http from 'http';

interface VaultSecret {
  data: Record<string, string>;
  lease_duration: number;
  renewable: boolean;
}

@Injectable()
export class VaultService implements OnModuleInit {
  private readonly logger = new Logger(VaultService.name);
  private readonly enabled: boolean;
  private readonly address: string;
  private readonly token: string;
  private readonly mountPath: string;
  private readonly secretPath: string;
  private readonly renewIntervalMs = 60_000;
  private renewTimer?: ReturnType<typeof setInterval>;

  constructor(private readonly config: ConfigService) {
    this.address    = this.config.get<string>('VAULT_ADDR', '');
    this.token      = this.config.get<string>('VAULT_TOKEN', '');
    this.mountPath  = this.config.get<string>('VAULT_MOUNT', 'secret');
    this.secretPath = this.config.get<string>('VAULT_SECRET_PATH', 'lumorius/prod');
    this.enabled    = !!(this.address && this.token);
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('Vault not configured — using env-based secrets (development mode)');
      return;
    }
    try {
      await this.renewToken();
      this.renewTimer = setInterval(() => this.renewToken(), this.renewIntervalMs);
      this.logger.log('Vault token renewal scheduled');
    } catch (err) {
      this.logger.error('Vault initialisation failed', err);
    }
  }

  private request<T>(method: string, path: string, body?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.address}/v1/${path}`);
      const isHttps = url.protocol === 'https:';
      const options: http.RequestOptions = {
        hostname : url.hostname,
        port     : url.port || (isHttps ? 443 : 80),
        path     : url.pathname + url.search,
        method,
        headers  : {
          'X-Vault-Token' : this.token,
          'Content-Type'  : 'application/json',
        },
      };
      const req = (isHttps ? https : http).request(options, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`Vault ${method} ${path} → ${res.statusCode}: ${raw}`));
            } else {
              resolve(raw ? (JSON.parse(raw) as T) : ({} as T));
            }
          } catch {
            reject(new Error(`Failed to parse Vault response: ${raw}`));
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async getSecret(path?: string): Promise<Record<string, string>> {
    if (!this.enabled) return {};
    const secretPath = path ?? `${this.mountPath}/data/${this.secretPath}`;
    const res = await this.request<{ data: VaultSecret }>('GET', secretPath);
    return res.data?.data ?? {};
  }

  async writeSecret(path: string, data: Record<string, string>): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Vault disabled — skipping writeSecret');
      return;
    }
    await this.request('POST', `${this.mountPath}/data/${path}`, { data });
    this.logger.log(`Secret written to Vault path: ${path}`);
  }

  async rotateSecret(key: string, generator: () => string): Promise<string> {
    if (!this.enabled) return generator();
    const newValue = generator();
    const existing = await this.getSecret();
    await this.writeSecret(this.secretPath, { ...existing, [key]: newValue });
    this.logger.log(`Secret rotated for key: ${key}`);
    return newValue;
  }

  async renewToken(): Promise<void> {
    if (!this.enabled) return;
    await this.request('POST', 'auth/token/renew-self');
    this.logger.log('Vault token renewed');
  }

  async healthCheck(): Promise<boolean> {
    if (!this.enabled) return true;
    try {
      await this.request<unknown>('GET', 'sys/health');
      return true;
    } catch {
      return false;
    }
  }

  onModuleDestroy() {
    if (this.renewTimer) clearInterval(this.renewTimer);
  }
}

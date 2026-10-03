"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var VaultService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.VaultService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const https = __importStar(require("https"));
const http = __importStar(require("http"));
let VaultService = VaultService_1 = class VaultService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(VaultService_1.name);
        this.renewIntervalMs = 60_000;
        this.address = this.config.get('VAULT_ADDR', '');
        this.token = this.config.get('VAULT_TOKEN', '');
        this.mountPath = this.config.get('VAULT_MOUNT', 'secret');
        this.secretPath = this.config.get('VAULT_SECRET_PATH', 'lumorius/prod');
        this.enabled = !!(this.address && this.token);
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
        }
        catch (err) {
            this.logger.error('Vault initialisation failed', err);
        }
    }
    request(method, path, body) {
        return new Promise((resolve, reject) => {
            const url = new URL(`${this.address}/v1/${path}`);
            const isHttps = url.protocol === 'https:';
            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method,
                headers: {
                    'X-Vault-Token': this.token,
                    'Content-Type': 'application/json',
                },
            };
            const req = (isHttps ? https : http).request(options, (res) => {
                let raw = '';
                res.on('data', (c) => (raw += c));
                res.on('end', () => {
                    try {
                        if (res.statusCode && res.statusCode >= 400) {
                            reject(new Error(`Vault ${method} ${path} → ${res.statusCode}: ${raw}`));
                        }
                        else {
                            resolve(raw ? JSON.parse(raw) : {});
                        }
                    }
                    catch {
                        reject(new Error(`Failed to parse Vault response: ${raw}`));
                    }
                });
            });
            req.on('error', reject);
            if (body)
                req.write(JSON.stringify(body));
            req.end();
        });
    }
    async getSecret(path) {
        if (!this.enabled)
            return {};
        const secretPath = path ?? `${this.mountPath}/data/${this.secretPath}`;
        const res = await this.request('GET', secretPath);
        return res.data?.data ?? {};
    }
    async writeSecret(path, data) {
        if (!this.enabled) {
            this.logger.warn('Vault disabled — skipping writeSecret');
            return;
        }
        await this.request('POST', `${this.mountPath}/data/${path}`, { data });
        this.logger.log(`Secret written to Vault path: ${path}`);
    }
    async rotateSecret(key, generator) {
        if (!this.enabled)
            return generator();
        const newValue = generator();
        const existing = await this.getSecret();
        await this.writeSecret(this.secretPath, { ...existing, [key]: newValue });
        this.logger.log(`Secret rotated for key: ${key}`);
        return newValue;
    }
    async renewToken() {
        if (!this.enabled)
            return;
        await this.request('POST', 'auth/token/renew-self');
        this.logger.log('Vault token renewed');
    }
    async healthCheck() {
        if (!this.enabled)
            return true;
        try {
            await this.request('GET', 'sys/health');
            return true;
        }
        catch {
            return false;
        }
    }
    onModuleDestroy() {
        if (this.renewTimer)
            clearInterval(this.renewTimer);
    }
};
exports.VaultService = VaultService;
exports.VaultService = VaultService = VaultService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], VaultService);
//# sourceMappingURL=vault.service.js.map
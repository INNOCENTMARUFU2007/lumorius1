import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class VaultService implements OnModuleInit {
    private readonly config;
    private readonly logger;
    private readonly enabled;
    private readonly address;
    private readonly token;
    private readonly mountPath;
    private readonly secretPath;
    private readonly renewIntervalMs;
    private renewTimer?;
    constructor(config: ConfigService);
    onModuleInit(): Promise<void>;
    private request;
    getSecret(path?: string): Promise<Record<string, string>>;
    writeSecret(path: string, data: Record<string, string>): Promise<void>;
    rotateSecret(key: string, generator: () => string): Promise<string>;
    renewToken(): Promise<void>;
    healthCheck(): Promise<boolean>;
    onModuleDestroy(): void;
}
//# sourceMappingURL=vault.service.d.ts.map
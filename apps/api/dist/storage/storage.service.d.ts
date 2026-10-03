import { ConfigService } from '@nestjs/config';
export declare class StorageService {
    private readonly configService;
    private readonly logger;
    private readonly s3;
    private readonly bucket;
    constructor(configService: ConfigService);
    upload(key: string, body: Buffer, contentType: string): Promise<void>;
    download(key: string): Promise<Buffer>;
    delete(key: string): Promise<void>;
    getPresignedUrl(key: string, expiresIn?: number): Promise<string>;
}
//# sourceMappingURL=storage.service.d.ts.map
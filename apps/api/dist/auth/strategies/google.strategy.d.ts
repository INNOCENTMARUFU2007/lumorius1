import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
declare const GoogleStrategy_base: new (...args: any[]) => Strategy;
export declare class GoogleStrategy extends GoogleStrategy_base {
    private readonly configService;
    private readonly db;
    constructor(configService: ConfigService, db: DatabaseService);
    validate(accessToken: string, refreshToken: string, profile: Record<string, unknown>, done: VerifyCallback): Promise<void>;
}
export {};
//# sourceMappingURL=google.strategy.d.ts.map
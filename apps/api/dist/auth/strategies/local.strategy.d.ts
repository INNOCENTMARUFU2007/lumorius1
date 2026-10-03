import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';
declare const LocalStrategy_base: new (...args: any[]) => Strategy;
export declare class LocalStrategy extends LocalStrategy_base {
    private readonly authService;
    constructor(authService: AuthService);
    validate(email: string, password: string): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
        user: {
            id: unknown;
            email: unknown;
            name: unknown;
            role: unknown;
            organizationId: unknown;
            emailVerified: unknown;
            mfaEnabled: unknown;
        };
    } | {
        mfaRequired: boolean;
    }>;
}
export {};
//# sourceMappingURL=local.strategy.d.ts.map
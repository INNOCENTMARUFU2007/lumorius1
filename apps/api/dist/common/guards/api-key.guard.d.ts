import { CanActivate, ExecutionContext } from '@nestjs/common';
import { SecurityService } from '../../security/security.service';
export declare class ApiKeyGuard implements CanActivate {
    private readonly securityService;
    constructor(securityService: SecurityService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractKey;
}
//# sourceMappingURL=api-key.guard.d.ts.map
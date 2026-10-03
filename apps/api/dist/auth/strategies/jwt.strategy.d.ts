import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../database/database.service';
import { JwtPayload } from '../../common/decorators/current-user.decorator';
declare const JwtStrategy_base: new (...args: any[]) => Strategy;
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly configService;
    private readonly db;
    constructor(configService: ConfigService, db: DatabaseService);
    validate(payload: JwtPayload): Promise<JwtPayload>;
}
export {};
//# sourceMappingURL=jwt.strategy.d.ts.map
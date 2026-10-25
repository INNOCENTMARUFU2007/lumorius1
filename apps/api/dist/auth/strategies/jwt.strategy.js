"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const passport_jwt_1 = require("passport-jwt");
const config_1 = require("@nestjs/config");
const database_service_1 = require("../../database/database.service");
let JwtStrategy = class JwtStrategy extends (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy) {
    constructor(configService, db) {
        const secret = configService.get('jwt.secret') ??
            configService.get('JWT_SECRET') ??
            process.env.JWT_SECRET;
        if (!secret) {
            throw new Error('JWT_SECRET is not configured. ' +
                'Set JWT_SECRET in the Lumorius .env file.');
        }
        super({
            jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: secret,
        });
        this.configService = configService;
        this.db = db;
    }
    async validate(payload) {
        const user = await this.db.findOne('users', {
            id: payload.sub,
            is_active: true,
        });
        if (!user) {
            throw new common_1.UnauthorizedException('User not found or inactive');
        }
        const sessionId = payload.sid;
        if (!sessionId) {
            throw new common_1.UnauthorizedException('Session is not bound to a device. Please sign in again.');
        }
        const session = await this.db.findOne('sessions', { id: sessionId, user_id: payload.sub, is_valid: true });
        if (!session ||
            !session.expires_at ||
            new Date(String(session.expires_at)).getTime() <= Date.now()) {
            throw new common_1.UnauthorizedException('Session revoked or expired. Please sign in again.');
        }
        const tokenCutoff = user.tokens_valid_after;
        if (tokenCutoff) {
            const cutoffMs = new Date(String(tokenCutoff)).getTime();
            const issuedAt = payload.iat;
            const cutoffSeconds = Math.floor(cutoffMs / 1000);
            if (!Number.isFinite(cutoffMs) || typeof issuedAt !== 'number' || issuedAt <= cutoffSeconds) {
                throw new common_1.UnauthorizedException('Session revoked. Please sign in again.');
            }
        }
        return payload;
    }
};
exports.JwtStrategy = JwtStrategy;
exports.JwtStrategy = JwtStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        database_service_1.DatabaseService])
], JwtStrategy);
//# sourceMappingURL=jwt.strategy.js.map
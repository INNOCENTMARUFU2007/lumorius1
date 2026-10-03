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
exports.GoogleStrategy = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const passport_google_oauth20_1 = require("passport-google-oauth20");
const config_1 = require("@nestjs/config");
const database_service_1 = require("../../database/database.service");
const uuid_1 = require("uuid");
let GoogleStrategy = class GoogleStrategy extends (0, passport_1.PassportStrategy)(passport_google_oauth20_1.Strategy, 'google') {
    constructor(configService, db) {
        super({
            clientID: configService.get('oauth.google.clientId', 'placeholder'),
            clientSecret: configService.get('oauth.google.clientSecret', 'placeholder'),
            callbackURL: `${configService.get('appUrl')}/api/v1/auth/google/callback`,
            scope: ['email', 'profile'],
        });
        this.configService = configService;
        this.db = db;
    }
    async validate(accessToken, refreshToken, profile, done) {
        const emails = profile.emails;
        const photos = profile.photos;
        const email = emails?.[0]?.value;
        const name = profile.displayName;
        const avatarUrl = photos?.[0]?.value;
        if (!email)
            return done(new Error('No email from Google'), false);
        let user = await this.db.findOne('users', { email });
        if (!user) {
            const userId = (0, uuid_1.v4)();
            await this.db.query(`INSERT INTO users (id, email, name, avatar_url, email_verified)
         VALUES ($1, $2, $3, $4, TRUE)`, [userId, email, name, avatarUrl]);
            user = await this.db.findOne('users', { id: userId });
        }
        await this.db.query(`INSERT INTO oauth_accounts (user_id, provider, provider_user_id, access_token, refresh_token)
       VALUES ($1, 'google', $2, $3, $4)
       ON CONFLICT (provider, provider_user_id) DO UPDATE
       SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token`, [user.id, profile.id, accessToken, refreshToken]);
        done(null, user);
    }
};
exports.GoogleStrategy = GoogleStrategy;
exports.GoogleStrategy = GoogleStrategy = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        database_service_1.DatabaseService])
], GoogleStrategy);
//# sourceMappingURL=google.strategy.js.map
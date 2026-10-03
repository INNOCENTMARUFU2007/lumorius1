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
exports.ApiKeyGuard = void 0;
const common_1 = require("@nestjs/common");
const security_service_1 = require("../../security/security.service");
let ApiKeyGuard = class ApiKeyGuard {
    constructor(securityService) {
        this.securityService = securityService;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const apiKey = this.extractKey(req);
        if (!apiKey)
            throw new common_1.UnauthorizedException('API key required');
        const keyRecord = await this.securityService.validateApiKey(apiKey);
        if (!keyRecord)
            throw new common_1.UnauthorizedException('Invalid or revoked API key');
        req.apiKey = keyRecord;
        return true;
    }
    extractKey(req) {
        const header = req.headers['x-api-key'];
        if (header)
            return header;
        const bearer = req.headers['authorization'];
        if (bearer?.startsWith('ApiKey '))
            return bearer.slice(7);
        return null;
    }
};
exports.ApiKeyGuard = ApiKeyGuard;
exports.ApiKeyGuard = ApiKeyGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [security_service_1.SecurityService])
], ApiKeyGuard);
//# sourceMappingURL=api-key.guard.js.map
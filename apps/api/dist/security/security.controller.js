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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const swagger_1 = require("@nestjs/swagger");
const security_service_1 = require("./security.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const roles_guard_1 = require("../common/guards/roles.guard");
const class_validator_1 = require("class-validator");
class CreateApiKeyDto {
    constructor() {
        this.name = '';
    }
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateApiKeyDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], CreateApiKeyDto.prototype, "scopes", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateApiKeyDto.prototype, "expiresAt", void 0);
class AuditQueryDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AuditQueryDto.prototype, "action", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AuditQueryDto.prototype, "userId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AuditQueryDto.prototype, "from", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AuditQueryDto.prototype, "to", void 0);
let SecurityController = class SecurityController {
    constructor(securityService) {
        this.securityService = securityService;
    }
    async summary(user) {
        return this.securityService.getSecuritySummary(user.organizationId);
    }
    async auditLogs(user, query) {
        return this.securityService.getAuditLogs(user.organizationId, query);
    }
    async createKey(user, dto) {
        return this.securityService.createApiKey(user.organizationId, user.sub, dto);
    }
    async listKeys(user) {
        return this.securityService.listApiKeys(user.organizationId);
    }
    async revokeKey(user, keyId) {
        return this.securityService.revokeApiKey(user.organizationId, keyId);
    }
    async loginAttempts(user) {
        return this.securityService.getLoginAttempts(user.organizationId);
    }
};
exports.SecurityController = SecurityController;
__decorate([
    (0, common_1.Get)('summary'),
    (0, swagger_1.ApiOperation)({ summary: 'Security dashboard summary' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "summary", null);
__decorate([
    (0, common_1.Get)('audit-logs'),
    (0, roles_decorator_1.Roles)('owner', 'admin'),
    (0, swagger_1.ApiOperation)({ summary: 'Get audit logs for the organisation' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, AuditQueryDto]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "auditLogs", null);
__decorate([
    (0, common_1.Post)('api-keys'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new API key' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateApiKeyDto]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "createKey", null);
__decorate([
    (0, common_1.Get)('api-keys'),
    (0, swagger_1.ApiOperation)({ summary: 'List all active API keys' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "listKeys", null);
__decorate([
    (0, common_1.Delete)('api-keys/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Revoke an API key' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "revokeKey", null);
__decorate([
    (0, common_1.Get)('login-attempts'),
    (0, roles_decorator_1.Roles)('owner', 'admin'),
    (0, swagger_1.ApiOperation)({ summary: 'Recent login attempts for the organisation' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SecurityController.prototype, "loginAttempts", null);
exports.SecurityController = SecurityController = __decorate([
    (0, swagger_1.ApiTags)('security'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt'), roles_guard_1.RolesGuard),
    (0, common_1.Controller)('security'),
    __metadata("design:paramtypes", [security_service_1.SecurityService])
], SecurityController);
//# sourceMappingURL=security.controller.js.map
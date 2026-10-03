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
exports.GdprController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const gdpr_service_1 = require("./gdpr.service");
let GdprController = class GdprController {
    constructor(gdprService) {
        this.gdprService = gdprService;
    }
    async exportMyData(user, res) {
        const bundle = await this.gdprService.exportUserData(user.id);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="lumorius-data-export-${user.id}.json"`);
        res.send(JSON.stringify(bundle, null, 2));
    }
    requestDeletion(user) {
        return this.gdprService.requestDeletion(user.id);
    }
    cancelDeletion(user) {
        return this.gdprService.cancelDeletion(user.id);
    }
};
exports.GdprController = GdprController;
__decorate([
    (0, common_1.Get)('export'),
    (0, swagger_1.ApiOperation)({ summary: 'Export all my data (GDPR Art. 20)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], GdprController.prototype, "exportMyData", null);
__decorate([
    (0, common_1.Post)('request-deletion'),
    (0, swagger_1.ApiOperation)({ summary: 'Request account deletion (GDPR Art. 17) — 30-day grace period' }),
    (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GdprController.prototype, "requestDeletion", null);
__decorate([
    (0, common_1.Delete)('cancel-deletion'),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel a pending deletion request' }),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], GdprController.prototype, "cancelDeletion", null);
exports.GdprController = GdprController = __decorate([
    (0, swagger_1.ApiTags)('gdpr'),
    (0, swagger_1.ApiBearerAuth)('access-token'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)({ path: 'gdpr', version: '1' }),
    __metadata("design:paramtypes", [gdpr_service_1.GdprService])
], GdprController);
//# sourceMappingURL=gdpr.controller.js.map
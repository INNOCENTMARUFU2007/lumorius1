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
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const swagger_1 = require("@nestjs/swagger");
const ai_service_1 = require("./ai.service");
const ai_quota_guard_1 = require("./guards/ai-quota.guard");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let AiController = class AiController {
    constructor(aiService) {
        this.aiService = aiService;
    }
    sendMessage(user, body) {
        return this.aiService.sendMessage(user.sub, user.organizationId, body.message, body.conversationId);
    }
    getConversations(user) {
        return this.aiService.getConversations(user.sub, user.organizationId);
    }
    getMessages(user, id) {
        return this.aiService.getConversationMessages(id, user.sub);
    }
    strategyAnalyze(user, body) {
        return this.aiService.strategyAdvisor(user.organizationId, body.question, body.context ?? {});
    }
    detectRisksOpportunities(user, body) {
        return this.aiService.detectRisksAndOpportunities(body.data);
    }
    generateWeeklyReport(user, body) {
        return this.aiService.generateWeeklyReport(user.organizationId, body.data);
    }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Post)('chat'),
    (0, common_1.UseGuards)(ai_quota_guard_1.AiQuotaGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Send a message to the AI assistant' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Burst rate limit hit — slow down (Retry-After header set)' }),
    (0, swagger_1.ApiResponse)({ status: 402, description: 'Monthly AI quota exhausted — upgrade plan' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "sendMessage", null);
__decorate([
    (0, common_1.Get)('conversations'),
    (0, swagger_1.ApiOperation)({ summary: 'List AI conversations' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "getConversations", null);
__decorate([
    (0, common_1.Get)('conversations/:id/messages'),
    (0, swagger_1.ApiOperation)({ summary: 'Get messages in a conversation' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "getMessages", null);
__decorate([
    (0, common_1.Post)('strategy/analyze'),
    (0, common_1.UseGuards)(ai_quota_guard_1.AiQuotaGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Get strategic analysis from AI advisor' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Burst rate limit hit' }),
    (0, swagger_1.ApiResponse)({ status: 402, description: 'Monthly AI quota exhausted' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "strategyAnalyze", null);
__decorate([
    (0, common_1.Post)('strategy/risks-opportunities'),
    (0, common_1.UseGuards)(ai_quota_guard_1.AiQuotaGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Detect risks and opportunities from business data' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Burst rate limit hit' }),
    (0, swagger_1.ApiResponse)({ status: 402, description: 'Monthly AI quota exhausted' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "detectRisksOpportunities", null);
__decorate([
    (0, common_1.Post)('reports/weekly'),
    (0, common_1.UseGuards)(ai_quota_guard_1.AiQuotaGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Generate AI weekly business report' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'Burst rate limit hit' }),
    (0, swagger_1.ApiResponse)({ status: 402, description: 'Monthly AI quota exhausted' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AiController.prototype, "generateWeeklyReport", null);
exports.AiController = AiController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [ai_service_1.AiService])
], AiController);
//# sourceMappingURL=ai.controller.js.map
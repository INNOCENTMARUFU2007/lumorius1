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
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const swagger_1 = require("@nestjs/swagger");
const analytics_service_1 = require("./analytics.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const roles_guard_1 = require("../common/guards/roles.guard");
let AnalyticsController = class AnalyticsController {
    constructor(analyticsService) {
        this.analyticsService = analyticsService;
    }
    getFounderDashboard(user) {
        return this.analyticsService.getFounderDashboard(user.organizationId, user.sub);
    }
    getTeamDashboard(user) {
        return this.analyticsService.getTeamDashboard(user.organizationId);
    }
    getKpis(user) {
        return this.analyticsService.getKpiMetrics(user.organizationId);
    }
    createKpi(user, body) {
        return this.analyticsService.createKpiMetric(user.organizationId, user.sub, body);
    }
    recordKpiValue(user, id, body) {
        return this.analyticsService.recordKpiValue(id, user.organizationId, body.value, body.date);
    }
    getGoals(user) {
        return this.analyticsService.getGoals(user.organizationId);
    }
    createGoal(user, body) {
        return this.analyticsService.createGoal(user.organizationId, user.sub, body);
    }
    generateWeeklyReport(user) {
        return this.analyticsService.generateWeeklyReport(user.organizationId, user.sub);
    }
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, common_1.Get)('founder-dashboard'),
    (0, swagger_1.ApiOperation)({ summary: 'Founder OS — AI-powered daily focus dashboard' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getFounderDashboard", null);
__decorate([
    (0, common_1.Get)('team-dashboard'),
    (0, swagger_1.ApiOperation)({ summary: 'Team productivity dashboard' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getTeamDashboard", null);
__decorate([
    (0, common_1.Get)('kpis'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all KPI metrics' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getKpis", null);
__decorate([
    (0, common_1.Post)('kpis'),
    (0, roles_decorator_1.Roles)('manager'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a KPI metric' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "createKpi", null);
__decorate([
    (0, common_1.Post)('kpis/:id/values'),
    (0, roles_decorator_1.Roles)('member'),
    (0, swagger_1.ApiOperation)({ summary: 'Record a KPI value' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "recordKpiValue", null);
__decorate([
    (0, common_1.Get)('goals'),
    (0, swagger_1.ApiOperation)({ summary: 'Get organization goals' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "getGoals", null);
__decorate([
    (0, common_1.Post)('goals'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a goal' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "createGoal", null);
__decorate([
    (0, common_1.Post)('reports/weekly'),
    (0, roles_decorator_1.Roles)('manager'),
    (0, swagger_1.ApiOperation)({ summary: 'Generate AI-powered weekly report' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AnalyticsController.prototype, "generateWeeklyReport", null);
exports.AnalyticsController = AnalyticsController = __decorate([
    (0, swagger_1.ApiTags)('analytics'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt'), roles_guard_1.RolesGuard),
    (0, common_1.Controller)('analytics'),
    __metadata("design:paramtypes", [analytics_service_1.AnalyticsService])
], AnalyticsController);
//# sourceMappingURL=analytics.controller.js.map
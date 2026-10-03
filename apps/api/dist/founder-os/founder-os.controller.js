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
exports.FounderOsController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const swagger_1 = require("@nestjs/swagger");
const founder_os_service_1 = require("./founder-os.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const class_validator_1 = require("class-validator");
class CreateObjectiveDto {
    constructor() {
        this.title = '';
        this.quarter = 'Q1';
        this.year = new Date().getFullYear();
    }
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateObjectiveDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateObjectiveDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateObjectiveDto.prototype, "quarter", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(2020),
    (0, class_validator_1.Max)(2050),
    __metadata("design:type", Number)
], CreateObjectiveDto.prototype, "year", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateObjectiveDto.prototype, "dueDate", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateObjectiveDto.prototype, "ownerId", void 0);
class UpdateObjectiveDto {
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateObjectiveDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateObjectiveDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['on_track', 'at_risk', 'behind', 'completed']),
    __metadata("design:type", String)
], UpdateObjectiveDto.prototype, "status", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], UpdateObjectiveDto.prototype, "progress", void 0);
class AddKeyResultDto {
    constructor() {
        this.title = '';
        this.targetValue = 100;
    }
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddKeyResultDto.prototype, "title", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['percentage', 'number', 'currency', 'boolean']),
    __metadata("design:type", String)
], AddKeyResultDto.prototype, "metricType", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AddKeyResultDto.prototype, "targetValue", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], AddKeyResultDto.prototype, "startValue", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AddKeyResultDto.prototype, "unit", void 0);
class UpdateKeyResultDto {
    constructor() {
        this.currentValue = 0;
    }
}
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdateKeyResultDto.prototype, "currentValue", void 0);
class RecordKpiDto {
    constructor() {
        this.metricKey = '';
        this.value = 0;
    }
}
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RecordKpiDto.prototype, "metricKey", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], RecordKpiDto.prototype, "value", void 0);
let FounderOsController = class FounderOsController {
    constructor(founderOsService) {
        this.founderOsService = founderOsService;
    }
    async dashboard(user) {
        return this.founderOsService.getDashboard(user.organizationId, user.sub);
    }
    async healthScore(user) {
        return this.founderOsService.computeHealthScore(user.organizationId);
    }
    async healthScoreHistory(user, limit) {
        return this.founderOsService.getHealthScoreHistory(user.organizationId, limit ?? 30);
    }
    async getOkrs(user, quarter, year) {
        return this.founderOsService.getOkrs(user.organizationId, quarter, year ? Number(year) : undefined);
    }
    async createObjective(user, dto) {
        return this.founderOsService.createObjective(user.organizationId, user.sub, dto);
    }
    async updateObjective(user, id, dto) {
        return this.founderOsService.updateObjective(user.organizationId, id, dto);
    }
    async addKeyResult(objectiveId, dto) {
        return this.founderOsService.addKeyResult(objectiveId, dto);
    }
    async updateKeyResult(krId, dto) {
        return this.founderOsService.updateKeyResult(krId, dto.currentValue);
    }
    async kpis(user, days) {
        return this.founderOsService.getAllKpiSnapshots(user.organizationId, days ? Number(days) : 30);
    }
    async kpiTimeseries(user, key, days) {
        return this.founderOsService.getKpiTimeseries(user.organizationId, key, days ? Number(days) : 30);
    }
    async recordKpi(user, dto) {
        return this.founderOsService.recordKpiSnapshot(user.organizationId, dto.metricKey, dto.value);
    }
    async usage(user, days) {
        return this.founderOsService.getUsageSummary(user.organizationId, days ? Number(days) : 30);
    }
};
exports.FounderOsController = FounderOsController;
__decorate([
    (0, common_1.Get)('dashboard'),
    (0, swagger_1.ApiOperation)({ summary: 'Full Founder OS dashboard' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FounderOsController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Get)('health-score'),
    (0, swagger_1.ApiOperation)({ summary: 'Compute current business health score' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], FounderOsController.prototype, "healthScore", null);
__decorate([
    (0, common_1.Get)('health-score/history'),
    (0, swagger_1.ApiOperation)({ summary: 'Historical health score trend' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], FounderOsController.prototype, "healthScoreHistory", null);
__decorate([
    (0, common_1.Get)('okrs'),
    (0, swagger_1.ApiOperation)({ summary: 'Get OKRs for a quarter' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('quarter')),
    __param(2, (0, common_1.Query)('year')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Number]),
    __metadata("design:returntype", Promise)
], FounderOsController.prototype, "getOkrs", null);
__decorate([
    (0, common_1.Post)('okrs'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new objective' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateObjectiveDto]),
    __metadata("design:returntype", Promise)
], FounderOsController.prototype, "createObjective", null);
__decorate([
    (0, common_1.Patch)('okrs/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update an objective' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, UpdateObjectiveDto]),
    __metadata("design:returntype", Promise)
], FounderOsController.prototype, "updateObjective", null);
__decorate([
    (0, common_1.Post)('okrs/:id/key-results'),
    (0, swagger_1.ApiOperation)({ summary: 'Add a key result to an objective' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, AddKeyResultDto]),
    __metadata("design:returntype", Promise)
], FounderOsController.prototype, "addKeyResult", null);
__decorate([
    (0, common_1.Patch)('okrs/key-results/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a key result\'s current value' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateKeyResultDto]),
    __metadata("design:returntype", Promise)
], FounderOsController.prototype, "updateKeyResult", null);
__decorate([
    (0, common_1.Get)('kpis'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all KPI snapshots (last 30 days by default)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], FounderOsController.prototype, "kpis", null);
__decorate([
    (0, common_1.Get)('kpis/:key/timeseries'),
    (0, swagger_1.ApiOperation)({ summary: 'Time-series data for a specific KPI' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('key')),
    __param(2, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Number]),
    __metadata("design:returntype", Promise)
], FounderOsController.prototype, "kpiTimeseries", null);
__decorate([
    (0, common_1.Post)('kpis/record'),
    (0, swagger_1.ApiOperation)({ summary: 'Record a KPI value' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, RecordKpiDto]),
    __metadata("design:returntype", Promise)
], FounderOsController.prototype, "recordKpi", null);
__decorate([
    (0, common_1.Get)('usage'),
    (0, swagger_1.ApiOperation)({ summary: 'Usage summary for the organisation' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", Promise)
], FounderOsController.prototype, "usage", null);
exports.FounderOsController = FounderOsController = __decorate([
    (0, swagger_1.ApiTags)('founder-os'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Controller)('founder-os'),
    __metadata("design:paramtypes", [founder_os_service_1.FounderOsService])
], FounderOsController);
//# sourceMappingURL=founder-os.controller.js.map
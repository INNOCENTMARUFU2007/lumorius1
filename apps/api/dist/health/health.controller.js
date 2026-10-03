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
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const database_service_1 = require("../database/database.service");
const bull_1 = require("@nestjs/bull");
let HealthController = class HealthController {
    constructor(db, documentsQueue) {
        this.db = db;
        this.documentsQueue = documentsQueue;
    }
    async check() {
        const checks = {};
        try {
            await this.db.query('SELECT 1');
            checks.database = 'ok';
        }
        catch {
            checks.database = 'error';
        }
        try {
            await this.documentsQueue.client.ping();
            checks.redis = 'ok';
        }
        catch {
            checks.redis = 'error';
        }
        const allOk = Object.values(checks).every((v) => v === 'ok');
        return {
            status: allOk ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version ?? '1.0.0',
            checks,
        };
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Health check' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "check", null);
exports.HealthController = HealthController = __decorate([
    (0, swagger_1.ApiTags)('health'),
    (0, common_1.Controller)('health'),
    __param(1, (0, bull_1.InjectQueue)('documents')),
    __metadata("design:paramtypes", [database_service_1.DatabaseService, Object])
], HealthController);
//# sourceMappingURL=health.controller.js.map
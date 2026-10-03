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
var GdprDeletionScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GdprDeletionScheduler = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const gdpr_service_1 = require("./gdpr.service");
let GdprDeletionScheduler = GdprDeletionScheduler_1 = class GdprDeletionScheduler {
    constructor(gdprService) {
        this.gdprService = gdprService;
        this.logger = new common_1.Logger(GdprDeletionScheduler_1.name);
    }
    async processExpiredDeletionRequests() {
        this.logger.log('GDPR nightly deletion job — starting');
        try {
            const result = await this.gdprService.purgeScheduledDeletions();
            if (result.purged === 0) {
                this.logger.log('GDPR nightly deletion job — no accounts due for deletion');
            }
            else {
                this.logger.warn(`GDPR nightly deletion job — purged ${result.purged} account(s)`);
            }
        }
        catch (err) {
            this.logger.error('GDPR nightly deletion job — unexpected error', err);
            throw err;
        }
    }
};
exports.GdprDeletionScheduler = GdprDeletionScheduler;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_2AM, {
        name: 'gdpr-deletion',
        timeZone: 'UTC',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GdprDeletionScheduler.prototype, "processExpiredDeletionRequests", null);
exports.GdprDeletionScheduler = GdprDeletionScheduler = GdprDeletionScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [gdpr_service_1.GdprService])
], GdprDeletionScheduler);
//# sourceMappingURL=gdpr-deletion.scheduler.js.map
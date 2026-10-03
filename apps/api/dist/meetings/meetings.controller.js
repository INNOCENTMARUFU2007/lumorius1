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
exports.MeetingsController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const meetings_service_1 = require("./meetings.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let MeetingsController = class MeetingsController {
    constructor(meetingsService) {
        this.meetingsService = meetingsService;
    }
    upload(file, user, body) {
        return this.meetingsService.upload(file, user.organizationId, user.sub, body);
    }
    findAll(user, search, status, teamId, page, pageSize) {
        return this.meetingsService.findAll(user.organizationId, { search, status, teamId, page, pageSize });
    }
    findOne(user, id) {
        return this.meetingsService.findById(id, user.organizationId);
    }
    getTranscript(user, id) {
        return this.meetingsService.getTranscript(id, user.organizationId);
    }
    getAnalysis(user, id) {
        return this.meetingsService.getAnalysis(id, user.organizationId);
    }
    delete(user, id) {
        return this.meetingsService.delete(id, user.organizationId);
    }
};
exports.MeetingsController = MeetingsController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        limits: { fileSize: 500 * 1024 * 1024 },
    })),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiOperation)({ summary: 'Upload audio/video for transcription and analysis' }),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List meetings' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('search')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('teamId')),
    __param(4, (0, common_1.Query)('page')),
    __param(5, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, Number, Number]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get meeting by ID' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/transcript'),
    (0, swagger_1.ApiOperation)({ summary: 'Get meeting transcript' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "getTranscript", null);
__decorate([
    (0, common_1.Get)(':id/analysis'),
    (0, swagger_1.ApiOperation)({ summary: 'Get meeting analysis (summary, action items, decisions)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "getAnalysis", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a meeting and its recording' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "delete", null);
exports.MeetingsController = MeetingsController = __decorate([
    (0, swagger_1.ApiTags)('meetings'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Controller)('meetings'),
    __metadata("design:paramtypes", [meetings_service_1.MeetingsService])
], MeetingsController);
//# sourceMappingURL=meetings.controller.js.map
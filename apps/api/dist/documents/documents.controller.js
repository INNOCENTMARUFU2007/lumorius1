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
exports.DocumentsController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const documents_service_1 = require("./documents.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let DocumentsController = class DocumentsController {
    constructor(documentsService) {
        this.documentsService = documentsService;
    }
    upload(file, user, body) {
        return this.documentsService.upload(file, user.organizationId, user.sub, {
            teamId: body.teamId,
            tags: body.tags
                ? body.tags
                    .split(',')
                    .map((tag) => tag.trim())
                    .filter(Boolean)
                : [],
        });
    }
    findAll(user, search, status, type, teamId, page, pageSize) {
        return this.documentsService.findAll(user.organizationId, {
            search,
            status,
            type,
            teamId,
            page,
            pageSize,
        });
    }
    getSearchFacets(user) {
        return this.documentsService.getSearchFacets(user.organizationId);
    }
    findOne(user, id) {
        return this.documentsService.findById(id, user.organizationId);
    }
    getDownloadUrl(user, id) {
        return this.documentsService.getDownloadUrl(id, user.organizationId);
    }
    delete(user, id) {
        return this.documentsService.delete(id, user.organizationId);
    }
    search(user, body) {
        return this.documentsService.search(user.organizationId, body.query, {
            documentIds: body.documentIds,
            topK: body.topK,
            type: body.type,
            tag: body.tag,
            createdAfter: body.createdAfter,
            teamId: body.teamId,
            uploadedById: body.myHistory
                ? user.sub
                : undefined,
        });
    }
    ask(user, body) {
        return this.documentsService.ask(user.organizationId, body.question, {
            documentIds: body.documentIds,
            teamId: body.teamId,
            type: body.type,
            tag: body.tag,
            createdAfter: body.createdAfter,
            uploadedById: body.myHistory
                ? user.sub
                : undefined,
        });
    }
};
exports.DocumentsController = DocumentsController;
__decorate([
    (0, common_1.Post)('upload'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        limits: { fileSize: 100 * 1024 * 1024 },
    })),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiOperation)({
        summary: 'Upload and index a document into Company Brain',
    }),
    __param(0, (0, common_1.UploadedFile)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "upload", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({
        summary: 'List documents in Company Brain',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('search')),
    __param(2, (0, common_1.Query)('status')),
    __param(3, (0, common_1.Query)('type')),
    __param(4, (0, common_1.Query)('teamId')),
    __param(5, (0, common_1.Query)('page')),
    __param(6, (0, common_1.Query)('pageSize')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('search-facets'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get indexed-document search filters for the current organization',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "getSearchFacets", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get a document by ID',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/download'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get a presigned download URL',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "getDownloadUrl", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: 'Delete a document',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "delete", null);
__decorate([
    (0, common_1.Post)('search'),
    (0, swagger_1.ApiOperation)({
        summary: 'Semantic search across documents',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "search", null);
__decorate([
    (0, common_1.Post)('ask'),
    (0, swagger_1.ApiOperation)({
        summary: 'Ask a question about your documents (RAG)',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], DocumentsController.prototype, "ask", null);
exports.DocumentsController = DocumentsController = __decorate([
    (0, swagger_1.ApiTags)('documents'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Controller)('documents'),
    __metadata("design:paramtypes", [documents_service_1.DocumentsService])
], DocumentsController);
//# sourceMappingURL=documents.controller.js.map
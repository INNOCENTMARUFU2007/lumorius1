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
exports.KnowledgeController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const swagger_1 = require("@nestjs/swagger");
const knowledge_service_1 = require("./knowledge.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let KnowledgeController = class KnowledgeController {
    constructor(knowledgeService) {
        this.knowledgeService = knowledgeService;
    }
    getGraph(user, nodeId, nodeType, depth, search) {
        return this.knowledgeService.getGraph(user.organizationId, { nodeId, nodeType, depth, search });
    }
    createNode(user, body) {
        return this.knowledgeService.createNode(user.organizationId, body);
    }
    getNode(user, id) {
        return this.knowledgeService.findNodeById(id, user.organizationId);
    }
    createRelation(user, body) {
        return this.knowledgeService.createRelation(user.organizationId, body);
    }
    search(user, body) {
        return this.knowledgeService.semanticSearch(user.organizationId, body.query);
    }
    sync(user) {
        return this.knowledgeService.syncFromDocuments(user.organizationId);
    }
};
exports.KnowledgeController = KnowledgeController;
__decorate([
    (0, common_1.Get)('graph'),
    (0, swagger_1.ApiOperation)({ summary: 'Get the knowledge graph' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('nodeId')),
    __param(2, (0, common_1.Query)('nodeType')),
    __param(3, (0, common_1.Query)('depth')),
    __param(4, (0, common_1.Query)('search')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Number, String]),
    __metadata("design:returntype", void 0)
], KnowledgeController.prototype, "getGraph", null);
__decorate([
    (0, common_1.Post)('nodes'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a knowledge node' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeController.prototype, "createNode", null);
__decorate([
    (0, common_1.Get)('nodes/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get a knowledge node by ID' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], KnowledgeController.prototype, "getNode", null);
__decorate([
    (0, common_1.Post)('relations'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a relation between nodes' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeController.prototype, "createRelation", null);
__decorate([
    (0, common_1.Post)('search'),
    (0, swagger_1.ApiOperation)({ summary: 'Semantic search across knowledge graph' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], KnowledgeController.prototype, "search", null);
__decorate([
    (0, common_1.Post)('sync'),
    (0, swagger_1.ApiOperation)({ summary: 'Sync knowledge nodes from indexed documents' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], KnowledgeController.prototype, "sync", null);
exports.KnowledgeController = KnowledgeController = __decorate([
    (0, swagger_1.ApiTags)('knowledge'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Controller)('knowledge'),
    __metadata("design:paramtypes", [knowledge_service_1.KnowledgeService])
], KnowledgeController);
//# sourceMappingURL=knowledge.controller.js.map
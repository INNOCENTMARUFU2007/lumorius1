"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentsModule = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const documents_controller_1 = require("./documents.controller");
const documents_service_1 = require("./documents.service");
const documents_processor_1 = require("./documents.processor");
const embedding_service_1 = require("./embedding.service");
const database_module_1 = require("../database/database.module");
const storage_module_1 = require("../storage/storage.module");
const ai_module_1 = require("../ai/ai.module");
let DocumentsModule = class DocumentsModule {
};
exports.DocumentsModule = DocumentsModule;
exports.DocumentsModule = DocumentsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule,
            bull_1.BullModule.registerQueue({
                name: 'documents',
            }),
            storage_module_1.StorageModule,
            ai_module_1.AiModule,
        ],
        controllers: [
            documents_controller_1.DocumentsController,
        ],
        providers: [
            documents_service_1.DocumentsService,
            documents_processor_1.DocumentsProcessor,
            embedding_service_1.EmbeddingService,
        ],
        exports: [
            documents_service_1.DocumentsService,
            embedding_service_1.EmbeddingService,
        ],
    })
], DocumentsModule);
//# sourceMappingURL=documents.module.js.map
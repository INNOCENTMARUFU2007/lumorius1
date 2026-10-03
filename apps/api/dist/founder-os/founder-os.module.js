"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FounderOsModule = void 0;
const common_1 = require("@nestjs/common");
const founder_os_service_1 = require("./founder-os.service");
const founder_os_controller_1 = require("./founder-os.controller");
const database_module_1 = require("../database/database.module");
const ai_module_1 = require("../ai/ai.module");
let FounderOsModule = class FounderOsModule {
};
exports.FounderOsModule = FounderOsModule;
exports.FounderOsModule = FounderOsModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, ai_module_1.AiModule],
        controllers: [founder_os_controller_1.FounderOsController],
        providers: [founder_os_service_1.FounderOsService],
        exports: [founder_os_service_1.FounderOsService],
    })
], FounderOsModule);
//# sourceMappingURL=founder-os.module.js.map
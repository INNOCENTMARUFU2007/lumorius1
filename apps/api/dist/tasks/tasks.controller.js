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
exports.TasksController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const swagger_1 = require("@nestjs/swagger");
const tasks_service_1 = require("./tasks.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let TasksController = class TasksController {
    constructor(tasksService) {
        this.tasksService = tasksService;
    }
    createTask(user, body) {
        return this.tasksService.create(user.organizationId, user.sub, body);
    }
    findTasks(user, query) {
        return this.tasksService.findAll(user.organizationId, query);
    }
    findTask(user, id) {
        return this.tasksService.findById(id, user.organizationId);
    }
    updateTask(user, id, body) {
        return this.tasksService.update(id, user.organizationId, body);
    }
    deleteTask(user, id) {
        return this.tasksService.delete(id, user.organizationId);
    }
    findProjects(user) {
        return this.tasksService.findProjects(user.organizationId);
    }
    createProject(user, body) {
        return this.tasksService.createProject(user.organizationId, user.sub, body);
    }
    findProject(user, id) {
        return this.tasksService.findProjectById(id, user.organizationId);
    }
};
exports.TasksController = TasksController;
__decorate([
    (0, common_1.Post)('tasks'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a task' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "createTask", null);
__decorate([
    (0, common_1.Get)('tasks'),
    (0, swagger_1.ApiOperation)({ summary: 'List tasks' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "findTasks", null);
__decorate([
    (0, common_1.Get)('tasks/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get task by ID' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "findTask", null);
__decorate([
    (0, common_1.Patch)('tasks/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a task' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "updateTask", null);
__decorate([
    (0, common_1.Delete)('tasks/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a task' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "deleteTask", null);
__decorate([
    (0, common_1.Get)('projects'),
    (0, swagger_1.ApiOperation)({ summary: 'List projects' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "findProjects", null);
__decorate([
    (0, common_1.Post)('projects'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a project' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "createProject", null);
__decorate([
    (0, common_1.Get)('projects/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get project by ID' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TasksController.prototype, "findProject", null);
exports.TasksController = TasksController = __decorate([
    (0, swagger_1.ApiTags)('tasks'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [tasks_service_1.TasksService])
], TasksController);
//# sourceMappingURL=tasks.controller.js.map
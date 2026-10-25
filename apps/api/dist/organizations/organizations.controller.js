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
exports.OrganizationsController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const swagger_1 = require("@nestjs/swagger");
const organizations_service_1 = require("./organizations.service");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const roles_decorator_1 = require("../common/decorators/roles.decorator");
const roles_guard_1 = require("../common/guards/roles.guard");
let OrganizationsController = class OrganizationsController {
    constructor(orgsService) {
        this.orgsService = orgsService;
    }
    getMyOrg(user) {
        return this.orgsService.findById(user.organizationId);
    }
    update(user, body) {
        return this.orgsService.update(user.organizationId, body);
    }
    getUsage(user) {
        return this.orgsService.getUsage(user.organizationId);
    }
    getMembers(user) {
        return this.orgsService.getMembers(user.organizationId);
    }
    inviteMember(user, body) {
        return this.orgsService.invite(user.organizationId, user.sub, {
            email: body.email,
            role: body.role ?? 'member',
            teamId: body.teamId,
        });
    }
    removeMember(user, userId) {
        return this.orgsService.removeMember(user.organizationId, userId, user.sub);
    }
    getTeams(user) {
        return this.orgsService.getTeams(user.organizationId);
    }
    createTeam(user, body) {
        return this.orgsService.createTeam(user.organizationId, user.sub, body);
    }
    addTeamMember(user, teamId, body) {
        return this.orgsService.addTeamMember(teamId, user.organizationId, body.userId, body.role);
    }
    getDepartments(user) {
        return this.orgsService.getDepartments(user.organizationId);
    }
    createDepartment(user, body) {
        return this.orgsService.createDepartment(user.organizationId, body);
    }
    getInvitationHistory(user) {
        return this.orgsService.getInvitationHistory(user.organizationId);
    }
    invite(user, body) {
        return this.orgsService.invite(user.organizationId, user.sub, {
            email: body.email,
            role: body.role ?? 'member',
            teamId: body.teamId,
        });
    }
    acceptInvite(user, body) {
        return this.orgsService.acceptInvitation(body.token, user.sub);
    }
    completeOnboarding(user, body) {
        return this.orgsService.completeOnboarding(user.sub, body);
    }
};
exports.OrganizationsController = OrganizationsController;
__decorate([
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiOperation)({ summary: 'Get current organization' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "getMyOrg", null);
__decorate([
    (0, common_1.Put)('me'),
    (0, roles_decorator_1.Roles)('admin'),
    (0, swagger_1.ApiOperation)({ summary: 'Update organization settings' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "update", null);
__decorate([
    (0, common_1.Get)('me/usage'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get usage statistics for the current organization',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "getUsage", null);
__decorate([
    (0, common_1.Get)('members'),
    (0, swagger_1.ApiOperation)({
        summary: 'List members of the current organization',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "getMembers", null);
__decorate([
    (0, common_1.Post)('members/invite'),
    (0, roles_decorator_1.Roles)('manager'),
    (0, swagger_1.ApiOperation)({
        summary: 'Invite a member to the organization',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "inviteMember", null);
__decorate([
    (0, common_1.Delete)('members/:userId'),
    (0, roles_decorator_1.Roles)('manager'),
    (0, swagger_1.ApiOperation)({
        summary: 'Remove a member from the organization',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "removeMember", null);
__decorate([
    (0, common_1.Get)('me/teams'),
    (0, swagger_1.ApiOperation)({
        summary: 'List teams in the organization',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "getTeams", null);
__decorate([
    (0, common_1.Post)('me/teams'),
    (0, roles_decorator_1.Roles)('manager'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a team' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "createTeam", null);
__decorate([
    (0, common_1.Post)('me/teams/:teamId/members'),
    (0, roles_decorator_1.Roles)('manager'),
    (0, swagger_1.ApiOperation)({ summary: 'Add a member to a team' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('teamId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "addTeamMember", null);
__decorate([
    (0, common_1.Get)('me/departments'),
    (0, swagger_1.ApiOperation)({
        summary: 'List departments in the organization',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "getDepartments", null);
__decorate([
    (0, common_1.Post)('me/departments'),
    (0, roles_decorator_1.Roles)('admin'),
    (0, swagger_1.ApiOperation)({ summary: 'Create a department' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "createDepartment", null);
__decorate([
    (0, common_1.Get)('me/invitations'),
    (0, swagger_1.ApiOperation)({
        summary: 'Get invitation history for the current organization',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "getInvitationHistory", null);
__decorate([
    (0, common_1.Post)('me/invite'),
    (0, roles_decorator_1.Roles)('manager'),
    (0, swagger_1.ApiOperation)({
        summary: 'Invite a user to the organization',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "invite", null);
__decorate([
    (0, common_1.Post)('accept-invite'),
    (0, swagger_1.ApiOperation)({
        summary: 'Accept an organization invitation',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "acceptInvite", null);
__decorate([
    (0, common_1.Post)('onboarding'),
    (0, swagger_1.ApiOperation)({
        summary: 'Complete user onboarding',
    }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], OrganizationsController.prototype, "completeOnboarding", null);
exports.OrganizationsController = OrganizationsController = __decorate([
    (0, swagger_1.ApiTags)('organizations'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt'), roles_guard_1.RolesGuard),
    (0, common_1.Controller)('organizations'),
    __metadata("design:paramtypes", [organizations_service_1.OrganizationsService])
], OrganizationsController);
//# sourceMappingURL=organizations.controller.js.map
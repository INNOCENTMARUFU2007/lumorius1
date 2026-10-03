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
var NotificationEmailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationEmailService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const schedule_1 = require("@nestjs/schedule");
const database_service_1 = require("../database/database.service");
const email_service_1 = require("../common/email/email.service");
const notifications_service_1 = require("./notifications.service");
let NotificationEmailService = NotificationEmailService_1 = class NotificationEmailService {
    constructor(db, emailService, notificationsService) {
        this.db = db;
        this.emailService = emailService;
        this.notificationsService = notificationsService;
        this.logger = new common_1.Logger(NotificationEmailService_1.name);
    }
    async handleTaskAssigned(payload) {
        try {
            const assignee = await this.db.findOne('users', { id: payload.assigneeId, is_active: true });
            if (!assignee)
                return;
            await Promise.all([
                this.emailService.sendTaskAssigned(assignee.email, assignee.name, payload.taskTitle, payload.taskId, payload.assignerName, payload.priority, payload.dueDate),
                this.notificationsService.create({
                    userId: payload.assigneeId,
                    organizationId: payload.organizationId,
                    type: 'task_assigned',
                    title: `New task: ${payload.taskTitle}`,
                    message: `Assigned by ${payload.assignerName} · Priority: ${payload.priority}`,
                    data: { taskId: payload.taskId, priority: payload.priority },
                }),
            ]);
        }
        catch (err) {
            this.logger.error('handleTaskAssigned failed', err);
        }
    }
    async handleMeetingCompleted(payload) {
        try {
            const user = await this.db.findOne('users', { id: payload.userId, is_active: true });
            if (!user)
                return;
            await Promise.all([
                this.emailService.sendMeetingReady(user.email, user.name, payload.meetingTitle, payload.meetingId, payload.summary, payload.actionItemCount),
                this.notificationsService.create({
                    userId: payload.userId,
                    organizationId: payload.organizationId,
                    type: 'meeting_processed',
                    title: `Meeting ready: ${payload.meetingTitle}`,
                    message: `${payload.actionItemCount} action item${payload.actionItemCount !== 1 ? 's' : ''} extracted`,
                    data: { meetingId: payload.meetingId },
                }),
            ]);
        }
        catch (err) {
            this.logger.error('handleMeetingCompleted failed', err);
        }
    }
    async handleDocumentIndexed(payload) {
        try {
            const user = await this.db.findOne('users', { id: payload.uploadedById, is_active: true });
            if (!user)
                return;
            await Promise.all([
                this.emailService.sendDocumentIndexed(user.email, user.name, payload.documentName, payload.documentId, payload.chunkCount),
                this.notificationsService.create({
                    userId: payload.uploadedById,
                    organizationId: payload.organizationId,
                    type: 'document_indexed',
                    title: `"${payload.documentName}" is ready`,
                    message: `${payload.chunkCount} knowledge chunks indexed — AI search enabled`,
                    data: { documentId: payload.documentId, chunkCount: payload.chunkCount },
                }),
            ]);
        }
        catch (err) {
            this.logger.error('handleDocumentIndexed failed', err);
        }
    }
    async handleDocumentFailed(payload) {
        try {
            const user = await this.db.findOne('users', { id: payload.uploadedById, is_active: true });
            if (!user)
                return;
            await Promise.all([
                this.emailService.sendDocumentFailed(user.email, user.name, payload.documentName, payload.errorMessage),
                this.notificationsService.create({
                    userId: payload.uploadedById,
                    organizationId: payload.organizationId,
                    type: 'document_failed',
                    title: `Processing failed: "${payload.documentName}"`,
                    message: 'Please re-upload the file. Contact support if the issue persists.',
                    data: { documentId: payload.documentId, error: payload.errorMessage },
                }),
            ]);
        }
        catch (err) {
            this.logger.error('handleDocumentFailed failed', err);
        }
    }
    async handleGoalAchieved(payload) {
        try {
            const user = await this.db.findOne('users', { id: payload.ownerId, is_active: true });
            if (!user)
                return;
            await Promise.all([
                this.emailService.sendGoalAchieved(user.email, user.name, payload.goalTitle),
                this.notificationsService.create({
                    userId: payload.ownerId,
                    organizationId: payload.organizationId,
                    type: 'goal_achieved',
                    title: `🎉 Goal achieved: ${payload.goalTitle}`,
                    message: 'You hit your target. Congratulations!',
                    data: { goalId: payload.goalId },
                }),
            ]);
        }
        catch (err) {
            this.logger.error('handleGoalAchieved failed', err);
        }
    }
    async sendOverdueTaskReminders() {
        this.logger.log('Running overdue task reminder cron...');
        try {
            const overdueByUser = await this.db.query(`SELECT t.assignee_id as user_id, u.email, u.name,
                t.organization_id, t.id as task_id, t.title as task_title,
                t.due_date, t.priority
         FROM tasks t
         JOIN users u ON u.id = t.assignee_id
         WHERE t.due_date < NOW()
           AND t.status NOT IN ('done','cancelled')
           AND u.is_active = TRUE
         ORDER BY u.id, t.due_date ASC`);
            const byUser = new Map();
            for (const row of overdueByUser.rows) {
                const list = byUser.get(row.user_id) ?? [];
                list.push(row);
                byUser.set(row.user_id, list);
            }
            for (const [, tasks] of byUser) {
                const first = tasks[0];
                await this.emailService.sendOverdueTasksSummary(first.email, first.name, tasks.map((t) => ({
                    id: t.task_id,
                    title: t.task_title,
                    dueDate: t.due_date,
                    priority: t.priority,
                }))).catch((err) => this.logger.error(`Overdue reminder failed for ${first.email}`, err));
            }
        }
        catch (err) {
            this.logger.error('Overdue task reminder cron failed', err);
        }
    }
    async sendWeeklyDigests() {
        this.logger.log('Running weekly digest cron...');
        try {
            const orgs = await this.db.query(`SELECT DISTINCT o.id, o.name FROM organizations o
         JOIN users u ON u.organization_id = o.id
         WHERE u.is_active = TRUE AND u.role IN ('owner','admin')`);
            for (const org of orgs.rows) {
                const owners = await this.db.query(`SELECT id, email, name FROM users
           WHERE organization_id = $1 AND is_active = TRUE
             AND role IN ('owner','admin')`, [org.id]);
                const [tasks, docs, meetings, goals] = await Promise.all([
                    this.db.query(`SELECT
               COUNT(*) FILTER (WHERE status = 'done' AND updated_at > NOW() - INTERVAL '7 days') as completed_this_week,
               COUNT(*) FILTER (WHERE status != 'done' AND status != 'cancelled') as open,
               COUNT(*) FILTER (WHERE priority = 'urgent' AND status != 'done') as urgent_open,
               COUNT(*) FILTER (WHERE due_date < NOW() AND status != 'done') as overdue
             FROM tasks WHERE organization_id = $1`, [org.id]),
                    this.db.query(`SELECT
               COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as uploaded_this_week,
               COUNT(*) FILTER (WHERE status = 'indexed') as total_indexed
             FROM documents WHERE organization_id = $1`, [org.id]),
                    this.db.query(`SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as this_week,
                    COUNT(*) FILTER (WHERE status = 'completed' AND created_at > NOW() - INTERVAL '7 days') as completed
             FROM meetings WHERE organization_id = $1`, [org.id]),
                    this.db.query(`SELECT COUNT(*) FILTER (WHERE status = 'active') as active,
                    COUNT(*) FILTER (WHERE status = 'completed' AND updated_at > NOW() - INTERVAL '7 days') as achieved_this_week
             FROM goals WHERE organization_id = $1`, [org.id]),
                ]);
                const stats = {
                    tasksCompletedThisWeek: parseInt(tasks.rows[0]?.completed_this_week ?? '0', 10),
                    openTasks: parseInt(tasks.rows[0]?.open ?? '0', 10),
                    urgentOpenTasks: parseInt(tasks.rows[0]?.urgent_open ?? '0', 10),
                    overdueTasks: parseInt(tasks.rows[0]?.overdue ?? '0', 10),
                    docsUploadedThisWeek: parseInt(docs.rows[0]?.uploaded_this_week ?? '0', 10),
                    totalDocsIndexed: parseInt(docs.rows[0]?.total_indexed ?? '0', 10),
                    meetingsThisWeek: parseInt(meetings.rows[0]?.this_week ?? '0', 10),
                    meetingsCompleted: parseInt(meetings.rows[0]?.completed ?? '0', 10),
                    activeGoals: parseInt(goals.rows[0]?.active ?? '0', 10),
                    goalsAchievedThisWeek: parseInt(goals.rows[0]?.achieved_this_week ?? '0', 10),
                };
                for (const owner of owners.rows) {
                    await this.emailService.sendWeeklyDigest(owner.email, owner.name, org.name, stats).catch((err) => this.logger.error(`Weekly digest failed for ${owner.email}`, err));
                }
            }
        }
        catch (err) {
            this.logger.error('Weekly digest cron failed', err);
        }
    }
};
exports.NotificationEmailService = NotificationEmailService;
__decorate([
    (0, event_emitter_1.OnEvent)('task.assigned', { async: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationEmailService.prototype, "handleTaskAssigned", null);
__decorate([
    (0, event_emitter_1.OnEvent)('meeting.completed', { async: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationEmailService.prototype, "handleMeetingCompleted", null);
__decorate([
    (0, event_emitter_1.OnEvent)('document.indexed', { async: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationEmailService.prototype, "handleDocumentIndexed", null);
__decorate([
    (0, event_emitter_1.OnEvent)('document.failed', { async: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationEmailService.prototype, "handleDocumentFailed", null);
__decorate([
    (0, event_emitter_1.OnEvent)('goal.achieved', { async: true }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], NotificationEmailService.prototype, "handleGoalAchieved", null);
__decorate([
    (0, schedule_1.Cron)('0 9 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], NotificationEmailService.prototype, "sendOverdueTaskReminders", null);
__decorate([
    (0, schedule_1.Cron)('0 8 * * MON'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], NotificationEmailService.prototype, "sendWeeklyDigests", null);
exports.NotificationEmailService = NotificationEmailService = NotificationEmailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        email_service_1.EmailService,
        notifications_service_1.NotificationsService])
], NotificationEmailService);
//# sourceMappingURL=notification-email.service.js.map
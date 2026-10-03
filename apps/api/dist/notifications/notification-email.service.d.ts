import { DatabaseService } from '../database/database.service';
import { EmailService } from '../common/email/email.service';
import { NotificationsService } from './notifications.service';
export interface TaskAssignedEvent {
    taskId: string;
    taskTitle: string;
    assigneeId: string;
    assignerName: string;
    organizationId: string;
    priority: string;
    dueDate?: string;
}
export interface MeetingCompletedEvent {
    meetingId: string;
    meetingTitle: string;
    userId: string;
    organizationId: string;
    summary: string;
    actionItemCount: number;
}
export interface DocumentIndexedEvent {
    documentId: string;
    documentName: string;
    uploadedById: string;
    organizationId: string;
    chunkCount: number;
}
export interface DocumentFailedEvent {
    documentId: string;
    documentName: string;
    uploadedById: string;
    organizationId: string;
    errorMessage: string;
}
export interface GoalAchievedEvent {
    goalId: string;
    goalTitle: string;
    ownerId: string;
    organizationId: string;
}
export declare class NotificationEmailService {
    private readonly db;
    private readonly emailService;
    private readonly notificationsService;
    private readonly logger;
    constructor(db: DatabaseService, emailService: EmailService, notificationsService: NotificationsService);
    handleTaskAssigned(payload: TaskAssignedEvent): Promise<void>;
    handleMeetingCompleted(payload: MeetingCompletedEvent): Promise<void>;
    handleDocumentIndexed(payload: DocumentIndexedEvent): Promise<void>;
    handleDocumentFailed(payload: DocumentFailedEvent): Promise<void>;
    handleGoalAchieved(payload: GoalAchievedEvent): Promise<void>;
    sendOverdueTaskReminders(): Promise<void>;
    sendWeeklyDigests(): Promise<void>;
}
//# sourceMappingURL=notification-email.service.d.ts.map
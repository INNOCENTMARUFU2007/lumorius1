import { ConfigService } from '@nestjs/config';
export declare class EmailService {
    private readonly configService;
    private readonly logger;
    private transporter;
    constructor(configService: ConfigService);
    private get from();
    private get appUrl();
    private escapeHtml;
    private getNotificationActionUrl;
    private layout;
    private send;
    sendWelcome(email: string, name: string): Promise<void>;
    sendVerificationEmail(email: string, name: string, token: string): Promise<void>;
    sendPasswordReset(email: string, name: string, token: string, ip?: string): Promise<void>;
    sendMagicLink(email: string, url: string): Promise<void>;
    sendLoginAlert(email: string, name: string, ip: string, device: string): Promise<void>;
    sendTeamInvitation(email: string, inviterName: string, orgName: string, token: string): Promise<void>;
    sendNotificationEmail(email: string, name: string, title: string, message: string, actionUrl?: string, actionLabel?: string): Promise<void>;
    sendSubscriptionConfirmation(email: string, name: string, planName: string, amountUsd: string, nextBillingDate: string): Promise<void>;
    sendPaymentFailed(email: string, name: string, planName: string, retryUrl: string): Promise<void>;
    sendApiKeyCreated(email: string, name: string, keyName: string, keyPrefix: string): Promise<void>;
    sendTaskAssigned(email: string, name: string, taskTitle: string, taskId: string, assignerName: string, priority: string, dueDate?: string): Promise<void>;
    sendMeetingReady(email: string, name: string, meetingTitle: string, meetingId: string, summary: string, actionItemCount: number): Promise<void>;
    sendDocumentIndexed(email: string, name: string, docName: string, docId: string, chunkCount: number): Promise<void>;
    sendDocumentFailed(email: string, name: string, docName: string, errorMessage: string): Promise<void>;
    sendGoalAchieved(email: string, name: string, goalTitle: string): Promise<void>;
    sendOverdueTasksSummary(email: string, name: string, tasks: Array<{
        id: string;
        title: string;
        dueDate: string;
        priority: string;
    }>): Promise<void>;
    sendWeeklyDigest(email: string, name: string, orgName: string, stats: {
        tasksCompletedThisWeek: number;
        openTasks: number;
        urgentOpenTasks: number;
        overdueTasks: number;
        docsUploadedThisWeek: number;
        totalDocsIndexed: number;
        meetingsThisWeek: number;
        meetingsCompleted: number;
        activeGoals: number;
        goalsAchievedThisWeek: number;
    }): Promise<void>;
}
//# sourceMappingURL=email.service.d.ts.map
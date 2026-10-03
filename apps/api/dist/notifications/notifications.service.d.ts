import { DatabaseService } from '../database/database.service';
export declare class NotificationsService {
    private readonly db;
    constructor(db: DatabaseService);
    create(opts: {
        userId: string;
        organizationId: string;
        type: string;
        title: string;
        message?: string;
        data?: Record<string, unknown>;
    }): Promise<{
        id: string;
    }>;
    findAll(userId: string, unreadOnly?: boolean): Promise<Record<string, unknown>[]>;
    markRead(userId: string, notificationId: string): Promise<{
        read: boolean;
    }>;
    markAllRead(userId: string): Promise<{
        read: boolean;
    }>;
    getUnreadCount(userId: string): Promise<{
        count: number;
    }>;
}
//# sourceMappingURL=notifications.service.d.ts.map
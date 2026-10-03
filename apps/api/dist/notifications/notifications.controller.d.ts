import { NotificationsService } from './notifications.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
    findAll(user: JwtPayload, unreadOnly?: boolean): Promise<Record<string, unknown>[]>;
    getUnreadCount(user: JwtPayload): Promise<{
        count: number;
    }>;
    markRead(user: JwtPayload, id: string): Promise<{
        read: boolean;
    }>;
    markAllRead(user: JwtPayload): Promise<{
        read: boolean;
    }>;
}
//# sourceMappingURL=notifications.controller.d.ts.map
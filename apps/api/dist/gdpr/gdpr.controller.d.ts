import { Response } from 'express';
import { GdprService } from './gdpr.service';
export declare class GdprController {
    private readonly gdprService;
    constructor(gdprService: GdprService);
    exportMyData(user: {
        id: string;
    }, res: Response): Promise<void>;
    requestDeletion(user: {
        id: string;
    }): Promise<{
        scheduledAt: string;
        deletionAt: string;
    }>;
    cancelDeletion(user: {
        id: string;
    }): Promise<void>;
}
//# sourceMappingURL=gdpr.controller.d.ts.map
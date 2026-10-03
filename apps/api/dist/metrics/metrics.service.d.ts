import { OnModuleInit } from '@nestjs/common';
export declare class MetricsService implements OnModuleInit {
    private readonly startTime;
    private httpRequests;
    private httpDuration;
    private activeConnections;
    private customCounters;
    onModuleInit(): void;
    private systemMetrics;
    private collectSystemMetrics;
    incrementHttpRequests(method: string, path: string, statusCode: number): void;
    incrementCounter(name: string, amount?: number): void;
    setActiveConnections(count: number): void;
    renderPrometheus(): string;
}
//# sourceMappingURL=metrics.service.d.ts.map
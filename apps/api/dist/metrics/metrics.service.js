"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsService = void 0;
const common_1 = require("@nestjs/common");
const os = __importStar(require("os"));
let MetricsService = class MetricsService {
    constructor() {
        this.startTime = Date.now();
        this.httpRequests = [];
        this.httpDuration = [];
        this.activeConnections = { value: 0, labels: {} };
        this.customCounters = new Map();
        this.systemMetrics = {};
    }
    onModuleInit() {
        setInterval(() => this.collectSystemMetrics(), 15_000);
    }
    collectSystemMetrics() {
        const mem = process.memoryUsage();
        this.systemMetrics = {
            heap_used: mem.heapUsed,
            heap_total: mem.heapTotal,
            rss: mem.rss,
            external: mem.external,
            cpu_user: process.cpuUsage().user,
            cpu_system: process.cpuUsage().system,
            load_avg_1m: os.loadavg()[0],
            load_avg_5m: os.loadavg()[1],
            load_avg_15m: os.loadavg()[2],
            uptime_secs: Math.floor((Date.now() - this.startTime) / 1000),
            free_mem: os.freemem(),
            total_mem: os.totalmem(),
        };
    }
    incrementHttpRequests(method, path, statusCode) {
        this.httpRequests.push({
            value: 1,
            labels: { method, path, status_code: String(statusCode) },
        });
        if (this.httpRequests.length > 10_000)
            this.httpRequests.shift();
    }
    incrementCounter(name, amount = 1) {
        this.customCounters.set(name, (this.customCounters.get(name) ?? 0) + amount);
    }
    setActiveConnections(count) {
        this.activeConnections.value = count;
    }
    renderPrometheus() {
        const lines = [];
        const comment = (name, help, type) => {
            lines.push(`# HELP ${name} ${help}`);
            lines.push(`# TYPE ${name} ${type}`);
        };
        comment('lumorius_process_start_time_seconds', 'Process start time', 'gauge');
        lines.push(`lumorius_process_start_time_seconds ${Math.floor(this.startTime / 1000)}`);
        comment('lumorius_uptime_seconds', 'Process uptime', 'gauge');
        lines.push(`lumorius_uptime_seconds ${Math.floor((Date.now() - this.startTime) / 1000)}`);
        comment('lumorius_heap_used_bytes', 'Heap memory used', 'gauge');
        lines.push(`lumorius_heap_used_bytes ${this.systemMetrics.heap_used ?? 0}`);
        comment('lumorius_heap_total_bytes', 'Total heap memory', 'gauge');
        lines.push(`lumorius_heap_total_bytes ${this.systemMetrics.heap_total ?? 0}`);
        comment('lumorius_rss_bytes', 'RSS memory', 'gauge');
        lines.push(`lumorius_rss_bytes ${this.systemMetrics.rss ?? 0}`);
        comment('lumorius_system_load_avg', 'System load average', 'gauge');
        lines.push(`lumorius_system_load_avg{window="1m"} ${this.systemMetrics.load_avg_1m ?? 0}`);
        lines.push(`lumorius_system_load_avg{window="5m"} ${this.systemMetrics.load_avg_5m ?? 0}`);
        lines.push(`lumorius_system_load_avg{window="15m"} ${this.systemMetrics.load_avg_15m ?? 0}`);
        comment('lumorius_system_free_memory_bytes', 'Free system memory', 'gauge');
        lines.push(`lumorius_system_free_memory_bytes ${this.systemMetrics.free_mem ?? 0}`);
        const reqCounts = new Map();
        for (const r of this.httpRequests) {
            const key = `method="${r.labels.method}",status_code="${r.labels.status_code}"`;
            reqCounts.set(key, (reqCounts.get(key) ?? 0) + 1);
        }
        comment('lumorius_http_requests_total', 'Total HTTP requests', 'counter');
        for (const [labels, count] of reqCounts) {
            lines.push(`lumorius_http_requests_total{${labels}} ${count}`);
        }
        comment('lumorius_active_connections', 'Active WebSocket connections', 'gauge');
        lines.push(`lumorius_active_connections ${this.activeConnections.value}`);
        for (const [name, value] of this.customCounters) {
            comment(`lumorius_${name}`, name, 'counter');
            lines.push(`lumorius_${name} ${value}`);
        }
        lines.push('');
        return lines.join('\n');
    }
};
exports.MetricsService = MetricsService;
exports.MetricsService = MetricsService = __decorate([
    (0, common_1.Injectable)()
], MetricsService);
//# sourceMappingURL=metrics.service.js.map
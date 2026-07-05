import { Injectable, OnModuleInit } from '@nestjs/common';
import * as os from 'os';

interface Counter  { value: number; labels: Record<string, string> }
interface Gauge    { value: number; labels: Record<string, string> }
interface Histogram { buckets: number[]; values: number[]; count: number; sum: number; labels: Record<string, string> }

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly startTime = Date.now();

  private httpRequests: Counter[]  = [];
  private httpDuration: Histogram[] = [];
  private activeConnections: Gauge = { value: 0, labels: {} };
  private customCounters: Map<string, number> = new Map();

  onModuleInit() {
    // Start periodic metric updates
    setInterval(() => this.collectSystemMetrics(), 15_000);
  }

  private systemMetrics: Record<string, number> = {};

  private collectSystemMetrics() {
    const mem = process.memoryUsage();
    this.systemMetrics = {
      heap_used:    mem.heapUsed,
      heap_total:   mem.heapTotal,
      rss:          mem.rss,
      external:     mem.external,
      cpu_user:     process.cpuUsage().user,
      cpu_system:   process.cpuUsage().system,
      load_avg_1m:  os.loadavg()[0],
      load_avg_5m:  os.loadavg()[1],
      load_avg_15m: os.loadavg()[2],
      uptime_secs:  Math.floor((Date.now() - this.startTime) / 1000),
      free_mem:     os.freemem(),
      total_mem:    os.totalmem(),
    };
  }

  incrementHttpRequests(method: string, path: string, statusCode: number) {
    this.httpRequests.push({
      value: 1,
      labels: { method, path, status_code: String(statusCode) },
    });
    // Keep last 10k entries
    if (this.httpRequests.length > 10_000) this.httpRequests.shift();
  }

  incrementCounter(name: string, amount = 1) {
    this.customCounters.set(name, (this.customCounters.get(name) ?? 0) + amount);
  }

  setActiveConnections(count: number) {
    this.activeConnections.value = count;
  }

  /** Render Prometheus text format */
  renderPrometheus(): string {
    const lines: string[] = [];

    const comment = (name: string, help: string, type: string) => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
    };

    // ── Process info ──────────────────────────────────────────
    comment('lumorius_process_start_time_seconds', 'Process start time', 'gauge');
    lines.push(`lumorius_process_start_time_seconds ${Math.floor(this.startTime / 1000)}`);

    comment('lumorius_uptime_seconds', 'Process uptime', 'gauge');
    lines.push(`lumorius_uptime_seconds ${Math.floor((Date.now() - this.startTime) / 1000)}`);

    // ── Memory ────────────────────────────────────────────────
    comment('lumorius_heap_used_bytes', 'Heap memory used', 'gauge');
    lines.push(`lumorius_heap_used_bytes ${this.systemMetrics.heap_used ?? 0}`);

    comment('lumorius_heap_total_bytes', 'Total heap memory', 'gauge');
    lines.push(`lumorius_heap_total_bytes ${this.systemMetrics.heap_total ?? 0}`);

    comment('lumorius_rss_bytes', 'RSS memory', 'gauge');
    lines.push(`lumorius_rss_bytes ${this.systemMetrics.rss ?? 0}`);

    // ── System ────────────────────────────────────────────────
    comment('lumorius_system_load_avg', 'System load average', 'gauge');
    lines.push(`lumorius_system_load_avg{window="1m"} ${this.systemMetrics.load_avg_1m ?? 0}`);
    lines.push(`lumorius_system_load_avg{window="5m"} ${this.systemMetrics.load_avg_5m ?? 0}`);
    lines.push(`lumorius_system_load_avg{window="15m"} ${this.systemMetrics.load_avg_15m ?? 0}`);

    comment('lumorius_system_free_memory_bytes', 'Free system memory', 'gauge');
    lines.push(`lumorius_system_free_memory_bytes ${this.systemMetrics.free_mem ?? 0}`);

    // ── HTTP requests ─────────────────────────────────────────
    const reqCounts = new Map<string, number>();
    for (const r of this.httpRequests) {
      const key = `method="${r.labels.method}",status_code="${r.labels.status_code}"`;
      reqCounts.set(key, (reqCounts.get(key) ?? 0) + 1);
    }

    comment('lumorius_http_requests_total', 'Total HTTP requests', 'counter');
    for (const [labels, count] of reqCounts) {
      lines.push(`lumorius_http_requests_total{${labels}} ${count}`);
    }

    // ── Active connections ────────────────────────────────────
    comment('lumorius_active_connections', 'Active WebSocket connections', 'gauge');
    lines.push(`lumorius_active_connections ${this.activeConnections.value}`);

    // ── Custom counters ───────────────────────────────────────
    for (const [name, value] of this.customCounters) {
      comment(`lumorius_${name}`, name, 'counter');
      lines.push(`lumorius_${name} ${value}`);
    }

    lines.push('');
    return lines.join('\n');
  }
}

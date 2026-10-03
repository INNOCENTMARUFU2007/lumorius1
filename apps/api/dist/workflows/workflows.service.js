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
exports.WorkflowsService = void 0;
const common_1 = require("@nestjs/common");
const bull_1 = require("@nestjs/bull");
const uuid_1 = require("uuid");
const database_service_1 = require("../database/database.service");
let WorkflowsService = class WorkflowsService {
    constructor(db, workflowsQueue) {
        this.db = db;
        this.workflowsQueue = workflowsQueue;
    }
    async create(organizationId, userId, dto) {
        const id = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO workflow_definitions (id, name, description, trigger_type, trigger_config, steps, organization_id, created_by_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, dto.name, dto.description ?? null, dto.triggerType,
            JSON.stringify(dto.triggerConfig), JSON.stringify(dto.steps),
            organizationId, userId]);
        return this.findById(id, organizationId);
    }
    async findAll(organizationId) {
        const res = await this.db.query(`SELECT wd.*, u.name as created_by_name,
              COUNT(wr.id) as run_count,
              COUNT(wr.id) FILTER (WHERE wr.status = 'completed') as successful_runs
       FROM workflow_definitions wd
       LEFT JOIN users u ON wd.created_by_id = u.id
       LEFT JOIN workflow_runs wr ON wr.workflow_id = wd.id
       WHERE wd.organization_id = $1
       GROUP BY wd.id, u.name
       ORDER BY wd.created_at DESC`, [organizationId]);
        return res.rows;
    }
    async findById(id, organizationId) {
        const res = await this.db.query('SELECT * FROM workflow_definitions WHERE id = $1 AND organization_id = $2', [id, organizationId]);
        if (!res.rows[0])
            throw new common_1.NotFoundException('Workflow not found');
        return res.rows[0];
    }
    async toggle(id, organizationId) {
        const wf = await this.findById(id, organizationId);
        const isActive = !wf.is_active;
        await this.db.query('UPDATE workflow_definitions SET is_active = $1, updated_at = NOW() WHERE id = $2', [isActive, id]);
        return { id, isActive };
    }
    async trigger(id, organizationId, triggerData) {
        const wf = await this.findById(id, organizationId);
        if (!wf.is_active) {
            throw new common_1.NotFoundException('Workflow is not active');
        }
        const runId = (0, uuid_1.v4)();
        await this.db.query(`INSERT INTO workflow_runs (id, workflow_id, status, trigger_data) VALUES ($1,$2,'running',$3)`, [runId, id, JSON.stringify(triggerData)]);
        await this.workflowsQueue.add('execute', {
            runId, workflowId: id, organizationId, triggerData,
        });
        return { runId, status: 'running' };
    }
    async getRuns(workflowId, organizationId) {
        await this.findById(workflowId, organizationId);
        const res = await this.db.query(`SELECT id, status, trigger_data, result, error_message, started_at, completed_at
       FROM workflow_runs WHERE workflow_id = $1 ORDER BY started_at DESC LIMIT 50`, [workflowId]);
        return res.rows;
    }
};
exports.WorkflowsService = WorkflowsService;
exports.WorkflowsService = WorkflowsService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bull_1.InjectQueue)('workflows')),
    __metadata("design:paramtypes", [database_service_1.DatabaseService, Object])
], WorkflowsService);
//# sourceMappingURL=workflows.service.js.map
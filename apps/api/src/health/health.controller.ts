import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    @InjectQueue('documents') private readonly documentsQueue: Queue,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    const checks: Record<string, string> = {};

    // DB check
    try {
      await this.db.query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    // Queue check
    try {
      await this.documentsQueue.client.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'error';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      checks,
    };
  }
}

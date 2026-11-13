import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GdprService } from './gdpr.service';

/**
 * GDPR Article 17 — Right to Erasure (NX-000015)
 *
 * Runs nightly at 02:00 UTC and purges every user account whose
 * 30-day deletion grace period has expired.
 *
 * The nightly job processes due account and organization deletion requests,
 * records per-request failures, and applies configured retention policies.
 */
@Injectable()
export class GdprDeletionScheduler {
  private readonly logger = new Logger(GdprDeletionScheduler.name);

  constructor(private readonly gdprService: GdprService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name:     'gdpr-deletion',
    timeZone: 'UTC',
  })
  async processExpiredDeletionRequests(): Promise<void> {
    this.logger.log('GDPR nightly deletion job — starting');

    try {
      const result = await this.gdprService.purgeScheduledDeletions();

      if (result.purged || result.failed || result.organizations.purged || result.organizations.failed) {
        this.logger.log(
          `GDPR nightly job completed: accounts=${result.purged}, accountFailures=${result.failed}, ` +
          `organizations=${result.organizations.purged}, organizationFailures=${result.organizations.failed}, ` +
          `auditLogsExpired=${result.retention.auditLogs}, transcriptsExpired=${result.retention.meetingTranscripts}`,
        );
      } else {
        this.logger.log('GDPR nightly job completed with no due deletion requests');
      }
    } catch (err) {
      this.logger.error('GDPR nightly deletion job — unexpected error', err);
      throw err;
    }
  }
}

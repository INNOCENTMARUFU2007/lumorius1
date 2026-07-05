import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GdprService } from './gdpr.service';

/**
 * GDPR Article 17 — Right to Erasure (NX-000015)
 *
 * Runs nightly at 02:00 UTC and purges every user account whose
 * 30-day deletion grace period has expired.
 *
 * Flow:
 *  1. User calls DELETE /api/v1/gdpr/me  → GdprService.requestDeletion()
 *     sets deletion_scheduled_at = NOW() + 30 days, is_active = false
 *  2. This cron wakes up, finds rows where deletion_scheduled_at <= NOW()
 *  3. GdprService.purgeScheduledDeletions() anonymises each account and
 *     removes sessions / API keys
 *  4. An audit_log row records the completion
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

      if (result.purged === 0) {
        this.logger.log('GDPR nightly deletion job — no accounts due for deletion');
      } else {
        this.logger.warn(
          `GDPR nightly deletion job — purged ${result.purged} account(s)`,
        );
      }
    } catch (err) {
      this.logger.error('GDPR nightly deletion job — unexpected error', err);
      throw err;
    }
  }
}

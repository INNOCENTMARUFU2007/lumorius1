import { ForbiddenException, PayloadTooLargeException } from '@nestjs/common';
import type { PoolClient } from 'pg';

export async function reserveWorkspaceStorage(client: PoolClient, organizationId: string, bytes: number) {
  const reserved = await client.query(
    `UPDATE organizations o SET storage_used_bytes = COALESCE(o.storage_used_bytes, 0) + $2::bigint
      FROM billing_plans p
      CROSS JOIN LATERAL (
        SELECT COALESCE((p.limits->>'storage_bytes')::numeric,
          (p.limits->>'storage_gb')::numeric * 1073741824, 500000000) AS cap
      ) quota
      WHERE o.id = $1 AND p.id = o.plan_id::text
        AND (quota.cap < 0 OR COALESCE(o.storage_used_bytes, 0) + $2::bigint <= quota.cap)
      RETURNING o.id`,
    [organizationId, bytes],
  );
  if (reserved.rowCount !== 1) throw new PayloadTooLargeException('This upload exceeds the workspace storage allowance.');
}

/**
 * Enforces the plan's document allowance inside the upload transaction.
 * The organisation row is locked so concurrent uploads cannot both pass the cap.
 * A missing limit falls back to the trial allowance (fail closed).
 */
export async function assertDocumentAllowance(client: PoolClient, organizationId: string) {
  const res = await client.query<{ cap: number | null; used: number }>(
    `SELECT NULLIF(p.limits ->> 'documents', '')::integer AS cap,
            (SELECT COUNT(*)::int FROM documents d WHERE d.organization_id = o.id) AS used
       FROM organizations o
       LEFT JOIN billing_plans p ON p.id = o.plan_id::text
      WHERE o.id = $1
      FOR UPDATE OF o`,
    [organizationId],
  );
  const row = res.rows[0];
  const cap = row?.cap ?? 50;
  if (cap >= 0 && Number(row?.used ?? 0) >= cap) {
    throw new ForbiddenException({
      code: 'document_limit_reached',
      message: `Your plan includes ${cap} documents. Delete unused documents or upgrade to add more.`,
      upgradeUrl: '/billing',
    });
  }
}

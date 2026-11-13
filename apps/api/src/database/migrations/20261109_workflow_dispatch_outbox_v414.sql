BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

DO $v414_preflight$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.tasks
        WHERE metadata ? 'workflowExecutionKey'
          AND metadata ->> 'workflowExecutionKey' IS NOT NULL
        GROUP BY organization_id, metadata ->> 'workflowExecutionKey'
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'V4.14 migration blocked: duplicate workflow task execution keys exist.';
    END IF;
END;
$v414_preflight$;

ALTER TABLE public.workflow_runs
    DROP CONSTRAINT IF EXISTS workflow_runs_status_check;

ALTER TABLE public.workflow_runs
    ADD CONSTRAINT workflow_runs_status_check
    CHECK (
        status = ANY (
            ARRAY[
                'queued',
                'running',
                'completed',
                'failed',
                'cancelled'
            ]::text[]
        )
    );

ALTER TABLE public.workflow_runs
    ADD COLUMN execution_lease_token UUID,
    ADD COLUMN execution_lease_expires_at TIMESTAMPTZ,
    ADD COLUMN execution_heartbeat_at TIMESTAMPTZ,
    ADD COLUMN execution_attempt_count INTEGER NOT NULL DEFAULT 0
        CHECK (execution_attempt_count >= 0);

ALTER TABLE public.workflow_runs
    ADD CONSTRAINT workflow_runs_execution_lease_consistency
    CHECK (
        (
            execution_lease_token IS NULL
            AND execution_lease_expires_at IS NULL
            AND execution_heartbeat_at IS NULL
        )
        OR
        (
            execution_lease_token IS NOT NULL
            AND execution_lease_expires_at IS NOT NULL
            AND execution_heartbeat_at IS NOT NULL
        )
    );

CREATE INDEX idx_workflow_runs_expired_execution_lease
    ON public.workflow_runs (execution_lease_expires_at, id)
    WHERE status = 'running'
      AND execution_lease_token IS NOT NULL;
CREATE TABLE public.workflow_run_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workflow_run_id UUID NOT NULL
        REFERENCES public.workflow_runs(id)
        ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status = ANY (
                ARRAY[
                    'pending',
                    'processing',
                    'enqueued',
                    'dead_letter',
                    'cancelled'
                ]::text[]
            )
        ),

    attempt_count INTEGER NOT NULL DEFAULT 0
        CHECK (attempt_count >= 0),

    dispatch_generation INTEGER NOT NULL DEFAULT 1
        CHECK (dispatch_generation >= 1),

    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    lease_token UUID,
    lease_expires_at TIMESTAMPTZ,

    last_error TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    enqueued_at TIMESTAMPTZ,
    dead_lettered_at TIMESTAMPTZ,

    CONSTRAINT workflow_run_dispatches_run_unique
        UNIQUE (workflow_run_id),

    CONSTRAINT workflow_run_dispatches_lease_consistency
        CHECK (
            (
                status = 'processing'
                AND lease_token IS NOT NULL
                AND lease_expires_at IS NOT NULL
            )
            OR
            (
                status <> 'processing'
                AND lease_token IS NULL
                AND lease_expires_at IS NULL
            )
        )
);

CREATE INDEX idx_workflow_run_dispatches_pending
    ON public.workflow_run_dispatches (available_at, created_at, id)
    WHERE status = 'pending';

CREATE INDEX idx_workflow_run_dispatches_expired_lease
    ON public.workflow_run_dispatches (lease_expires_at, created_at, id)
    WHERE status = 'processing';

CREATE UNIQUE INDEX uq_tasks_workflow_execution_key
    ON public.tasks (
        organization_id,
        (metadata ->> 'workflowExecutionKey')
    )
    WHERE metadata ? 'workflowExecutionKey'
      AND metadata ->> 'workflowExecutionKey' IS NOT NULL;

COMMIT;
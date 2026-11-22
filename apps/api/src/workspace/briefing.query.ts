/* $1 organization, $2 actor, $3 org administrator, $4 manager or higher, $5 lookback days */
export const BRIEFING_ITEMS = `
WITH visible_projects AS (
  SELECT p.* FROM projects p
  WHERE p.organization_id = $1
    AND (p.team_id IS NULL OR $3 OR EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = p.team_id AND tm.user_id = $2
    ))
), visible_decisions AS (
  SELECT d.* FROM knowledge_decisions d
  WHERE d.organization_id = $1
    AND (d.team_id IS NULL OR $3 OR EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = d.team_id AND tm.user_id = $2
    ))
), recent_kpis AS (
  SELECT k.id, k.metric_key, k.metric_value, k.snapshot_date,
         LAG(k.metric_value) OVER series AS previous,
         ROW_NUMBER() OVER (PARTITION BY k.metric_key ORDER BY k.snapshot_date DESC, k.created_at DESC, k.id DESC) AS recency
  FROM kpi_snapshots k
  WHERE $4 AND k.organization_id = $1 AND k.snapshot_date >= CURRENT_DATE - 45
  WINDOW series AS (PARTITION BY k.metric_key ORDER BY k.snapshot_date, k.created_at, k.id)
), items AS (
  SELECT 'commitment' AS kind, t.id, t.title, COALESCE(t.assignee_id, t.created_by_id) AS owner_id,
         COALESCE(t.team_id, p.team_id) AS team_id, t.due_date::timestamptz AS deadline, t.updated_at AS activity,
         CASE WHEN t.due_date::date < CURRENT_DATE THEN 0 ELSE 2 END AS severity,
         CASE WHEN t.due_date::date < CURRENT_DATE THEN 'Open task past its due date' ELSE 'Open task due within three days' END AS reason,
         'Confirm the next step or agree a new due date with the owner.' AS next_step
  FROM tasks t LEFT JOIN projects p ON p.id = t.project_id AND p.organization_id = t.organization_id
  WHERE t.organization_id = $1 AND t.status::text NOT IN ('done', 'completed', 'cancelled')
    AND t.due_date::date <= CURRENT_DATE + 3
    AND ($4 OR t.assignee_id = $2 OR t.created_by_id = $2)
    AND (COALESCE(t.team_id, p.team_id) IS NULL OR $3 OR EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = COALESCE(t.team_id, p.team_id) AND tm.user_id = $2
    ))
  UNION ALL
  SELECT 'project', p.id, p.name, p.owner_id, p.team_id, p.end_date::timestamptz, p.updated_at,
         CASE WHEN p.end_date::date < CURRENT_DATE THEN 0 ELSE 1 END,
         CASE WHEN p.end_date::date < CURRENT_DATE THEN 'Active project past its end date' ELSE 'No project or task update for 14 days' END,
         'Review the blocker with the project owner and set the next milestone.'
  FROM visible_projects p
  WHERE p.status::text IN ('active', 'in_progress', 'on_hold')
    AND ($4 OR p.owner_id = $2)
    AND (p.end_date::date < CURRENT_DATE OR (
      p.updated_at < NOW() - INTERVAL '14 days' AND NOT EXISTS (
        SELECT 1 FROM tasks t WHERE t.organization_id = $1 AND t.project_id = p.id
          AND t.updated_at >= NOW() - INTERVAL '14 days'
          AND (COALESCE(t.team_id, p.team_id) IS NULL OR $3 OR EXISTS (
            SELECT 1 FROM team_members tm WHERE tm.team_id = COALESCE(t.team_id, p.team_id) AND tm.user_id = $2
          ))
      )
    ))
  UNION ALL
  SELECT 'approval', d.id, d.title, d.owner_id, d.team_id, d.approval_due_at, d.updated_at,
         CASE WHEN d.approval_due_at < NOW() OR d.priority IN ('critical', 'high') THEN 0 ELSE 1 END,
         CASE WHEN d.approval_due_at < NOW() THEN 'Decision approval deadline passed' ELSE
           'Decision proposed · ' || COALESCE(d.approval_required_role, 'authorized') || ' approval required' END,
         'Open the decision to verify the evidence and check your approval authority.'
  FROM visible_decisions d
  WHERE d.status = 'proposed' AND ($4 OR d.owner_id = $2 OR d.created_by_id = $2 OR EXISTS (
    SELECT 1 FROM knowledge_decision_delegations delegate
    WHERE delegate.organization_id = $1 AND delegate.delegate_user_id = $2 AND delegate.revoked_at IS NULL
      AND NOW() BETWEEN delegate.valid_from AND delegate.valid_until
      AND (delegate.decision_type IS NULL OR delegate.decision_type = d.decision_type)
      AND (delegate.priority IS NULL OR delegate.priority = d.priority)
      AND d.approval_delegation_allowed = TRUE
  ))
  UNION ALL
  SELECT 'decision', d.id, d.title, d.approved_by_id, d.team_id, d.review_due_at, d.updated_at,
         CASE WHEN d.review_due_at < NOW() AND d.reviewed_at IS NULL THEN 0 ELSE 2 END,
         CASE WHEN d.review_due_at < NOW() AND d.reviewed_at IS NULL THEN 'Decision review is overdue' ELSE 'Decision ' || d.status END,
         'Review the rationale, linked evidence, and decision outcome.'
  FROM visible_decisions d
  WHERE d.status IN ('approved', 'implemented', 'reviewed', 'rejected')
    AND (d.updated_at >= NOW() - $5::integer * INTERVAL '1 day' OR (d.review_due_at < NOW() AND d.reviewed_at IS NULL AND d.status <> 'rejected'))
  UNION ALL
  SELECT 'meeting', m.id, m.title, m.created_by_id, m.team_id, NULL, m.completed_at, 2,
         'Meeting completed during this briefing period', 'Review the meeting and confirm who owns each commitment.'
  FROM meetings m
  WHERE m.organization_id = $1 AND m.status::text = 'completed'
    AND m.completed_at >= NOW() - $5::integer * INTERVAL '1 day'
    AND (m.team_id IS NULL OR $3 OR EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.team_id = m.team_id AND tm.user_id = $2
    ))
    AND ($4 OR m.created_by_id = $2)
  UNION ALL
  SELECT 'objective', o.id, o.title, o.owner_id, NULL, o.due_date::timestamptz, o.updated_at,
         CASE WHEN o.status = 'behind' THEN 0 ELSE 1 END,
         'Objective marked ' || replace(o.status, '_', ' '),
         'Check the leading indicators and agree a recovery action.'
  FROM objectives o WHERE o.organization_id = $1 AND ($4 OR o.owner_id = $2)
    AND o.status IN ('behind', 'at_risk')
  UNION ALL
  SELECT 'kpi', k.id, replace(k.metric_key, '_', ' '), NULL, NULL, NULL, k.snapshot_date::timestamptz, 1,
         format('Latest KPI moved from %s to %s (change of at least 20%%)', k.previous, k.metric_value),
         'Confirm the movement against the KPI definition and reporting period.'
  FROM recent_kpis k
  WHERE k.recency = 1 AND k.snapshot_date >= CURRENT_DATE - $5::integer
    AND k.previous <> 0 AND abs(k.metric_value - k.previous) >= abs(k.previous) * 0.2
  UNION ALL
  SELECT 'renewal', c.id, c.customer_key, c.created_by_id, NULL, c.end_date::timestamptz, c.updated_at,
         CASE WHEN c.end_date <= CURRENT_DATE + 7 THEN 0 ELSE 1 END,
         'Active customer contract ends within 30 days',
         'Confirm the customer renewal plan and follow-up owner.'
  FROM executive_customer_contracts c
  WHERE $3 AND c.organization_id = $1 AND c.status = 'active' AND c.cancelled_at IS NULL
    AND c.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
  UNION ALL
  SELECT 'financial_approval', f.id, format('%s · %s %s', replace(f.transaction_type, '_', ' '), f.currency, f.amount),
         f.proposed_by_id, f.team_id, NULL, f.created_at, 1,
         'AI-extracted transaction awaits verification against its source document',
         'Review the cited passage before approving or rejecting the transaction.'
  FROM executive_financial_candidates f
  JOIN documents d ON d.id = f.document_id AND d.organization_id = f.organization_id
  WHERE $3 AND f.organization_id = $1 AND f.status = 'pending'
), ranked AS (
  SELECT items.*, kind || ':' || items.id AS item_key, u.name AS owner_name, f.disposition,
         follow_up.id AS follow_up_id, follow_up.status AS follow_up_status,
         ROW_NUMBER() OVER (PARTITION BY kind, COALESCE(f.disposition = 'dismissed' AND severity > 0, FALSE)
           ORDER BY severity, (f.disposition = 'useful') DESC NULLS LAST, deadline NULLS LAST, activity DESC, items.id) AS item_rank
  FROM items
  LEFT JOIN users u ON u.id = items.owner_id AND u.organization_id = $1
  LEFT JOIN briefing_feedback f ON f.organization_id = $1 AND f.user_id = $2 AND f.item_key = kind || ':' || items.id
  LEFT JOIN LATERAL (
    SELECT t.id, t.status FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id AND p.organization_id = t.organization_id
    WHERE t.organization_id = $1 AND t.created_by_id = $2
      AND t.metadata ->> 'briefingItemKey' = kind || ':' || items.id
      AND (COALESCE(t.team_id, p.team_id) IS NULL OR $3 OR EXISTS (
        SELECT 1 FROM team_members tm WHERE tm.team_id = COALESCE(t.team_id, p.team_id) AND tm.user_id = $2
      ))
    ORDER BY t.created_at DESC, t.id LIMIT 1
  ) follow_up ON TRUE
)
`;

/*
# Stage 2 fix-ups

1. Voting credit history now accepts the 'upgrade_grant' source so mid-month upgrades are recorded.
2. Reconciliation "mark resolved" writes to the audit log using its real columns.
*/

ALTER TABLE voting_credit_ledger DROP CONSTRAINT IF EXISTS voting_credit_ledger_source_check;
ALTER TABLE voting_credit_ledger ADD CONSTRAINT voting_credit_ledger_source_check
  CHECK (source = ANY (ARRAY['monthly_grant','initial_grant','upgrade_grant','initiative_vote_spend','initiative_vote_refund']));

CREATE OR REPLACE FUNCTION public.resolve_reconciliation_run(p_run_id uuid, p_notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.require_sub_role('financial_admin');
  IF p_notes IS NULL OR length(trim(p_notes)) < 5 THEN
    RAISE EXCEPTION 'A resolution note is required';
  END IF;
  UPDATE stripe_reconciliation_runs SET status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
    resolution_notes = left(trim(p_notes), 1000)
  WHERE id = p_run_id AND status = 'discrepancy';
  IF NOT FOUND THEN RAISE EXCEPTION 'This run does not need resolving'; END IF;
  INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (auth.uid(), 'reconciliation_resolved', 'stripe_reconciliation_run', p_run_id, jsonb_build_object('notes', left(trim(p_notes), 1000)));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.resolve_reconciliation_run(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_reconciliation_run(uuid, text) TO authenticated;

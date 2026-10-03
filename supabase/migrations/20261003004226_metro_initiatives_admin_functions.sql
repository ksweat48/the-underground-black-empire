/*
# Metro Initiative Voting — admin tools

1. New Functions (admins only; every function checks is_current_user_admin())
- `admin_review_initiative(initiative, decision, reason)` — approve a new submission to Eligible, or
  disqualify it (reason required).
- `admin_set_initiative_outcome(cycle, initiative, action, reason)` — after a vote: disqualify (failed review),
  defer, or approve staged funding. Reason required. The next-ranked initiative then moves up the queue.
- `admin_release_initiative_funding(cycle, initiative, amount_cents, payment_reference)` — releases money after
  verification. Enforces vote-ranked order (no higher-ranked initiative may still be waiting), full fundability
  unless staged funding was approved, and a payment reference. Records a `release` entry in the Metro Treasury
  ledger so it appears on the Metro Treasury page.
- `admin_complete_initiative(initiative, note)` — marks a funded initiative Completed.
- `admin_cancel_initiative_cycle(cycle, reason)` — for system/admin errors only, before any funds are released.
  Refunds every Voting Credit spent, reverses the +25 Influence, marks the cycle Cancelled with the reason,
  returns initiatives to Eligible and notifies the Metro.
- `admin_initiative_overview()` — review queue, funding queue and recent cycles for the admin console.

2. Security
- SECURITY DEFINER, fixed search_path, EXECUTE only for authenticated (non-admins are rejected inside).
*/

CREATE OR REPLACE FUNCTION public.admin_review_initiative(p_initiative_id uuid, p_decision text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_init initiatives%ROWTYPE;
  v_owner uuid;
  v_to text;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT * INTO v_init FROM initiatives WHERE id = p_initiative_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Initiative not found'; END IF;
  IF p_decision = 'approve' THEN
    IF v_init.status NOT IN ('submitted','deferred') THEN RAISE EXCEPTION 'Only submitted or deferred initiatives can be approved'; END IF;
    v_to := 'eligible';
  ELSIF p_decision = 'disqualify' THEN
    IF v_init.status NOT IN ('submitted','eligible','deferred') THEN RAISE EXCEPTION 'Use the cycle funding queue for initiatives in a vote'; END IF;
    IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN RAISE EXCEPTION 'A written reason is required'; END IF;
    v_to := 'disqualified';
  ELSE
    RAISE EXCEPTION 'Unknown decision';
  END IF;

  UPDATE initiatives SET status = v_to, updated_at = now() WHERE id = p_initiative_id;
  PERFORM public._initiative_log(p_initiative_id, CASE WHEN v_to = 'eligible' THEN 'approved' ELSE 'disqualified' END,
    v_init.status, v_to, v_uid, COALESCE(NULLIF(btrim(p_reason), ''), 'Approved for the Metro ranking.'));

  SELECT owner_id INTO v_owner FROM organizations WHERE id = v_init.organization_id;
  IF v_owner IS NOT NULL THEN
    PERFORM public.create_notification(v_owner, 'initiative_review',
      CASE WHEN v_to = 'eligible' THEN 'Your initiative is eligible' ELSE 'Your initiative was disqualified' END,
      CASE WHEN v_to = 'eligible' THEN '"' || v_init.title || '" is now in the Metro ranking. Members can back it.'
           ELSE '"' || v_init.title || '": ' || btrim(p_reason) END,
      '/initiatives/' || p_initiative_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_initiative_outcome(p_cycle_id uuid, p_initiative_id uuid, p_action text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entry initiative_cycle_entries%ROWTYPE;
  v_init initiatives%ROWTYPE;
  v_to text;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 5 THEN RAISE EXCEPTION 'A written reason is required'; END IF;
  SELECT * INTO v_entry FROM initiative_cycle_entries WHERE cycle_id = p_cycle_id AND initiative_id = p_initiative_id FOR UPDATE;
  IF NOT FOUND OR v_entry.outcome NOT IN ('pending_review','awaiting_funding') THEN
    RAISE EXCEPTION 'This initiative is not waiting for review or funding';
  END IF;
  SELECT * INTO v_init FROM initiatives WHERE id = p_initiative_id FOR UPDATE;

  IF p_action = 'approve_staged' THEN
    UPDATE initiatives SET staged_funding_approved = true, updated_at = now() WHERE id = p_initiative_id;
    UPDATE initiative_cycle_entries SET outcome_note = btrim(p_reason) WHERE cycle_id = p_cycle_id AND initiative_id = p_initiative_id;
    PERFORM public._initiative_log(p_initiative_id, 'staged_funding_approved', v_init.status, v_init.status, v_uid, btrim(p_reason), p_cycle_id);
    RETURN;
  ELSIF p_action IN ('disqualify','defer') THEN
    IF v_init.funded_cents > 0 THEN RAISE EXCEPTION 'Funds were already released to this initiative'; END IF;
    v_to := CASE WHEN p_action = 'disqualify' THEN 'disqualified' ELSE 'deferred' END;
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;

  UPDATE initiative_cycle_entries SET outcome = v_to, outcome_note = btrim(p_reason)
  WHERE cycle_id = p_cycle_id AND initiative_id = p_initiative_id;
  UPDATE initiatives SET status = v_to, updated_at = now() WHERE id = p_initiative_id;
  PERFORM public._initiative_log(p_initiative_id, v_to, v_init.status, v_to, v_uid, btrim(p_reason), p_cycle_id);
  PERFORM public._refresh_cycle_funding_queue(p_cycle_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_release_initiative_funding(p_cycle_id uuid, p_initiative_id uuid, p_amount_cents bigint, p_payment_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cycle initiative_cycles%ROWTYPE;
  v_entry initiative_cycle_entries%ROWTYPE;
  v_init initiatives%ROWTYPE;
  v_org organizations%ROWTYPE;
  v_remaining bigint;
  v_available bigint;
  v_full boolean;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_payment_reference IS NULL OR char_length(btrim(p_payment_reference)) < 3 THEN RAISE EXCEPTION 'A payment reference is required'; END IF;

  SELECT * INTO v_cycle FROM initiative_cycles WHERE id = p_cycle_id;
  IF NOT FOUND OR v_cycle.status <> 'results_posted' OR NOT COALESCE(v_cycle.quorum_met, false) THEN
    RAISE EXCEPTION 'This cycle cannot fund initiatives';
  END IF;
  SELECT * INTO v_entry FROM initiative_cycle_entries WHERE cycle_id = p_cycle_id AND initiative_id = p_initiative_id FOR UPDATE;
  IF NOT FOUND OR v_entry.outcome NOT IN ('pending_review','awaiting_funding') THEN
    RAISE EXCEPTION 'This initiative is not in the funding queue';
  END IF;
  IF EXISTS (SELECT 1 FROM initiative_cycle_entries WHERE cycle_id = p_cycle_id
             AND outcome IN ('pending_review','awaiting_funding') AND final_rank < v_entry.final_rank) THEN
    RAISE EXCEPTION 'A higher-ranked initiative must be funded, deferred or disqualified first';
  END IF;

  SELECT * INTO v_init FROM initiatives WHERE id = p_initiative_id FOR UPDATE;
  v_remaining := v_init.amount_requested_cents - v_init.funded_cents;
  v_available := public._metro_available_cents(v_cycle.metro_id);

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 OR p_amount_cents > v_remaining THEN
    RAISE EXCEPTION 'Release amount must be between $0.01 and the remaining request';
  END IF;
  IF NOT v_init.staged_funding_approved AND p_amount_cents <> v_remaining THEN
    RAISE EXCEPTION 'Partial releases need staged funding approval';
  END IF;
  IF p_amount_cents > v_available THEN
    RAISE EXCEPTION 'The Available Treasury cannot cover this release';
  END IF;

  INSERT INTO metro_treasury_ledger (metro_id, entry_type, amount_cents, source_event_id, notes, member_id)
  VALUES (v_cycle.metro_id, 'release', -p_amount_cents, 'initiative:' || p_initiative_id,
          'Initiative funding: ' || v_init.title || ' (ref ' || btrim(p_payment_reference) || ')', v_uid);

  v_full := v_init.funded_cents + p_amount_cents >= v_init.amount_requested_cents;
  UPDATE initiatives SET
    funded_cents = funded_cents + p_amount_cents,
    payment_reference = CASE WHEN payment_reference IS NULL THEN btrim(p_payment_reference)
                             ELSE payment_reference || ', ' || btrim(p_payment_reference) END,
    status = CASE WHEN v_full THEN 'funded' ELSE 'awaiting_funding' END,
    funded_at = CASE WHEN v_full THEN now() ELSE funded_at END,
    updated_at = now()
  WHERE id = p_initiative_id;
  UPDATE initiative_cycle_entries SET outcome = CASE WHEN v_full THEN 'funded' ELSE 'awaiting_funding' END
  WHERE cycle_id = p_cycle_id AND initiative_id = p_initiative_id;

  PERFORM public._initiative_log(p_initiative_id, CASE WHEN v_full THEN 'funded' ELSE 'staged_release' END,
    v_init.status, CASE WHEN v_full THEN 'funded' ELSE 'awaiting_funding' END, v_uid,
    'Released $' || to_char(p_amount_cents / 100.0, 'FM999,999,990.00') || ' after verification. Payment ref ' || btrim(p_payment_reference) || '.',
    p_cycle_id);

  SELECT * INTO v_org FROM organizations WHERE id = v_init.organization_id;
  IF v_org.owner_id IS NOT NULL THEN
    PERFORM public.create_notification(v_org.owner_id, 'initiative_funded',
      CASE WHEN v_full THEN 'Your initiative is funded' ELSE 'A funding stage was released' END,
      '"' || v_init.title || '" received $' || to_char(p_amount_cents / 100.0, 'FM999,999,990.00') || ' from the Metro Treasury.',
      '/initiatives/' || p_initiative_id);
  END IF;

  PERFORM public._refresh_cycle_funding_queue(p_cycle_id);
  RETURN jsonb_build_object('funded_cents', v_init.funded_cents + p_amount_cents, 'fully_funded', v_full);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_complete_initiative(p_initiative_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_init initiatives%ROWTYPE;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  SELECT * INTO v_init FROM initiatives WHERE id = p_initiative_id FOR UPDATE;
  IF NOT FOUND OR v_init.status <> 'funded' THEN RAISE EXCEPTION 'Only funded initiatives can be completed'; END IF;
  UPDATE initiatives SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = p_initiative_id;
  PERFORM public._initiative_log(p_initiative_id, 'completed', 'funded', 'completed', auth.uid(),
    COALESCE(NULLIF(btrim(p_note), ''), 'Marked complete.'));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_initiative_cycle(p_cycle_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cycle initiative_cycles%ROWTYPE;
  b record;
  e record;
  v_refunded int := 0;
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 THEN RAISE EXCEPTION 'Describe the system or admin error (at least 10 characters)'; END IF;
  SELECT * INTO v_cycle FROM initiative_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF NOT FOUND OR v_cycle.status NOT IN ('open','results_posted') THEN RAISE EXCEPTION 'This cycle cannot be cancelled'; END IF;
  IF EXISTS (SELECT 1 FROM initiative_cycle_entries WHERE cycle_id = p_cycle_id AND outcome = 'funded')
     OR EXISTS (SELECT 1 FROM initiative_events WHERE cycle_id = p_cycle_id AND event_type IN ('funded','staged_release')) THEN
    RAISE EXCEPTION 'Funds were already released from this cycle, so it is complete and cannot be cancelled';
  END IF;

  FOR b IN SELECT * FROM initiative_ballots WHERE cycle_id = p_cycle_id AND NOT refunded FOR UPDATE LOOP
    INSERT INTO voting_credits (member_id, balance) VALUES (b.member_id, 0) ON CONFLICT (member_id) DO NOTHING;
    UPDATE voting_credits SET balance = balance + b.credits_spent, updated_at = now() WHERE member_id = b.member_id;
    INSERT INTO voting_credit_ledger (member_id, amount, source, reference_id)
    VALUES (b.member_id, b.credits_spent, 'initiative_vote_refund', b.id);
    PERFORM public.award_influence(b.member_id, 'initiative_ballot_reversal', -25, p_cycle_id,
      'initiative_ballot_reversal:' || p_cycle_id || ':' || b.member_id, 'Cycle cancelled: ' || btrim(p_reason));
    UPDATE initiative_ballots SET refunded = true WHERE id = b.id;
    v_refunded := v_refunded + 1;
  END LOOP;

  FOR e IN SELECT ce.initiative_id, i.status FROM initiative_cycle_entries ce JOIN initiatives i ON i.id = ce.initiative_id
           WHERE ce.cycle_id = p_cycle_id AND ce.outcome NOT IN ('disqualified','withdrawn','deferred') LOOP
    UPDATE initiative_cycle_entries SET outcome = 'cancelled', outcome_note = btrim(p_reason)
    WHERE cycle_id = p_cycle_id AND initiative_id = e.initiative_id;
    IF e.status IN ('in_voting','awaiting_review','awaiting_funding') THEN
      UPDATE initiatives SET status = 'eligible', updated_at = now() WHERE id = e.initiative_id;
    END IF;
    PERFORM public._initiative_log(e.initiative_id, 'cycle_cancelled', e.status, 'eligible', v_uid, btrim(p_reason), p_cycle_id);
  END LOOP;

  UPDATE initiative_cycles SET status = 'cancelled', cancel_reason = btrim(p_reason), cancelled_by = v_uid
  WHERE id = p_cycle_id;

  PERFORM public._notify_metro_voters(v_cycle.metro_id, 'initiative_cycle_cancelled', 'Initiative vote cancelled',
    'This cycle was cancelled: ' || btrim(p_reason) || ' Any Voting Credits you spent have been refunded.', '/initiatives');
  RETURN jsonb_build_object('ballots_refunded', v_refunded);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_initiative_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'Admins only'; END IF;
  RETURN jsonb_build_object(
    'review_queue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'title', i.title, 'description', i.description, 'impact', i.impact, 'timeline', i.timeline,
        'conflict_disclosure', i.conflict_disclosure, 'amount_requested_cents', i.amount_requested_cents,
        'status', i.status, 'created_at', i.created_at, 'organization_name', o.name, 'metro_name', mt.name,
        'metro_available_cents', public._metro_available_cents(i.metro_id)
      ) ORDER BY i.created_at)
      FROM initiatives i JOIN organizations o ON o.id = i.organization_id JOIN metros mt ON mt.id = i.metro_id
      WHERE i.status IN ('submitted','deferred')), '[]'::jsonb),
    'funding_queue', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'cycle_id', c.id, 'initiative_id', i.id, 'title', i.title, 'organization_name', o.name, 'metro_name', mt.name,
        'final_rank', e.final_rank, 'support_ballots', e.support_ballots, 'weighted_support', e.weighted_support,
        'ballot_count', c.ballot_count, 'outcome', e.outcome, 'amount_requested_cents', i.amount_requested_cents,
        'funded_cents', i.funded_cents, 'staged_funding_approved', i.staged_funding_approved,
        'metro_available_cents', public._metro_available_cents(c.metro_id),
        'is_next', NOT EXISTS (SELECT 1 FROM initiative_cycle_entries e2 WHERE e2.cycle_id = c.id
          AND e2.outcome IN ('pending_review','awaiting_funding') AND e2.final_rank < e.final_rank),
        'closes_at', c.closes_at
      ) ORDER BY c.closes_at, e.final_rank)
      FROM initiative_cycle_entries e JOIN initiative_cycles c ON c.id = e.cycle_id
      JOIN initiatives i ON i.id = e.initiative_id JOIN organizations o ON o.id = i.organization_id
      JOIN metros mt ON mt.id = c.metro_id
      WHERE e.outcome IN ('pending_review','awaiting_funding')), '[]'::jsonb),
    'funded', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'organization_name', o.name,
        'funded_cents', i.funded_cents, 'funded_at', i.funded_at, 'payment_reference', i.payment_reference) ORDER BY i.funded_at DESC)
      FROM initiatives i JOIN organizations o ON o.id = i.organization_id WHERE i.status = 'funded'), '[]'::jsonb),
    'cycles', COALESCE((
      SELECT jsonb_agg(x.j ORDER BY x.opens_at DESC) FROM (
        SELECT c.opens_at, jsonb_build_object(
          'id', c.id, 'metro_name', mt.name, 'opens_at', c.opens_at, 'closes_at', c.closes_at, 'status', c.status,
          'skip_reason', c.skip_reason, 'cancel_reason', c.cancel_reason, 'eligible_voter_count', c.eligible_voter_count,
          'quorum_required', c.quorum_required, 'quorum_met', c.quorum_met,
          'ballot_count', CASE WHEN c.status = 'open'
            THEN (SELECT count(*) FROM initiative_ballots b WHERE b.cycle_id = c.id AND NOT b.refunded) ELSE c.ballot_count END,
          'entry_count', (SELECT count(*) FROM initiative_cycle_entries e WHERE e.cycle_id = c.id),
          'can_cancel', c.status IN ('open','results_posted') AND NOT EXISTS (
            SELECT 1 FROM initiative_events ev WHERE ev.cycle_id = c.id AND ev.event_type IN ('funded','staged_release'))
        ) AS j
        FROM initiative_cycles c JOIN metros mt ON mt.id = c.metro_id
        ORDER BY c.opens_at DESC LIMIT 40) x), '[]'::jsonb)
  );
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.admin_review_initiative(uuid, text, text)',
    'public.admin_set_initiative_outcome(uuid, uuid, text, text)',
    'public.admin_release_initiative_funding(uuid, uuid, bigint, text)',
    'public.admin_complete_initiative(uuid, text)',
    'public.admin_cancel_initiative_cycle(uuid, text)',
    'public.admin_initiative_overview()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

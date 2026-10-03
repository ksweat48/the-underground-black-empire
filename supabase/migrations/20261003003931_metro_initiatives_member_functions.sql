/*
# Metro Initiative Voting — member actions and page data

1. New Functions (callable by signed-in members)
- `submit_initiative(org, title, description, impact, timeline, amount_cents, conflict_disclosure)` —
  organization owners submit a request for their Metro. Blocks requests above the Available Treasury.
- `toggle_initiative_backing(initiative)` — free backing of an eligible initiative in your own Metro; drives the ranking.
- `withdraw_initiative(initiative, reason)` — organization owner withdraws a not-yet-funded initiative.
- `post_initiative_update(initiative, note)` — organization owner posts a progress report on a funded initiative.
- `submit_initiative_ballot(cycle, initiative_ids[])` — one final ballot per member per cycle. Black Card and
  above only. 1 Voting Credit per selected initiative (1–5). Each selection receives the member's Voting
  Power once. Awards +25 Influence once per cycle regardless of credits spent.
- `get_initiative_hub(metro)` — everything the Initiatives page needs; vote totals hidden while voting is open.
- `get_initiative_detail(initiative)` — one initiative with history and cycle results.

2. Security
- All SECURITY DEFINER with fixed search_path, every input validated server-side.
- EXECUTE revoked from PUBLIC/anon and granted only to authenticated.
*/

CREATE OR REPLACE FUNCTION public.submit_initiative(
  p_organization_id uuid, p_title text, p_description text, p_impact text, p_timeline text,
  p_amount_cents bigint, p_conflict_disclosure text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org organizations%ROWTYPE;
  v_metro uuid;
  v_available bigint;
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO v_org FROM organizations WHERE id = p_organization_id;
  IF NOT FOUND OR v_org.owner_id <> v_uid THEN RAISE EXCEPTION 'Only the organization owner can submit an initiative'; END IF;
  SELECT metro_id INTO v_metro FROM cities WHERE id = v_org.city_id;
  IF v_metro IS NULL THEN RAISE EXCEPTION 'This organization is not in a Metro area'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents < 100 THEN RAISE EXCEPTION 'Enter the amount requested'; END IF;
  v_available := public._metro_available_cents(v_metro);
  IF p_amount_cents > v_available THEN
    RAISE EXCEPTION 'The request is larger than the Metro''s Available Treasury';
  END IF;
  IF EXISTS (SELECT 1 FROM initiatives WHERE organization_id = p_organization_id
             AND status IN ('submitted','eligible','in_voting','awaiting_review','awaiting_funding')) THEN
    RAISE EXCEPTION 'This organization already has an active initiative';
  END IF;

  INSERT INTO initiatives (organization_id, metro_id, submitted_by, title, description, impact, timeline, amount_requested_cents, conflict_disclosure)
  VALUES (p_organization_id, v_metro, v_uid, btrim(p_title), btrim(p_description), btrim(p_impact), btrim(p_timeline), p_amount_cents, btrim(p_conflict_disclosure))
  RETURNING id INTO v_id;
  PERFORM public._initiative_log(v_id, 'submitted', NULL, 'submitted', v_uid, 'Submitted for Admin review.');
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_initiative_backing(p_initiative_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_init initiatives%ROWTYPE;
  v_backed boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO v_init FROM initiatives WHERE id = p_initiative_id FOR UPDATE;
  IF NOT FOUND OR v_init.status <> 'eligible' THEN RAISE EXCEPTION 'Only eligible initiatives can be backed'; END IF;
  IF public.get_my_metro_id() IS DISTINCT FROM v_init.metro_id THEN RAISE EXCEPTION 'You can only back initiatives in your Metro'; END IF;

  IF EXISTS (SELECT 1 FROM initiative_backers WHERE initiative_id = p_initiative_id AND member_id = v_uid) THEN
    DELETE FROM initiative_backers WHERE initiative_id = p_initiative_id AND member_id = v_uid;
    v_backed := false;
  ELSE
    INSERT INTO initiative_backers (initiative_id, member_id) VALUES (p_initiative_id, v_uid);
    v_backed := true;
  END IF;
  UPDATE initiatives SET backer_count = (SELECT count(*) FROM initiative_backers WHERE initiative_id = p_initiative_id)
  WHERE id = p_initiative_id RETURNING * INTO v_init;
  RETURN jsonb_build_object('backed', v_backed, 'backer_count', v_init.backer_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_initiative(p_initiative_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_init initiatives%ROWTYPE;
  v_owner uuid;
BEGIN
  SELECT * INTO v_init FROM initiatives WHERE id = p_initiative_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Initiative not found'; END IF;
  SELECT owner_id INTO v_owner FROM organizations WHERE id = v_init.organization_id;
  IF v_owner IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Only the organization owner can withdraw'; END IF;
  IF v_init.status IN ('funded','completed','disqualified','withdrawn') OR v_init.funded_cents > 0 THEN
    RAISE EXCEPTION 'This initiative can no longer be withdrawn';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'Please give a reason'; END IF;

  UPDATE initiatives SET status = 'withdrawn', updated_at = now() WHERE id = p_initiative_id;
  UPDATE initiative_cycle_entries SET outcome = 'withdrawn', outcome_note = btrim(p_reason)
  WHERE initiative_id = p_initiative_id AND outcome IN ('voting','pending_review','awaiting_funding');
  PERFORM public._initiative_log(p_initiative_id, 'withdrawn', v_init.status, 'withdrawn', v_uid, btrim(p_reason));

  PERFORM public._refresh_cycle_funding_queue(e.cycle_id)
  FROM initiative_cycle_entries e WHERE e.initiative_id = p_initiative_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_initiative_update(p_initiative_id uuid, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_init initiatives%ROWTYPE;
BEGIN
  SELECT * INTO v_init FROM initiatives WHERE id = p_initiative_id;
  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_init.organization_id AND owner_id = v_uid) THEN
    RAISE EXCEPTION 'Only the organization owner can post updates';
  END IF;
  IF v_init.status NOT IN ('funded','completed','awaiting_funding') OR v_init.funded_cents = 0 THEN
    RAISE EXCEPTION 'Progress reports open once funding is released';
  END IF;
  IF p_note IS NULL OR char_length(btrim(p_note)) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'Progress reports must be 10 to 2000 characters';
  END IF;
  PERFORM public._initiative_log(p_initiative_id, 'progress_report', NULL, NULL, v_uid, btrim(p_note));
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_initiative_ballot(p_cycle_id uuid, p_initiative_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cycle initiative_cycles%ROWTYPE;
  v_member members%ROWTYPE;
  v_ids uuid[];
  v_n int;
  v_balance int;
  v_vp numeric(5,2);
  v_ballot_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO v_cycle FROM initiative_cycles WHERE id = p_cycle_id;
  IF NOT FOUND OR v_cycle.status <> 'open' OR now() < v_cycle.opens_at OR now() >= v_cycle.closes_at THEN
    RAISE EXCEPTION 'Voting is not open for this cycle';
  END IF;

  SELECT * INTO v_member FROM members WHERE id = v_uid;
  IF v_member.membership_tier IS NULL OR v_member.membership_tier = 'white' OR v_member.account_status <> 'active' THEN
    RAISE EXCEPTION 'Initiative voting is open to Black Card members and above';
  END IF;
  IF public.get_my_metro_id() IS DISTINCT FROM v_cycle.metro_id THEN
    RAISE EXCEPTION 'You can only vote in your own Metro';
  END IF;

  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_initiative_ids) x;
  v_n := COALESCE(array_length(v_ids, 1), 0);
  IF v_n < 1 OR v_n > 5 THEN RAISE EXCEPTION 'Select between 1 and 5 initiatives'; END IF;
  IF (SELECT count(*) FROM initiative_cycle_entries WHERE cycle_id = p_cycle_id AND initiative_id = ANY (v_ids) AND outcome = 'voting') <> v_n THEN
    RAISE EXCEPTION 'One or more selections are not on this ballot';
  END IF;
  IF EXISTS (SELECT 1 FROM initiative_ballots WHERE cycle_id = p_cycle_id AND member_id = v_uid) THEN
    RAISE EXCEPTION 'You have already submitted your ballot for this cycle';
  END IF;

  SELECT balance INTO v_balance FROM voting_credits WHERE member_id = v_uid FOR UPDATE;
  IF COALESCE(v_balance, 0) < v_n THEN
    RAISE EXCEPTION 'Not enough Voting Credits (% needed, % available)', v_n, COALESCE(v_balance, 0);
  END IF;

  v_vp := public.get_member_voting_power(v_uid);

  INSERT INTO initiative_ballots (cycle_id, member_id, credits_spent, voting_power)
  VALUES (p_cycle_id, v_uid, v_n, v_vp) RETURNING id INTO v_ballot_id;
  INSERT INTO initiative_ballot_selections (ballot_id, initiative_id, weight)
  SELECT v_ballot_id, x, v_vp FROM unnest(v_ids) x;

  UPDATE voting_credits SET balance = balance - v_n, updated_at = now() WHERE member_id = v_uid;
  INSERT INTO voting_credit_ledger (member_id, amount, source, reference_id)
  VALUES (v_uid, -v_n, 'initiative_vote_spend', v_ballot_id);

  PERFORM public.award_influence(v_uid, 'initiative_ballot', 25, p_cycle_id,
    'initiative_ballot:' || p_cycle_id || ':' || v_uid, 'Completed a Metro initiative ballot');

  RETURN jsonb_build_object('ballot_id', v_ballot_id, 'credits_spent', v_n, 'voting_power', v_vp,
    'credits_remaining', v_balance - v_n, 'influence_awarded', 25);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_initiative_hub(p_metro_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_metro_id uuid := COALESCE(p_metro_id, public.get_my_metro_id());
  v_metro record;
  v_member record;
  v_local timestamp;
  v_month date;
  v_next timestamptz;
  v_active initiative_cycles%ROWTYPE;
  v_active_json jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF v_metro_id IS NULL THEN RETURN NULL; END IF;
  SELECT mt.id, mt.name, mt.timezone, s.abbreviation AS state INTO v_metro
  FROM metros mt LEFT JOIN states s ON s.id = mt.state_id WHERE mt.id = v_metro_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT m.membership_tier, t.display_name, m.account_status, COALESCE(vc.balance, 0) AS credits
  INTO v_member
  FROM members m
  LEFT JOIN membership_tiers t ON t.id = m.membership_tier
  LEFT JOIN voting_credits vc ON vc.member_id = m.id
  WHERE m.id = v_uid;

  v_local := now() AT TIME ZONE v_metro.timezone;
  v_month := date_trunc('month', v_local)::date;
  SELECT min(d::timestamp AT TIME ZONE v_metro.timezone) INTO v_next
  FROM unnest(ARRAY[v_month, v_month + 14, (v_month + interval '1 month')::date, (v_month + interval '1 month')::date + 14]) d
  WHERE d::timestamp AT TIME ZONE v_metro.timezone > now();

  SELECT * INTO v_active FROM initiative_cycles WHERE metro_id = v_metro_id AND status = 'open' ORDER BY opens_at DESC LIMIT 1;
  IF FOUND THEN
    v_active_json := jsonb_build_object(
      'id', v_active.id, 'opens_at', v_active.opens_at, 'closes_at', v_active.closes_at,
      'eligible_voter_count', v_active.eligible_voter_count, 'quorum_required', v_active.quorum_required,
      'entries', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'initiative_id', i.id, 'title', i.title, 'description', i.description, 'impact', i.impact,
          'organization_id', o.id, 'organization_name', o.name, 'organization_image_url', o.image_url,
          'amount_requested_cents', e.amount_requested_cents, 'frozen_rank', e.frozen_rank, 'outcome', e.outcome
        ) ORDER BY e.frozen_rank)
        FROM initiative_cycle_entries e JOIN initiatives i ON i.id = e.initiative_id
        JOIN organizations o ON o.id = i.organization_id
        WHERE e.cycle_id = v_active.id), '[]'::jsonb),
      'my_ballot', (
        SELECT jsonb_build_object('credits_spent', b.credits_spent, 'voting_power', b.voting_power, 'submitted_at', b.submitted_at,
          'selections', COALESCE((SELECT jsonb_agg(s.initiative_id) FROM initiative_ballot_selections s WHERE s.ballot_id = b.id), '[]'::jsonb))
        FROM initiative_ballots b WHERE b.cycle_id = v_active.id AND b.member_id = v_uid)
    );
  END IF;

  RETURN jsonb_build_object(
    'metro', jsonb_build_object('id', v_metro.id, 'name', v_metro.name, 'state', v_metro.state, 'timezone', v_metro.timezone),
    'available_cents', public._metro_available_cents(v_metro_id),
    'min_available_cents', 200000,
    'next_cycle_opens_at', v_next,
    'me', jsonb_build_object(
      'in_metro', public.get_my_metro_id() IS NOT DISTINCT FROM v_metro_id,
      'tier', v_member.membership_tier,
      'tier_name', v_member.display_name,
      'can_vote', v_member.membership_tier IS NOT NULL AND v_member.membership_tier <> 'white' AND v_member.account_status = 'active',
      'credits', COALESCE(v_member.credits, 0),
      'voting_power', public.get_member_voting_power(v_uid)
    ),
    'active_cycle', v_active_json,
    'ranking', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'initiative_id', i.id, 'title', i.title, 'description', i.description,
        'organization_id', o.id, 'organization_name', o.name, 'organization_image_url', o.image_url,
        'amount_requested_cents', i.amount_requested_cents, 'backer_count', i.backer_count, 'created_at', i.created_at,
        'i_backed', EXISTS (SELECT 1 FROM initiative_backers b WHERE b.initiative_id = i.id AND b.member_id = v_uid)
      ) ORDER BY i.backer_count DESC, i.created_at ASC)
      FROM initiatives i JOIN organizations o ON o.id = i.organization_id
      WHERE i.metro_id = v_metro_id AND i.status = 'eligible'), '[]'::jsonb),
    'cycles', COALESCE((
      SELECT jsonb_agg(cy.j ORDER BY cy.opens_at DESC) FROM (
        SELECT c.opens_at, jsonb_build_object(
          'id', c.id, 'opens_at', c.opens_at, 'closes_at', c.closes_at, 'status', c.status,
          'skip_reason', c.skip_reason, 'cancel_reason', c.cancel_reason,
          'eligible_voter_count', c.eligible_voter_count, 'quorum_required', c.quorum_required,
          'ballot_count', c.ballot_count, 'quorum_met', c.quorum_met, 'results_posted_at', c.results_posted_at,
          'my_selections', COALESCE((SELECT jsonb_agg(s.initiative_id) FROM initiative_ballots b
              JOIN initiative_ballot_selections s ON s.ballot_id = b.id WHERE b.cycle_id = c.id AND b.member_id = v_uid), '[]'::jsonb),
          'entries', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'initiative_id', i.id, 'title', i.title, 'organization_name', o.name,
              'amount_requested_cents', e.amount_requested_cents, 'frozen_rank', e.frozen_rank, 'final_rank', e.final_rank,
              'support_ballots', e.support_ballots, 'weighted_support', e.weighted_support,
              'qualified', e.qualified, 'outcome', e.outcome
            ) ORDER BY COALESCE(e.final_rank, e.frozen_rank))
            FROM initiative_cycle_entries e JOIN initiatives i ON i.id = e.initiative_id
            JOIN organizations o ON o.id = i.organization_id WHERE e.cycle_id = c.id), '[]'::jsonb)
        ) AS j
        FROM initiative_cycles c WHERE c.metro_id = v_metro_id AND c.status <> 'open'
        ORDER BY c.opens_at DESC LIMIT 8
      ) cy), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_initiative_detail(p_initiative_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_init initiatives%ROWTYPE;
  v_org organizations%ROWTYPE;
  v_is_owner boolean;
  v_is_admin boolean := public.is_current_user_admin();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO v_init FROM initiatives WHERE id = p_initiative_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_org FROM organizations WHERE id = v_init.organization_id;
  v_is_owner := v_org.owner_id = v_uid;
  IF v_init.status IN ('submitted','disqualified') AND NOT v_is_owner AND NOT v_is_admin THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id', v_init.id, 'title', v_init.title, 'description', v_init.description, 'impact', v_init.impact,
    'timeline', v_init.timeline, 'conflict_disclosure', v_init.conflict_disclosure,
    'amount_requested_cents', v_init.amount_requested_cents, 'funded_cents', v_init.funded_cents,
    'status', v_init.status, 'backer_count', v_init.backer_count, 'staged_funding_approved', v_init.staged_funding_approved,
    'funded_at', v_init.funded_at, 'completed_at', v_init.completed_at, 'created_at', v_init.created_at,
    'payment_reference', CASE WHEN v_is_owner OR v_is_admin THEN v_init.payment_reference END,
    'organization', jsonb_build_object('id', v_org.id, 'name', v_org.name, 'image_url', v_org.image_url, 'is_verified', v_org.is_verified),
    'metro', (SELECT jsonb_build_object('id', mt.id, 'name', mt.name) FROM metros mt WHERE mt.id = v_init.metro_id),
    'is_owner', v_is_owner,
    'i_backed', EXISTS (SELECT 1 FROM initiative_backers WHERE initiative_id = v_init.id AND member_id = v_uid),
    'can_back', v_init.status = 'eligible' AND public.get_my_metro_id() IS NOT DISTINCT FROM v_init.metro_id,
    'events', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', ev.id, 'event_type', ev.event_type, 'from_status', ev.from_status,
        'to_status', ev.to_status, 'note', ev.note, 'created_at', ev.created_at, 'actor_name', am.display_name) ORDER BY ev.created_at DESC)
      FROM initiative_events ev LEFT JOIN members am ON am.id = ev.actor_id WHERE ev.initiative_id = v_init.id), '[]'::jsonb),
    'cycles', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'cycle_id', c.id, 'opens_at', c.opens_at, 'closes_at', c.closes_at, 'status', c.status,
        'ballot_count', CASE WHEN c.status = 'open' THEN NULL ELSE c.ballot_count END,
        'quorum_met', c.quorum_met, 'frozen_rank', e.frozen_rank,
        'final_rank', CASE WHEN c.status = 'open' THEN NULL ELSE e.final_rank END,
        'support_ballots', CASE WHEN c.status = 'open' THEN NULL ELSE e.support_ballots END,
        'weighted_support', CASE WHEN c.status = 'open' THEN NULL ELSE e.weighted_support END,
        'outcome', e.outcome) ORDER BY c.opens_at DESC)
      FROM initiative_cycle_entries e JOIN initiative_cycles c ON c.id = e.cycle_id WHERE e.initiative_id = v_init.id), '[]'::jsonb)
  );
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.submit_initiative(uuid, text, text, text, text, bigint, text)',
    'public.toggle_initiative_backing(uuid)',
    'public.withdraw_initiative(uuid, text)',
    'public.post_initiative_update(uuid, text)',
    'public.submit_initiative_ballot(uuid, uuid[])',
    'public.get_initiative_hub(uuid)',
    'public.get_initiative_detail(uuid)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;

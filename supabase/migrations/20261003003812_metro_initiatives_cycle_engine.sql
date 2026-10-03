/*
# Metro Initiative Voting — cycle engine

Server-side lifecycle for Metro voting cycles. Runs automatically; members never call these directly.

1. New Functions (internal, not callable by app users)
- `_initiative_log(...)` — appends a row to the initiative history.
- `_metro_available_cents(metro)` — Available Metro Treasury (same figure shown on the Treasury page).
- `_notify_metro_voters(metro, ...)` — notifies every active paid (Black Card and above) member in a Metro.
- `_open_initiative_cycle(metro, opens_at, closes_at)` — freezes the Top 5 (one per organization, each fully
  fundable from Available) and opens the 48-hour ballot, or records a skipped cycle with the reason
  (Available below $2,000, or nothing eligible).
- `_tally_initiative_cycle(cycle)` — closes voting, checks quorum (5% of eligible voters or 100 ballots,
  whichever is lower, minimum 1), ranks by weighted support, applies the 10%-of-ballots minimum, and posts results.
- `_refresh_cycle_funding_queue(cycle)` — marks the next-in-line initiative Awaiting Funding when the
  Available Treasury cannot fully cover it (unless staged funding was approved).
- `process_initiative_cycles()` — opens cycles on the 1st and 15th (Metro local time) and tallies cycles
  whose 48 hours have ended. Scheduled hourly.

2. Modified Functions
- `notify_influence_earned()` — no longer sends an "Influence Earned" notification for negative
  (reversal) entries.

3. Security
- All functions are SECURITY DEFINER with a fixed search_path; EXECUTE revoked from PUBLIC, anon and authenticated.
*/

CREATE OR REPLACE FUNCTION public._initiative_log(
  p_initiative_id uuid, p_event_type text, p_from text, p_to text, p_actor uuid, p_note text, p_cycle_id uuid DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO initiative_events (initiative_id, event_type, from_status, to_status, actor_id, note, cycle_id)
  VALUES (p_initiative_id, p_event_type, p_from, p_to, p_actor, p_note, p_cycle_id);
$$;

CREATE OR REPLACE FUNCTION public._metro_available_cents(p_metro_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((public.get_metro_treasury(p_metro_id)->>'available_cents')::bigint, 0);
$$;

CREATE OR REPLACE FUNCTION public._notify_metro_voters(p_metro_id uuid, p_type text, p_title text, p_body text, p_link text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT m.id FROM members m JOIN cities c ON c.id = m.city_id
    WHERE c.metro_id = p_metro_id AND m.membership_tier IS DISTINCT FROM 'white'
      AND m.membership_tier IS NOT NULL AND m.account_status = 'active'
  LOOP
    PERFORM public.create_notification(r.id, p_type, p_title, p_body, p_link);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public._refresh_cycle_funding_queue(p_cycle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle initiative_cycles%ROWTYPE;
  v_entry record;
  v_available bigint;
BEGIN
  SELECT * INTO v_cycle FROM initiative_cycles WHERE id = p_cycle_id;
  IF NOT FOUND OR v_cycle.status <> 'results_posted' OR NOT COALESCE(v_cycle.quorum_met, false) THEN RETURN; END IF;

  SELECT e.*, i.funded_cents, i.staged_funding_approved, i.status AS initiative_status
  INTO v_entry
  FROM initiative_cycle_entries e JOIN initiatives i ON i.id = e.initiative_id
  WHERE e.cycle_id = p_cycle_id AND e.outcome IN ('pending_review','awaiting_funding')
  ORDER BY e.final_rank LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  v_available := public._metro_available_cents(v_cycle.metro_id);
  IF (v_entry.staged_funding_approved AND v_available <= 0)
     OR (NOT v_entry.staged_funding_approved AND v_available < v_entry.amount_requested_cents - v_entry.funded_cents) THEN
    IF v_entry.outcome <> 'awaiting_funding' THEN
      UPDATE initiative_cycle_entries SET outcome = 'awaiting_funding'
      WHERE cycle_id = p_cycle_id AND initiative_id = v_entry.initiative_id;
      UPDATE initiatives SET status = 'awaiting_funding', updated_at = now() WHERE id = v_entry.initiative_id;
      PERFORM public._initiative_log(v_entry.initiative_id, 'awaiting_funding', v_entry.initiative_status, 'awaiting_funding', NULL,
        'Available Treasury cannot fully cover this request yet. Lower-ranked initiatives wait behind it.', p_cycle_id);
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._open_initiative_cycle(p_metro_id uuid, p_opens_at timestamptz, p_closes_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_available bigint;
  v_cycle_id uuid;
  v_eligible int;
  v_count int := 0;
  v_reason text;
  r record;
BEGIN
  v_available := public._metro_available_cents(p_metro_id);

  IF v_available < 200000 THEN
    v_reason := 'The Metro Treasury had less than $2,000 Available when voting was due to open.';
  ELSIF NOT EXISTS (
    SELECT 1 FROM initiatives WHERE metro_id = p_metro_id AND status = 'eligible' AND amount_requested_cents <= v_available
  ) THEN
    v_reason := 'No eligible initiative could be fully funded from the Available Treasury.';
  END IF;

  IF v_reason IS NOT NULL THEN
    INSERT INTO initiative_cycles (metro_id, opens_at, closes_at, status, skip_reason, available_cents_at_open)
    VALUES (p_metro_id, p_opens_at, p_closes_at, 'skipped', v_reason, v_available)
    ON CONFLICT (metro_id, opens_at) DO NOTHING
    RETURNING id INTO v_cycle_id;
    IF v_cycle_id IS NOT NULL THEN
      PERFORM public._notify_metro_voters(p_metro_id, 'initiative_cycle_skipped', 'Initiative voting skipped this cycle', v_reason, '/initiatives');
    END IF;
    RETURN v_cycle_id;
  END IF;

  SELECT count(*) INTO v_eligible
  FROM members m JOIN cities c ON c.id = m.city_id
  WHERE c.metro_id = p_metro_id AND m.membership_tier IS DISTINCT FROM 'white'
    AND m.membership_tier IS NOT NULL AND m.account_status = 'active';

  INSERT INTO initiative_cycles (metro_id, opens_at, closes_at, status, eligible_voter_count, quorum_required, available_cents_at_open)
  VALUES (p_metro_id, p_opens_at, p_closes_at, 'open', v_eligible,
          GREATEST(1, LEAST(100, CEIL(v_eligible * 0.05)::int)), v_available)
  ON CONFLICT (metro_id, opens_at) DO NOTHING
  RETURNING id INTO v_cycle_id;
  IF v_cycle_id IS NULL THEN RETURN NULL; END IF;

  FOR r IN
    SELECT * FROM (
      SELECT DISTINCT ON (i.organization_id) i.*
      FROM initiatives i
      WHERE i.metro_id = p_metro_id AND i.status = 'eligible' AND i.amount_requested_cents <= v_available
      ORDER BY i.organization_id, i.backer_count DESC, i.created_at ASC
    ) best
    ORDER BY best.backer_count DESC, best.created_at ASC
    LIMIT 5
  LOOP
    v_count := v_count + 1;
    INSERT INTO initiative_cycle_entries (cycle_id, initiative_id, frozen_rank, amount_requested_cents)
    VALUES (v_cycle_id, r.id, v_count, r.amount_requested_cents);
    UPDATE initiatives SET status = 'in_voting', updated_at = now() WHERE id = r.id;
    PERFORM public._initiative_log(r.id, 'entered_voting', 'eligible', 'in_voting', NULL,
      'Frozen at #' || v_count || ' for the 48-hour Metro vote.', v_cycle_id);
  END LOOP;

  PERFORM public._notify_metro_voters(p_metro_id, 'initiative_voting_open', 'Initiative voting is open',
    'The Top ' || v_count || ' initiatives are on the ballot for the next 48 hours. Each initiative you back costs 1 Voting Credit.',
    '/initiatives');
  RETURN v_cycle_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._tally_initiative_cycle(p_cycle_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cycle initiative_cycles%ROWTYPE;
  v_ballots int;
  v_quorum boolean;
  r record;
  v_body text;
BEGIN
  SELECT * INTO v_cycle FROM initiative_cycles WHERE id = p_cycle_id FOR UPDATE;
  IF NOT FOUND OR v_cycle.status <> 'open' THEN RETURN; END IF;

  SELECT count(*) INTO v_ballots FROM initiative_ballots WHERE cycle_id = p_cycle_id AND NOT refunded;
  v_quorum := v_ballots >= v_cycle.quorum_required;

  UPDATE initiative_cycle_entries e SET
    support_ballots = COALESCE(s.ballots, 0),
    weighted_support = COALESCE(s.weight, 0)
  FROM (
    SELECT e2.initiative_id, count(sel.ballot_id) AS ballots, sum(sel.weight) AS weight
    FROM initiative_cycle_entries e2
    LEFT JOIN initiative_ballot_selections sel ON sel.initiative_id = e2.initiative_id
      AND sel.ballot_id IN (SELECT id FROM initiative_ballots WHERE cycle_id = p_cycle_id AND NOT refunded)
    WHERE e2.cycle_id = p_cycle_id
    GROUP BY e2.initiative_id
  ) s
  WHERE e.cycle_id = p_cycle_id AND e.initiative_id = s.initiative_id;

  UPDATE initiative_cycle_entries e SET final_rank = ranked.rk
  FROM (
    SELECT initiative_id, row_number() OVER (ORDER BY weighted_support DESC, support_ballots DESC, frozen_rank ASC) AS rk
    FROM initiative_cycle_entries WHERE cycle_id = p_cycle_id
  ) ranked
  WHERE e.cycle_id = p_cycle_id AND e.initiative_id = ranked.initiative_id;

  FOR r IN
    SELECT e.*, i.status AS initiative_status FROM initiative_cycle_entries e
    JOIN initiatives i ON i.id = e.initiative_id
    WHERE e.cycle_id = p_cycle_id ORDER BY e.final_rank
  LOOP
    IF r.outcome <> 'voting' THEN CONTINUE; END IF;
    IF NOT v_quorum THEN
      UPDATE initiative_cycle_entries SET qualified = false, outcome = 'no_quorum' WHERE cycle_id = p_cycle_id AND initiative_id = r.initiative_id;
      UPDATE initiatives SET status = 'eligible', updated_at = now() WHERE id = r.initiative_id;
      PERFORM public._initiative_log(r.initiative_id, 'no_quorum', r.initiative_status, 'eligible', NULL,
        'Quorum was not reached. The initiative remains eligible for the next cycle.', p_cycle_id);
    ELSIF r.support_ballots * 10 >= v_ballots THEN
      UPDATE initiative_cycle_entries SET qualified = true, outcome = 'pending_review' WHERE cycle_id = p_cycle_id AND initiative_id = r.initiative_id;
      UPDATE initiatives SET status = 'awaiting_review', updated_at = now() WHERE id = r.initiative_id;
      PERFORM public._initiative_log(r.initiative_id, 'qualified', r.initiative_status, 'awaiting_review', NULL,
        'Finished #' || r.final_rank || ' with support on ' || r.support_ballots || ' of ' || v_ballots || ' ballots. Sent to final review.', p_cycle_id);
    ELSE
      UPDATE initiative_cycle_entries SET qualified = false, outcome = 'not_qualified' WHERE cycle_id = p_cycle_id AND initiative_id = r.initiative_id;
      UPDATE initiatives SET status = 'eligible', updated_at = now() WHERE id = r.initiative_id;
      PERFORM public._initiative_log(r.initiative_id, 'not_qualified', r.initiative_status, 'eligible', NULL,
        'Supported on fewer than 10% of ballots. The initiative remains eligible for the next cycle.', p_cycle_id);
    END IF;
  END LOOP;

  UPDATE initiative_cycles SET status = 'results_posted', ballot_count = v_ballots, quorum_met = v_quorum, results_posted_at = now()
  WHERE id = p_cycle_id;

  v_body := CASE WHEN v_quorum
    THEN v_ballots || ' ballots were cast. Qualifying initiatives now move to final review and funding in ranked order.'
    ELSE 'Quorum was not reached (' || v_ballots || ' of ' || v_cycle.quorum_required || ' ballots needed), so nothing is funded this cycle.' END;
  PERFORM public._notify_metro_voters(v_cycle.metro_id, 'initiative_results', 'Initiative results are in', v_body, '/initiatives');

  PERFORM public._refresh_cycle_funding_queue(p_cycle_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_initiative_cycles()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record;
  c record;
  v_local timestamp;
  v_day int;
  v_start date;
  v_opens timestamptz;
  v_closes timestamptz;
BEGIN
  FOR c IN SELECT id FROM initiative_cycles WHERE status = 'open' AND closes_at <= now() LOOP
    PERFORM public._tally_initiative_cycle(c.id);
  END LOOP;

  FOR m IN
    SELECT DISTINCT mt.id, mt.timezone FROM metros mt
    JOIN initiatives i ON i.metro_id = mt.id AND i.status = 'eligible'
  LOOP
    v_local := now() AT TIME ZONE m.timezone;
    v_day := extract(day FROM v_local)::int;
    IF v_day IN (1, 2) THEN
      v_start := date_trunc('month', v_local)::date;
    ELSIF v_day IN (15, 16) THEN
      v_start := date_trunc('month', v_local)::date + 14;
    ELSE
      CONTINUE;
    END IF;
    v_opens := v_start::timestamp AT TIME ZONE m.timezone;
    v_closes := (v_start + 2)::timestamp AT TIME ZONE m.timezone;
    IF now() < v_closes AND NOT EXISTS (SELECT 1 FROM initiative_cycles WHERE metro_id = m.id AND opens_at = v_opens) THEN
      PERFORM public._open_initiative_cycle(m.id, v_opens, v_closes);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_influence_earned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
v_body text;
BEGIN
IF NEW.source = 'referral_verified' OR NEW.amount <= 0 THEN
RETURN NEW;
END IF;

IF NEW.source = 'ballot_participation' THEN
v_body := 'You earned ' || NEW.amount || ' Influence for casting a vote.';
ELSIF NEW.source = 'initiative_ballot' THEN
v_body := 'You earned ' || NEW.amount || ' Influence for completing your Metro initiative ballot.';
ELSIF NEW.source = 'signup_completed' THEN
v_body := 'You earned ' || NEW.amount || ' Influence for joining the Empire.';
ELSIF NEW.source = 'city_selected' THEN
v_body := 'You earned ' || NEW.amount || ' Influence for selecting your city.';
ELSIF NEW.notes IS NOT NULL THEN
v_body := 'You earned ' || NEW.amount || ' Influence. ' || NEW.notes;
ELSE
v_body := 'You earned ' || NEW.amount || ' Influence.';
END IF;

PERFORM create_notification(NEW.member_id, 'influence_earned', 'Influence Earned', v_body, '/empire');
RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._initiative_log(uuid, text, text, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._metro_available_cents(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._notify_metro_voters(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._refresh_cycle_funding_queue(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._open_initiative_cycle(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._tally_initiative_cycle(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_initiative_cycles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_initiative_cycles() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'initiative_cycles_hourly') THEN
    PERFORM cron.unschedule('initiative_cycles_hourly');
  END IF;
  PERFORM cron.schedule('initiative_cycles_hourly', '5 * * * *', 'SELECT public.process_initiative_cycles();');
END $$;

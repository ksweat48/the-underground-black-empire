===== _refresh_cycle_funding_queue
CREATE OR REPLACE FUNCTION public._refresh_cycle_funding_queue(p_cycle_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

===== admin_release_initiative_funding
CREATE OR REPLACE FUNCTION public.admin_release_initiative_funding(p_cycle_id uuid, p_initiative_id uuid, p_amount_cents bigint, p_payment_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

===== complete_treasury_release
CREATE OR REPLACE FUNCTION public.complete_treasury_release(p_release_id uuid, p_payment_reference text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_caller uuid := auth.uid(); v_release record; v_ledger uuid;
BEGIN
PERFORM public.require_sub_role('financial_admin');
SELECT * INTO v_release FROM treasury_releases WHERE id = p_release_id AND status = 'approved' FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Release not found or not in approved status'; END IF;
INSERT INTO metro_treasury_ledger (metro_id, entry_type, amount_cents, notes, policy_version_id)
VALUES (v_release.metro_id, 'release', -v_release.amount_cents,
COALESCE('Treasury release: ' || p_payment_reference, 'Treasury release'), NULL)
RETURNING id INTO v_ledger;
UPDATE treasury_releases SET status = 'completed', funded_by = v_caller, funded_at = now(),
payment_reference = p_payment_reference, completed_by = v_caller, completed_at = now(), ledger_entry_id = v_ledger
WHERE id = p_release_id;
PERFORM public.refill_treasury_capacity(v_release.metro_id);
RETURN jsonb_build_object('release_id', p_release_id, 'status', 'completed', 'ledger_entry_id', v_ledger);
END $function$

===== get_metro_treasury
CREATE OR REPLACE FUNCTION public.get_metro_treasury(p_metro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_metro record;
v_ms record;
v_population int;
v_contributed bigint;
v_reversed bigint;
v_released bigint;
v_unspent bigint;
v_capacity bigint;
v_available bigint;
v_next_band int;
BEGIN
SELECT m.id, m.name, s.abbreviation AS state INTO v_metro
FROM metros m LEFT JOIN states s ON s.id = m.state_id
WHERE m.id = p_metro_id;

IF NOT FOUND THEN
RETURN NULL;
END IF;

SELECT * INTO v_ms FROM metro_milestones WHERE metro_id = p_metro_id;
SELECT COALESCE(population_count, 0) INTO v_population FROM metro_progress WHERE metro_id = p_metro_id;
v_population := COALESCE(v_population, 0);

SELECT
COALESCE(sum(amount_cents) FILTER (WHERE entry_type = 'contribution'), 0),
COALESCE(-sum(amount_cents) FILTER (WHERE entry_type = 'reversal'), 0),
COALESCE(-sum(amount_cents) FILTER (WHERE entry_type = 'release'), 0)
INTO v_contributed, v_reversed, v_released
FROM metro_treasury_ledger WHERE metro_id = p_metro_id;

v_unspent := GREATEST(0, v_contributed - v_reversed - v_released);
v_capacity := public.treasury_capacity_cents(COALESCE(v_ms.capacity_band, 0));
v_available := CASE WHEN v_capacity IS NULL THEN v_unspent ELSE LEAST(v_unspent, v_capacity) END;
v_next_band := CASE WHEN COALESCE(v_ms.capacity_band, 0) >= 6 THEN NULL ELSE COALESCE(v_ms.capacity_band, 0) + 1 END;

RETURN jsonb_build_object(
'metro_id', v_metro.id,
'metro_name', v_metro.name,
'state', v_metro.state,
'population', v_population,
'qualified', v_ms.qualified_at IS NOT NULL,
'qualified_at', v_ms.qualified_at,
'capacity_band', COALESCE(v_ms.capacity_band, 0),
'capacity_cents', v_capacity,
'capacity_unlimited', v_capacity IS NULL,
'capacity_unlocked_at', v_ms.capacity_unlocked_at,
'next_band', CASE WHEN v_next_band IS NULL THEN NULL ELSE jsonb_build_object(
'band', v_next_band,
'population_threshold', public.treasury_band_threshold(v_next_band),
'capacity_cents', public.treasury_capacity_cents(v_next_band),
'members_needed', GREATEST(0, public.treasury_band_threshold(v_next_band) - v_population)
) END,
'total_raised_cents', v_contributed - v_reversed,
'total_released_cents', v_released,
'available_cents', v_available,
'reserved_cents', v_unspent - v_available,
'cities', COALESCE((
SELECT jsonb_agg(jsonb_build_object(
'city_id', c.id,
'name', c.name,
'population', c.population_count,
'contributed_cents', COALESCE(l.net, 0)
) ORDER BY COALESCE(l.net, 0) DESC, c.population_count DESC, c.name)
FROM cities c
LEFT JOIN (
SELECT city_id, sum(amount_cents) FILTER (WHERE entry_type IN ('contribution','reversal')) AS net
FROM metro_treasury_ledger WHERE metro_id = p_metro_id GROUP BY city_id
) l ON l.city_id = c.id
WHERE c.metro_id = p_metro_id AND c.canonical_status = 'active'
AND (c.population_count > 0 OR COALESCE(l.net, 0) <> 0)
), '[]'::jsonb),
'releases', COALESCE((
SELECT jsonb_agg(jsonb_build_object('amount_cents', -r.amount_cents, 'notes', r.notes, 'created_at', r.created_at) ORDER BY r.created_at DESC)
FROM (SELECT * FROM metro_treasury_ledger WHERE metro_id = p_metro_id AND entry_type = 'release' ORDER BY created_at DESC LIMIT 25) r
), '[]'::jsonb),
'milestones', COALESCE((
SELECT jsonb_agg(jsonb_build_object('event_type', e.event_type, 'capacity_band', e.capacity_band, 'population', e.population_at_event, 'created_at', e.created_at) ORDER BY e.created_at DESC)
FROM metro_milestone_events e WHERE e.metro_id = p_metro_id
), '[]'::jsonb)
);
END;
$function$

===== get_treasury_releases
CREATE OR REPLACE FUNCTION public.get_treasury_releases(p_metro_id uuid, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
SELECT COALESCE(jsonb_agg(jsonb_build_object(
'id', r.id,
'metro_id', r.metro_id,
'initiative_id', r.initiative_id,
'amount_cents', r.amount_cents,
'status', r.status,
'submitted_by', r.submitted_by,
'submitted_at', r.submitted_at,
'reviewed_by', r.reviewed_by,
'reviewed_at', r.reviewed_at,
'review_notes', r.review_notes,
'approved_by', r.approved_by,
'approved_at', r.approved_at,
'payment_reference', r.payment_reference,
'funded_by', r.funded_by,
'funded_at', r.funded_at,
'completed_by', r.completed_by,
'completed_at', r.completed_at,
'rejection_reason', r.rejection_reason,
'created_at', r.created_at
) ORDER BY r.created_at DESC), '[]'::jsonb)
FROM (
SELECT * FROM treasury_releases WHERE metro_id = p_metro_id
ORDER BY created_at DESC LIMIT p_limit
) r;
$function$

===== refill_treasury_capacity
CREATE OR REPLACE FUNCTION public.refill_treasury_capacity(p_metro_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_ms record;
v_population int;
v_contributed bigint;
v_reversed bigint;
v_released bigint;
v_unspent bigint;
v_capacity bigint;
v_available bigint;
v_reserved bigint;
BEGIN
SELECT * INTO v_ms FROM metro_milestones WHERE metro_id = p_metro_id;
SELECT COALESCE(population_count, 0) INTO v_population FROM metro_progress WHERE metro_id = p_metro_id;

SELECT
COALESCE(sum(amount_cents) FILTER (WHERE entry_type = 'contribution'), 0),
COALESCE(-sum(amount_cents) FILTER (WHERE entry_type = 'reversal'), 0),
COALESCE(-sum(amount_cents) FILTER (WHERE entry_type = 'release'), 0)
INTO v_contributed, v_reversed, v_released
FROM metro_treasury_ledger WHERE metro_id = p_metro_id;

v_unspent := GREATEST(0, v_contributed - v_reversed - v_released);
v_capacity := public.treasury_capacity_cents(COALESCE(v_ms.capacity_band, 0));
v_available := CASE WHEN v_capacity IS NULL THEN v_unspent ELSE LEAST(v_unspent, v_capacity) END;
v_reserved := v_unspent - v_available;

RETURN jsonb_build_object(
'metro_id', p_metro_id,
'available_cents', v_available,
'reserved_cents', v_reserved,
'capacity_cents', v_capacity,
'capacity_unlimited', v_capacity IS NULL,
'refilled', v_reserved > 0 AND v_available < v_capacity
);
END;
$function$

===== reject_treasury_release
CREATE OR REPLACE FUNCTION public.reject_treasury_release(p_release_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_caller uuid := auth.uid();
BEGIN
PERFORM public.require_sub_role('financial_admin');
IF coalesce(trim(p_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
UPDATE treasury_releases SET status = 'rejected', rejection_reason = p_reason,
reviewed_by = COALESCE(reviewed_by, v_caller), reviewed_at = COALESCE(reviewed_at, now())
WHERE id = p_release_id AND status IN ('submitted', 'under_review', 'approved');
IF NOT FOUND THEN RAISE EXCEPTION 'Release not found or already completed'; END IF;
RETURN jsonb_build_object('release_id', p_release_id, 'status', 'rejected');
END $function$

===== review_treasury_release
CREATE OR REPLACE FUNCTION public.review_treasury_release(p_release_id uuid, p_review_notes text DEFAULT NULL::text, p_approve boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_caller uuid := auth.uid(); v_release record; v_other_admins int;
BEGIN
PERFORM public.require_sub_role('financial_admin');
SELECT * INTO v_release FROM treasury_releases WHERE id = p_release_id AND status IN ('submitted', 'under_review') FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Release not found or not awaiting review'; END IF;

IF p_approve AND v_release.submitted_by = v_caller THEN
SELECT count(*) INTO v_other_admins FROM (
SELECT member_id FROM admin_sub_roles WHERE sub_role = 'financial_admin' AND is_active AND member_id <> v_caller
UNION SELECT id FROM members WHERE is_admin AND id <> v_caller
) x;
IF v_other_admins > 0 OR NOT public.is_current_user_admin() THEN
RAISE EXCEPTION 'A different Financial Admin must approve this release';
END IF;
INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
VALUES (v_caller, 'treasury_release_self_approved_sole_admin', 'treasury_release', p_release_id,
jsonb_build_object('amount_cents', v_release.amount_cents));
END IF;

IF p_approve THEN
UPDATE treasury_releases SET status = 'approved', reviewed_by = v_caller, reviewed_at = now(),
review_notes = coalesce(p_review_notes, review_notes), approved_by = v_caller, approved_at = now()
WHERE id = p_release_id;
ELSE
UPDATE treasury_releases SET status = 'under_review', reviewed_by = v_caller, reviewed_at = now(),
review_notes = coalesce(p_review_notes, review_notes)
WHERE id = p_release_id;
END IF;
RETURN jsonb_build_object('release_id', p_release_id, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'under_review' END);
END $function$

===== submit_treasury_release
CREATE OR REPLACE FUNCTION public.submit_treasury_release(p_metro_id uuid, p_amount_cents bigint, p_initiative_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_available bigint;
BEGIN
PERFORM public.require_sub_role('financial_admin');
IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN RAISE EXCEPTION 'Amount must be greater than zero'; END IF;
v_available := (public.get_metro_treasury(p_metro_id)->>'available_cents')::bigint;
IF p_amount_cents > coalesce(v_available, 0) THEN
RAISE EXCEPTION 'Release amount ($%) exceeds available Treasury ($%)', (p_amount_cents / 100.0), (coalesce(v_available, 0) / 100.0);
END IF;
INSERT INTO treasury_releases (metro_id, initiative_id, amount_cents, submitted_by, review_notes)
VALUES (p_metro_id, p_initiative_id, p_amount_cents, auth.uid(), p_notes) RETURNING id INTO v_id;
RETURN jsonb_build_object('release_id', v_id, 'status', 'submitted', 'amount_cents', p_amount_cents);
END $function$


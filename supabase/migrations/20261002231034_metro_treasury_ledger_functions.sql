/*
# Metro Treasury: payments feed the ledger, refunds reverse it, and read summaries

## Plain-English summary
- Every paid membership payment now records the payer's city and Metro, and adds the city
  share to that Metro's Treasury ledger as a contribution tagged with the city.
- A refund or chargeback adds an equal negative "reversal" entry (nothing is ever deleted).
- Two read functions power the app:
  - `get_metro_treasury(metro_id)`: Available, Reserved, Total Raised, Released, permanent
    capacity, next unlock, and the exact contribution of each city.
  - `get_empire_growth()`: permanent Empire stage, Qualified Metro count and every Metro's
    live population, qualification and capacity.

## Formulas
- unspent = contributions + reversals + releases (reversals and releases are negative)
- available = unspent when capacity is unlimited, otherwise least(unspent, capacity)
- reserved = unspent - available

## Security
- `generate_partner_commission` / `reverse_partner_commission` stay service-role only.
- Read functions return aggregates only (no member identities) and are executable by
  authenticated users.
*/

CREATE OR REPLACE FUNCTION public.generate_partner_commission(
  p_referred_member_id uuid,
  p_stripe_event_id text,
  p_tier_id text,
  p_period_start date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id uuid;
  v_commission_cents integer;
  v_gross_cents integer;
  v_has_referral boolean := false;
  v_city_pct numeric;
  v_empire_pct numeric;
  v_family_pct numeric;
  v_ops_pct numeric;
  v_city_id uuid;
  v_metro_id uuid;
  v_allocation_id uuid;
  v_city_cents int;
BEGIN
  SELECT commission_amount_cents, price_monthly * 100
  INTO v_commission_cents, v_gross_cents
  FROM membership_tiers WHERE id = p_tier_id;

  v_commission_cents := COALESCE(v_commission_cents, 0);

  IF v_gross_cents IS NULL OR v_gross_cents = 0 THEN
    RETURN jsonb_build_object('commission_generated', false, 'reason', 'free_tier');
  END IF;

  SELECT pr.partner_id INTO v_partner_id
  FROM partner_referrals pr
  JOIN empire_partners ep ON ep.member_id = pr.partner_id AND ep.is_active = true
  WHERE pr.referred_member_id = p_referred_member_id;

  SELECT m.city_id, c.metro_id INTO v_city_id, v_metro_id
  FROM members m LEFT JOIN cities c ON c.id = m.city_id
  WHERE m.id = p_referred_member_id;

  IF v_partner_id IS NOT NULL AND v_commission_cents > 0 THEN
    v_has_referral := true;
    v_city_pct := 0.35; v_empire_pct := 0.15; v_family_pct := 0.10; v_ops_pct := 0.20;
  ELSE
    v_city_pct := 0.40; v_empire_pct := 0.20; v_family_pct := 0.10; v_ops_pct := 0.30;
  END IF;

  v_city_cents := ROUND(v_gross_cents * v_city_pct)::int;

  INSERT INTO treasury_allocations (
    stripe_event_id, member_id, membership_tier, gross_amount_cents,
    city_treasury_cents, empire_treasury_cents, family_legacy_cents,
    operations_cents, referral_commission_cents, has_active_referral, city_id, metro_id
  ) VALUES (
    p_stripe_event_id, p_referred_member_id, p_tier_id, v_gross_cents,
    v_city_cents,
    ROUND(v_gross_cents * v_empire_pct)::int,
    ROUND(v_gross_cents * v_family_pct)::int,
    ROUND(v_gross_cents * v_ops_pct)::int,
    CASE WHEN v_has_referral THEN v_commission_cents ELSE 0 END,
    v_has_referral, v_city_id, v_metro_id
  ) ON CONFLICT (stripe_event_id) DO NOTHING
  RETURNING id INTO v_allocation_id;

  IF v_allocation_id IS NOT NULL AND v_metro_id IS NOT NULL AND v_city_cents > 0 THEN
    INSERT INTO metro_treasury_ledger (metro_id, city_id, member_id, entry_type, amount_cents, source_event_id, allocation_id, notes)
    VALUES (v_metro_id, v_city_id, p_referred_member_id, 'contribution', v_city_cents, p_stripe_event_id, v_allocation_id, 'Membership payment')
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_has_referral THEN
    INSERT INTO partner_commission_ledger (
      partner_id, referred_member_id, stripe_event_id,
      membership_tier, amount_cents, status, payment_period_start
    ) VALUES (
      v_partner_id, p_referred_member_id, p_stripe_event_id,
      p_tier_id, v_commission_cents, 'pending', p_period_start
    ) ON CONFLICT (stripe_event_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'commission_generated', v_has_referral,
    'partner_id', v_partner_id,
    'commission_cents', CASE WHEN v_has_referral THEN v_commission_cents ELSE 0 END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_partner_commission(p_stripe_event_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
  v_contribution record;
BEGIN
  UPDATE partner_commission_ledger
  SET status = 'reversed', reversed_at = now()
  WHERE stripe_event_id = p_stripe_event_id
    AND status IN ('pending', 'available');
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT * INTO v_contribution
  FROM metro_treasury_ledger
  WHERE source_event_id = p_stripe_event_id AND entry_type = 'contribution';

  IF FOUND THEN
    INSERT INTO metro_treasury_ledger (metro_id, city_id, member_id, entry_type, amount_cents, source_event_id, allocation_id, notes)
    VALUES (v_contribution.metro_id, v_contribution.city_id, v_contribution.member_id, 'reversal',
            -v_contribution.amount_cents, p_stripe_event_id, v_contribution.allocation_id, 'Refund or chargeback')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_partner_commission(uuid, text, text, date) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reverse_partner_commission(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_metro_treasury(p_metro_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.get_empire_growth()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'highest_stage', e.highest_stage,
    'stage_reached_at', e.stage_reached_at,
    'qualified_metro_count', e.qualified_metro_count,
    'total_population', e.total_population,
    'stage_history', COALESCE((SELECT jsonb_agg(jsonb_build_object('stage', h.stage, 'reached_at', h.reached_at, 'qualified_metro_count', h.qualified_metro_count) ORDER BY h.reached_at) FROM empire_stage_history h), '[]'::jsonb),
    'metros', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'metro_id', m.id,
        'name', m.name,
        'state', s.abbreviation,
        'population', COALESCE(mp.population_count, 0),
        'qualified', ms.qualified_at IS NOT NULL,
        'qualified_at', ms.qualified_at,
        'capacity_band', COALESCE(ms.capacity_band, 0)
      ) ORDER BY (ms.qualified_at IS NOT NULL) DESC, COALESCE(mp.population_count, 0) DESC, m.name)
      FROM metros m
      LEFT JOIN states s ON s.id = m.state_id
      LEFT JOIN metro_progress mp ON mp.metro_id = m.id
      LEFT JOIN metro_milestones ms ON ms.metro_id = m.id
    ), '[]'::jsonb)
  )
  FROM empire_progress e WHERE e.id = 1;
$$;

REVOKE EXECUTE ON FUNCTION public.get_metro_treasury(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_empire_growth() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_metro_treasury(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_empire_growth() TO authenticated;

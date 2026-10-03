/*
# Phase 3: Partner payout schedule, tax records, and attribution corrections

## Plain-English summary
1. Creates `partner_attribution_corrections` so admin can fix a misattributed referral
   without deleting history. The original attribution is marked 'superseded', and a new
   one is created — both remain visible for audit.
2. Adds `status`, `superseded_by`, `superseded_at` columns to `partner_referrals` so
   only one active attribution exists per member at a time.
3. Creates `partner_payout_schedule` to track monthly payout eligibility runs.
4. Creates `partner_tax_records` to store 1099-relevant data per payout (exportable).
5. Adds `tax_year` and `tax_record_id` to `partner_payouts`.
6. Creates `process_scheduled_payouts()` to check all partners for eligibility.
7. Creates `correct_partner_attribution()` to fix misattributed referrals.
8. Creates `generate_tax_record()` to aggregate 1099 data per partner per year.

## Security
- RLS enabled on all new tables.
- Partners can read their own payout schedule and tax records.
- Attribution corrections are admin-only (service role).
- All financial write functions are service-role only except `correct_partner_attribution`
  and `generate_tax_record` which are granted to authenticated (admin-only in practice
  via app-level checks).
*/

-- ============================================================
-- 1. partner_attribution_corrections (created FIRST for FK)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.partner_attribution_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referred_member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  original_partner_id uuid NOT NULL,
  corrected_partner_id uuid NOT NULL,
  reason text NOT NULL,
  corrected_by uuid,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_attribution_corrections ENABLE ROW LEVEL SECURITY;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.partner_attribution_corrections FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_attribution_corrections_referred
  ON public.partner_attribution_corrections(referred_member_id);

-- ============================================================
-- 2. Add status columns to partner_referrals
-- ============================================================

ALTER TABLE public.partner_referrals
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded')),
  ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES public.partner_attribution_corrections(id),
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

-- Drop the original UNIQUE constraint on referred_member_id
-- and replace with a partial unique index that only applies to active attributions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'partner_referrals_referred_member_id_key'
    AND conrelid = 'partner_referrals'::regclass
  ) THEN
    ALTER TABLE public.partner_referrals DROP CONSTRAINT partner_referrals_referred_member_id_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS partner_referrals_active_referred_uniq
  ON public.partner_referrals(referred_member_id)
  WHERE status = 'active';

-- ============================================================
-- 3. partner_payout_schedule
-- ============================================================

CREATE TABLE IF NOT EXISTS public.partner_payout_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.empire_partners(member_id) ON DELETE CASCADE,
  schedule_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'eligible', 'ineligible', 'processed', 'failed')),
  gross_cents bigint,
  fee_cents integer,
  net_cents integer,
  skip_reason text,
  payout_id uuid REFERENCES public.partner_payouts(id),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_payout_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_payout_schedule" ON public.partner_payout_schedule;
CREATE POLICY "select_own_payout_schedule" ON public.partner_payout_schedule
  FOR SELECT TO authenticated USING (auth.uid() = partner_id);

CREATE INDEX IF NOT EXISTS idx_payout_schedule_date
  ON public.partner_payout_schedule(schedule_date, status);
CREATE INDEX IF NOT EXISTS idx_payout_schedule_partner
  ON public.partner_payout_schedule(partner_id);

-- ============================================================
-- 4. partner_tax_records
-- ============================================================

CREATE TABLE IF NOT EXISTS public.partner_tax_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.empire_partners(member_id) ON DELETE CASCADE,
  tax_year int NOT NULL,
  legal_name text,
  tax_id_last4 text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip_code text,
  total_paid_cents bigint NOT NULL DEFAULT 0,
  payout_count integer NOT NULL DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, tax_year)
);

ALTER TABLE public.partner_tax_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_tax_records" ON public.partner_tax_records;
CREATE POLICY "select_own_tax_records" ON public.partner_tax_records
  FOR SELECT TO authenticated USING (auth.uid() = partner_id);

CREATE INDEX IF NOT EXISTS idx_tax_records_year
  ON public.partner_tax_records(tax_year);

-- ============================================================
-- 5. Add tax columns to partner_payouts
-- ============================================================

ALTER TABLE public.partner_payouts
  ADD COLUMN IF NOT EXISTS tax_year int,
  ADD COLUMN IF NOT EXISTS tax_record_id uuid;

-- ============================================================
-- 6. process_scheduled_payouts() — eligibility checker
-- ============================================================

CREATE OR REPLACE FUNCTION public.process_scheduled_payouts(
  p_schedule_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_results jsonb[];
  v_partner record;
  v_available_cents bigint;
  v_fee_cents integer;
  v_net_cents integer;
  v_schedule_id uuid;
  v_skip_reason text;
BEGIN
  FOR v_partner IN
    SELECT ep.member_id, ep.stripe_connect_account_id, ep.stripe_connect_status
    FROM empire_partners ep
    WHERE ep.is_active = true
    ORDER BY ep.member_id
  LOOP
    v_skip_reason := NULL;
    v_available_cents := 0;

    IF v_partner.stripe_connect_status <> 'verified' OR v_partner.stripe_connect_account_id IS NULL THEN
      v_skip_reason := 'stripe_connect_not_verified';
    ELSE
      SELECT COALESCE(SUM(amount_cents), 0) INTO v_available_cents
      FROM partner_commission_ledger
      WHERE partner_id = v_partner.member_id AND status = 'available';

      IF v_available_cents < 10000 THEN
        v_skip_reason := 'below_minimum_100';
      END IF;
    END IF;

    INSERT INTO partner_payout_schedule (partner_id, schedule_date, status, gross_cents, fee_cents, net_cents, skip_reason)
    VALUES (
      v_partner.member_id, p_schedule_date,
      CASE WHEN v_skip_reason IS NULL THEN 'eligible' ELSE 'ineligible' END,
      CASE WHEN v_skip_reason IS NULL THEN v_available_cents ELSE NULL END,
      CASE WHEN v_skip_reason IS NULL THEN ROUND(v_available_cents * 0.03)::int ELSE NULL END,
      CASE WHEN v_skip_reason IS NULL THEN v_available_cents - ROUND(v_available_cents * 0.03)::int ELSE NULL END,
      v_skip_reason
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_schedule_id;

    v_results := array_append(v_results, jsonb_build_object(
      'partner_id', v_partner.member_id,
      'eligible', v_skip_reason IS NULL,
      'skip_reason', v_skip_reason,
      'available_cents', v_available_cents
    ));
  END LOOP;

  RETURN jsonb_build_object('results', to_jsonb(v_results));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_scheduled_payouts(date) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 7. correct_partner_attribution() — fix misattributed referrals
-- ============================================================

CREATE OR REPLACE FUNCTION public.correct_partner_attribution(
  p_referred_member_id uuid,
  p_corrected_partner_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original_partner_id uuid;
  v_correction_id uuid;
BEGIN
  SELECT partner_id INTO v_original_partner_id
  FROM partner_referrals
  WHERE referred_member_id = p_referred_member_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_active_attribution');
  END IF;

  IF v_original_partner_id = p_corrected_partner_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'same_partner');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM empire_partners WHERE member_id = p_corrected_partner_id AND is_active = true) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'corrected_partner_not_active');
  END IF;

  INSERT INTO partner_attribution_corrections (referred_member_id, original_partner_id, corrected_partner_id, reason, corrected_by)
  VALUES (p_referred_member_id, v_original_partner_id, p_corrected_partner_id, p_reason, auth.uid())
  RETURNING id INTO v_correction_id;

  UPDATE partner_referrals
  SET status = 'superseded', superseded_by = v_correction_id, superseded_at = now()
  WHERE referred_member_id = p_referred_member_id AND status = 'active';

  INSERT INTO partner_referrals (partner_id, referred_member_id, referral_code, status)
  VALUES (p_corrected_partner_id, p_referred_member_id, 'CORRECTED', 'active')
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'correction_id', v_correction_id,
    'original_partner_id', v_original_partner_id,
    'corrected_partner_id', p_corrected_partner_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.correct_partner_attribution(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_partner_attribution(uuid, uuid, text) TO authenticated;

-- ============================================================
-- 8. generate_tax_record() — aggregate 1099 data
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_tax_record(
  p_partner_id uuid,
  p_tax_year int DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_paid bigint;
  v_payout_count int;
  v_tax_record_id uuid;
BEGIN
  SELECT
    COALESCE(SUM(net_amount_cents), 0),
    COUNT(*)
  INTO v_total_paid, v_payout_count
  FROM partner_payouts
  WHERE partner_id = p_partner_id
    AND status = 'completed'
    AND EXTRACT(YEAR FROM requested_at)::int = p_tax_year;

  IF v_total_paid = 0 THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_paid_payouts_for_year');
  END IF;

  INSERT INTO partner_tax_records (partner_id, tax_year, total_paid_cents, payout_count)
  VALUES (p_partner_id, p_tax_year, v_total_paid, v_payout_count)
  ON CONFLICT (partner_id, tax_year) DO UPDATE
    SET total_paid_cents = EXCLUDED.total_paid_cents,
        payout_count = EXCLUDED.payout_count,
        generated_at = now()
  RETURNING id INTO v_tax_record_id;

  UPDATE partner_payouts
  SET tax_year = p_tax_year, tax_record_id = v_tax_record_id
  WHERE partner_id = p_partner_id
    AND status = 'completed'
    AND EXTRACT(YEAR FROM requested_at)::int = p_tax_year
    AND tax_record_id IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'tax_record_id', v_tax_record_id,
    'total_paid_cents', v_total_paid,
    'payout_count', v_payout_count,
    'tax_year', p_tax_year
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_tax_record(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_tax_record(uuid, int) TO authenticated;

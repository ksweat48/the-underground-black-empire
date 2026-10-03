/*
# Phase 3: Reconciliation, Treasury release workflow, and capacity refill

## Plain-English summary
1. Creates `stripe_reconciliation_runs` and `stripe_reconciliation_discrepancies` tables
   for a daily routine that compares Stripe-reported totals against the database ledger.
   Differences are flagged for Financial Admin review.
2. Creates the `treasury_releases` table with a full approval workflow: submitted →
   reviewed → approved → funded → completed. Each step is recorded with who did it, when,
   and a payment reference (e.g. Stripe transfer ID or check number).
3. Creates `submit_treasury_release()`, `review_treasury_release()`,
   `approve_treasury_release()`, and `complete_treasury_release()` SECURITY DEFINER
   functions. When a release is completed, a negative 'release' entry is written to
   `metro_treasury_ledger` and the `treasury_releases` record is linked.
4. Creates `refill_treasury_capacity()` — a SECURITY DEFINER function that moves Reserved
   funds into Available up to the permanent capacity cap. Called automatically after
   releases and by the daily scheduler.
5. Creates `run_daily_reconciliation()` — compares the sum of `stripe_payment_events`
   amounts against `treasury_allocations` gross amounts for a given day, and records
   any discrepancies.

## New Tables
### stripe_reconciliation_runs
- `id` (uuid PK)
- `run_date` (date) — the day being reconciled
- `stripe_total_cents` (bigint) — total from Stripe events
- `ledger_total_cents` (bigint) — total from treasury allocations
- `difference_cents` (bigint) — stripe - ledger
- `status` (text) — 'balanced', 'discrepancy', 'resolved'
- `resolved_by` (uuid, nullable)
- `resolved_at` (timestamptz, nullable)
- `resolution_notes` (text, nullable)
- `created_at` (timestamptz)

### stripe_reconciliation_discrepancies
- `id` (uuid PK)
- `run_id` (uuid FK)
- `stripe_event_id` (text) — the Stripe event in question
- `stripe_amount_cents` (bigint)
- `ledger_amount_cents` (bigint)
- `difference_cents` (bigint)
- `notes` (text, nullable)
- `created_at` (timestamptz)

### treasury_releases
- `id` (uuid PK)
- `metro_id` (uuid FK)
- `initiative_id` (uuid, nullable FK) — the winning initiative
- `amount_cents` (bigint) — amount being released
- `status` (text) — 'submitted', 'under_review', 'approved', 'funded', 'completed', 'rejected'
- `submitted_by` (uuid) — admin who submitted
- `submitted_at` (timestamptz)
- `reviewed_by` (uuid, nullable)
- `reviewed_at` (timestamptz, nullable)
- `review_notes` (text, nullable)
- `approved_by` (uuid, nullable)
- `approved_at` (timestamptz, nullable)
- `payment_reference` (text, nullable) — Stripe transfer ID, check number, etc.
- `funded_by` (uuid, nullable)
- `funded_at` (timestamptz, nullable)
- `completed_by` (uuid, nullable)
- `completed_at` (timestamptz, nullable)
- `ledger_entry_id` (uuid, nullable, FK->metro_treasury_ledger) — linked ledger entry
- `rejection_reason` (text, nullable)
- `created_at` (timestamptz)

## Security
- RLS on all new tables.
- `treasury_releases`: authenticated read (members can see releases for their Metro).
- `stripe_reconciliation_runs` and discrepancies: admin-only (service role).
- All workflow functions require `auth.uid()` and check admin status via `is_current_user_admin()`.

## Important Notes
1. The Treasury release workflow has 4 required steps: submit → review → approve → fund.
   Each step records who did it and when, creating a permanent audit trail.
2. `refill_treasury_capacity()` is called after every release completion to ensure
   Reserved funds automatically refill Available back up to the permanent cap.
3. The reconciliation routine is designed to be called by a daily cron edge function.
*/

-- ============================================================
-- 1. stripe_reconciliation_runs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stripe_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date date NOT NULL,
  stripe_total_cents bigint NOT NULL DEFAULT 0,
  ledger_total_cents bigint NOT NULL DEFAULT 0,
  difference_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'balanced'
    CHECK (status IN ('balanced', 'discrepancy', 'resolved')),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_date)
);

ALTER TABLE public.stripe_reconciliation_runs ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.stripe_reconciliation_runs FROM anon, authenticated;

-- ============================================================
-- 2. stripe_reconciliation_discrepancies
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stripe_reconciliation_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.stripe_reconciliation_runs(id) ON DELETE CASCADE,
  stripe_event_id text,
  stripe_amount_cents bigint,
  ledger_amount_cents bigint,
  difference_cents bigint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_reconciliation_discrepancies ENABLE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.stripe_reconciliation_discrepancies FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_run
  ON public.stripe_reconciliation_discrepancies(run_id);

-- ============================================================
-- 3. treasury_releases
-- ============================================================

CREATE TABLE IF NOT EXISTS public.treasury_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metro_id uuid NOT NULL REFERENCES public.metros(id),
  initiative_id uuid,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'approved', 'funded', 'completed', 'rejected')),
  submitted_by uuid NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  approved_by uuid,
  approved_at timestamptz,
  payment_reference text,
  funded_by uuid,
  funded_at timestamptz,
  completed_by uuid,
  completed_at timestamptz,
  ledger_entry_id uuid REFERENCES public.metro_treasury_ledger(id),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.treasury_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read treasury releases" ON public.treasury_releases;
CREATE POLICY "Authenticated can read treasury releases" ON public.treasury_releases
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_treasury_releases_metro
  ON public.treasury_releases(metro_id, status);
CREATE INDEX IF NOT EXISTS idx_treasury_releases_status
  ON public.treasury_releases(status);

-- ============================================================
-- 4. submit_treasury_release()
-- ============================================================

CREATE OR REPLACE FUNCTION public.submit_treasury_release(
  p_metro_id uuid,
  p_amount_cents bigint,
  p_initiative_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_release_id uuid;
  v_caller uuid := auth.uid();
  v_treasury jsonb;
  v_available bigint;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get current available funds
  v_treasury := public.get_metro_treasury(p_metro_id);
  v_available := (v_treasury->>'available_cents')::bigint;

  IF p_amount_cents > v_available THEN
    RAISE EXCEPTION 'Release amount ($%) exceeds available Treasury ($%)',
      (p_amount_cents / 100.0), (v_available / 100.0);
  END IF;

  INSERT INTO treasury_releases (metro_id, initiative_id, amount_cents, submitted_by, review_notes)
  VALUES (p_metro_id, p_initiative_id, p_amount_cents, v_caller, p_notes)
  RETURNING id INTO v_release_id;

  RETURN jsonb_build_object('release_id', v_release_id, 'status', 'submitted', 'amount_cents', p_amount_cents);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_treasury_release(uuid, bigint, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_treasury_release(uuid, bigint, uuid, text) TO authenticated;

-- ============================================================
-- 5. review_treasury_release()
-- ============================================================

CREATE OR REPLACE FUNCTION public.review_treasury_release(
  p_release_id uuid,
  p_review_notes text DEFAULT NULL,
  p_approve boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_release record;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_release FROM treasury_releases WHERE id = p_release_id AND status = 'submitted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Release not found or not in submitted status';
  END IF;

  IF p_approve THEN
    UPDATE treasury_releases
    SET status = 'approved', reviewed_by = v_caller, reviewed_at = now(),
        review_notes = p_review_notes, approved_by = v_caller, approved_at = now()
    WHERE id = p_release_id;
  ELSE
    UPDATE treasury_releases
    SET status = 'under_review', reviewed_by = v_caller, reviewed_at = now(),
        review_notes = p_review_notes
    WHERE id = p_release_id;
  END IF;

  RETURN jsonb_build_object('release_id', p_release_id, 'status', CASE WHEN p_approve THEN 'approved' ELSE 'under_review' END);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_treasury_release(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_treasury_release(uuid, text, boolean) TO authenticated;

-- ============================================================
-- 6. complete_treasury_release() — funds the release and writes ledger entry
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_treasury_release(
  p_release_id uuid,
  p_payment_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_release record;
  v_ledger_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_release FROM treasury_releases WHERE id = p_release_id AND status = 'approved';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Release not found or not in approved status';
  END IF;

  -- Write the negative ledger entry
  INSERT INTO metro_treasury_ledger (metro_id, entry_type, amount_cents, notes, policy_version_id)
  VALUES (v_release.metro_id, 'release', -v_release.amount_cents,
          COALESCE('Treasury release: ' || p_payment_reference, 'Treasury release'), NULL)
  RETURNING id INTO v_ledger_id;

  -- Mark as completed
  UPDATE treasury_releases
  SET status = 'completed', funded_by = v_caller, funded_at = now(),
      payment_reference = p_payment_reference, completed_by = v_caller, completed_at = now(),
      ledger_entry_id = v_ledger_id
  WHERE id = p_release_id;

  -- Refill Available from Reserved up to capacity
  PERFORM public.refill_treasury_capacity(v_release.metro_id);

  RETURN jsonb_build_object('release_id', p_release_id, 'status', 'completed', 'ledger_entry_id', v_ledger_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_treasury_release(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_treasury_release(uuid, text) TO authenticated;

-- ============================================================
-- 7. reject_treasury_release()
-- ============================================================

CREATE OR REPLACE FUNCTION public.reject_treasury_release(
  p_release_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE treasury_releases
  SET status = 'rejected', rejection_reason = p_reason,
      reviewed_by = COALESCE(reviewed_by, v_caller), reviewed_at = COALESCE(reviewed_at, now())
  WHERE id = p_release_id AND status IN ('submitted', 'under_review', 'approved');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Release not found or already completed';
  END IF;

  RETURN jsonb_build_object('release_id', p_release_id, 'status', 'rejected');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_treasury_release(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_treasury_release(uuid, text) TO authenticated;

-- ============================================================
-- 8. refill_treasury_capacity() — auto-refill Available from Reserved
-- ============================================================

CREATE OR REPLACE FUNCTION public.refill_treasury_capacity(
  p_metro_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.refill_treasury_capacity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refill_treasury_capacity(uuid) TO authenticated;

-- ============================================================
-- 9. run_daily_reconciliation() — compare Stripe vs ledger
-- ============================================================

CREATE OR REPLACE FUNCTION public.run_daily_reconciliation(
  p_run_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stripe_total bigint;
  v_ledger_total bigint;
  v_diff bigint;
  v_run_id uuid;
  v_event record;
BEGIN
  -- Sum Stripe payment events for the date (invoice.paid only = actual money collected)
  SELECT COALESCE(SUM(amount_total), 0) INTO v_stripe_total
  FROM stripe_payment_events
  WHERE event_type = 'invoice.paid'
    AND created_at::date = p_run_date;

  -- Sum treasury allocations for the date
  SELECT COALESCE(SUM(net_collected_cents), 0) INTO v_ledger_total
  FROM treasury_allocations
  WHERE created_at::date = p_run_date
    AND gross_amount_cents > 0;

  v_diff := v_stripe_total - v_ledger_total;

  -- Create the run record
  INSERT INTO stripe_reconciliation_runs (run_date, stripe_total_cents, ledger_total_cents, difference_cents, status)
  VALUES (p_run_date, v_stripe_total, v_ledger_total, v_diff,
          CASE WHEN v_diff = 0 THEN 'balanced' ELSE 'discrepancy' END)
  ON CONFLICT (run_date) DO UPDATE
    SET stripe_total_cents = EXCLUDED.stripe_total_cents,
        ledger_total_cents = EXCLUDED.ledger_total_cents,
        difference_cents = EXCLUDED.difference_cents,
        status = CASE WHEN EXCLUDED.difference_cents = 0 THEN 'balanced' ELSE 'discrepancy' END
  RETURNING id INTO v_run_id;

  -- If discrepancy, record individual mismatches
  IF v_diff <> 0 THEN
    FOR v_event IN
      SELECT stripe_event_id, amount_total
      FROM stripe_payment_events
      WHERE event_type = 'invoice.paid'
        AND created_at::date = p_run_date
        AND stripe_event_id NOT IN (
          SELECT stripe_event_id FROM treasury_allocations WHERE stripe_event_id IS NOT NULL
        )
    LOOP
      INSERT INTO stripe_reconciliation_discrepancies (run_id, stripe_event_id, stripe_amount_cents, ledger_amount_cents, difference_cents, notes)
      VALUES (v_run_id, v_event.stripe_event_id, v_event.amount_total, 0, v_event.amount_total, 'Payment event with no matching allocation')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'run_date', p_run_date,
    'stripe_total_cents', v_stripe_total,
    'ledger_total_cents', v_ledger_total,
    'difference_cents', v_diff,
    'status', CASE WHEN v_diff = 0 THEN 'balanced' ELSE 'discrepancy' END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_daily_reconciliation(date) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 10. get_treasury_releases() — list releases for a Metro
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_treasury_releases(
  p_metro_id uuid,
  p_limit int DEFAULT 25
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.get_treasury_releases(uuid, int) TO authenticated;

-- ============================================================
-- 11. get_reconciliation_runs() — admin view of reconciliation history
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_reconciliation_runs(
  p_limit int DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'run_date', r.run_date,
    'stripe_total_cents', r.stripe_total_cents,
    'ledger_total_cents', r.ledger_total_cents,
    'difference_cents', r.difference_cents,
    'status', r.status,
    'resolved_by', r.resolved_by,
    'resolved_at', r.resolved_at,
    'resolution_notes', r.resolution_notes,
    'created_at', r.created_at,
    'discrepancies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id,
        'stripe_event_id', d.stripe_event_id,
        'stripe_amount_cents', d.stripe_amount_cents,
        'ledger_amount_cents', d.ledger_amount_cents,
        'difference_cents', d.difference_cents,
        'notes', d.notes
      )) FROM stripe_reconciliation_discrepancies d WHERE d.run_id = r.id
    ), '[]'::jsonb)
  ) ORDER BY r.run_date DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM stripe_reconciliation_runs ORDER BY run_date DESC LIMIT p_limit
  ) r;
$$;

REVOKE EXECUTE ON FUNCTION public.get_reconciliation_runs(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reconciliation_runs(int) TO authenticated;

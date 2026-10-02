/*
# Metro milestones, permanent Empire stage, and Metro Treasury ledger

## Plain-English summary
The Empire now grows by counting Qualified Metros (Metros with at least 100 active members).
Each Metro permanently remembers when it qualified and the highest Treasury capacity it ever
unlocked. The Empire permanently remembers the highest stage it has reached. A new ledger
records every dollar entering or leaving a Metro Treasury, tagged with the city it came from.

## 1. Modified tables
- `members.account_status` (text, default 'active'): active | suspended | terminated.
  An "active member" = onboarding_complete AND account_status = 'active'.
- `empire_progress`: adds `qualified_metro_count`, `highest_stage` (default 'outpost'),
  `stage_reached_at`.
- `treasury_allocations`: adds `city_id`, `metro_id` so each payment split is tagged with the
  payer's city and Metro at the time of payment.

## 2. New tables
- `metro_milestones`: one row per Metro. `qualified_at` (permanent once set),
  `capacity_band` (0-6, only ever increases), `capacity_unlocked_at`, `peak_population`.
- `metro_milestone_events`: history of qualification and capacity unlocks.
- `empire_stage_history`: one row per Empire stage reached, with the date and Qualified Metro count.
- `metro_treasury_ledger`: append-only money history per Metro. Entry types:
  contribution (+), reversal (-), release (-). Each entry keeps the source city.

## 3. Security
- RLS enabled on all new tables.
- Milestones, milestone events and stage history are public aggregate facts: SELECT for
  anon + authenticated. No client write policies (server functions only).
- `metro_treasury_ledger` has NO client policies at all; it links money to members, so it is
  only exposed in aggregate through server functions.

## 4. Notes
1. Nothing is dropped or deleted. Existing data is preserved.
2. Capacity and qualification are never lowered by any function.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='members' AND column_name='account_status') THEN
    ALTER TABLE public.members ADD COLUMN account_status text NOT NULL DEFAULT 'active';
    ALTER TABLE public.members ADD CONSTRAINT members_account_status_check CHECK (account_status IN ('active','suspended','terminated'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='empire_progress' AND column_name='qualified_metro_count') THEN
    ALTER TABLE public.empire_progress ADD COLUMN qualified_metro_count int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='empire_progress' AND column_name='highest_stage') THEN
    ALTER TABLE public.empire_progress ADD COLUMN highest_stage text NOT NULL DEFAULT 'outpost';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='empire_progress' AND column_name='stage_reached_at') THEN
    ALTER TABLE public.empire_progress ADD COLUMN stage_reached_at timestamptz;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='treasury_allocations' AND column_name='city_id') THEN
    ALTER TABLE public.treasury_allocations ADD COLUMN city_id uuid REFERENCES public.cities(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='treasury_allocations' AND column_name='metro_id') THEN
    ALTER TABLE public.treasury_allocations ADD COLUMN metro_id uuid REFERENCES public.metros(id);
  END IF;
END $$;

REVOKE UPDATE (account_status) ON public.members FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.metro_milestones (
  metro_id uuid PRIMARY KEY REFERENCES public.metros(id) ON DELETE CASCADE,
  qualified_at timestamptz,
  capacity_band int NOT NULL DEFAULT 0 CHECK (capacity_band BETWEEN 0 AND 6),
  capacity_unlocked_at timestamptz,
  peak_population int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.metro_milestone_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metro_id uuid NOT NULL REFERENCES public.metros(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('qualified','capacity_unlocked')),
  capacity_band int,
  population_at_event int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS metro_milestone_events_metro_idx ON public.metro_milestone_events(metro_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.empire_stage_history (
  stage text PRIMARY KEY CHECK (stage IN ('outpost','settlement','village','province','kingdom','dominion','empire')),
  reached_at timestamptz NOT NULL DEFAULT now(),
  qualified_metro_count int NOT NULL
);

CREATE TABLE IF NOT EXISTS public.metro_treasury_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metro_id uuid NOT NULL REFERENCES public.metros(id),
  city_id uuid REFERENCES public.cities(id),
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('contribution','reversal','release')),
  amount_cents bigint NOT NULL,
  source_event_id text,
  allocation_id uuid REFERENCES public.treasury_allocations(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT metro_treasury_ledger_sign_check CHECK (
    (entry_type = 'contribution' AND amount_cents > 0) OR
    (entry_type IN ('reversal','release') AND amount_cents < 0)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS metro_treasury_ledger_source_uniq
  ON public.metro_treasury_ledger(source_event_id, entry_type) WHERE source_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS metro_treasury_ledger_metro_idx ON public.metro_treasury_ledger(metro_id, created_at DESC);
CREATE INDEX IF NOT EXISTS metro_treasury_ledger_city_idx ON public.metro_treasury_ledger(city_id);

ALTER TABLE public.metro_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metro_milestone_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empire_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metro_treasury_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read metro milestones" ON public.metro_milestones;
CREATE POLICY "Public can read metro milestones" ON public.metro_milestones
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can read metro milestone events" ON public.metro_milestone_events;
CREATE POLICY "Public can read metro milestone events" ON public.metro_milestone_events
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Public can read empire stage history" ON public.empire_stage_history;
CREATE POLICY "Public can read empire stage history" ON public.empire_stage_history
  FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.metro_milestones, public.metro_milestone_events,
  public.empire_stage_history, public.metro_treasury_ledger FROM anon, authenticated;
REVOKE SELECT ON public.metro_treasury_ledger FROM anon, authenticated;

INSERT INTO public.metro_milestones (metro_id)
SELECT id FROM public.metros
ON CONFLICT (metro_id) DO NOTHING;

INSERT INTO public.empire_stage_history (stage, reached_at, qualified_metro_count)
VALUES ('outpost', now(), 0)
ON CONFLICT (stage) DO NOTHING;

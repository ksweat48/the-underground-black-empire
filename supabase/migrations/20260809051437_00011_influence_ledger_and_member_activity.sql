/*
# Influence Ledger and Member Activity History

## Purpose
Adds two new capabilities to support the redesigned profile page:

1. **Influence Ledger** — a new append-only table that tracks Influence points,
   which represent a member's permanent reputation earned through voting and
   referrals. This is separate from XP (participation) and Credits (spending).
   All existing founders start at 0 Influence.

2. **Member Activity History** — a SECURITY DEFINER function that returns a
   single member's own recent actions across XP awards, referral verifications,
   mission completions, and influence awards, ordered by date descending.

## New Tables

### influence_ledger (APPEND-ONLY)
- `id` (uuid, PK) — record identifier
- `member_id` (uuid, FK -> members) — who received the Influence
- `amount` (int, NOT NULL) — positive for awards, negative for reversals
- `source` (text, NOT NULL) — vote_cast | referral_verified | consistent_participation | reversal
- `reference_id` (uuid, nullable) — links to the source record (e.g., vote id, referral id)
- `notes` (text, nullable) — human-readable note
- `created_at` (timestamptz) — when the entry was created
- This table is NEVER updated or deleted. Reversals are new negative rows.
- All existing members start at 0 Influence (no rows = 0 Influence).

## Security
- RLS enabled on influence_ledger
- influence_ledger: readable by all authenticated users (for leaderboard/public influence totals);
  inserts/updates/deletes are server-side only (no client policies)
- get_member_activity: SECURITY DEFINER function, callable by authenticated users only

## Important Notes
1. influence_ledger is append-only by design — no UPDATE or DELETE policies are defined.
2. Influence is a permanent reputation stat — it does NOT decay and is NOT spent.
3. Buying credits NEVER awards Influence or XP.
4. The get_member_activity function reads from xp_ledger, referrals, and influence_ledger
   to build a unified personal history for the profile page.
*/

-- ==================== INFLUENCE LEDGER (APPEND-ONLY) ====================

CREATE TABLE IF NOT EXISTS influence_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount int NOT NULL,
  source text NOT NULL,
  reference_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE influence_ledger ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read influence entries (for leaderboard — shows total influence per member)
DROP POLICY IF EXISTS "select_all_influence" ON influence_ledger;
CREATE POLICY "select_all_influence" ON influence_ledger FOR SELECT
  TO authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies — influence awards are server-side only

CREATE INDEX IF NOT EXISTS idx_influence_ledger_member_id ON influence_ledger(member_id);
CREATE INDEX IF NOT EXISTS idx_influence_ledger_source ON influence_ledger(source);

-- ==================== MEMBER ACTIVITY FUNCTION ====================

CREATE OR REPLACE FUNCTION public.get_member_activity(
  p_member_id uuid,
  p_limit int DEFAULT 25
) RETURNS TABLE (
  id uuid,
  activity_type text,
  description text,
  amount int,
  source text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Return a unified timeline of the member's own actions
  -- Sources: xp_ledger (XP awards), influence_ledger (influence awards), referrals (verified referrals)
  RETURN QUERY
  SELECT
    x.id,
    'xp'::text AS activity_type,
    COALESCE(x.notes, x.source) AS description,
    x.amount,
    x.source,
    x.created_at
  FROM xp_ledger x
  WHERE x.member_id = p_member_id

  UNION ALL

  SELECT
    i.id,
    'influence'::text AS activity_type,
    COALESCE(i.notes, i.source) AS description,
    i.amount,
    i.source,
    i.created_at
  FROM influence_ledger i
  WHERE i.member_id = p_member_id

  UNION ALL

  SELECT
    r.id,
    'referral'::text AS activity_type,
    CASE WHEN r.status = 'verified' THEN 'Referral verified' ELSE 'Referral ' || r.status END AS description,
    0 AS amount,
    r.status AS source,
    COALESCE(r.verified_at, r.created_at) AS created_at
  FROM referrals r
  WHERE r.referring_member_id = p_member_id

  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_activity TO authenticated;
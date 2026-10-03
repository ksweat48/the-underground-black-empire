/*
# Metro Initiative Voting — tables

Organizations submit funding initiatives to their Metro. Members back them between cycles,
the Top 5 are frozen into a 48-hour ballot on the 1st and 15th (Metro local time), and the
Metro Treasury funds qualifying initiatives in vote-ranked order.

1. Modified Tables
- `metros.timezone` (text) — Metro local time zone, seeded from the state's time zone.
- `voting_credit_ledger.source` check now also allows `initiative_vote_spend` and `initiative_vote_refund`.

2. New Tables
- `initiatives` — a funding request owned by an organization (title, description, impact, timeline,
  amount_requested_cents, conflict_disclosure, status, backer_count, staged_funding_approved,
  funded_cents, payment_reference, funded_at, completed_at).
- `initiative_backers` — one free backing per member per initiative; drives the live ranking.
- `initiative_events` — permanent history of every status change, review note, and progress report.
- `initiative_cycles` — one row per Metro voting cycle (opens_at, closes_at, status, quorum snapshot, results).
- `initiative_cycle_entries` — the frozen Top 5 for a cycle with final rank, support, qualification and funding outcome.
- `initiative_ballots` — one ballot per member per cycle (credits spent, voting power at submission).
- `initiative_ballot_selections` — each initiative chosen on a ballot with the weight it received.

3. Security
- RLS enabled on every new table. Members can read public initiative data and their own ballots.
- Vote totals on cycle entries are only readable once the cycle is no longer open (admins excepted).
- No direct insert/update/delete policies: every write goes through validated server functions.

4. Notes
1. Statuses: submitted (shown as Under Review), eligible, in_voting, awaiting_review, awaiting_funding,
   funded, completed, disqualified, withdrawn, deferred.
2. No existing data is changed or removed.
*/

ALTER TABLE metros ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/New_York';

UPDATE metros m SET timezone = s.timezone
FROM states s
WHERE s.id = m.state_id AND s.timezone IS NOT NULL AND s.timezone <> '' AND m.timezone = 'America/New_York';

ALTER TABLE voting_credit_ledger DROP CONSTRAINT IF EXISTS voting_credit_ledger_source_check;
ALTER TABLE voting_credit_ledger ADD CONSTRAINT voting_credit_ledger_source_check
  CHECK (source = ANY (ARRAY['monthly_grant','initial_grant','vote_spend','initiative_vote_spend','initiative_vote_refund']));

CREATE TABLE IF NOT EXISTS initiatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metro_id uuid NOT NULL REFERENCES metros(id),
  submitted_by uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 4 AND 120),
  description text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 4000),
  impact text NOT NULL CHECK (char_length(impact) BETWEEN 10 AND 2000),
  timeline text NOT NULL CHECK (char_length(timeline) BETWEEN 3 AND 500),
  amount_requested_cents bigint NOT NULL CHECK (amount_requested_cents > 0),
  conflict_disclosure text NOT NULL CHECK (char_length(conflict_disclosure) BETWEEN 2 AND 2000),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN (
    'submitted','eligible','in_voting','awaiting_review','awaiting_funding',
    'funded','completed','disqualified','withdrawn','deferred')),
  backer_count integer NOT NULL DEFAULT 0,
  staged_funding_approved boolean NOT NULL DEFAULT false,
  funded_cents bigint NOT NULL DEFAULT 0,
  payment_reference text,
  funded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_initiatives_metro_status ON initiatives (metro_id, status);
CREATE INDEX IF NOT EXISTS idx_initiatives_org ON initiatives (organization_id);

CREATE TABLE IF NOT EXISTS initiative_backers (
  initiative_id uuid NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (initiative_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_initiative_backers_member ON initiative_backers (member_id);

CREATE TABLE IF NOT EXISTS initiative_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id uuid NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  actor_id uuid REFERENCES members(id) ON DELETE SET NULL,
  note text,
  cycle_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_initiative_events_initiative ON initiative_events (initiative_id, created_at DESC);

CREATE TABLE IF NOT EXISTS initiative_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metro_id uuid NOT NULL REFERENCES metros(id),
  opens_at timestamptz NOT NULL,
  closes_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('open','results_posted','skipped','cancelled')),
  skip_reason text,
  cancel_reason text,
  cancelled_by uuid REFERENCES members(id) ON DELETE SET NULL,
  eligible_voter_count integer NOT NULL DEFAULT 0,
  quorum_required integer NOT NULL DEFAULT 1,
  ballot_count integer NOT NULL DEFAULT 0,
  quorum_met boolean,
  available_cents_at_open bigint NOT NULL DEFAULT 0,
  results_posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (metro_id, opens_at)
);
CREATE INDEX IF NOT EXISTS idx_initiative_cycles_status ON initiative_cycles (status, closes_at);

CREATE TABLE IF NOT EXISTS initiative_cycle_entries (
  cycle_id uuid NOT NULL REFERENCES initiative_cycles(id) ON DELETE CASCADE,
  initiative_id uuid NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  frozen_rank integer NOT NULL CHECK (frozen_rank BETWEEN 1 AND 5),
  final_rank integer CHECK (final_rank BETWEEN 1 AND 5),
  support_ballots integer NOT NULL DEFAULT 0,
  weighted_support numeric(12,2) NOT NULL DEFAULT 0,
  qualified boolean,
  outcome text NOT NULL DEFAULT 'voting' CHECK (outcome IN (
    'voting','pending_review','awaiting_funding','funded','not_qualified','no_quorum',
    'disqualified','deferred','withdrawn','cancelled')),
  outcome_note text,
  amount_requested_cents bigint NOT NULL,
  PRIMARY KEY (cycle_id, initiative_id),
  UNIQUE (cycle_id, frozen_rank)
);
CREATE INDEX IF NOT EXISTS idx_initiative_cycle_entries_initiative ON initiative_cycle_entries (initiative_id);

CREATE TABLE IF NOT EXISTS initiative_ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES initiative_cycles(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  credits_spent integer NOT NULL CHECK (credits_spent BETWEEN 1 AND 5),
  voting_power numeric(5,2) NOT NULL,
  refunded boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_initiative_ballots_member ON initiative_ballots (member_id);

CREATE TABLE IF NOT EXISTS initiative_ballot_selections (
  ballot_id uuid NOT NULL REFERENCES initiative_ballots(id) ON DELETE CASCADE,
  initiative_id uuid NOT NULL REFERENCES initiatives(id) ON DELETE CASCADE,
  weight numeric(5,2) NOT NULL,
  PRIMARY KEY (ballot_id, initiative_id)
);

ALTER TABLE initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiative_backers ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiative_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiative_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiative_cycle_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiative_ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE initiative_ballot_selections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_initiatives" ON initiatives;
CREATE POLICY "read_initiatives" ON initiatives FOR SELECT TO authenticated
USING (
  status NOT IN ('submitted','disqualified')
  OR submitted_by = auth.uid()
  OR EXISTS (SELECT 1 FROM organizations o WHERE o.id = initiatives.organization_id AND o.owner_id = auth.uid())
  OR public.is_current_user_admin()
);

DROP POLICY IF EXISTS "read_own_backings" ON initiative_backers;
CREATE POLICY "read_own_backings" ON initiative_backers FOR SELECT TO authenticated
USING (member_id = auth.uid());

DROP POLICY IF EXISTS "read_initiative_events" ON initiative_events;
CREATE POLICY "read_initiative_events" ON initiative_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM initiatives i WHERE i.id = initiative_events.initiative_id));

DROP POLICY IF EXISTS "read_initiative_cycles" ON initiative_cycles;
CREATE POLICY "read_initiative_cycles" ON initiative_cycles FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "read_closed_cycle_entries" ON initiative_cycle_entries;
CREATE POLICY "read_closed_cycle_entries" ON initiative_cycle_entries FOR SELECT TO authenticated
USING (
  public.is_current_user_admin()
  OR EXISTS (SELECT 1 FROM initiative_cycles c WHERE c.id = initiative_cycle_entries.cycle_id AND c.status <> 'open')
);

DROP POLICY IF EXISTS "read_own_ballots" ON initiative_ballots;
CREATE POLICY "read_own_ballots" ON initiative_ballots FOR SELECT TO authenticated
USING (member_id = auth.uid());

DROP POLICY IF EXISTS "read_own_ballot_selections" ON initiative_ballot_selections;
CREATE POLICY "read_own_ballot_selections" ON initiative_ballot_selections FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM initiative_ballots b WHERE b.id = initiative_ballot_selections.ballot_id AND b.member_id = auth.uid()));

/*
# Organizations System

## Overview
Adds a new "Organizations" content type to the marketplace, allowing any member to
list community organizations (nonprofits, initiatives, foundations, etc.) with a
fundraising goal. Organizations are voted on by the community through the existing
voting system -- the most liked and engaged organizations rise to the top and become
vote candidates. Funds raised grow as the community votes for the organization, and
organizations can appear in multiple voting rounds.

## New Tables

### 1. organizations
Stores community organization listings.
- id (uuid, primary key)
- owner_id (uuid, references members, defaults to auth.uid())
- city_id (uuid, references cities)
- name (text, required)
- org_type (text, required -- one of: nonprofit, community_organization, mission_based, initiative, foundation, other)
- description (text, mission statement / description)
- funding_goal (numeric, fundraising target in dollars, defaults to 0)
- total_raised (numeric, amount raised through voting support, defaults to 0)
- external_url (text, website or donation link)
- contact_info (text, phone/email/social)
- image_url (text, optional organization image)
- status (text, defaults to 'in_review' -- same lifecycle as market_listings)
- is_verified (boolean, defaults to false)
- like_count (integer, cached count, defaults to 0)
- save_count (integer, cached count, defaults to 0)
- comment_count (integer, cached count, defaults to 0)
- vote_support_total (numeric, total voting weight received across all rounds, defaults to 0)
- created_at, updated_at (timestamps)

### 2. organization_likes
Low-weight engagement signal. One like per member per organization.
- id, member_id, organization_id, created_at
- UNIQUE (member_id, organization_id)

### 3. organization_saves
Bookmarks. One save per member per organization.
- id, member_id, organization_id, created_at
- UNIQUE (member_id, organization_id)

### 4. organization_comments
Medium-weight engagement signal.
- id, member_id, organization_id, body, created_at, updated_at

### 5. organization_vote_support
Tracks individual voting contributions to organizations. Each time a member votes
for an organization in a voting round, the effective weight of their vote is recorded
here and added to the organization's total_raised and vote_support_total.
- id, organization_id, vote_id, member_id, effective_weight (numeric), voted_at
- UNIQUE (vote_id, member_id) -- one vote per member per voting round

## Security
- RLS enabled on all new tables.
- organizations: anyone can read approved/own; owner can CRUD their own.
- organization_likes/saves: owner-scoped read/insert/delete (authenticated).
- organization_comments: anyone can read; owner can insert/update/delete their own.
- organization_vote_support: anyone can read; insert only through vote casting flow
  (authenticated, must match an active vote record).

## Triggers
- like_count, save_count, comment_count auto-maintained via triggers (same pattern as
  market_listings).
- updated_at auto-maintained via trigger.
- total_raised auto-incremented when a vote_support row is inserted.

## Important Notes
1. Organizations use the same status lifecycle as market_listings (in_review, approved,
   needs_changes, removed).
2. The fundraising goal is a projected target -- organizations can raise more than the
   goal and can appear in multiple voting rounds.
3. total_raised grows as votes are cast for the organization, with each vote's effective
   weight contributing a dollar amount.
4. The existing votes table uses jsonb choices. Organization votes will use a choice key
   format of "org:<organization_id>" so they can be distinguished from other vote types.
*/

-- ============================================================
-- ORGANIZATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name text NOT NULL,
  org_type text NOT NULL DEFAULT 'initiative',
  description text NOT NULL DEFAULT '',
  funding_goal numeric NOT NULL DEFAULT 0,
  total_raised numeric NOT NULL DEFAULT 0,
  external_url text NOT NULL DEFAULT '',
  contact_info text NOT NULL DEFAULT '',
  image_url text,
  status text NOT NULL DEFAULT 'in_review',
  is_verified boolean NOT NULL DEFAULT false,
  like_count integer NOT NULL DEFAULT 0,
  save_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  vote_support_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_organizations" ON organizations;
CREATE POLICY "read_organizations" ON organizations FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' OR owner_id = auth.uid());

DROP POLICY IF EXISTS "insert_organizations" ON organizations;
CREATE POLICY "insert_organizations" ON organizations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id AND status = 'in_review');

DROP POLICY IF EXISTS "update_organizations" ON organizations;
CREATE POLICY "update_organizations" ON organizations FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "delete_organizations" ON organizations;
CREATE POLICY "delete_organizations" ON organizations FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_organizations_city ON organizations(city_id);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(org_type);

-- ============================================================
-- ORGANIZATION LIKES
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, organization_id)
);

ALTER TABLE organization_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_organization_likes" ON organization_likes;
CREATE POLICY "read_organization_likes" ON organization_likes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_organization_likes" ON organization_likes;
CREATE POLICY "insert_organization_likes" ON organization_likes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "delete_organization_likes" ON organization_likes;
CREATE POLICY "delete_organization_likes" ON organization_likes FOR DELETE
  TO authenticated USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_organization_likes_org ON organization_likes(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_likes_member ON organization_likes(member_id);

-- ============================================================
-- ORGANIZATION SAVES
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, organization_id)
);

ALTER TABLE organization_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_organization_saves" ON organization_saves;
CREATE POLICY "read_organization_saves" ON organization_saves FOR SELECT
  TO authenticated USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "insert_organization_saves" ON organization_saves;
CREATE POLICY "insert_organization_saves" ON organization_saves FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "delete_organization_saves" ON organization_saves;
CREATE POLICY "delete_organization_saves" ON organization_saves FOR DELETE
  TO authenticated USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_organization_saves_member ON organization_saves(member_id);
CREATE INDEX IF NOT EXISTS idx_organization_saves_org ON organization_saves(organization_id);

-- ============================================================
-- ORGANIZATION COMMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organization_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_organization_comments" ON organization_comments;
CREATE POLICY "read_organization_comments" ON organization_comments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_organization_comments" ON organization_comments;
CREATE POLICY "insert_organization_comments" ON organization_comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "update_organization_comments" ON organization_comments;
CREATE POLICY "update_organization_comments" ON organization_comments FOR UPDATE
  TO authenticated USING (auth.uid() = member_id)
  WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "delete_organization_comments" ON organization_comments;
CREATE POLICY "delete_organization_comments" ON organization_comments FOR DELETE
  TO authenticated USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_organization_comments_org ON organization_comments(organization_id);

-- ============================================================
-- ORGANIZATION VOTE SUPPORT
-- Tracks individual vote contributions to organizations.
-- Each row represents one member's vote for an organization in a
-- specific voting round. The effective_weight is the dollar amount
-- contributed to the organization's total_raised.
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_vote_support (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vote_id uuid NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  effective_weight numeric NOT NULL DEFAULT 0,
  voted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vote_id, member_id)
);

ALTER TABLE organization_vote_support ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_organization_vote_support" ON organization_vote_support;
CREATE POLICY "read_organization_vote_support" ON organization_vote_support FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_organization_vote_support" ON organization_vote_support;
CREATE POLICY "insert_organization_vote_support" ON organization_vote_support FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = member_id
    AND EXISTS (
      SELECT 1 FROM votes
      WHERE votes.id = organization_vote_support.vote_id
      AND votes.status = 'active'
      AND now() >= votes.opens_at
      AND now() <= votes.closes_at
    )
  );

DROP POLICY IF EXISTS "delete_organization_vote_support" ON organization_vote_support;
CREATE POLICY "delete_organization_vote_support" ON organization_vote_support FOR DELETE
  TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_org_vote_support_org ON organization_vote_support(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_vote_support_vote ON organization_vote_support(vote_id);
CREATE INDEX IF NOT EXISTS idx_org_vote_support_member ON organization_vote_support(member_id);

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================

DROP TRIGGER IF EXISTS trg_organizations_updated ON organizations;
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_organization_comments_updated ON organization_comments;
CREATE TRIGGER trg_organization_comments_updated BEFORE UPDATE ON organization_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TRIGGERS: cached engagement counters
-- ============================================================

CREATE OR REPLACE FUNCTION update_organization_like_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organizations SET like_count = like_count + 1 WHERE id = NEW.organization_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organizations SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.organization_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_organization_likes_count ON organization_likes;
CREATE TRIGGER trg_organization_likes_count AFTER INSERT OR DELETE ON organization_likes
  FOR EACH ROW EXECUTE FUNCTION update_organization_like_count();

CREATE OR REPLACE FUNCTION update_organization_save_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organizations SET save_count = save_count + 1 WHERE id = NEW.organization_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organizations SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.organization_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_organization_saves_count ON organization_saves;
CREATE TRIGGER trg_organization_saves_count AFTER INSERT OR DELETE ON organization_saves
  FOR EACH ROW EXECUTE FUNCTION update_organization_save_count();

CREATE OR REPLACE FUNCTION update_organization_comment_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organizations SET comment_count = comment_count + 1 WHERE id = NEW.organization_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE organizations SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.organization_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_organization_comments_count ON organization_comments;
CREATE TRIGGER trg_organization_comments_count AFTER INSERT OR DELETE ON organization_comments
  FOR EACH ROW EXECUTE FUNCTION update_organization_comment_count();

-- ============================================================
-- TRIGGER: update total_raised when vote support is recorded
-- ============================================================

CREATE OR REPLACE FUNCTION update_organization_total_raised()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE organizations
    SET total_raised = total_raised + NEW.effective_weight,
        vote_support_total = vote_support_total + NEW.effective_weight
    WHERE id = NEW.organization_id;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_organization_vote_support_raised ON organization_vote_support;
CREATE TRIGGER trg_organization_vote_support_raised AFTER INSERT ON organization_vote_support
  FOR EACH ROW EXECUTE FUNCTION update_organization_total_raised();

-- ============================================================
-- FUNCTION: Record organization vote support
-- Called from the frontend after a vote is cast for an organization.
-- Inserts a vote_support row and returns the new total_raised.
-- ============================================================

CREATE OR REPLACE FUNCTION record_organization_vote_support(
  p_organization_id uuid,
  p_vote_id uuid,
  p_effective_weight numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_total numeric;
  v_already_voted boolean;
BEGIN
  -- Check if member already voted in this round
  SELECT EXISTS(
    SELECT 1 FROM organization_vote_support
    WHERE vote_id = p_vote_id
    AND member_id = auth.uid()
  ) INTO v_already_voted;

  IF v_already_voted THEN
    RAISE EXCEPTION 'Already voted in this round';
  END IF;

  -- Insert the vote support record
  INSERT INTO organization_vote_support (organization_id, vote_id, member_id, effective_weight)
  VALUES (p_organization_id, p_vote_id, auth.uid(), p_effective_weight);

  -- Return the new total raised
  SELECT total_raised INTO v_new_total FROM organizations WHERE id = p_organization_id;

  RETURN v_new_total;
END;
$$;

-- ============================================================
-- VIEW: Organization ranking by engagement
-- Surfaces organizations sorted by total engagement (likes + saves + comments)
-- plus vote support, so the most engaged organizations can be promoted
-- as vote candidates.
-- ============================================================

CREATE OR REPLACE VIEW organization_ranking AS
SELECT
  o.id,
  o.name,
  o.org_type,
  o.city_id,
  o.status,
  o.funding_goal,
  o.total_raised,
  o.like_count,
  o.save_count,
  o.comment_count,
  o.vote_support_total,
  (o.like_count * 3 + o.save_count * 2 + o.comment_count * 2 + COALESCE(o.vote_support_total, 0)) AS engagement_score
FROM organizations o
WHERE o.status = 'approved'
ORDER BY engagement_score DESC;

ALTER VIEW organization_ranking SET (security_invoker = true);

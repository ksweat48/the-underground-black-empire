/*
# Market Listings, Community Engagement, Voting, and Ranking System

1. Purpose
   This migration builds the full data layer for the Empire Market — a local
   discovery and showcase platform for businesses, services, products, events,
   and community updates. It also adds a community voting system and a weighted
   engagement ranking model.

   IMPORTANT: The Market is NOT an ecommerce platform. There are no carts,
   checkouts, payments, or order tracking. All purchases happen through
   external links provided by listing owners.

2. New Tables

   - `market_listings`: Approved/pending business or creator listings.
   - `listing_updates`: Text/image announcements tied to an approved listing.
   - `local_news`: Community-submitted news items.
   - `market_events`: Community events with date, time, location.
   - `listing_saves`: Members can save/bookmark listings.
   - `listing_likes`: Lightweight like signals (one per member per listing).
   - `listing_comments`: Comment threads on listings.
   - `event_check_ins`: Verified check-ins for events (high-weight signal).
   - `content_reports`: Reports for misleading/spam/inappropriate content.
   - `votes`: Empire-controlled voting opportunities.
   - `vote_records`: Individual vote cast by a member.
   - `market_ranking_cache`: Cached ranking score per listing.

3. Engagement Weight Model
   - Like = 1 point (low-weight)
   - Comment = 5 points (medium-weight)
   - Verified event check-in = 20 points (high-weight)
   - Velocity: engagement in the last 7 days counts double
   - Freshness: listings created or updated in the last 14 days get +10
   - Trust: verified listings get +15

4. Security (RLS)
   - All new tables have RLS enabled.
   - Public/approved content is readable by anon + authenticated.
   - Create/update/delete operations require authenticated ownership.
   - Moderation status changes are NOT client-writable.
   - Vote records are insert-only by the authenticated user; they can read
     their own records but not others'.

5. Important Notes
   - `market_listings.status`: 'pending' | 'approved' | 'needs_changes' | 'removed'.
   - `votes.status`: 'draft' | 'active' | 'closed' | 'tallied'.
   - Ranking is computed server-side to prevent client manipulation.
*/

-- ============================================================
-- MARKET LISTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS market_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'services',
  description text NOT NULL DEFAULT '',
  products_services text NOT NULL DEFAULT '',
  price_display text NOT NULL DEFAULT '',
  external_url text NOT NULL DEFAULT '',
  contact_info text NOT NULL DEFAULT '',
  image_url text,
  status text NOT NULL DEFAULT 'pending',
  is_verified boolean NOT NULL DEFAULT false,
  like_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  check_in_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE market_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_market_listings" ON market_listings;
CREATE POLICY "read_market_listings" ON market_listings FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' OR owner_id = auth.uid());

DROP POLICY IF EXISTS "insert_market_listings" ON market_listings;
CREATE POLICY "insert_market_listings" ON market_listings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id AND status = 'pending');

DROP POLICY IF EXISTS "update_market_listings" ON market_listings;
CREATE POLICY "update_market_listings" ON market_listings FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "delete_market_listings" ON market_listings;
CREATE POLICY "delete_market_listings" ON market_listings FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS idx_market_listings_city ON market_listings(city_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status);
CREATE INDEX IF NOT EXISTS idx_market_listings_category ON market_listings(category);
CREATE INDEX IF NOT EXISTS idx_market_listings_owner ON market_listings(owner_id);

-- ============================================================
-- LISTING UPDATES
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  body text NOT NULL,
  image_url text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE listing_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_listing_updates" ON listing_updates;
CREATE POLICY "read_listing_updates" ON listing_updates FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' OR author_id = auth.uid());

DROP POLICY IF EXISTS "insert_listing_updates" ON listing_updates;
CREATE POLICY "insert_listing_updates" ON listing_updates FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM market_listings
      WHERE market_listings.id = listing_updates.listing_id
      AND market_listings.owner_id = auth.uid()
      AND market_listings.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "update_listing_updates" ON listing_updates;
CREATE POLICY "update_listing_updates" ON listing_updates FOR UPDATE
  TO authenticated USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "delete_listing_updates" ON listing_updates;
CREATE POLICY "delete_listing_updates" ON listing_updates FOR DELETE
  TO authenticated USING (auth.uid() = author_id);

CREATE INDEX IF NOT EXISTS idx_listing_updates_listing ON listing_updates(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_updates_status ON listing_updates(status);

-- ============================================================
-- LOCAL NEWS
-- ============================================================

CREATE TABLE IF NOT EXISTS local_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  location_text text NOT NULL DEFAULT '',
  news_date date,
  image_url text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE local_news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_local_news" ON local_news;
CREATE POLICY "read_local_news" ON local_news FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' OR author_id = auth.uid());

DROP POLICY IF EXISTS "insert_local_news" ON local_news;
CREATE POLICY "insert_local_news" ON local_news FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = author_id AND status = 'pending');

DROP POLICY IF EXISTS "update_local_news" ON local_news;
CREATE POLICY "update_local_news" ON local_news FOR UPDATE
  TO authenticated USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "delete_local_news" ON local_news;
CREATE POLICY "delete_local_news" ON local_news FOR DELETE
  TO authenticated USING (auth.uid() = author_id);

CREATE INDEX IF NOT EXISTS idx_local_news_city ON local_news(city_id);
CREATE INDEX IF NOT EXISTS idx_local_news_status ON local_news(status);

-- ============================================================
-- MARKET EVENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS market_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES market_listings(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  event_date date NOT NULL,
  event_time text NOT NULL DEFAULT '',
  location_text text NOT NULL DEFAULT '',
  external_url text NOT NULL DEFAULT '',
  image_url text,
  status text NOT NULL DEFAULT 'pending',
  check_in_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE market_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_market_events" ON market_events;
CREATE POLICY "read_market_events" ON market_events FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' OR author_id = auth.uid());

DROP POLICY IF EXISTS "insert_market_events" ON market_events;
CREATE POLICY "insert_market_events" ON market_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = author_id AND status = 'pending');

DROP POLICY IF EXISTS "update_market_events" ON market_events;
CREATE POLICY "update_market_events" ON market_events FOR UPDATE
  TO authenticated USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "delete_market_events" ON market_events;
CREATE POLICY "delete_market_events" ON market_events FOR DELETE
  TO authenticated USING (auth.uid() = author_id);

CREATE INDEX IF NOT EXISTS idx_market_events_city ON market_events(city_id);
CREATE INDEX IF NOT EXISTS idx_market_events_status ON market_events(status);
CREATE INDEX IF NOT EXISTS idx_market_events_date ON market_events(event_date);
CREATE INDEX IF NOT EXISTS idx_market_events_listing ON market_events(listing_id);

-- ============================================================
-- LISTING SAVES (bookmarks)
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, listing_id)
);

ALTER TABLE listing_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_listing_saves" ON listing_saves;
CREATE POLICY "read_listing_saves" ON listing_saves FOR SELECT
  TO authenticated USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "insert_listing_saves" ON listing_saves;
CREATE POLICY "insert_listing_saves" ON listing_saves FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "delete_listing_saves" ON listing_saves;
CREATE POLICY "delete_listing_saves" ON listing_saves FOR DELETE
  TO authenticated USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_listing_saves_member ON listing_saves(member_id);

-- ============================================================
-- LISTING LIKES (low-weight signal)
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, listing_id)
);

ALTER TABLE listing_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_listing_likes" ON listing_likes;
CREATE POLICY "read_listing_likes" ON listing_likes FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_listing_likes" ON listing_likes;
CREATE POLICY "insert_listing_likes" ON listing_likes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "delete_listing_likes" ON listing_likes;
CREATE POLICY "delete_listing_likes" ON listing_likes FOR DELETE
  TO authenticated USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_listing_likes_listing ON listing_likes(listing_id);
CREATE INDEX IF NOT EXISTS idx_listing_likes_member ON listing_likes(member_id);

-- ============================================================
-- LISTING COMMENTS (medium-weight signal)
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES market_listings(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE listing_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_listing_comments" ON listing_comments;
CREATE POLICY "read_listing_comments" ON listing_comments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_listing_comments" ON listing_comments;
CREATE POLICY "insert_listing_comments" ON listing_comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "update_listing_comments" ON listing_comments;
CREATE POLICY "update_listing_comments" ON listing_comments FOR UPDATE
  TO authenticated USING (auth.uid() = member_id)
  WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "delete_listing_comments" ON listing_comments;
CREATE POLICY "delete_listing_comments" ON listing_comments FOR DELETE
  TO authenticated USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_listing_comments_listing ON listing_comments(listing_id);

-- ============================================================
-- EVENT CHECK-INS (high-weight signal)
-- ============================================================

CREATE TABLE IF NOT EXISTS event_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES market_events(id) ON DELETE CASCADE,
  verified boolean NOT NULL DEFAULT false,
  check_in_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, event_id)
);

ALTER TABLE event_check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_event_check_ins" ON event_check_ins;
CREATE POLICY "read_event_check_ins" ON event_check_ins FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_event_check_ins" ON event_check_ins;
CREATE POLICY "insert_event_check_ins" ON event_check_ins FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "delete_event_check_ins" ON event_check_ins;
CREATE POLICY "delete_event_check_ins" ON event_check_ins FOR DELETE
  TO authenticated USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_event_check_ins_event ON event_check_ins(event_id);
CREATE INDEX IF NOT EXISTS idx_event_check_ins_member ON event_check_ins(member_id);

-- ============================================================
-- CONTENT REPORTS
-- ============================================================

CREATE TABLE IF NOT EXISTS content_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  content_id uuid NOT NULL,
  reason text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE content_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_content_reports" ON content_reports;
CREATE POLICY "read_content_reports" ON content_reports FOR SELECT
  TO authenticated USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "insert_content_reports" ON content_reports;
CREATE POLICY "insert_content_reports" ON content_reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = reporter_id);

CREATE INDEX IF NOT EXISTS idx_content_reports_status ON content_reports(status);
CREATE INDEX IF NOT EXISTS idx_content_reports_content ON content_reports(content_type, content_id);

-- ============================================================
-- VOTES
-- ============================================================

CREATE TABLE IF NOT EXISTS votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  description text NOT NULL DEFAULT '',
  choices jsonb NOT NULL DEFAULT '[]'::jsonb,
  eligibility text NOT NULL DEFAULT 'all_authenticated',
  opens_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_votes" ON votes;
CREATE POLICY "read_votes" ON votes FOR SELECT
  TO authenticated USING (status IN ('active', 'closed', 'tallied'));

DROP POLICY IF EXISTS "insert_votes" ON votes;
CREATE POLICY "insert_votes" ON votes FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "update_votes" ON votes;
CREATE POLICY "update_votes" ON votes FOR UPDATE
  TO authenticated USING (false);

DROP POLICY IF EXISTS "delete_votes" ON votes;
CREATE POLICY "delete_votes" ON votes FOR DELETE
  TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_votes_status ON votes(status);

-- ============================================================
-- VOTE RECORDS
-- ============================================================

CREATE TABLE IF NOT EXISTS vote_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id uuid NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  choice text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vote_id, member_id)
);

ALTER TABLE vote_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_vote_records" ON vote_records;
CREATE POLICY "read_vote_records" ON vote_records FOR SELECT
  TO authenticated USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "insert_vote_records" ON vote_records;
CREATE POLICY "insert_vote_records" ON vote_records FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = member_id
    AND EXISTS (
      SELECT 1 FROM votes
      WHERE votes.id = vote_records.vote_id
      AND votes.status = 'active'
      AND now() >= votes.opens_at
      AND now() <= votes.closes_at
    )
  );

DROP POLICY IF EXISTS "update_vote_records" ON vote_records;
CREATE POLICY "update_vote_records" ON vote_records FOR UPDATE
  TO authenticated USING (false);

DROP POLICY IF EXISTS "delete_vote_records" ON vote_records;
CREATE POLICY "delete_vote_records" ON vote_records FOR DELETE
  TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_vote_records_vote ON vote_records(vote_id);
CREATE INDEX IF NOT EXISTS idx_vote_records_member ON vote_records(member_id);

-- ============================================================
-- MARKET RANKING CACHE
-- ============================================================

CREATE TABLE IF NOT EXISTS market_ranking_cache (
  listing_id uuid PRIMARY KEY REFERENCES market_listings(id) ON DELETE CASCADE,
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  score numeric NOT NULL DEFAULT 0,
  recent_likes integer NOT NULL DEFAULT 0,
  recent_comments integer NOT NULL DEFAULT 0,
  recent_check_ins integer NOT NULL DEFAULT 0,
  lifetime_likes integer NOT NULL DEFAULT 0,
  lifetime_comments integer NOT NULL DEFAULT 0,
  lifetime_check_ins integer NOT NULL DEFAULT 0,
  is_fresh boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  computed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE market_ranking_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_market_ranking_cache" ON market_ranking_cache;
CREATE POLICY "read_market_ranking_cache" ON market_ranking_cache FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_market_ranking_cache" ON market_ranking_cache;
CREATE POLICY "insert_market_ranking_cache" ON market_ranking_cache FOR INSERT
  TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "update_market_ranking_cache" ON market_ranking_cache;
CREATE POLICY "update_market_ranking_cache" ON market_ranking_cache FOR UPDATE
  TO authenticated USING (false);

DROP POLICY IF EXISTS "delete_market_ranking_cache" ON market_ranking_cache;
CREATE POLICY "delete_market_ranking_cache" ON market_ranking_cache FOR DELETE
  TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_market_ranking_city ON market_ranking_cache(city_id);
CREATE INDEX IF NOT EXISTS idx_market_ranking_score ON market_ranking_cache(score DESC);

-- ============================================================
-- TRIGGER: update updated_at on market tables
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_market_listings_updated ON market_listings;
CREATE TRIGGER trg_market_listings_updated BEFORE UPDATE ON market_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_listing_updates_updated ON listing_updates;
CREATE TRIGGER trg_listing_updates_updated BEFORE UPDATE ON listing_updates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_local_news_updated ON local_news;
CREATE TRIGGER trg_local_news_updated BEFORE UPDATE ON local_news
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_market_events_updated ON market_events;
CREATE TRIGGER trg_market_events_updated BEFORE UPDATE ON market_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_listing_comments_updated ON listing_comments;
CREATE TRIGGER trg_listing_comments_updated BEFORE UPDATE ON listing_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_votes_updated ON votes;
CREATE TRIGGER trg_votes_updated BEFORE UPDATE ON votes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TRIGGERS: maintain cached engagement counters
-- ============================================================

CREATE OR REPLACE FUNCTION update_listing_like_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE market_listings SET like_count = like_count + 1 WHERE id = NEW.listing_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE market_listings SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.listing_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_listing_likes_count ON listing_likes;
CREATE TRIGGER trg_listing_likes_count AFTER INSERT OR DELETE ON listing_likes
  FOR EACH ROW EXECUTE FUNCTION update_listing_like_count();

CREATE OR REPLACE FUNCTION update_listing_comment_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE market_listings SET comment_count = comment_count + 1 WHERE id = NEW.listing_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE market_listings SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.listing_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_listing_comments_count ON listing_comments;
CREATE TRIGGER trg_listing_comments_count AFTER INSERT OR DELETE ON listing_comments
  FOR EACH ROW EXECUTE FUNCTION update_listing_comment_count();

CREATE OR REPLACE FUNCTION update_event_check_in_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE market_events SET check_in_count = check_in_count + 1 WHERE id = NEW.event_id;
    IF EXISTS (SELECT 1 FROM market_events WHERE id = NEW.event_id AND listing_id IS NOT NULL) THEN
      UPDATE market_listings SET check_in_count = check_in_count + 1
      WHERE id = (SELECT listing_id FROM market_events WHERE id = NEW.event_id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE market_events SET check_in_count = GREATEST(check_in_count - 1, 0) WHERE id = OLD.event_id;
    IF EXISTS (SELECT 1 FROM market_events WHERE id = OLD.event_id AND listing_id IS NOT NULL) THEN
      UPDATE market_listings SET check_in_count = GREATEST(check_in_count - 1, 0)
      WHERE id = (SELECT listing_id FROM market_events WHERE id = OLD.event_id);
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_check_ins_count ON event_check_ins;
CREATE TRIGGER trg_event_check_ins_count AFTER INSERT OR DELETE ON event_check_ins
  FOR EACH ROW EXECUTE FUNCTION update_event_check_in_count();

-- ============================================================
-- RANKING COMPUTATION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION compute_market_rank_scores(p_city_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  listing RECORD;
  v_recent_likes integer;
  v_recent_comments integer;
  v_recent_check_ins integer;
  v_lifetime_likes integer;
  v_lifetime_comments integer;
  v_lifetime_check_ins integer;
  v_score numeric;
  v_is_fresh boolean;
BEGIN
  FOR listing IN
    SELECT id, city_id, is_verified, created_at, updated_at
    FROM market_listings
    WHERE status = 'approved'
    AND (p_city_id IS NULL OR city_id = p_city_id)
  LOOP
    SELECT COUNT(*) INTO v_lifetime_likes
    FROM listing_likes WHERE listing_id = listing.id;

    SELECT COUNT(*) INTO v_lifetime_comments
    FROM listing_comments WHERE listing_id = listing.id;

    SELECT COUNT(*) INTO v_lifetime_check_ins
    FROM event_check_ins eci
    JOIN market_events me ON me.id = eci.event_id
    WHERE me.listing_id = listing.id;

    SELECT COUNT(*) INTO v_recent_likes
    FROM listing_likes
    WHERE listing_id = listing.id
    AND created_at >= now() - interval '7 days';

    SELECT COUNT(*) INTO v_recent_comments
    FROM listing_comments
    WHERE listing_id = listing.id
    AND created_at >= now() - interval '7 days';

    SELECT COUNT(*) INTO v_recent_check_ins
    FROM event_check_ins eci
    JOIN market_events me ON me.id = eci.event_id
    WHERE me.listing_id = listing.id
    AND eci.created_at >= now() - interval '7 days';

    v_score := 0;
    v_score := v_score + (v_lifetime_likes * 1);
    v_score := v_score + (v_lifetime_comments * 5);
    v_score := v_score + (v_lifetime_check_ins * 20);
    v_score := v_score + (v_recent_likes * 1);
    v_score := v_score + (v_recent_comments * 5);
    v_score := v_score + (v_recent_check_ins * 20);

    v_is_fresh := (listing.created_at >= now() - interval '14 days'
      OR listing.updated_at >= now() - interval '14 days');
    IF v_is_fresh THEN
      v_score := v_score + 10;
    END IF;

    IF listing.is_verified THEN
      v_score := v_score + 15;
    END IF;

    INSERT INTO market_ranking_cache (
      listing_id, city_id, score,
      recent_likes, recent_comments, recent_check_ins,
      lifetime_likes, lifetime_comments, lifetime_check_ins,
      is_fresh, is_verified, computed_at
    ) VALUES (
      listing.id, listing.city_id, v_score,
      v_recent_likes, v_recent_comments, v_recent_check_ins,
      v_lifetime_likes, v_lifetime_comments, v_lifetime_check_ins,
      v_is_fresh, listing.is_verified, now()
    ) ON CONFLICT (listing_id) DO UPDATE SET
      score = EXCLUDED.score,
      recent_likes = EXCLUDED.recent_likes,
      recent_comments = EXCLUDED.recent_comments,
      recent_check_ins = EXCLUDED.recent_check_ins,
      lifetime_likes = EXCLUDED.lifetime_likes,
      lifetime_comments = EXCLUDED.lifetime_comments,
      lifetime_check_ins = EXCLUDED.lifetime_check_ins,
      is_fresh = EXCLUDED.is_fresh,
      is_verified = EXCLUDED.is_verified,
      computed_at = EXCLUDED.computed_at;
  END LOOP;

  DELETE FROM market_ranking_cache
  WHERE listing_id NOT IN (
    SELECT id FROM market_listings WHERE status = 'approved'
  );
END;
$$;

-- ============================================================
-- CONVENIENCE VIEWS
-- ============================================================

CREATE OR REPLACE VIEW market_feed_view AS
  SELECT
    ml.id,
    ml.name,
    ml.category,
    ml.description,
    ml.price_display,
    ml.image_url,
    ml.is_verified,
    ml.like_count,
    ml.comment_count,
    ml.check_in_count,
    ml.city_id,
    ml.owner_id,
    ml.external_url,
    ml.created_at,
    ml.updated_at,
    COALESCE(mrc.score, 0) AS rank_score
  FROM market_listings ml
  LEFT JOIN market_ranking_cache mrc ON mrc.listing_id = ml.id
  WHERE ml.status = 'approved'
  ORDER BY COALESCE(mrc.score, 0) DESC, ml.created_at DESC;

CREATE OR REPLACE VIEW community_feed_view AS
  SELECT
    lu.id,
    'update' AS feed_type,
    lu.listing_id,
    ml.name AS listing_name,
    ml.city_id,
    lu.body,
    lu.image_url,
    lu.author_id,
    lu.created_at,
    COALESCE(mrc.score, 0) AS rank_score
  FROM listing_updates lu
  JOIN market_listings ml ON ml.id = lu.listing_id
  LEFT JOIN market_ranking_cache mrc ON mrc.listing_id = lu.listing_id
  WHERE lu.status = 'approved'

  UNION ALL

  SELECT
    ln.id,
    'news' AS feed_type,
    NULL::uuid AS listing_id,
    ln.title AS listing_name,
    ln.city_id,
    ln.body,
    ln.image_url,
    ln.author_id,
    ln.created_at,
    0 AS rank_score
  FROM local_news ln
  WHERE ln.status = 'approved'

  UNION ALL

  SELECT
    me.id,
    'event' AS feed_type,
    me.listing_id,
    me.name AS listing_name,
    me.city_id,
    me.description AS body,
    me.image_url,
    me.author_id,
    me.created_at,
    COALESCE(mrc.score, 0) AS rank_score
  FROM market_events me
  LEFT JOIN market_ranking_cache mrc ON mrc.listing_id = me.listing_id
  WHERE me.status = 'approved'
  ORDER BY created_at DESC;

/*
# Unified Feed Engagement — Boosts, News Comments/Saves, Boost Counts

## Purpose
Adds a unified boost system across all post types (listings, organizations, news, events, updates),
adds comments and saves for news posts, and adds boost_count columns to content tables so the
engagement bar can display consistent counts everywhere.

## Changes

1. New Tables
   - `post_boosts` — one row per boost action, keyed by (post_type, post_id, member_id).
     post_type values: 'listing', 'organization', 'news', 'event', 'update'.
   - `news_comments` — comments on local_news posts, mirrors listing_comments structure.
   - `news_saves` — saves/bookmarks on local_news posts, mirrors listing_saves structure.

2. Modified Tables
   - `local_news` — adds like_count, comment_count, save_count, boost_count integer columns (default 0).
   - `market_listings` — adds boost_count integer column (default 0).
   - `organizations` — adds boost_count integer column (default 0).
   - `market_events` — adds boost_count integer column (default 0).
   - `listing_updates` — adds boost_count integer column (default 0).

3. New Functions
   - `boost_post(p_post_type, p_post_id)` — inserts a boost row, awards 2 influence (capped at 20/day),
     increments the boost_count on the parent table, returns true. Idempotent.
   - `unboost_post(p_post_type, p_post_id)` — removes the boost row, decrements boost_count, returns boolean.
   - `unlike_news(p_news_id)` — removes a news like, decrements like_count on local_news.
   - `is_post_boosted_by_user(p_post_type, p_post_id, p_member_id)` — check if a user already boosted.

4. Triggers
   - `trg_news_comment_count` — increments/decrements local_news.comment_count on news_comments insert/delete.
   - `trg_news_save_count` — increments/decrements local_news.save_count on news_saves insert/delete.

5. Security
   - RLS enabled on all new tables.
   - post_boosts: authenticated can read all boosts; insert/delete only own boost.
   - news_comments: authenticated can read all, insert only own, delete only own.
   - news_saves: authenticated can read all, insert only own, delete only own.
   - All count mutations go through SECURITY DEFINER functions or triggers, not client-writable columns.

## Important Notes
1. boost_count columns are NOT client-writable — they are maintained by triggers and RPC functions.
2. The boost RPC uses the same daily influence cap pattern as like_listing/like_news.
3. Existing listing_likes, listing_saves, listing_comments, organization_likes, organization_saves,
   organization_comments, and news_likes tables remain unchanged.
4. The like_news RPC already exists but unlike_news did not — this migration adds it.
5. local_news.like_count is maintained by a trigger on news_likes (added below) since like_news RPC
   currently does not increment a count column (the column did not exist before).
*/

-- ============================================================
-- 1. ADD COUNT COLUMNS TO local_news
-- ============================================================
DO $$ BEGIN
  ALTER TABLE local_news ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;
  ALTER TABLE local_news ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;
  ALTER TABLE local_news ADD COLUMN IF NOT EXISTS save_count integer NOT NULL DEFAULT 0;
  ALTER TABLE local_news ADD COLUMN IF NOT EXISTS boost_count integer NOT NULL DEFAULT 0;
END $$;

-- ============================================================
-- 2. ADD boost_count TO OTHER CONTENT TABLES
-- ============================================================
DO $$ BEGIN
  ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS boost_count integer NOT NULL DEFAULT 0;
  ALTER TABLE organizations ADD COLUMN IF NOT EXISTS boost_count integer NOT NULL DEFAULT 0;
  ALTER TABLE market_events ADD COLUMN IF NOT EXISTS boost_count integer NOT NULL DEFAULT 0;
  ALTER TABLE listing_updates ADD COLUMN IF NOT EXISTS boost_count integer NOT NULL DEFAULT 0;
END $$;

-- ============================================================
-- 3. POST_BOOSTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS post_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type text NOT NULL CHECK (post_type IN ('listing','organization','news','event','update')),
  post_id uuid NOT NULL,
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  influence_awarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_type, post_id, member_id)
);

ALTER TABLE post_boosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_post_boosts" ON post_boosts;
CREATE POLICY "read_post_boosts" ON post_boosts FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_boost" ON post_boosts;
CREATE POLICY "insert_own_boost" ON post_boosts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "delete_own_boost" ON post_boosts;
CREATE POLICY "delete_own_boost" ON post_boosts FOR DELETE
  TO authenticated USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_post_boosts_lookup ON post_boosts(post_type, post_id);
CREATE INDEX IF NOT EXISTS idx_post_boosts_member ON post_boosts(member_id);

-- ============================================================
-- 4. NEWS_COMMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS news_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id uuid NOT NULL REFERENCES local_news(id) ON DELETE CASCADE,
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE news_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_news_comments" ON news_comments;
CREATE POLICY "read_news_comments" ON news_comments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_news_comment" ON news_comments;
CREATE POLICY "insert_own_news_comment" ON news_comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "delete_own_news_comment" ON news_comments;
CREATE POLICY "delete_own_news_comment" ON news_comments FOR DELETE
  TO authenticated USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_news_comments_news ON news_comments(news_id);

-- ============================================================
-- 5. NEWS_SAVES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS news_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id uuid NOT NULL REFERENCES local_news(id) ON DELETE CASCADE,
  member_id uuid NOT NULL DEFAULT auth.uid() REFERENCES members(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (news_id, member_id)
);

ALTER TABLE news_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_news_saves" ON news_saves;
CREATE POLICY "read_news_saves" ON news_saves FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_news_save" ON news_saves;
CREATE POLICY "insert_own_news_save" ON news_saves FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "delete_own_news_save" ON news_saves;
CREATE POLICY "delete_own_news_save" ON news_saves FOR DELETE
  TO authenticated USING (auth.uid() = member_id);

CREATE INDEX IF NOT EXISTS idx_news_saves_lookup ON news_saves(news_id);
CREATE INDEX IF NOT EXISTS idx_news_saves_member ON news_saves(member_id);

-- ============================================================
-- 6. TRIGGERS FOR NEWS COMMENT AND SAVE COUNTS
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_news_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE local_news SET comment_count = comment_count + 1 WHERE id = NEW.news_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE local_news SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.news_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_news_comment_count ON news_comments;
CREATE TRIGGER trg_news_comment_count AFTER INSERT OR DELETE ON news_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_news_comment_count();

CREATE OR REPLACE FUNCTION public.update_news_save_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE local_news SET save_count = save_count + 1 WHERE id = NEW.news_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE local_news SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.news_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_news_save_count ON news_saves;
CREATE TRIGGER trg_news_save_count AFTER INSERT OR DELETE ON news_saves
  FOR EACH ROW EXECUTE FUNCTION public.update_news_save_count();

-- ============================================================
-- 7. TRIGGER FOR NEWS LIKE COUNT (news_likes already exists)
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_news_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE local_news SET like_count = like_count + 1 WHERE id = NEW.news_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE local_news SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.news_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_news_like_count ON news_likes;
CREATE TRIGGER trg_news_like_count AFTER INSERT OR DELETE ON news_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_news_like_count();

-- ============================================================
-- 8. BOOST_POST FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.boost_post(
  p_post_type text,
  p_post_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member_id uuid := auth.uid();
  v_daily_influence int;
  v_idem_key text;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM post_boosts
    WHERE post_type = p_post_type AND post_id = p_post_id AND member_id = v_member_id
  ) THEN
    RETURN true;
  END IF;

  INSERT INTO post_boosts (post_type, post_id, member_id, influence_awarded)
  VALUES (p_post_type, p_post_id, v_member_id, false);

  SELECT COALESCE(influence_awarded_today, 0) INTO v_daily_influence
  FROM daily_like_influence_log
  WHERE member_id = v_member_id AND log_date = CURRENT_DATE;

  IF v_daily_influence < 20 THEN
    v_idem_key := 'post_boost:' || p_post_type || ':' || p_post_id::text || ':' || v_member_id::text;
    IF public.award_influence(v_member_id, 'post_boost', 2, p_post_id, v_idem_key, 'Post boost') THEN
      UPDATE post_boosts SET influence_awarded = true
      WHERE post_type = p_post_type AND post_id = p_post_id AND member_id = v_member_id;

      INSERT INTO daily_like_influence_log (member_id, log_date, influence_awarded_today)
      VALUES (v_member_id, CURRENT_DATE, 2)
      ON CONFLICT (member_id, log_date)
      DO UPDATE SET influence_awarded_today = daily_like_influence_log.influence_awarded_today + 2;
    END IF;
  END IF;

  -- Increment boost_count on the parent table
  IF p_post_type = 'listing' THEN
    UPDATE market_listings SET boost_count = boost_count + 1 WHERE id = p_post_id;
  ELSIF p_post_type = 'organization' THEN
    UPDATE organizations SET boost_count = boost_count + 1 WHERE id = p_post_id;
  ELSIF p_post_type = 'news' THEN
    UPDATE local_news SET boost_count = boost_count + 1 WHERE id = p_post_id;
  ELSIF p_post_type = 'event' THEN
    UPDATE market_events SET boost_count = boost_count + 1 WHERE id = p_post_id;
  ELSIF p_post_type = 'update' THEN
    UPDATE listing_updates SET boost_count = boost_count + 1 WHERE id = p_post_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.boost_post(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.boost_post(text, uuid) TO authenticated;

-- ============================================================
-- 9. UNBOOST_POST FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.unboost_post(
  p_post_type text,
  p_post_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member_id uuid := auth.uid();
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM post_boosts
  WHERE post_type = p_post_type AND post_id = p_post_id AND member_id = v_member_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF p_post_type = 'listing' THEN
    UPDATE market_listings SET boost_count = GREATEST(boost_count - 1, 0) WHERE id = p_post_id;
  ELSIF p_post_type = 'organization' THEN
    UPDATE organizations SET boost_count = GREATEST(boost_count - 1, 0) WHERE id = p_post_id;
  ELSIF p_post_type = 'news' THEN
    UPDATE local_news SET boost_count = GREATEST(boost_count - 1, 0) WHERE id = p_post_id;
  ELSIF p_post_type = 'event' THEN
    UPDATE market_events SET boost_count = GREATEST(boost_count - 1, 0) WHERE id = p_post_id;
  ELSIF p_post_type = 'update' THEN
    UPDATE listing_updates SET boost_count = GREATEST(boost_count - 1, 0) WHERE id = p_post_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unboost_post(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.unboost_post(text, uuid) TO authenticated;

-- ============================================================
-- 10. UNLIKE_NEWS FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.unlike_news(p_news_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_member_id uuid := auth.uid();
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM news_likes
  WHERE news_id = p_news_id AND member_id = v_member_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unlike_news(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.unlike_news(uuid) TO authenticated;
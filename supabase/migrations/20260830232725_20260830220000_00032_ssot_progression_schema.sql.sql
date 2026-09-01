/*
# SSOT Progression System — Schema & Server-Authoritative Functions

## Purpose
Replaces the old 5-level, lookup-table VP system with the new open-ended
30+ level ladder, linear VP formula, idempotent XP/Influence awards, and
server-authoritative reward functions.

## Schema Changes
1. xp_ledger: add `event_type` (text) and `idempotency_key` (text, UNIQUE)
2. influence_ledger: add `event_type` (text) and `idempotency_key` (text, UNIQUE)
3. vote_records: add `xp_awarded` (boolean, default false)
4. listing_likes: add `xp_awarded` (boolean, default false)
5. New table: `daily_like_xp_log` — tracks per-member daily like XP for 20/day cap
6. New table: `news_likes` — for news like tracking with anti-farming XP

## New/Replaced Functions
- award_xp (replaced) — idempotent ledger insert with new signature
- award_influence — idempotent ledger insert
- get_member_level — computes level from XP using 30+ level ladder
- get_member_voting_power — rewritten with linear VP formula
- cast_weighted_vote — now awards +10 XP and +5 Influence (once per ballot)
- like_listing / unlike_listing — server-side like with anti-farming XP
- like_news — server-side news like with anti-farming XP
- check_in_to_event — awards +25 XP once per member per event
- award_verified_referral — awards +25 Influence once per referral
- award_city_level_xp — +50 XP to city members on city level transition
- award_empire_level_xp — +100 XP to all members on civilization transition
- award_verified_event_host_xp — +75 XP to host after event verification

## Security
- All reward functions are SECURITY DEFINER, callable by authenticated only.
- Old award_xp dropped and replaced with idempotent version.
- listing_likes INSERT/DELETE policies removed — must go through RPCs.
*/

-- ============================================================
-- 1. DROP OLD award_xp function (different signature)
-- ============================================================

DROP FUNCTION IF EXISTS public.award_xp(uuid, int, text, uuid, text);

-- ============================================================
-- 2. ADD COLUMNS TO XP_LEDGER
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'xp_ledger' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE xp_ledger ADD COLUMN event_type text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'xp_ledger' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE xp_ledger ADD COLUMN idempotency_key text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS xp_ledger_idempotency_key_uniq
  ON xp_ledger (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- 3. ADD COLUMNS TO INFLUENCE_LEDGER
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'influence_ledger' AND column_name = 'event_type'
  ) THEN
    ALTER TABLE influence_ledger ADD COLUMN event_type text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'influence_ledger' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE influence_ledger ADD COLUMN idempotency_key text;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS influence_ledger_idempotency_key_uniq
  ON influence_ledger (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- 4. ADD xp_awarded TO vote_records
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vote_records' AND column_name = 'xp_awarded'
  ) THEN
    ALTER TABLE vote_records ADD COLUMN xp_awarded boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- 5. ADD xp_awarded TO listing_likes
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listing_likes' AND column_name = 'xp_awarded'
  ) THEN
    ALTER TABLE listing_likes ADD COLUMN xp_awarded boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- 6. DAILY LIKE XP LOG TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS daily_like_xp_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  xp_awarded_today int NOT NULL DEFAULT 0,
  UNIQUE (member_id, log_date)
);

ALTER TABLE daily_like_xp_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_daily_like_xp" ON daily_like_xp_log;
CREATE POLICY "select_own_daily_like_xp" ON daily_like_xp_log FOR SELECT
  TO authenticated USING (auth.uid() = member_id);

-- ============================================================
-- 7. NEWS_LIKES TABLE (for news like anti-farming)
-- ============================================================

CREATE TABLE IF NOT EXISTS news_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  news_id uuid NOT NULL REFERENCES local_news(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  xp_awarded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (news_id, member_id)
);

ALTER TABLE news_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_news_likes" ON news_likes;
CREATE POLICY "read_news_likes" ON news_likes FOR SELECT
  TO authenticated USING (true);

-- ============================================================
-- 8. AWARD_XP — idempotent XP ledger insert (new signature)
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_xp(
  p_member_id uuid,
  p_event_type text,
  p_amount int,
  p_reference_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF p_idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM xp_ledger WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO xp_ledger (member_id, amount, source, reference_id, notes, event_type, idempotency_key)
  VALUES (p_member_id, p_amount, p_event_type, p_reference_id, p_notes, p_event_type, p_idempotency_key);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_xp(uuid, text, int, uuid, text, text) TO authenticated;

-- ============================================================
-- 9. AWARD_INFLUENCE — idempotent Influence ledger insert
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_influence(
  p_member_id uuid,
  p_event_type text,
  p_amount int,
  p_reference_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF p_idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM influence_ledger WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO influence_ledger (member_id, amount, source, reference_id, notes, event_type, idempotency_key)
  VALUES (p_member_id, p_amount, p_event_type, p_reference_id, p_notes, p_event_type, p_idempotency_key);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_influence(uuid, text, int, uuid, text, text) TO authenticated;

-- ============================================================
-- 10. GET_MEMBER_LEVEL — computes level from XP total
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_member_level(
  p_member_id uuid
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total_xp int;
  v_level int := 1;
  v_threshold int;
  v_next_threshold int;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total_xp
  FROM xp_ledger WHERE member_id = p_member_id;

  IF v_total_xp >= 190000 THEN
    v_level := 30;
    v_threshold := 190000;
    LOOP
      v_level := v_level + 1;
      v_next_threshold := v_threshold + (15000 + (v_level - 31) * 1000);
      IF v_total_xp < v_next_threshold THEN
        EXIT;
      END IF;
      v_threshold := v_next_threshold;
    END LOOP;
  ELSIF v_total_xp >= 176500 THEN v_level := 29;
  ELSIF v_total_xp >= 163500 THEN v_level := 28;
  ELSIF v_total_xp >= 151000 THEN v_level := 27;
  ELSIF v_total_xp >= 139000 THEN v_level := 26;
  ELSIF v_total_xp >= 127500 THEN v_level := 25;
  ELSIF v_total_xp >= 116500 THEN v_level := 24;
  ELSIF v_total_xp >= 106000 THEN v_level := 23;
  ELSIF v_total_xp >= 96000 THEN v_level := 22;
  ELSIF v_total_xp >= 86500 THEN v_level := 21;
  ELSIF v_total_xp >= 77500 THEN v_level := 20;
  ELSIF v_total_xp >= 69000 THEN v_level := 19;
  ELSIF v_total_xp >= 61000 THEN v_level := 18;
  ELSIF v_total_xp >= 53500 THEN v_level := 17;
  ELSIF v_total_xp >= 46500 THEN v_level := 16;
  ELSIF v_total_xp >= 40000 THEN v_level := 15;
  ELSIF v_total_xp >= 34000 THEN v_level := 14;
  ELSIF v_total_xp >= 28500 THEN v_level := 13;
  ELSIF v_total_xp >= 23500 THEN v_level := 12;
  ELSIF v_total_xp >= 19000 THEN v_level := 11;
  ELSIF v_total_xp >= 15000 THEN v_level := 10;
  ELSIF v_total_xp >= 11500 THEN v_level := 9;
  ELSIF v_total_xp >= 8500 THEN v_level := 8;
  ELSIF v_total_xp >= 6000 THEN v_level := 7;
  ELSIF v_total_xp >= 4000 THEN v_level := 6;
  ELSIF v_total_xp >= 2500 THEN v_level := 5;
  ELSIF v_total_xp >= 1500 THEN v_level := 4;
  ELSIF v_total_xp >= 750 THEN v_level := 3;
  ELSIF v_total_xp >= 250 THEN v_level := 2;
  END IF;

  RETURN v_level;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_level(uuid) TO authenticated;

-- ============================================================
-- 11. GET_MEMBER_VOTING_POWER — rewritten with linear VP formula
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_member_voting_power(
  p_member_id uuid
) RETURNS numeric(5,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_total_influence int;
  v_level int;
  v_level_bonus numeric(5,2);
  v_influence_bonus numeric(5,2);
  v_vp numeric(5,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total_influence
  FROM influence_ledger WHERE member_id = p_member_id;

  v_level := public.get_member_level(p_member_id);

  v_level_bonus := LEAST(1.50, (v_level - 1) * 0.05);
  v_influence_bonus := LEAST(2.50, FLOOR(v_total_influence / 10) * 0.01);
  v_vp := LEAST(5.00, 1.00 + v_level_bonus + v_influence_bonus);

  RETURN v_vp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_member_voting_power(uuid) TO authenticated;

-- ============================================================
-- 12. CAST_WEIGHTED_VOTE — now awards +10 XP and +5 Influence
-- ============================================================

CREATE OR REPLACE FUNCTION public.cast_weighted_vote(
  p_vote_id uuid,
  p_choice text,
  p_credits_used int DEFAULT 1
) RETURNS numeric(10,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
  v_vote record;
  v_vp numeric(5,2);
  v_effective_weight numeric(10,2);
  v_credit_balance int;
  v_new_record_id uuid;
  v_idem_key text;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_credits_used < 1 OR p_credits_used > 100 THEN
    RAISE EXCEPTION 'Credits used must be between 1 and 100';
  END IF;

  SELECT * INTO v_vote FROM votes WHERE id = p_vote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vote not found';
  END IF;
  IF v_vote.status <> 'active' THEN
    RAISE EXCEPTION 'This vote is not currently active';
  END IF;
  IF now() < v_vote.opens_at OR now() > v_vote.closes_at THEN
    RAISE EXCEPTION 'This vote is not within its voting window';
  END IF;

  IF EXISTS (SELECT 1 FROM vote_records WHERE vote_id = p_vote_id AND member_id = v_member_id) THEN
    RAISE EXCEPTION 'You have already voted on this ballot';
  END IF;

  SELECT COALESCE(balance, 0) INTO v_credit_balance
  FROM voting_credits WHERE member_id = v_member_id;
  IF v_credit_balance IS NULL OR v_credit_balance < p_credits_used THEN
    RAISE EXCEPTION 'Insufficient voting credits';
  END IF;

  v_vp := public.get_member_voting_power(v_member_id);
  v_effective_weight := p_credits_used * v_vp;

  INSERT INTO vote_records (vote_id, member_id, choice, credits_used, voting_power, effective_weight, voted_at, xp_awarded)
  VALUES (p_vote_id, v_member_id, p_choice, p_credits_used, v_vp, v_effective_weight, now(), true)
  RETURNING id INTO v_new_record_id;

  UPDATE voting_credits
  SET balance = balance - p_credits_used, updated_at = now()
  WHERE member_id = v_member_id;

  v_idem_key := 'ballot_participation:' || p_vote_id::text || ':' || v_member_id::text;
  PERFORM public.award_xp(v_member_id, 'ballot_participation', 10, p_vote_id, v_idem_key, 'Awarded for casting a vote');
  PERFORM public.award_influence(v_member_id, 'ballot_participation', 5, p_vote_id, v_idem_key, 'Awarded for casting a vote');

  RETURN v_effective_weight;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_weighted_vote(uuid, text, int) TO authenticated;

-- ============================================================
-- 13. LIKE_LISTING — server-side like with anti-farming XP
-- ============================================================

CREATE OR REPLACE FUNCTION public.like_listing(
  p_listing_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
  v_daily_xp int;
  v_idem_key text;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM listing_likes WHERE listing_id = p_listing_id AND member_id = v_member_id) THEN
    RETURN true;
  END IF;

  INSERT INTO listing_likes (listing_id, member_id, xp_awarded)
  VALUES (p_listing_id, v_member_id, false);

  SELECT COALESCE(xp_awarded_today, 0) INTO v_daily_xp
  FROM daily_like_xp_log
  WHERE member_id = v_member_id AND log_date = CURRENT_DATE;

  IF v_daily_xp < 20 THEN
    v_idem_key := 'marketplace_like:' || p_listing_id::text || ':' || v_member_id::text;
    IF public.award_xp(v_member_id, 'marketplace_like', 1, p_listing_id, v_idem_key, 'Marketplace like') THEN
      UPDATE listing_likes SET xp_awarded = true
      WHERE listing_id = p_listing_id AND member_id = v_member_id;

      INSERT INTO daily_like_xp_log (member_id, log_date, xp_awarded_today)
      VALUES (v_member_id, CURRENT_DATE, 1)
      ON CONFLICT (member_id, log_date)
      DO UPDATE SET xp_awarded_today = daily_like_xp_log.xp_awarded_today + 1;
    END IF;
  END IF;

  UPDATE market_listings SET like_count = like_count + 1 WHERE id = p_listing_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.like_listing(uuid) TO authenticated;

-- ============================================================
-- 14. UNLIKE_LISTING — removes like, does NOT create future XP
-- ============================================================

CREATE OR REPLACE FUNCTION public.unlike_listing(
  p_listing_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM listing_likes
  WHERE listing_id = p_listing_id AND member_id = v_member_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE market_listings
  SET like_count = GREATEST(0, like_count - 1)
  WHERE id = p_listing_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlike_listing(uuid) TO authenticated;

-- ============================================================
-- 15. LIKE_NEWS — server-side news like with anti-farming XP
-- ============================================================

CREATE OR REPLACE FUNCTION public.like_news(
  p_news_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
  v_daily_xp int;
  v_idem_key text;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM news_likes WHERE news_id = p_news_id AND member_id = v_member_id) THEN
    RETURN true;
  END IF;

  INSERT INTO news_likes (news_id, member_id, xp_awarded)
  VALUES (p_news_id, v_member_id, false)
  ON CONFLICT (news_id, member_id) DO NOTHING;

  SELECT COALESCE(xp_awarded_today, 0) INTO v_daily_xp
  FROM daily_like_xp_log
  WHERE member_id = v_member_id AND log_date = CURRENT_DATE;

  IF v_daily_xp < 20 THEN
    v_idem_key := 'news_like:' || p_news_id::text || ':' || v_member_id::text;
    IF public.award_xp(v_member_id, 'news_like', 1, p_news_id, v_idem_key, 'News like') THEN
      UPDATE news_likes SET xp_awarded = true
      WHERE news_id = p_news_id AND member_id = v_member_id;

      INSERT INTO daily_like_xp_log (member_id, log_date, xp_awarded_today)
      VALUES (v_member_id, CURRENT_DATE, 1)
      ON CONFLICT (member_id, log_date)
      DO UPDATE SET xp_awarded_today = daily_like_xp_log.xp_awarded_today + 1;
    END IF;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.like_news(uuid) TO authenticated;

-- ============================================================
-- 16. CHECK_IN_TO_EVENT — awards +25 XP once per member per event
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_in_to_event(
  p_event_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
  v_idem_key text;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM event_check_ins
    WHERE event_id = p_event_id AND member_id = v_member_id
  ) THEN
    RETURN true;
  END IF;

  INSERT INTO event_check_ins (event_id, member_id, verified)
  VALUES (p_event_id, v_member_id, true);

  v_idem_key := 'event_checkin_verified:' || p_event_id::text || ':' || v_member_id::text;
  PERFORM public.award_xp(v_member_id, 'event_checkin_verified', 25, p_event_id, v_idem_key, 'Verified event check-in');

  UPDATE market_events SET check_in_count = check_in_count + 1 WHERE id = p_event_id;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_in_to_event(uuid) TO authenticated;

-- ============================================================
-- 17. AWARD_VERIFIED_REFERRAL — +25 Influence once per referral
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_verified_referral(
  p_referring_member_id uuid,
  p_referred_member_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_idem_key text;
BEGIN
  IF p_referring_member_id = p_referred_member_id THEN
    RETURN false;
  END IF;

  v_idem_key := 'verified_referral:' || p_referred_member_id::text;

  RETURN public.award_influence(
    p_referring_member_id,
    'verified_referral',
    25,
    p_referred_member_id,
    v_idem_key,
    'Verified member referral'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_verified_referral(uuid, uuid) TO authenticated;

-- ============================================================
-- 18. AWARD_CITY_LEVEL_XP — +50 XP to city members on level transition
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_city_level_xp(
  p_city_id uuid,
  p_new_tier text,
  p_old_tier text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member record;
  v_idem_key text;
BEGIN
  v_idem_key := 'city_level_upgrade:' || p_city_id::text || ':' || p_new_tier;

  FOR v_member IN
    SELECT id FROM members WHERE city_id = p_city_id
  LOOP
    PERFORM public.award_xp(
      v_member.id,
      'city_level_upgrade',
      50,
      p_city_id,
      v_idem_key || ':' || v_member.id::text,
      'City advanced to ' || p_new_tier
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_city_level_xp(uuid, text, text) TO authenticated;

-- ============================================================
-- 19. AWARD_EMPIRE_LEVEL_XP — +100 XP to all members on civ transition
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_empire_level_xp(
  p_new_civilization_level text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member record;
  v_idem_key text;
BEGIN
  v_idem_key := 'empire_level_upgrade:' || p_new_civilization_level;

  FOR v_member IN SELECT id FROM members LOOP
    PERFORM public.award_xp(
      v_member.id,
      'empire_level_upgrade',
      100,
      NULL,
      v_idem_key || ':' || v_member.id::text,
      'Empire advanced to ' || p_new_civilization_level
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_empire_level_xp(text) TO authenticated;

-- ============================================================
-- 20. AWARD_VERIFIED_EVENT_HOST_XP — +75 XP to host after verification
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_verified_event_host_xp(
  p_event_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_event record;
  v_idem_key text;
  v_host_id uuid;
BEGIN
  SELECT * INTO v_event FROM market_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF v_event.status <> 'approved' THEN
    RAISE EXCEPTION 'Event is not approved';
  END IF;
  IF v_event.event_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Event has not yet occurred';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM event_check_ins
    WHERE event_id = p_event_id AND verified = true
  ) THEN
    RAISE EXCEPTION 'No verified check-ins for this event';
  END IF;

  v_idem_key := 'verified_event_hosted:' || p_event_id::text;

  IF v_event.listing_id IS NOT NULL THEN
    SELECT owner_id INTO v_host_id FROM market_listings WHERE id = v_event.listing_id;
  END IF;

  IF v_host_id IS NULL AND v_event.author_id IS NOT NULL THEN
    v_host_id := v_event.author_id;
  END IF;

  IF v_host_id IS NOT NULL THEN
    RETURN public.award_xp(v_host_id, 'verified_event_hosted', 75, p_event_id, v_idem_key, 'Hosted a verified event');
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_verified_event_host_xp(uuid) TO authenticated;

-- ============================================================
-- 21. UPDATE MEMBERSHIP TIER SEED DATA — correct credits and price
-- ============================================================

UPDATE membership_tiers SET voting_credits = 25, price_monthly = 5 WHERE id = 'black_plus';
UPDATE membership_tiers SET voting_credits = 50, price_monthly = 10 WHERE id = 'emerald';
UPDATE membership_tiers SET voting_credits = 100, price_monthly = 20 WHERE id = 'plum';

-- ============================================================
-- 22. REMOVE OLD INSERT/DELETE POLICIES ON listing_likes
-- (Likes must go through like_listing/unlike_listing RPCs now)
-- ============================================================

DROP POLICY IF EXISTS "insert_listing_likes" ON listing_likes;
DROP POLICY IF EXISTS "delete_listing_likes" ON listing_likes;

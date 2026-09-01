-- ============================================================
-- Migration: Remove XP entirely. Influence becomes the single
-- progression currency that determines Level and Voting Power.
-- ============================================================

-- Step 1: Rebuild influence_ledger from underlying actions
-- (signup_completed = 10, city_selected = 10)
-- Each existing member gets 20 Influence total.

INSERT INTO influence_ledger (member_id, amount, source, event_type, idempotency_key, notes)
SELECT
  member_id,
  10,
  'signup_completed',
  'signup_completed',
  'signup_completed:' || member_id::text,
  'Member signup (migrated from XP)'
FROM (SELECT DISTINCT member_id FROM xp_ledger WHERE source IN ('founder_signup', 'member_signup')) s
WHERE NOT EXISTS (
  SELECT 1 FROM influence_ledger il
  WHERE il.member_id = s.member_id AND il.idempotency_key = 'signup_completed:' || s.member_id::text
);

INSERT INTO influence_ledger (member_id, amount, source, event_type, idempotency_key, notes)
SELECT
  member_id,
  10,
  'city_selected',
  'city_selected',
  'city_selected:' || member_id::text,
  'City selection (migrated from XP)'
FROM (SELECT DISTINCT member_id FROM xp_ledger WHERE source = 'city_selection') s
WHERE NOT EXISTS (
  SELECT 1 FROM influence_ledger il
  WHERE il.member_id = s.member_id AND il.idempotency_key = 'city_selected:' || s.member_id::text
);

-- Step 2: Rename xp_awarded columns to influence_awarded in all tables
ALTER TABLE vote_records RENAME COLUMN xp_awarded TO influence_awarded;
ALTER TABLE listing_likes RENAME COLUMN xp_awarded TO influence_awarded;
ALTER TABLE news_likes RENAME COLUMN xp_awarded TO influence_awarded;
ALTER TABLE member_missions RENAME COLUMN xp_awarded TO influence_awarded;

-- Step 3: Rename missions.xp_reward to missions.influence_reward
ALTER TABLE missions RENAME COLUMN xp_reward TO influence_reward;

-- Step 4: Rename daily_like_xp_log table and its column
ALTER TABLE daily_like_xp_log RENAME COLUMN xp_awarded_today TO influence_awarded_today;
ALTER TABLE daily_like_xp_log RENAME TO daily_like_influence_log;

-- Step 5: Drop XP functions
DROP FUNCTION IF EXISTS public.award_xp(uuid, text, integer, uuid, text, text);
DROP FUNCTION IF EXISTS public.award_city_level_xp(uuid, text, text);
DROP FUNCTION IF EXISTS public.award_empire_level_xp(text);
DROP FUNCTION IF EXISTS public.award_verified_event_host_xp(uuid);

-- Step 6: Drop xp_ledger table
DROP TABLE IF EXISTS public.xp_ledger;

-- ============================================================
-- Step 7: Rewrite get_member_level to use influence_ledger
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_member_level(p_member_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_influence int;
  v_level int := 1;
  v_threshold int;
  v_next_threshold int;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total_influence
  FROM influence_ledger WHERE member_id = p_member_id;

  IF v_total_influence >= 190000 THEN
    v_level := 30;
    v_threshold := 190000;
    LOOP
      v_level := v_level + 1;
      v_next_threshold := v_threshold + (15000 + (v_level - 31) * 1000);
      IF v_total_influence < v_next_threshold THEN
        EXIT;
      END IF;
      v_threshold := v_next_threshold;
    END LOOP;
  ELSIF v_total_influence >= 176500 THEN v_level := 29;
  ELSIF v_total_influence >= 163500 THEN v_level := 28;
  ELSIF v_total_influence >= 151000 THEN v_level := 27;
  ELSIF v_total_influence >= 139000 THEN v_level := 26;
  ELSIF v_total_influence >= 127500 THEN v_level := 25;
  ELSIF v_total_influence >= 116500 THEN v_level := 24;
  ELSIF v_total_influence >= 106000 THEN v_level := 23;
  ELSIF v_total_influence >= 96000 THEN v_level := 22;
  ELSIF v_total_influence >= 86500 THEN v_level := 21;
  ELSIF v_total_influence >= 77500 THEN v_level := 20;
  ELSIF v_total_influence >= 69000 THEN v_level := 19;
  ELSIF v_total_influence >= 61000 THEN v_level := 18;
  ELSIF v_total_influence >= 53500 THEN v_level := 17;
  ELSIF v_total_influence >= 46500 THEN v_level := 16;
  ELSIF v_total_influence >= 40000 THEN v_level := 15;
  ELSIF v_total_influence >= 34000 THEN v_level := 14;
  ELSIF v_total_influence >= 28500 THEN v_level := 13;
  ELSIF v_total_influence >= 23500 THEN v_level := 12;
  ELSIF v_total_influence >= 19000 THEN v_level := 11;
  ELSIF v_total_influence >= 15000 THEN v_level := 10;
  ELSIF v_total_influence >= 11500 THEN v_level := 9;
  ELSIF v_total_influence >= 8500 THEN v_level := 8;
  ELSIF v_total_influence >= 6000 THEN v_level := 7;
  ELSIF v_total_influence >= 4000 THEN v_level := 6;
  ELSIF v_total_influence >= 2500 THEN v_level := 5;
  ELSIF v_total_influence >= 1500 THEN v_level := 4;
  ELSIF v_total_influence >= 750 THEN v_level := 3;
  ELSIF v_total_influence >= 250 THEN v_level := 2;
  END IF;

  RETURN v_level;
END;
$function$;

-- ============================================================
-- Step 8: Rewrite get_member_voting_power
-- VP = MIN(1.00 + (Level - 1) * 0.05, 5.00) — no influence bonus
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_member_voting_power(p_member_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_level int;
  v_vp numeric(5,2);
BEGIN
  v_level := public.get_member_level(p_member_id);
  v_vp := LEAST(5.00, 1.00 + ((v_level - 1) * 0.05));
  RETURN v_vp;
END;
$function$;

-- ============================================================
-- Step 9: Rewrite cast_weighted_vote — award +10 influence, no XP
-- ============================================================
CREATE OR REPLACE FUNCTION public.cast_weighted_vote(p_vote_id uuid, p_choice text, p_credits_used integer DEFAULT 1)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  INSERT INTO vote_records (vote_id, member_id, choice, credits_used, voting_power, effective_weight, voted_at, influence_awarded)
  VALUES (p_vote_id, v_member_id, p_choice, p_credits_used, v_vp, v_effective_weight, now(), true)
  RETURNING id INTO v_new_record_id;

  UPDATE voting_credits
  SET balance = balance - p_credits_used, updated_at = now()
  WHERE member_id = v_member_id;

  v_idem_key := 'ballot_participation:' || p_vote_id::text || ':' || v_member_id::text;
  PERFORM public.award_influence(v_member_id, 'ballot_participation', 10, p_vote_id, v_idem_key, 'Awarded for casting a vote');

  RETURN v_effective_weight;
END;
$function$;

-- ============================================================
-- Step 10: Rewrite like_listing — award +1 influence, 20/day cap
-- ============================================================
CREATE OR REPLACE FUNCTION public.like_listing(p_listing_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member_id uuid := auth.uid();
  v_daily_influence int;
  v_idem_key text;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM listing_likes WHERE listing_id = p_listing_id AND member_id = v_member_id) THEN
    RETURN true;
  END IF;

  INSERT INTO listing_likes (listing_id, member_id, influence_awarded)
  VALUES (p_listing_id, v_member_id, false);

  SELECT COALESCE(influence_awarded_today, 0) INTO v_daily_influence
  FROM daily_like_influence_log
  WHERE member_id = v_member_id AND log_date = CURRENT_DATE;

  IF v_daily_influence < 20 THEN
    v_idem_key := 'marketplace_like:' || p_listing_id::text || ':' || v_member_id::text;
    IF public.award_influence(v_member_id, 'marketplace_like', 1, p_listing_id, v_idem_key, 'Marketplace like') THEN
      UPDATE listing_likes SET influence_awarded = true
      WHERE listing_id = p_listing_id AND member_id = v_member_id;

      INSERT INTO daily_like_influence_log (member_id, log_date, influence_awarded_today)
      VALUES (v_member_id, CURRENT_DATE, 1)
      ON CONFLICT (member_id, log_date)
      DO UPDATE SET influence_awarded_today = daily_like_influence_log.influence_awarded_today + 1;
    END IF;
  END IF;

  UPDATE market_listings SET like_count = like_count + 1 WHERE id = p_listing_id;

  RETURN true;
END;
$function$;

-- ============================================================
-- Step 11: Rewrite like_news — award +1 influence, 20/day cap
-- ============================================================
CREATE OR REPLACE FUNCTION public.like_news(p_news_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member_id uuid := auth.uid();
  v_daily_influence int;
  v_idem_key text;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (SELECT 1 FROM news_likes WHERE news_id = p_news_id AND member_id = v_member_id) THEN
    RETURN true;
  END IF;

  INSERT INTO news_likes (news_id, member_id, influence_awarded)
  VALUES (p_news_id, v_member_id, false)
  ON CONFLICT (news_id, member_id) DO NOTHING;

  SELECT COALESCE(influence_awarded_today, 0) INTO v_daily_influence
  FROM daily_like_influence_log
  WHERE member_id = v_member_id AND log_date = CURRENT_DATE;

  IF v_daily_influence < 20 THEN
    v_idem_key := 'news_like:' || p_news_id::text || ':' || v_member_id::text;
    IF public.award_influence(v_member_id, 'news_like', 1, p_news_id, v_idem_key, 'News like') THEN
      UPDATE news_likes SET influence_awarded = true
      WHERE news_id = p_news_id AND member_id = v_member_id;

      INSERT INTO daily_like_influence_log (member_id, log_date, influence_awarded_today)
      VALUES (v_member_id, CURRENT_DATE, 1)
      ON CONFLICT (member_id, log_date)
      DO UPDATE SET influence_awarded_today = daily_like_influence_log.influence_awarded_today + 1;
    END IF;
  END IF;

  RETURN true;
END;
$function$;

-- ============================================================
-- Step 12: Rewrite check_in_to_event — award +25 influence
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_in_to_event(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  PERFORM public.award_influence(v_member_id, 'event_checkin_verified', 25, p_event_id, v_idem_key, 'Verified event check-in');

  UPDATE market_events SET check_in_count = check_in_count + 1 WHERE id = p_event_id;

  RETURN true;
END;
$function$;

-- ============================================================
-- Step 13: Rewrite complete_mission — award influence instead of XP
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_mission(p_member_id uuid, p_mission_slug text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mission_id uuid;
  v_influence_reward int;
  v_already_done boolean;
  v_idem_key text;
BEGIN
  SELECT id, influence_reward INTO v_mission_id, v_influence_reward
  FROM missions WHERE slug = p_mission_slug;

  IF v_mission_id IS NULL THEN
    RAISE EXCEPTION 'Mission not found: %', p_mission_slug;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM member_missions WHERE member_id = p_member_id AND mission_id = v_mission_id
  ) INTO v_already_done;

  IF v_already_done THEN
    RETURN false;
  END IF;

  INSERT INTO member_missions (member_id, mission_id, influence_awarded)
  VALUES (p_member_id, v_mission_id, v_influence_reward);

  v_idem_key := 'mission_completed:' || p_mission_slug || ':' || p_member_id::text;

  PERFORM public.award_influence(
    p_member_id,
    'mission_completed',
    v_influence_reward,
    v_mission_id,
    v_idem_key,
    'Mission completed: ' || p_mission_slug
  );

  PERFORM public.log_audit(
    p_member_id,
    'mission_completed',
    'mission',
    v_mission_id,
    jsonb_build_object('slug', p_mission_slug, 'influence', v_influence_reward)
  );

  RETURN true;
END;
$function$;

-- ============================================================
-- Step 14: Create award_city_level_influence (replaces award_city_level_xp)
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_city_level_influence(p_city_id uuid, p_new_tier text, p_old_tier text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member record;
  v_idem_key text;
  v_mission_slug text;
BEGIN
  v_idem_key := 'city_level_upgrade:' || p_city_id::text || ':' || p_new_tier;

  v_mission_slug := CASE p_new_tier
    WHEN 'tribe' THEN 'city-tribe'
    WHEN 'organization' THEN 'city-organization'
    WHEN 'congregation' THEN 'city-congregation'
    WHEN 'coalition' THEN 'city-coalition'
    WHEN 'powerhouse' THEN 'city-powerhouse'
    WHEN 'legacy_city' THEN 'city-legacy'
    ELSE NULL
  END;

  FOR v_member IN SELECT id FROM members LOOP
    PERFORM public.award_influence(
      v_member.id,
      'city_level_upgrade',
      50,
      p_city_id,
      v_idem_key || ':' || v_member.id::text,
      'City advanced to ' || p_new_tier
    );

    IF v_mission_slug IS NOT NULL THEN
      PERFORM public.complete_mission(v_member.id, v_mission_slug);
    END IF;
  END LOOP;
END;
$function$;

-- ============================================================
-- Step 15: Create award_empire_level_influence (replaces award_empire_level_xp)
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_empire_level_influence(p_new_civilization_level text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member record;
  v_idem_key text;
  v_mission_slug text;
BEGIN
  v_idem_key := 'empire_level_upgrade:' || p_new_civilization_level;

  v_mission_slug := CASE p_new_civilization_level
    WHEN 'settlement' THEN 'empire-settlement'
    WHEN 'village' THEN 'empire-village'
    WHEN 'province' THEN 'empire-province'
    WHEN 'kingdom' THEN 'empire-kingdom'
    WHEN 'dominion' THEN 'empire-dominion'
    WHEN 'empire' THEN 'empire-empire'
    ELSE NULL
  END;

  FOR v_member IN SELECT id FROM members LOOP
    PERFORM public.award_influence(
      v_member.id,
      'empire_level_upgrade',
      100,
      NULL,
      v_idem_key || ':' || v_member.id::text,
      'Empire advanced to ' || p_new_civilization_level
    );

    IF v_mission_slug IS NOT NULL THEN
      PERFORM public.complete_mission(v_member.id, v_mission_slug);
    END IF;
  END LOOP;
END;
$function$;

-- ============================================================
-- Step 16: Create award_verified_event_host_influence
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_verified_event_host_influence(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    RETURN public.award_influence(v_host_id, 'verified_event_hosted', 75, p_event_id, v_idem_key, 'Hosted a verified event');
  END IF;

  RETURN false;
END;
$function$;

-- ============================================================
-- Step 17: Rewrite refresh_city_progress to call award_city_level_influence
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_city_progress(p_city_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
  v_tier text;
  v_old_tier text;
BEGIN
  SELECT count(*) INTO v_count FROM founder_numbers WHERE city_id = p_city_id;

  v_tier := CASE
    WHEN v_count >= 10000 THEN 'legacy_city'
    WHEN v_count >= 5000 THEN 'powerhouse'
    WHEN v_count >= 2500 THEN 'coalition'
    WHEN v_count >= 1000 THEN 'congregation'
    WHEN v_count >= 250 THEN 'organization'
    WHEN v_count >= 100 THEN 'tribe'
    ELSE 'group'
  END;

  SELECT tier INTO v_old_tier FROM cities WHERE id = p_city_id;

  UPDATE cities SET population_count = v_count, tier = v_tier, updated_at = now()
  WHERE id = p_city_id;

  INSERT INTO city_progress (city_id, population_count, tier, updated_at)
  VALUES (p_city_id, v_count, v_tier, now())
  ON CONFLICT (city_id) DO UPDATE
  SET population_count = EXCLUDED.population_count,
      tier = EXCLUDED.tier,
      updated_at = now();

  IF v_old_tier IS NOT NULL AND v_old_tier <> v_tier THEN
    PERFORM public.award_city_level_influence(p_city_id, v_tier, v_old_tier);
  END IF;
END;
$function$;

-- ============================================================
-- Step 18: Rewrite refresh_empire_progress to call award_empire_level_influence
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_empire_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tribe_count int;
  v_total_members int;
  v_total_population int;
  v_old_civ text;
  v_new_civ text;
  v_old_tribe_count int;
  v_old_total_population int;
BEGIN
  SELECT count(*) INTO v_tribe_count
  FROM cities WHERE population_count >= 100;

  SELECT count(*) INTO v_total_members FROM members WHERE member_number IS NOT NULL;
  SELECT count(*) INTO v_total_population FROM members;

  SELECT tribe_city_count, total_population INTO v_old_tribe_count, v_old_total_population
  FROM empire_progress WHERE id = 1;

  v_old_civ := public.get_empire_civilization_level_internal(v_old_tribe_count, v_old_total_population);

  UPDATE empire_progress
  SET tribe_city_count = v_tribe_count,
      total_founders = v_total_members,
      total_population = v_total_population,
      updated_at = now()
  WHERE id = 1;

  v_new_civ := public.get_empire_civilization_level_internal(v_tribe_count, v_total_population);

  IF v_old_civ IS NOT NULL AND v_old_civ <> v_new_civ THEN
    PERFORM public.award_empire_level_influence(v_new_civ);
  END IF;
END;
$function$;

-- ============================================================
-- Step 19: Rewrite assign_founder_number to use award_influence
-- ============================================================
CREATE OR REPLACE FUNCTION public.assign_founder_number(p_city_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member_id uuid := auth.uid();
  v_next_number int;
  v_current_count int;
  v_member_number int;
  v_is_founder boolean;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM founder_numbers WHERE member_id = v_member_id AND city_id = p_city_id;
  IF FOUND THEN
    SELECT number INTO v_next_number FROM founder_numbers
    WHERE member_id = v_member_id AND city_id = p_city_id;
    RETURN v_next_number;
  END IF;

  SELECT count(*) INTO v_current_count FROM founder_numbers WHERE city_id = p_city_id;

  IF v_current_count >= 10000 THEN
    RAISE EXCEPTION 'This city has reached its capacity (10000)' USING ERRCODE = 'P0003';
  END IF;

  SELECT COALESCE(max(number), 0) + 1 INTO v_next_number
  FROM founder_numbers WHERE city_id = p_city_id;

  v_member_number := nextval('member_number_seq');
  v_is_founder := v_member_number <= 5000;

  INSERT INTO founder_numbers (city_id, member_id, number)
  VALUES (p_city_id, v_member_id, v_next_number);

  UPDATE members
  SET is_founder = v_is_founder,
      city_id = p_city_id,
      founder_number = v_next_number,
      member_number = v_member_number,
      updated_at = now()
  WHERE id = v_member_id;

  PERFORM public.refresh_city_progress(p_city_id);
  PERFORM public.refresh_empire_progress();

  PERFORM public.award_influence(v_member_id, 'signup_completed', 10, NULL, 'signup_completed:' || v_member_id::text, 'Member signup');
  PERFORM public.award_influence(v_member_id, 'city_selected', 10, p_city_id, 'city_selected:' || v_member_id::text, 'City selection');

  PERFORM public.verify_referral(v_member_id);

  PERFORM public.log_audit(
    v_member_id,
    'member_number_assigned',
    'city',
    p_city_id,
    jsonb_build_object('member_number', v_member_number, 'city_number', v_next_number, 'is_founder', v_is_founder)
  );

  RETURN v_next_number;
END;
$function$;

-- ============================================================
-- Step 20: Rewrite get_member_activity — remove xp_ledger reference
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_member_activity(p_member_id uuid, p_limit integer DEFAULT 25)
RETURNS TABLE(id uuid, activity_type text, description text, amount integer, source text, created_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
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
$function$;

-- ============================================================
-- Step 21: Add get_member_influence helper function
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_member_influence(p_member_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total int;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM influence_ledger WHERE member_id = p_member_id;
  RETURN v_total;
END;
$function$;

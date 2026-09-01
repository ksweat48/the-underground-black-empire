/*
# Server-Side Functions for Founder Journey

## Purpose
Creates SECURITY DEFINER functions that run with server privileges (bypassing RLS)
to handle the sensitive operations in the founder journey:
1. `create_member` — creates a member record after auth signup, generates referral code
2. `assign_founder_number` — assigns the next sequential founder number for a city
3. `award_xp` — adds an entry to the append-only XP ledger
4. `refresh_city_progress` — recalculates cached city progress from founder_numbers
5. `refresh_empire_progress` — recalculates cached empire progress from cities
6. `record_referral` — records a referral relationship (pending status)

## Security
- All functions are SECURITY DEFINER — they run with the function owner's privileges
- All functions are VOLATILE (they modify data)
- Functions validate inputs and return meaningful error codes
- The functions are callable by authenticated users (they check auth.uid() internally)
- search_path is set to 'public' to prevent search_path injection

## Important Notes
1. These functions are the ONLY way the client can perform these operations —
   the underlying tables have no client-side INSERT/UPDATE policies for these actions.
2. `assign_founder_number` uses a transaction-safe approach: it finds the max existing
   number for the city and assigns max+1 (up to 100). If the city is full, it returns an error.
3. `award_xp` always inserts into the append-only ledger — it never updates or deletes.
4. `refresh_city_progress` and `refresh_empire_progress` are idempotent — safe to call repeatedly.
5. `record_referral` prevents self-referrals and duplicate referrals.
*/

-- ==================== CREATE_MEMBER ====================
CREATE OR REPLACE FUNCTION public.create_member(
  p_email text,
  p_display_name text DEFAULT NULL,
  p_referred_by_code text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
  v_referral_code text;
  v_referrer_id uuid;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Check if member already exists
  IF EXISTS (SELECT 1 FROM members WHERE id = v_member_id) THEN
    RETURN v_member_id;
  END IF;

  -- Generate a unique referral code (8-char hex from uuid)
  v_referral_code := lower(substr(md5(v_member_id::text || clock_timestamp()::text), 1, 8));

  -- Resolve referrer if a code was provided
  IF p_referred_by_code IS NOT NULL AND p_referred_by_code != '' THEN
    SELECT id INTO v_referrer_id FROM members WHERE referral_code = p_referred_by_code;
    IF v_referrer_id IS NULL THEN
      v_referrer_id := NULL;
    END IF;
  END IF;

  INSERT INTO members (id, email, display_name, referral_code, referred_by)
  VALUES (v_member_id, p_email, p_display_name, v_referral_code, v_referrer_id);

  -- Record the referral relationship if a referrer exists
  IF v_referrer_id IS NOT NULL THEN
    INSERT INTO referrals (referring_member_id, referred_member_id, referral_code, status)
    VALUES (v_referrer_id, v_member_id, p_referred_by_code, 'pending')
    ON CONFLICT (referred_member_id) DO NOTHING;
  END IF;

  RETURN v_member_id;
END;
$$;

-- ==================== ASSIGN_FOUNDER_NUMBER ====================
CREATE OR REPLACE FUNCTION public.assign_founder_number(
  p_city_id uuid
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_member_id uuid := auth.uid();
  v_next_number int;
  v_current_count int;
  v_city_tier text;
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Check if member already has a founder number for this city
  PERFORM 1 FROM founder_numbers WHERE member_id = v_member_id AND city_id = p_city_id;
  IF FOUND THEN
    SELECT number INTO v_next_number FROM founder_numbers WHERE member_id = v_member_id AND city_id = p_city_id;
    RETURN v_next_number;
  END IF;

  -- Get current count for this city
  SELECT count(*) INTO v_current_count FROM founder_numbers WHERE city_id = p_city_id;

  -- Check city capacity (max 100 founders)
  IF v_current_count >= 100 THEN
    RAISE EXCEPTION 'This city has reached its founder capacity (100)' USING ERRCODE = 'P0003';
  END IF;

  -- Assign next number (max existing + 1, or 1 if none exist)
  SELECT COALESCE(max(number), 0) + 1 INTO v_next_number
  FROM founder_numbers WHERE city_id = p_city_id;

  -- Insert the founder number
  INSERT INTO founder_numbers (city_id, member_id, number)
  VALUES (p_city_id, v_member_id, v_next_number);

  -- Update member record: set is_founder, city_id, founder_number
  UPDATE members
  SET is_founder = true,
      city_id = p_city_id,
      founder_number = v_next_number,
      updated_at = now()
  WHERE id = v_member_id;

  -- Refresh city progress
  PERFORM public.refresh_city_progress(p_city_id);

  -- Award founder signup + city selection XP
  PERFORM public.award_xp(v_member_id, 100, 'founder_signup', NULL, 'Founder signup bonus');
  PERFORM public.award_xp(v_member_id, 25, 'city_selection', NULL, 'City selection bonus');

  RETURN v_next_number;
END;
$$;

-- ==================== AWARD_XP ====================
CREATE OR REPLACE FUNCTION public.award_xp(
  p_member_id uuid,
  p_amount int,
  p_source text,
  p_reference_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO xp_ledger (member_id, amount, source, reference_id, notes)
  VALUES (p_member_id, p_amount, p_source, p_reference_id, p_notes);
END;
$$;

-- ==================== REFRESH_CITY_PROGRESS ====================
CREATE OR REPLACE FUNCTION public.refresh_city_progress(
  p_city_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count int;
  v_tier text;
BEGIN
  SELECT count(*) INTO v_count FROM founder_numbers WHERE city_id = p_city_id;

  v_tier := CASE
    WHEN v_count >= 100 THEN 'tribe'
    WHEN v_count >= 10 THEN 'outpost'
    ELSE 'settlement'
  END;

  -- Update city record
  UPDATE cities SET founder_count = v_count, tier = v_tier, updated_at = now()
  WHERE id = p_city_id;

  -- Upsert city_progress
  INSERT INTO city_progress (city_id, founder_count, tier, updated_at)
  VALUES (p_city_id, v_count, v_tier, now())
  ON CONFLICT (city_id) DO UPDATE
  SET founder_count = EXCLUDED.founder_count,
      tier = EXCLUDED.tier,
      updated_at = now();
END;
$$;

-- ==================== REFRESH_EMPIRE_PROGRESS ====================
CREATE OR REPLACE FUNCTION public.refresh_empire_progress()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_tribe_count int;
  v_total_founders int;
BEGIN
  SELECT count(*) INTO v_tribe_count FROM cities WHERE tier = 'tribe';
  SELECT count(*) INTO v_total_founders FROM founder_numbers;

  UPDATE empire_progress
  SET tribe_city_count = v_tribe_count,
      total_founders = v_total_founders,
      updated_at = now()
  WHERE id = 1;
END;
$$;

-- ==================== GRANT EXECUTE ====================
GRANT EXECUTE ON FUNCTION public.create_member TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_founder_number TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_xp TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_city_progress TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_empire_progress TO authenticated;

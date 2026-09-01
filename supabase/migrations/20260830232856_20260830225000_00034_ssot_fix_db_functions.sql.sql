/*
# SSOT — Fix Existing DB Functions to Use New Reward Values

## Purpose
Updates `assign_founder_number` and `verify_referral` to use the new
SSOT reward values and the new `award_xp` / `award_influence` signatures.

## Changes
1. assign_founder_number: signup XP 100→10, city XP 25→10 (new award_xp signature)
2. verify_referral: old +50 XP → new +25 Influence (award_influence, idempotent)
*/

-- ============================================================
-- 1. FIX assign_founder_number — use new SSOT XP values
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_founder_number(p_city_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
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

  -- SSOT XP rewards: signup = 10 XP, city selection = 10 XP
  PERFORM public.award_xp(v_member_id, 'signup_completed', 10, NULL, 'signup_completed:' || v_member_id::text, 'Member signup');
  PERFORM public.award_xp(v_member_id, 'city_selected', 10, p_city_id, 'city_selected:' || v_member_id::text, 'City selection');

  PERFORM public.verify_referral(v_member_id);
  PERFORM public.check_and_auto_complete_missions(v_member_id);
  PERFORM public.check_and_auto_complete_missions_for_referrer(v_member_id);

  PERFORM public.log_audit(
    v_member_id,
    'member_number_assigned',
    'city',
    p_city_id,
    jsonb_build_object('member_number', v_member_number, 'city_number', v_next_number, 'is_founder', v_is_founder)
  );

  RETURN v_next_number;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_founder_number(uuid) TO authenticated;

-- ============================================================
-- 2. FIX verify_referral — +25 Influence instead of +50 XP
-- ============================================================

CREATE OR REPLACE FUNCTION public.verify_referral(p_referred_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, referring_member_id, referral_code
    FROM referrals
    WHERE referred_member_id = p_referred_member_id AND status = 'pending'
  LOOP
    UPDATE referrals SET status = 'verified', verified_at = now() WHERE id = r.id;

    -- SSOT: +25 Influence per verified referral (idempotent)
    PERFORM public.award_influence(
      r.referring_member_id,
      'verified_referral',
      25,
      p_referred_member_id,
      'verified_referral:' || p_referred_member_id::text,
      'Verified referral: ' || r.referral_code
    );

    PERFORM public.log_audit(
      p_referred_member_id,
      'referral_verified',
      'referral',
      r.id,
      jsonb_build_object('referring_member_id', r.referring_member_id)
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_referral(uuid) TO authenticated;

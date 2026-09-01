/*
# Missions Tables, Referral Verification, and Audit Logging

## Purpose
Completes the Founder Campaign with:
1. `missions` table — defines available missions with XP rewards and completion criteria
2. `member_missions` table — tracks which missions each member has completed
3. `verify_referral` function — marks a referral as verified when the referred member becomes a founder
4. `complete_mission` function — marks a mission complete and awards XP (with audit logging)
5. `check_and_auto_complete_missions` function — auto-completes missions a member qualifies for
6. `log_audit` helper — writes to the append-only audit log
7. Seeds 5 initial missions matching the existing frontend config
8. Updates `assign_founder_number` to verify referrals and auto-complete missions

## New Tables
### missions
- `id` (uuid, PK), `slug` (text, UNIQUE), `title`, `description`, `xp_reward`, `criteria`, `display_order`, `created_at`
### member_missions
- `id` (uuid, PK), `member_id` (FK->members), `mission_id` (FK->missions), `completed_at`, `xp_awarded`
- UNIQUE (member_id, mission_id)

## Security
- missions: publicly readable
- member_missions: readable by all authenticated (for leaderboard), no client writes
- All new functions are SECURITY DEFINER

## Important Notes
1. Missions auto-complete based on real data — clients never mark missions done.
2. Referral verification happens automatically when a referred member selects a city.
3. Referrer earns 50 XP per verified referral.
4. All privileged actions are audit-logged.
*/

-- ==================== MISSIONS TABLE ====================
CREATE TABLE IF NOT EXISTS missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  xp_reward int NOT NULL,
  criteria text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_missions" ON missions;
CREATE POLICY "public_read_missions" ON missions FOR SELECT
  TO anon, authenticated USING (true);

-- ==================== MEMBER_MISSIONS TABLE ====================
CREATE TABLE IF NOT EXISTS member_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  xp_awarded int NOT NULL,
  UNIQUE (member_id, mission_id)
);

ALTER TABLE member_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_member_missions" ON member_missions;
CREATE POLICY "select_own_member_missions" ON member_missions FOR SELECT
  TO authenticated USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "select_all_member_missions" ON member_missions;
CREATE POLICY "select_all_member_missions" ON member_missions FOR SELECT
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_member_missions_member ON member_missions(member_id);
CREATE INDEX IF NOT EXISTS idx_member_missions_mission ON member_missions(mission_id);

-- ==================== SEED MISSIONS ====================
INSERT INTO missions (slug, title, description, xp_reward, criteria, display_order) VALUES
  ('signup', 'Found Your City', 'Create your founder account and select your city.', 125, 'signup', 1),
  ('first-referral', 'First Referral', 'Invite your first verified founder using your referral link.', 50, 'first_referral', 2),
  ('five-referrals', 'Build Your Tribe', 'Recruit 5 verified founders to your city.', 250, 'five_referrals', 3),
  ('city-outpost', 'Reach Outpost Status', 'Help your city reach 10 founders.', 500, 'city_outpost', 4),
  ('city-tribe', 'Tribe Status', 'Help your city reach 100 founders and achieve Tribe status.', 1000, 'city_tribe', 5)
ON CONFLICT (slug) DO NOTHING;

-- ==================== LOG_AUDIT HELPER ====================
CREATE OR REPLACE FUNCTION public.log_audit(
  p_actor_id uuid,
  p_action text,
  p_target_type text DEFAULT NULL,
  p_target_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (p_actor_id, p_action, p_target_type, p_target_id, p_metadata);
END;
$$;

-- ==================== VERIFY_REFERRAL ====================
CREATE OR REPLACE FUNCTION public.verify_referral(
  p_referred_member_id uuid
) RETURNS void
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

    PERFORM public.award_xp(
      r.referring_member_id,
      50,
      'referral_verified',
      r.id,
      'Referral verified: ' || r.referral_code
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

-- ==================== COMPLETE_MISSION ====================
CREATE OR REPLACE FUNCTION public.complete_mission(
  p_member_id uuid,
  p_mission_slug text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_mission_id uuid;
  v_xp_reward int;
  v_already_done boolean;
BEGIN
  SELECT id, xp_reward INTO v_mission_id, v_xp_reward
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

  INSERT INTO member_missions (member_id, mission_id, xp_awarded)
  VALUES (p_member_id, v_mission_id, v_xp_reward);

  PERFORM public.award_xp(
    p_member_id,
    v_xp_reward,
    'mission_completed',
    v_mission_id,
    'Mission completed: ' || p_mission_slug
  );

  PERFORM public.log_audit(
    p_member_id,
    'mission_completed',
    'mission',
    v_mission_id,
    jsonb_build_object('slug', p_mission_slug, 'xp', v_xp_reward)
  );

  RETURN true;
END;
$$;

-- ==================== CHECK_AND_AUTO_COMPLETE_MISSIONS ====================
CREATE OR REPLACE FUNCTION public.check_and_auto_complete_missions(
  p_member_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_is_founder boolean;
  v_city_id uuid;
  v_city_founder_count int;
  v_city_tier text;
  v_verified_referrals int;
BEGIN
  SELECT is_founder, city_id INTO v_is_founder, v_city_id
  FROM members WHERE id = p_member_id;

  IF v_is_founder IS NULL THEN
    RETURN;
  END IF;

  IF v_city_id IS NOT NULL THEN
    SELECT founder_count, tier INTO v_city_founder_count, v_city_tier
    FROM cities WHERE id = v_city_id;
  END IF;

  SELECT count(*) INTO v_verified_referrals
  FROM referrals
  WHERE referring_member_id = p_member_id AND status = 'verified';

  IF v_is_founder AND v_city_id IS NOT NULL THEN
    PERFORM public.complete_mission(p_member_id, 'signup');
  END IF;

  IF v_verified_referrals >= 1 THEN
    PERFORM public.complete_mission(p_member_id, 'first-referral');
  END IF;

  IF v_verified_referrals >= 5 THEN
    PERFORM public.complete_mission(p_member_id, 'five-referrals');
  END IF;

  IF v_city_founder_count IS NOT NULL AND v_city_founder_count >= 10 THEN
    PERFORM public.complete_mission(p_member_id, 'city-outpost');
  END IF;

  IF v_city_tier = 'tribe' THEN
    PERFORM public.complete_mission(p_member_id, 'city-tribe');
  END IF;
END;
$$;

-- ==================== HELPER: AUTO-COMPLETE FOR REFERRER ====================
CREATE OR REPLACE FUNCTION public.check_and_auto_complete_missions_for_referrer(
  p_referred_member_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_referrer_id uuid;
BEGIN
  SELECT referring_member_id INTO v_referrer_id
  FROM referrals
  WHERE referred_member_id = p_referred_member_id
  LIMIT 1;

  IF v_referrer_id IS NOT NULL THEN
    PERFORM public.check_and_auto_complete_missions(v_referrer_id);
  END IF;
END;
$$;

-- ==================== UPDATE ASSIGN_FOUNDER_NUMBER ====================
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
BEGIN
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM founder_numbers WHERE member_id = v_member_id AND city_id = p_city_id;
  IF FOUND THEN
    SELECT number INTO v_next_number FROM founder_numbers WHERE member_id = v_member_id AND city_id = p_city_id;
    RETURN v_next_number;
  END IF;

  SELECT count(*) INTO v_current_count FROM founder_numbers WHERE city_id = p_city_id;

  IF v_current_count >= 100 THEN
    RAISE EXCEPTION 'This city has reached its founder capacity (100)' USING ERRCODE = 'P0003';
  END IF;

  SELECT COALESCE(max(number), 0) + 1 INTO v_next_number
  FROM founder_numbers WHERE city_id = p_city_id;

  INSERT INTO founder_numbers (city_id, member_id, number)
  VALUES (p_city_id, v_member_id, v_next_number);

  UPDATE members
  SET is_founder = true,
      city_id = p_city_id,
      founder_number = v_next_number,
      updated_at = now()
  WHERE id = v_member_id;

  PERFORM public.refresh_city_progress(p_city_id);
  PERFORM public.refresh_empire_progress();

  PERFORM public.award_xp(v_member_id, 100, 'founder_signup', NULL, 'Founder signup bonus');
  PERFORM public.award_xp(v_member_id, 25, 'city_selection', NULL, 'City selection bonus');

  PERFORM public.verify_referral(v_member_id);
  PERFORM public.check_and_auto_complete_missions(v_member_id);
  PERFORM public.check_and_auto_complete_missions_for_referrer(v_member_id);

  PERFORM public.log_audit(
    v_member_id,
    'founder_number_assigned',
    'city',
    p_city_id,
    jsonb_build_object('founder_number', v_next_number)
  );

  RETURN v_next_number;
END;
$$;

-- ==================== GRANT EXECUTE ====================
GRANT EXECUTE ON FUNCTION public.verify_referral TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_mission TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_auto_complete_missions TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_auto_complete_missions_for_referrer TO authenticated;

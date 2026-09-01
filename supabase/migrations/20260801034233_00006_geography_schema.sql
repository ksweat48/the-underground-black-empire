/*
# Geography Schema: States, Metros, City Aliases, Metro Progress

## Purpose
Establishes a normalized geography hierarchy: Empire -> State -> Metro -> City.
Users only choose City + State. Metro and State are auto-assigned.
Supports canonical city resolution via aliases (ATL, Atlanta GA, City of Atlanta -> one city).
Supports pending city requests for cities not yet seeded.

## New Tables
### states
- id (uuid, PK), name (text), abbreviation (text UNIQUE), timezone (text)
### metros
- id (uuid, PK), name (text), state_id (uuid FK->states), UNIQUE (name, state_id)
### city_aliases
- id (uuid, PK), city_id (uuid FK->cities ON DELETE CASCADE), alias (text)
### metro_progress (cached)
- metro_id (uuid PK FK->metros), founder_count, member_count, city_count, updated_at

## Modified Tables
### cities (added columns)
- metro_id (uuid FK->metros), county, latitude, longitude, timezone, population, canonical_status

## New Functions
- refresh_metro_progress(metro_id) — sums founder counts across cities in a metro

## Security
- states, metros, city_aliases, metro_progress: publicly readable
- No client writes to any geography table
*/

-- ==================== STATES ====================
CREATE TABLE IF NOT EXISTS states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  abbreviation text UNIQUE NOT NULL,
  timezone text
);

ALTER TABLE states ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_states" ON states;
CREATE POLICY "public_read_states" ON states FOR SELECT
  TO anon, authenticated USING (true);

-- ==================== METROS ====================
CREATE TABLE IF NOT EXISTS metros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state_id uuid NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  UNIQUE (name, state_id)
);

ALTER TABLE metros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_metros" ON metros;
CREATE POLICY "public_read_metros" ON metros FOR SELECT
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_metros_state_id ON metros(state_id);

-- ==================== CITY_ALIASES ====================
CREATE TABLE IF NOT EXISTS city_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  alias text NOT NULL
);

ALTER TABLE city_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_city_aliases" ON city_aliases;
CREATE POLICY "public_read_city_aliases" ON city_aliases FOR SELECT
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_city_aliases_alias ON city_aliases(alias);
CREATE INDEX IF NOT EXISTS idx_city_aliases_city_id ON city_aliases(city_id);

-- ==================== METRO_PROGRESS ====================
CREATE TABLE IF NOT EXISTS metro_progress (
  metro_id uuid PRIMARY KEY REFERENCES metros(id) ON DELETE CASCADE,
  founder_count int NOT NULL DEFAULT 0,
  member_count int NOT NULL DEFAULT 0,
  city_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE metro_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_metro_progress" ON metro_progress;
CREATE POLICY "public_read_metro_progress" ON metro_progress FOR SELECT
  TO anon, authenticated USING (true);

-- ==================== ADD COLUMNS TO CITIES ====================
DO $$ BEGIN
  ALTER TABLE cities ADD COLUMN IF NOT EXISTS county text;
  ALTER TABLE cities ADD COLUMN IF NOT EXISTS latitude numeric(10,7);
  ALTER TABLE cities ADD COLUMN IF NOT EXISTS longitude numeric(10,7);
  ALTER TABLE cities ADD COLUMN IF NOT EXISTS timezone text;
  ALTER TABLE cities ADD COLUMN IF NOT EXISTS population int;
  ALTER TABLE cities ADD COLUMN IF NOT EXISTS canonical_status text NOT NULL DEFAULT 'active';
END $$;

DO $$ BEGIN
  ALTER TABLE cities 
    ADD CONSTRAINT cities_metro_id_fkey 
    FOREIGN KEY (metro_id) REFERENCES metros(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_cities_metro_id ON cities(metro_id);
CREATE INDEX IF NOT EXISTS idx_cities_canonical_status ON cities(canonical_status);

-- ==================== SEED STATES (all 50) ====================
INSERT INTO states (name, abbreviation, timezone) VALUES
  ('Alabama', 'AL', 'America/Chicago'),
  ('Alaska', 'AK', 'America/Anchorage'),
  ('Arizona', 'AZ', 'America/Phoenix'),
  ('Arkansas', 'AR', 'America/Chicago'),
  ('California', 'CA', 'America/Los_Angeles'),
  ('Colorado', 'CO', 'America/Denver'),
  ('Connecticut', 'CT', 'America/New_York'),
  ('Delaware', 'DE', 'America/New_York'),
  ('Florida', 'FL', 'America/New_York'),
  ('Georgia', 'GA', 'America/New_York'),
  ('Hawaii', 'HI', 'Pacific/Honolulu'),
  ('Idaho', 'ID', 'America/Boise'),
  ('Illinois', 'IL', 'America/Chicago'),
  ('Indiana', 'IN', 'America/Indiana/Indianapolis'),
  ('Iowa', 'IA', 'America/Chicago'),
  ('Kansas', 'KS', 'America/Chicago'),
  ('Kentucky', 'KY', 'America/New_York'),
  ('Louisiana', 'LA', 'America/Chicago'),
  ('Maine', 'ME', 'America/New_York'),
  ('Maryland', 'MD', 'America/New_York'),
  ('Massachusetts', 'MA', 'America/New_York'),
  ('Michigan', 'MI', 'America/Detroit'),
  ('Minnesota', 'MN', 'America/Chicago'),
  ('Mississippi', 'MS', 'America/Chicago'),
  ('Missouri', 'MO', 'America/Chicago'),
  ('Montana', 'MT', 'America/Denver'),
  ('Nebraska', 'NE', 'America/Chicago'),
  ('Nevada', 'NV', 'America/Los_Angeles'),
  ('New Hampshire', 'NH', 'America/New_York'),
  ('New Jersey', 'NJ', 'America/New_York'),
  ('New Mexico', 'NM', 'America/Denver'),
  ('New York', 'NY', 'America/New_York'),
  ('North Carolina', 'NC', 'America/New_York'),
  ('North Dakota', 'ND', 'America/Chicago'),
  ('Ohio', 'OH', 'America/New_York'),
  ('Oklahoma', 'OK', 'America/Chicago'),
  ('Oregon', 'OR', 'America/Los_Angeles'),
  ('Pennsylvania', 'PA', 'America/New_York'),
  ('Rhode Island', 'RI', 'America/New_York'),
  ('South Carolina', 'SC', 'America/New_York'),
  ('South Dakota', 'SD', 'America/Chicago'),
  ('Tennessee', 'TN', 'America/Chicago'),
  ('Texas', 'TX', 'America/Chicago'),
  ('Utah', 'UT', 'America/Denver'),
  ('Vermont', 'VT', 'America/New_York'),
  ('Virginia', 'VA', 'America/New_York'),
  ('Washington', 'WA', 'America/Los_Angeles'),
  ('West Virginia', 'WV', 'America/New_York'),
  ('Wisconsin', 'WI', 'America/Chicago'),
  ('Wyoming', 'WY', 'America/Denver')
ON CONFLICT (abbreviation) DO NOTHING;

-- ==================== SEED METROS ====================
INSERT INTO metros (name, state_id)
  SELECT m.name, s.id FROM (VALUES
    ('Atlanta Metro', 'GA'), ('Savannah Metro', 'GA'), ('Augusta Metro', 'GA'),
    ('Athens Metro', 'GA'), ('Macon Metro', 'GA'), ('Columbus Metro', 'GA'),
    ('Valdosta Metro', 'GA'),
    ('Miami Metro', 'FL'), ('Orlando Metro', 'FL'), ('Tampa Metro', 'FL'),
    ('Jacksonville Metro', 'FL'),
    ('Dallas-Fort Worth Metro', 'TX'), ('Houston Metro', 'TX'),
    ('Austin Metro', 'TX'), ('San Antonio Metro', 'TX'),
    ('Chicago Metro', 'IL'), ('Los Angeles Metro', 'CA'),
    ('New York Metro', 'NY'), ('Philadelphia Metro', 'PA'),
    ('Phoenix Metro', 'AZ')
  ) AS m(name, abbr)
  JOIN states s ON s.abbreviation = m.abbr
ON CONFLICT (name, state_id) DO NOTHING;

-- ==================== BACKFILL CITIES WITH METRO ASSIGNMENTS ====================
UPDATE cities c SET metro_id = sub.metro_id
  FROM (
    SELECT c2.id as city_id, m.id as metro_id
    FROM cities c2
    JOIN states s ON s.abbreviation = c2.state
    JOIN metros m ON m.state_id = s.id AND m.name = c2.state || ' Metro'
  ) sub
  WHERE c.id = sub.city_id AND c.metro_id IS NULL;

-- Handle cities where metro name doesn't match "{state} Metro" pattern
UPDATE cities SET metro_id = (SELECT m.id FROM metros m JOIN states s ON m.state_id = s.id WHERE m.name = 'Atlanta Metro' AND s.abbreviation = 'GA')
  WHERE slug = 'atlanta' AND metro_id IS NULL;

UPDATE cities SET metro_id = (SELECT m.id FROM metros m JOIN states s ON m.state_id = s.id WHERE m.name = 'Chicago Metro' AND s.abbreviation = 'IL')
  WHERE slug = 'chicago' AND metro_id IS NULL;

UPDATE cities SET metro_id = (SELECT m.id FROM metros m JOIN states s ON m.state_id = s.id WHERE m.name = 'Houston Metro' AND s.abbreviation = 'TX')
  WHERE slug = 'houston' AND metro_id IS NULL;

UPDATE cities SET metro_id = (SELECT m.id FROM metros m JOIN states s ON m.state_id = s.id WHERE m.name = 'Los Angeles Metro' AND s.abbreviation = 'CA')
  WHERE slug = 'los-angeles' AND metro_id IS NULL;

UPDATE cities SET metro_id = (SELECT m.id FROM metros m JOIN states s ON m.state_id = s.id WHERE m.name = 'Miami Metro' AND s.abbreviation = 'FL')
  WHERE slug = 'miami' AND metro_id IS NULL;

UPDATE cities SET metro_id = (SELECT m.id FROM metros m JOIN states s ON m.state_id = s.id WHERE m.name = 'New York Metro' AND s.abbreviation = 'NY')
  WHERE slug = 'new-york' AND metro_id IS NULL;

UPDATE cities SET metro_id = (SELECT m.id FROM metros m JOIN states s ON m.state_id = s.id WHERE m.name = 'Philadelphia Metro' AND s.abbreviation = 'PA')
  WHERE slug = 'philadelphia' AND metro_id IS NULL;

UPDATE cities SET metro_id = (SELECT m.id FROM metros m JOIN states s ON m.state_id = s.id WHERE m.name = 'Phoenix Metro' AND s.abbreviation = 'AZ')
  WHERE slug = 'phoenix' AND metro_id IS NULL;

-- ==================== SEED CITY ALIASES ====================
INSERT INTO city_aliases (city_id, alias)
  SELECT c.id, a.alias FROM cities c
  CROSS JOIN (VALUES ('ATL'), ('Atlanta GA'), ('City of Atlanta'), ('Atlanta Georgia')) AS a(alias)
  WHERE c.slug = 'atlanta'
ON CONFLICT DO NOTHING;

INSERT INTO city_aliases (city_id, alias)
  SELECT c.id, a.alias FROM cities c
  CROSS JOIN (VALUES ('Chi'), ('Chicago IL'), ('City of Chicago'), ('Chicago Illinois'), ('Windy City')) AS a(alias)
  WHERE c.slug = 'chicago'
ON CONFLICT DO NOTHING;

INSERT INTO city_aliases (city_id, alias)
  SELECT c.id, a.alias FROM cities c
  CROSS JOIN (VALUES ('HOU'), ('Houston TX'), ('City of Houston'), ('Houston Texas'), ('H-Town')) AS a(alias)
  WHERE c.slug = 'houston'
ON CONFLICT DO NOTHING;

INSERT INTO city_aliases (city_id, alias)
  SELECT c.id, a.alias FROM cities c
  CROSS JOIN (VALUES ('LA'), ('Los Angeles CA'), ('City of Los Angeles'), ('City of Angels')) AS a(alias)
  WHERE c.slug = 'los-angeles'
ON CONFLICT DO NOTHING;

INSERT INTO city_aliases (city_id, alias)
  SELECT c.id, a.alias FROM cities c
  CROSS JOIN (VALUES ('MIA'), ('Miami FL'), ('City of Miami'), ('Miami Florida')) AS a(alias)
  WHERE c.slug = 'miami'
ON CONFLICT DO NOTHING;

INSERT INTO city_aliases (city_id, alias)
  SELECT c.id, a.alias FROM cities c
  CROSS JOIN (VALUES ('NYC'), ('New York NY'), ('New York City'), ('The Big Apple'), ('Manhattan')) AS a(alias)
  WHERE c.slug = 'new-york'
ON CONFLICT DO NOTHING;

INSERT INTO city_aliases (city_id, alias)
  SELECT c.id, a.alias FROM cities c
  CROSS JOIN (VALUES ('PHL'), ('Philadelphia PA'), ('City of Philadelphia'), ('Philly')) AS a(alias)
  WHERE c.slug = 'philadelphia'
ON CONFLICT DO NOTHING;

INSERT INTO city_aliases (city_id, alias)
  SELECT c.id, a.alias FROM cities c
  CROSS JOIN (VALUES ('PHX'), ('Phoenix AZ'), ('City of Phoenix'), ('Phoenix Arizona')) AS a(alias)
  WHERE c.slug = 'phoenix'
ON CONFLICT DO NOTHING;

-- ==================== SEED METRO PROGRESS ====================
INSERT INTO metro_progress (metro_id, founder_count, member_count, city_count)
  SELECT m.id, 0, 0,
    (SELECT count(*) FROM cities c WHERE c.metro_id = m.id AND c.canonical_status = 'active')
  FROM metros m
ON CONFLICT (metro_id) DO UPDATE SET
  city_count = EXCLUDED.city_count,
  updated_at = now();

-- ==================== REFRESH_METRO_PROGRESS FUNCTION ====================
CREATE OR REPLACE FUNCTION public.refresh_metro_progress(
  p_metro_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_founder_count int;
  v_city_count int;
BEGIN
  SELECT COALESCE(sum(founder_count), 0) INTO v_founder_count
  FROM cities WHERE metro_id = p_metro_id AND canonical_status = 'active';

  SELECT count(*) INTO v_city_count
  FROM cities WHERE metro_id = p_metro_id AND canonical_status = 'active';

  INSERT INTO metro_progress (metro_id, founder_count, member_count, city_count, updated_at)
  VALUES (p_metro_id, v_founder_count, 0, v_city_count, now())
  ON CONFLICT (metro_id) DO UPDATE SET
    founder_count = EXCLUDED.founder_count,
    city_count = EXCLUDED.city_count,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_metro_progress TO authenticated;

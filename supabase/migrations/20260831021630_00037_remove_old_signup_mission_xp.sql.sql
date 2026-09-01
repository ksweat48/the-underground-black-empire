-- Remove orphaned XP awards from the old individual "signup" mission.
-- These missions were replaced by the collective level-up system,
-- but the 125 XP per member was never cleaned up from the ledger.

DELETE FROM xp_ledger
WHERE source = 'mission_completed'
  AND notes = 'Mission completed: signup';

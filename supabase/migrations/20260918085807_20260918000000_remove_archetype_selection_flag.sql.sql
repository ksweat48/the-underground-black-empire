/*
# Remove Archetype Selection Feature Flag

1. Changes
- Deletes the `archetype_selection` row from the `feature_flags` table.
- This flag has been removed from the product and should no longer appear in the Admin Console.
2. Safety
- This is a targeted DELETE of a single row by its primary key.
- No other data is affected.
*/

DELETE FROM feature_flags WHERE key = 'archetype_selection';

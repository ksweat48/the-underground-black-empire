/*
# Disable Legacy Organization Voting Mutation

## Purpose
The application now votes on organization-created initiatives. Organizations are
not voting choices. The old organization vote-support function is no longer used
by the application and must not remain callable as a hidden voting path.

## Modified Database Objects
- `public.record_organization_vote_support(uuid, uuid, numeric)`
  - Revoke EXECUTE from `anon`.
  - Revoke EXECUTE from `authenticated`.
- Existing organization tables, organization records, initiative tables, initiative
  ballot functions, and organization ranking data are preserved. Organizations can
  still create and own initiatives.

## Security Changes
- Signed-out and signed-in API roles can no longer invoke the obsolete organization
  vote-support mutation.
- No data is deleted and no existing initiative voting behavior is changed.

## Important Notes
1. The function definition is preserved for migration history and data safety, but
   it is no longer available to browser callers.
2. Initiative voting continues through `submit_initiative_ballot`, where members
   select initiatives rather than organizations.
*/

REVOKE EXECUTE ON FUNCTION public.record_organization_vote_support(uuid, uuid, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_organization_vote_support(uuid, uuid, numeric) FROM authenticated;

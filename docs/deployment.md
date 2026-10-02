# Deployment

## Netlify

- Production deploys via build hook: `curl -X POST -d '{}' https://api.netlify.com/build_hooks/68965660f2a0a7d94873ccca`
- Preview deploys may be configured separately; the documented production path is the build hook above.
- Build command: `npm run build`
- Publish directory: `dist`

## Verification Gates

Before publishing, verify:

1. Database migrations have been applied in order without destructive data changes.
2. Lint and type checks pass when configured.
3. The production build completes successfully.
4. Required environment variables are available to the hosted application.
5. Market engagement and leadership behavior match the documented invariants.

## Source and Release Workflow

This project is not currently backed by a local Git repository. The build hook is the authoritative production publishing path for the current workspace. Do not document pull-request checks, protected branches, or release tags as active workflow requirements until source control is configured.

## Environments

| Environment | Database | Secrets | URL |
|------------|----------|---------|-----|
| Local | Supabase dev instance | `.env` | `localhost` |
| Preview | Supabase preview | Netlify env | `*.netlify.app` |
| Production | Supabase production | Netlify env | Custom domain |

Each environment has its own database, secrets, and configuration. They never share writable databases.

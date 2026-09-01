# Deployment

## Netlify

- Production deploys via build hook: `curl -X POST -d '{}' https://api.netlify.com/build_hooks/68965660f2a0a7d94873ccca`
- Preview deploys automatically on pull requests
- Build command: `npm run build`
- Publish directory: `dist`

## CI/CD Gates (enforced by Netlify build pipeline)

Production deployment is blocked when any of the following fail:

1. Migration validation (ordered, deterministic, no drift)
2. Generated type validation (no stale types)
3. Lint (`npm run lint`)
4. Type check (`npm run typecheck`)
5. Unit tests (when configured)
6. Production build (`npm run build`)
7. Missing required environment variables
8. Destructive migration without explicit approval

## GitHub

- Repository: `the-underground-black-empire`
- Protected `main` branch
- Pull-request-based changes only
- Required CI checks before merge
- Release tags for production milestones
- No direct commits to `main`

## Environments

| Environment | Database | Secrets | URL |
|------------|----------|---------|-----|
| Local | Supabase dev instance | `.env` | `localhost` |
| Preview | Supabase preview | Netlify env | `*.netlify.app` |
| Production | Supabase production | Netlify env | Custom domain |

Each environment has its own database, secrets, and configuration. They never share writable databases.

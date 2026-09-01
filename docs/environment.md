# Environment

## Required Client-Side Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon public key | `eyJ...` |

## Server-Side Only (NEVER in client code)

| Variable | Description |
|----------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — bypasses RLS, edge functions only |
| `SUPABASE_DB_URL` | Direct Postgres connection string |

## Validation

- Environment variables are validated at startup via `src/config/env.ts` using Zod.
- Missing or invalid variables cause a fail-fast error with a clear message.
- `.env.example` documents all required variables.

## Security Rules

- Never expose `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_DB_URL` in client-side code.
- Client-side variables must be prefixed with `VITE_` to be exposed by Vite.
- Edge functions read secrets from Supabase secret storage, not from `.env`.

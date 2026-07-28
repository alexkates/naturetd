# Architecture

Next.js 16 (App Router) game client backed by Supabase for auth and persistence.

## Layout

- `app/` — routes and UI
  - `page.tsx` / `game.tsx` — the game itself
  - `login/`, `auth/callback/` — passwordless magic-link sign-in flow
  - `profile/` — leaderboard display-name management (`profile-form.tsx`)
  - `actions.ts` — server actions (auth, save/leaderboard writes)
  - `globals.css`, `design-tokens.css` — styling; no CSS framework beyond Tailwind v4 (postcss plugin)
- `lib/`
  - `supabase/client.ts` / `server.ts` — browser vs. server Supabase clients (`@supabase/ssr`)
  - `supabase/config.ts` — resolves env var aliases (see [local-development.md](local-development.md))
  - `data.ts`, `types.ts` — shared game data/types
- `supabase/migrations/` — schema, source of truth for the DB (see below)
- `tests/` — `bun test` against a production build (see [verification.md](verification.md))

## Data model

Three tables, defined in `supabase/migrations/20260727000000_auth_profiles_games_leaderboard.sql`:

- `profiles` — one row per account; unique (case-insensitive) `display_name`, 2–24 chars. This is the name shown on the leaderboard.
- `game_saves` — one resumable snapshot per player, autosaved between waves.
- `game_runs` — every finished run. The leaderboard is the top 10 by wave/kills/damage/time.

Row-level security: saves are private to their owner; profiles and finished runs are publicly readable (needed for the leaderboard).

## Auth

Passwordless magic-link only, via Supabase Auth (PKCE flow):

1. `app/login/sign-in-form.tsx` calls a server action with `redirectTo = <origin>/auth/callback`.
2. Supabase emails a link to `<SUPABASE_URL>/auth/v1/verify?...&redirect_to=<origin>/auth/callback`.
3. `app/auth/callback/route.ts` calls `exchangeCodeForSession` and redirects into the app.

For this to work against a **local** Supabase instance, the callback URL must be in `supabase/config.toml`'s `additional_redirect_urls` — see [local-development.md](local-development.md).

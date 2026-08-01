# Architecture

Next.js 16 (App Router) game client backed by Supabase for auth and persistence.

## Layout

- `app/` — routes and UI
  - `page.tsx` / `game.tsx` — the game itself, including the profile modal
    (leaderboard display-name management, opened from the account chip)
  - `art.ts` — all board artwork (see [Board art](#board-art) below)
  - `login/`, `auth/callback/` — passwordless magic-link sign-in flow
  - `actions.ts` — server actions (auth, save/leaderboard writes)
  - `globals.css`, `design-tokens.css` — styling; no CSS framework beyond Tailwind v4 (postcss plugin)

- `lib/`
  - `supabase/client.ts` / `server.ts` — browser vs. server Supabase clients (`@supabase/ssr`)
  - `supabase/config.ts` — resolves env var aliases (see [local-development.md](local-development.md))
  - `data.ts`, `types.ts` — shared game data/types
- `supabase/migrations/` — schema, source of truth for the DB (see below)
- `tests/` — `bun test` against a production build (see [verification.md](verification.md))

## Releases and What's New

`app/releases.json` is the player-facing release history. Its newest version
must match `package.json`. Returning players see that release in a modal until
its version is written to `profiles.last_seen_release_id`; the header sparkle
button reopens it later. Release dismissal is stored in Supabase so it follows
the account across devices.

The committed `.githooks/pre-push` hook compares the commits being pushed with
the remote ref. Changes under `app/`, `lib/`, `public/`, or `supabase/` require
both a package version bump and a changed `app/releases.json`. Static release
validation also runs as part of `bun run test`.

## Board art

Everything on the board — blightlings, tower nests, guardian animals, shots,
the Heartwood and the rift, the grass — is drawn procedurally in `app/art.ts`.
There are no sprite sheets or image files involved.

Each `draw*` function paints into a **100x100 design box centred on the origin**,
so callers `translate` to a position and `scale(size / 100)`. `app/game.tsx` wraps
this in `drawInCell` (one grid cell) and `paintTower` (nest + its guardian).
The same functions back the UI icons via the `ArtIcon` / `TowerIcon` / `BlightIcon`
components, so a tower looks identical on the board, in the build dock and on the
leaderboard mini-board.

The house style is documented in the file header — flat fills, one soft-plum ink
outline, two tones per form, sine-based motion. Follow it when adding a creature
or tower so the set stays coherent.

### Tower rank variants

`drawNest` and `drawGuardian` take the tower's `level` (1–5) and layer on gear
additively, so a maxed guardian is still recognisably its level-1 self:

| Level | Guardian | Nest |
| --- | --- | --- |
| 1 | bare | base |
| 2 | leaf headband + sprig | 2 foundation stones |
| 3 | + bark pauldron, determined brows | 4 stones |
| 4 | acorn cap (replaces band) + moss cape | 6 stones, mossy green |
| 5 | + gold laurel, halo, circling motes | 8 stones, gold, warm ground glow |

Gear positions come from `GUARDIAN_RIG`, which holds brow / shoulder / back /
eye anchors per animal — the four guardians have different proportions, so the
shared gear reads off those rather than hardcoding four sets of coordinates.

Two things to respect when tuning this:

- **Fine detail does not survive board scale.** A guardian is roughly 23px on a
  40px cell, so headbands and brows are essentially invisible there. The signals
  that actually read at that size are silhouette changes (the sprig, the cap
  stem), the foundation stones widening the base, and the level-4/5 colour steps
  to green then gold. That is why the progression leans on those.
- **A guardian already reaches the cell edge at level 1**, so `paintTower`'s
  per-level `bulk` growth is deliberately small (2%/level). Larger values spill
  onto vertically adjacent towers.

The precise number is always available from the level pips drawn on the cell and
the portrait in the tower popover — the art conveys "beefier", not an exact count.

Two constraints worth knowing:

- The board canvas sizes its backing store to `clientWidth * devicePixelRatio`
  and scales the context to match (`renderScaleRef`). Game logic stays in the
  fixed 800x400 design space. Without this the vector art renders blurry, since
  CSS stretches the canvas well past 800px.
- `ArtIcon` runs one `requestAnimationFrame` loop per icon. Pass
  `animate={false}` where many render at once and motion adds nothing (the
  leaderboard mini-board does this).

## Data model

Three tables, defined in `supabase/migrations/20260727000000_auth_profiles_games_leaderboard.sql`:

- `profiles` — one row per account; unique (case-insensitive) `display_name`, 2–24 chars. This is the name shown on the leaderboard.
- `game_saves` — one resumable snapshot per player, autosaved between waves.
- `game_runs` — every finished run. The leaderboard is the top 10 by wave/kills/damage/time.

Row-level security: saves are private to their owner; profiles and finished runs are publicly readable (needed for the leaderboard).

The schema migrations also grant the necessary table privileges to Supabase's
`anon` and `authenticated` roles. Both grants and RLS policies are required:
Postgres checks table privileges before evaluating an RLS policy.

## Auth

Passwordless magic-link only, via Supabase Auth (PKCE flow):

1. `app/login/sign-in-form.tsx` calls a server action with `redirectTo = <origin>/auth/callback`.
2. Supabase emails a link to `<SUPABASE_URL>/auth/v1/verify?...&redirect_to=<origin>/auth/callback`.
3. `app/auth/callback/route.ts` calls `exchangeCodeForSession` and redirects into the app.

For this to work against a **local** Supabase instance, the callback URL must be in `supabase/config.toml`'s `additional_redirect_urls` — see [local-development.md](local-development.md).

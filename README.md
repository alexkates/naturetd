# Nature's Last Stand

An endless maze tower-defense game where animal guardians protect the
Heartwood from waves of Blightlings.

## Requirements

- [Bun](https://bun.sh/) 1.3.1 or newer
- Node.js 22.13 or newer

## Development

```bash
bun install
vercel env pull .env.local
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). The game requires a signed-in
player, so `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` must be
present locally (the Vercel/Supabase integration sets them in the deployment).

## Supabase

Accounts use passwordless magic-link email. Schema lives in
`supabase/migrations/` and covers three tables:

- `profiles` — the required, unique leaderboard name for each account.
- `game_saves` — one resumable snapshot per player, autosaved between waves.
- `game_runs` — every finished run; the leaderboard is the top 10 of these.

Row-level security keeps saves private to their owner while profiles and
finished runs stay publicly readable for the leaderboard.

In the Supabase dashboard, add your deployment's `/auth/callback` URL (and
`http://localhost:3000/auth/callback`) to **Authentication → URL Configuration →
Redirect URLs**.

## Checks

```bash
bun run lint
bun run test
```

`bun run test` creates a production build and exercises it through the
production server.

## Deploy to Vercel

Import the repository in Vercel. Vercel detects Next.js and Bun from
`bun.lock` and `packageManager`, so no framework override or custom build
settings are required.

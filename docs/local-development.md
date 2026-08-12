# Local development setup

The app requires a signed-in player, so a working Supabase connection is mandatory even for local dev — there's no offline/mock mode.

## Option A: point at the real (hosted) Supabase project

```bash
vercel env pull .env.local
bun run dev
```

This is the path in the root `README.md` and is the quickest way to get a working env if you have Vercel access to this project.

## Option B: run Supabase locally (no Vercel access, or you want to touch schema/auth)

Requires Docker running and the `supabase` CLI.

```bash
supabase init     # only if supabase/config.toml doesn't exist yet
supabase start    # boots Postgres, Auth (GoTrue), Studio, Mailpit, etc.
supabase status -o env   # prints ANON_KEY / API_URL for the values below
supabase migration up    # apply new migrations to an existing local database
```

Create `.env.local` (gitignored) at repo root:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from `supabase status -o env`>
```

`lib/supabase/config.ts` also accepts `SUPABASE_URL` / `SUPABASE_ANON_KEY` / the Vercel-integration aliases — any of these work.

### Production site URL (for OG/Twitter metadata)

`app/layout.tsx` resolves absolute URLs (OG image, canonical links) from
`NEXT_PUBLIC_SITE_URL`, falling back to Vercel's auto-set `VERCEL_URL`, then
`http://localhost:3999`. Set `NEXT_PUBLIC_SITE_URL` in the production environment
to the real custom domain if one is used, so social previews resolve to the right
host instead of a `*.vercel.app` deployment URL.

### The dev server is pinned to port 3999

Not the Next.js default of 3000 — that port collides with other local projects,
and a collision here isn't obvious: Next would quietly move to another port,
which then isn't in the Supabase redirect allow-list, and sign-in would fail for
no visible reason.

3999 is fixed in four places, and they have to agree:

- `package.json` — `dev` script (`next dev --port 3999`)
- `.claude/launch.json` — `port`, plus `autoPort: false` so it's never reassigned
- `supabase/config.toml` — `site_url` and `additional_redirect_urls`
- `app/layout.tsx` — the local fallback for `NEXT_PUBLIC_SITE_URL`

To move it, change all four and then `supabase stop && supabase start`.
(`bun run test` is unaffected — it starts the production server on a random
high port and passes `-p` explicitly.)

### Local accounts

Create an account directly from `/login` with an email address and a password of
at least eight characters. Local and production Supabase must keep email
confirmations disabled; no SMTP or Mailpit step is needed.

Studio (DB browser) is at `http://127.0.0.1:54323` — no auth in local dev.

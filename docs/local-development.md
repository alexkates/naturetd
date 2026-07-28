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
`http://localhost:3000`. Set `NEXT_PUBLIC_SITE_URL` in the production environment
to the real custom domain if one is used, so social previews resolve to the right
host instead of a `*.vercel.app` deployment URL.

### Magic-link redirect must be allow-listed

Local GoTrue only redirects to URLs in `supabase/config.toml`. The app requests
`redirect_to = <origin>/auth/callback`, so `additional_redirect_urls` must include
`http://localhost:3000/auth/callback` (and the `127.0.0.1` equivalents if you use that
host instead). If it's missing, the magic link silently falls back to `site_url` and
sign-in never completes. Restart with `supabase stop && supabase start` after editing
`config.toml`.

### Reading magic-link emails

Local Supabase never sends real email — it captures messages in Mailpit at
`http://127.0.0.1:54324`. To sign in as a test user during local dev or automated
browser verification:

1. Submit the sign-in form with any email address.
2. Open Mailpit (`http://127.0.0.1:54324`) — the "Your sign-in link" message has the
   verify URL in `Text`/`HTML`. You can also fetch it via the API:
   `fetch('/api/v1/messages')` then `fetch('/api/v1/message/<ID>')`.
3. Navigate to that verify URL directly in the **same browser** that submitted the
   form (the PKCE flow needs matching local storage/cookies). It redirects into
   `/auth/callback` and then into the app.

See [verification.md](verification.md) for doing this as part of checking a change.

Studio (DB browser) is at `http://127.0.0.1:54323` — no auth in local dev.

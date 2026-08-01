# Commands

Package manager is Bun (`bun@1.3.1`, see `package.json#packageManager`). Node >=22.13 required.

```bash
bun install          # install deps
bun run dev           # start Next.js dev server on :3999
bun run build         # production build
bun run start         # run the production build
bun run lint          # eslint .
bun run test          # bun run build && bun test tests — builds, then exercises the production server
```

## Release workflow

Enable the committed push gate once per clone:

```bash
bun run hooks:install
```

Prepare a patch release (or pass `minor` / `major`):

```bash
bun run release:new
```

Edit the generated entry in `app/releases.json`, then validate it with:

```bash
bun run release:check
```

Preview the current release popup locally without recording it as dismissed:

```text
http://localhost:3999/?release-preview=1
```

This works for new and returning profiles and leaves
`last_seen_release_id` unchanged.

Normal `git push` commands run this automatically. A push containing
player-facing changes is rejected unless `package.json` and
`app/releases.json` were both updated.

The leaderboard includes runs from game version 0.2.0 onward. New releases do
not reset it; every run retains its version for future profile history.

## Supabase CLI

```bash
supabase start        # boot local Postgres/Auth/Studio/Mailpit in Docker
supabase stop          # tear it down (data persists in a Docker volume)
supabase status -o env # print local URLs/keys
```

Docker must be running before `supabase start`. See [local-development.md](local-development.md) for full local setup and [verification.md](verification.md) for how to exercise auth end-to-end.

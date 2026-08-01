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

## Version workflow

Push fixes and small changes normally:

```bash
git push
```

When you want to publish a player-facing changelog, set `OPENAI_API_KEY` and
run one command from a clean worktree:

```bash
bun run version
```

It summarizes commits since the previous `vX.Y.Z` tag with AI, appends the
notes to `app/versions.json`, creates the next patch version, commits it,
creates an annotated tag, and pushes both. The new entry appears as a What's
New modal on a player's next login; ordinary pushes do not retrigger it.
Set `VERSION_BUMP=minor` for a player-facing feature release that should bump
the minor version instead of the default patch version.
On the first run, before any `vX.Y.Z` tag exists, it summarizes the repository
history. Set `VERSION_MODEL` only if you need to override the default AI model.

Preview the current modal locally without recording it as seen:

```text
http://localhost:3999/?version-preview=1
```

The leaderboard includes runs from game version 0.2.0 onward. New versions do
not reset it; every run retains its version for future profile history.

## Supabase CLI

```bash
supabase start        # boot local Postgres/Auth/Studio/Mailpit in Docker
supabase stop          # tear it down (data persists in a Docker volume)
supabase status -o env # print local URLs/keys
```

Docker must be running before `supabase start`. See [local-development.md](local-development.md) for full local setup and [verification.md](verification.md) for how to exercise auth end-to-end.

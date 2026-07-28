# Commands

Package manager is Bun (`bun@1.3.1`, see `package.json#packageManager`). Node >=22.13 required.

```bash
bun install          # install deps
bun run dev           # start Next.js dev server on :3000
bun run build         # production build
bun run start         # run the production build
bun run lint          # eslint .
bun run test          # bun run build && bun test tests — builds, then exercises the production server
```

## Supabase CLI

```bash
supabase start        # boot local Postgres/Auth/Studio/Mailpit in Docker
supabase stop          # tear it down (data persists in a Docker volume)
supabase status -o env # print local URLs/keys
```

Docker must be running before `supabase start`. See [local-development.md](local-development.md) for full local setup and [verification.md](verification.md) for how to exercise auth end-to-end.

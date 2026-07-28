# Nature's Last Stand

An endless maze tower-defense game where animal guardians protect the
Heartwood from waves of Blightlings. Next.js (App Router) + Supabase (auth,
Postgres). Package manager is Bun; Node >=22.13 required.

Details live in [`docs/`](docs/) — read the relevant file for the task at hand
rather than loading all of them.

- [Architecture](docs/architecture.md) — app structure, data model, auth flow
- [Commands](docs/commands.md) — dev/build/lint/test, Supabase CLI
- [Local development](docs/local-development.md) — env setup, running Supabase locally, magic-link sign-in
- [Verification](docs/verification.md) — how to check a change actually works, including browser sign-in

## Keeping docs in sync

When a change alters setup, commands, architecture, or how to verify something,
update the relevant `docs/*.md` file in the same change — don't leave it for later.

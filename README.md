# Nature's Last Stand

An endless maze tower-defense game where animal guardians protect the
Heartwood from waves of Blightlings.

## Requirements

- [Bun](https://bun.sh/) 1.3.1 or newer
- Node.js 22.13 or newer

## Development

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

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

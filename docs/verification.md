# Verifying changes

## Automated checks

```bash
bun run lint
bun run test    # builds for production, then runs tests/ against that build
```

Always run these before considering a change done.

## Manual/browser verification

Most UI changes here (game screen, login, profile) require an authenticated session —
there is no logged-out fallback view worth testing except the sign-in form itself.

To verify a change that requires being signed in:

1. Make sure local Supabase is set up and running (see [local-development.md](local-development.md)).
2. Start the dev server and open it in a browser.
3. Go through the magic-link flow (submit email → grab the link from Mailpit at
   `127.0.0.1:54324` → open it in the same browser tab) to reach an authenticated state.
4. For a *new* account you'll land on "Claim your grove name" (profile, `isNew` state —
   only one footer button). Set a name and reload `/profile` to see the *returning*
   user state (two footer buttons: "Back to the grove" + "Sign out") if that's the
   state relevant to your change.
5. Screenshot / inspect as needed for the specific change.

Don't ask the user to manually check something that can be verified this way —
walk through it yourself.

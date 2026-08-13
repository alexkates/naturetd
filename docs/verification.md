# Verifying changes

## Automated checks

```bash
bun run lint
bun run test    # builds for production, then runs tests/ against that build
```

Always run these before considering a change done.

## Manual/browser verification

Most UI changes here (game screen, login, profile) require an anonymous authenticated session —
there is no logged-out fallback view worth testing except the sign-in form itself.

To verify a change that requires being signed in:

1. Make sure local Supabase is set up and running (see [local-development.md](local-development.md)).
2. Start the dev server and open it in a browser.
3. Enter a unique guardian name on `/login` to create an anonymous player.
4. Click the player chip in the game header to open the profile modal. It allows
   renaming the player or forgetting the current browser-bound player session.
5. Screenshot / inspect as needed for the specific change.

Don't ask the user to manually check something that can be verified this way —
walk through it yourself.

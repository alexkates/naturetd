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
3. Enter a test email on `/login`, then open the magic link in local Mailpit at
   `http://127.0.0.1:54324`.
4. For a new email, claim a unique guardian name in the required profile modal.
   Click the player chip later to rename the player or sign out.
5. Screenshot / inspect as needed for the specific change.

Don't ask the user to manually check something that can be verified this way —
walk through it yourself.

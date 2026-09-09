---
name: Programmatic Vite browser tests
description: Environment and access-gate constraints for Chromium tests that start the full app with Vite.
---

Programmatic full-app browser tests must temporarily clear `REPL_ID` before calling Vite's `createServer`, then restore it after shutdown. Browser fixtures must explicitly satisfy authentication, enforced 2FA, and attendance access gates rather than bypassing the protected route.

**Why:** In the Replit test environment, the cartographer plugin loaded under `REPL_ID` can fail during programmatic transforms. A valid authenticated session can still leave the target page hidden behind app-wide 2FA or attendance UI.

**How to apply:** For tests that exercise a protected route in real Chromium, start Vite with `REPL_ID` absent, mock the real guard endpoints with valid response shapes, assert the browser remains on the requested protected path, and restore the environment during cleanup.
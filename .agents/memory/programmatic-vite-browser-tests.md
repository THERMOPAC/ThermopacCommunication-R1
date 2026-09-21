---
name: Programmatic Vite browser tests
description: Environment and access-gate constraints for Chromium tests that start the full app with Vite.
---

Programmatic full-app browser tests must temporarily clear `REPL_ID` before calling Vite's `createServer`, then restore it after shutdown. Browser fixtures must explicitly satisfy authentication, enforced 2FA, and attendance access gates rather than bypassing the protected route.

**Why:** In the Replit test environment, the cartographer plugin loaded under `REPL_ID` can fail during programmatic transforms. A valid authenticated session can still leave the target page hidden behind app-wide 2FA or attendance UI.

**How to apply:** For tests that exercise a protected route in real Chromium, start Vite with `REPL_ID` absent, mock the real guard endpoints with valid response shapes, assert the browser remains on the requested protected path, and restore the environment during cleanup.

Fresh-browser success does not establish that the existing preview session is
healthy. For syntax errors whose stack contains only the error message, inspect
the native ErrorEvent filename, line, and column in the affected session.

**Why:** A preview repeatedly failed on first-byte module parsing while new
Chromium sessions rendered successfully. Stack-only reporting hid the module
location, and bypassing one module exposed another failure.

**How to apply:** Preserve error locations without URL queries, distinguish
fresh-browser checks from preview-session logs, and do not declare cache
corruption proven solely because a fresh session passes.

Public development assets must not depend on database-backed user
deserialization; API and page authentication remain separate.

**Why:** An actual preview stylesheet request failed during user deserialization
with a database WebSocket connection reset. A logged-out browser does not
exercise this failure, so successful login-page screenshots miss it.

**How to apply:** Check signed-in asset delivery as well as logged-out rendering.
Keep any asset-only session bypass restricted to public development paths and
read methods; never broaden it to API or protected document requests.

Large scientific downloads need full-size browser verification in a download-enabled
sandboxed iframe, not just small fixtures or intercepted anchor clicks.

**Why:** Small export tests passed while the user received no file from a complete
hydraulic run. The original failure was not conclusively reproduced; successful
file preparation alone does not establish that the browser saved the file.

**How to apply:** Verify the actual downloaded file and its completeness against
the saved evidence. Distinguish preparation from saving, keep an explicit Save
link available, and never report a download as completed solely after creating a Blob.
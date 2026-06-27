---
name: Replit Publish DB Diff Pre-flight Hang
description: Replit Publishing UI runs a drizzle-kit DB diff check before submitting the build. On this project the schema is too large and drizzle-kit hangs, causing repeated publish failures.
---

## The Rule

When the Replit Publishing UI shows **"Failed to check for database diff: SERVER unexpectedly disconnected"**, it is the Publishing UI pre-flight timing out on the drizzle-kit schema diff — NOT a build pipeline failure.

**Why:** The schema (`shared/schema.ts`) is too large for drizzle-kit to diff within Replit's timeout. This is a known hang documented elsewhere in the project (post-merge.sh uses `--force` and `|| echo` for the same reason).

**How to apply:**
- Failed pre-flight attempts never create a build record in deployment history — confirmed by observation.
- The actual Replit build pipeline has NO drizzle diff step (proven from build logs: Security Scan → npm install → npm run build → container push — that's all).
- `PROD_DATABASE_URL` is NOT a Replit-supported variable — do not suggest it.
- The pre-flight check uses `DATABASE_URL` (reads `drizzle.config.ts`).
- Fix: retry Republish; the check eventually passes or gets bypassed. Build itself completes in ~37s when it runs.
- If the UI shows "Deploy already in progress" with a build ID, the build IS running — the history list just needs a browser refresh.

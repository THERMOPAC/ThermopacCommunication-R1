#!/bin/bash
set -e

npm install --prefer-offline --no-audit --no-fund 2>/dev/null || npm install

# Schema sync — additive only (CREATE TABLE / ADD COLUMN, never drop/rename).
# Do NOT replace this with `drizzle-kit push`: on this project push pulls the
# schema for ~5 minutes, then prompts interactively on create-vs-rename
# ambiguity (stdin is closed here, so it dies at the prompt with exit 0 and
# applies nothing), and a completed forced push would DROP live-data columns
# that exist in the DB but not in shared/schema.ts (long-standing accepted
# drift). Non-additive changes (renames, drops, constraint changes) must be
# applied deliberately via SQL by the agent.
npx tsx scripts/db-additive-sync.ts

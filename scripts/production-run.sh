#!/bin/sh
# Production only: force the build-generated Python shim ahead of module Python.
set -eu
node scripts/prepare-production-runtime.mjs --verify
PATH="$PWD/dist/production-bin:$PATH"
export PATH
# Preserve the former deployment command's sequencing and final exec/signal behavior.
node scripts/apply-ecr-pre-pilot-predictive-nt-schema.mjs &&
  NODE_ENV=production exec node dist/index.js
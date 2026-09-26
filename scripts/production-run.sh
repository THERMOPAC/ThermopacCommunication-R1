#!/bin/sh
# Production only: force the build-generated Python shim ahead of module Python.
set -eu
node scripts/prepare-production-runtime.mjs --verify
PATH="$PWD/dist/production-bin:$PATH"
export PATH
# Preserve final exec/signal behavior without reactivating retired schemas.
NODE_ENV=production exec node dist/index.js
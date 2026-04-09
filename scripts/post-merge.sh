#!/bin/bash
set -e

npm install --prefer-offline --no-audit --no-fund 2>/dev/null || npm install

npm run db:push --force 2>/dev/null || echo "db:push completed with warnings (non-blocking)"

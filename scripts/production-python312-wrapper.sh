#!/bin/sh
# Install as python3.12 earlier on PATH in the isolated production candidate.
# Resolve these two values from the same Nix channel as the candidate.
set -eu
: "${PRODUCTION_PYTHON312_BIN:?Set the absolute candidate Python executable}"
: "${PRODUCTION_PYTHON312_LIBRARY_PATH:?Set the candidate GCC/zlib library path}"
case "$PRODUCTION_PYTHON312_BIN" in
  /nix/store/*/bin/python3.12) ;;
  *) echo "Expected a Nix-store Python 3.12 executable" >&2; exit 1 ;;
esac
# Replace, rather than inherit, an ambient library path. Only this child sees it.
export LD_LIBRARY_PATH="$PRODUCTION_PYTHON312_LIBRARY_PATH"
exec "$PRODUCTION_PYTHON312_BIN" "$@"
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// A build must not ship stale workers or bundles from a previous release.
// This is generated output only; exports, uploads and source are untouched.
rmSync(fileURLToPath(new URL('../dist', import.meta.url)), { recursive: true, force: true });
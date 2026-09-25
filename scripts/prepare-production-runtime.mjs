#!/usr/bin/env node
// Build-time only Nix resolution; --verify needs neither Nix tooling nor credentials.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const directory = resolve(root, 'dist/production-bin');
const manifestFile = resolve(directory, 'manifest.json');
const shimFile = resolve(directory, 'python3.12');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const fail = (message) => { throw new Error(`Production Python runtime: ${message}`); };
const store = (path) => /^\/nix\/store\/[^/]+(?:\/.*)?$/.test(path);

function verify() {
  if (!existsSync(manifestFile) || !existsSync(shimFile)) fail('missing generated launcher/manifest; rebuild before publishing');
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  if (manifest.version !== 1 || !store(manifest.python)
      || !Array.isArray(manifest.roots) || manifest.roots.length !== 6
      || !Array.isArray(manifest.libraries) || manifest.libraries.length !== 2
      || !manifest.libraries.every(store) || !manifest.roots.every(store)
      || !manifest.roots.every(existsSync) || !existsSync(manifest.python)
      || !manifest.libraries.every(existsSync)
      || hash(readFileSync(shimFile)) !== manifest.shimSha256) {
    fail('invalid manifest, missing Nix runtime path or changed Python shim');
  }
}

if (process.argv[2] === '--verify') {
  verify();
} else if (process.argv.length === 2) {
  const expression = `let pkgs = import <nixpkgs> {};
    roots = (import ./replit.nix { inherit pkgs; }).deps;
  in {
    roots = map (p: p.outPath) roots;
    expected = map (p: p.outPath) [
      pkgs.glibcLocales pkgs.which pkgs.poppler_utils
      pkgs.zlib pkgs.python312 pkgs.chromium
    ];
    python = "\${pkgs.python312}/bin/python3.12";
    gcc = pkgs.stdenv.cc.cc.lib.outPath;
    zlib = pkgs.zlib.outPath;
    libraries = pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib pkgs.zlib ];
  }`;
  const config = JSON.parse(execFileSync('nix-instantiate',
    ['--eval', '--strict', '--json', '-E', expression], { cwd: root, encoding: 'utf8' }));
  if (JSON.stringify(config.roots) !== JSON.stringify(config.expected))
    fail('active replit.nix must contain exactly the approved six roots');
  const closure = new Set(execFileSync('nix-store',
    ['-qR', ...config.roots], { encoding: 'utf8' }).trim().split('\n'));
  if (![config.gcc, config.zlib].every((path) => closure.has(path)))
    fail('GCC runtime or zlib is missing from the active six-root closure');
  const libraries = config.libraries.split(':');
  if (!store(config.python) || !existsSync(config.python)
      || !libraries.every(store)
      || !existsSync(resolve(config.gcc, 'lib/libstdc++.so.6'))
      || !existsSync(resolve(config.zlib, 'lib/libz.so.1')))
    fail('Nix Python or required native wheel libraries are unavailable');
  const wrapper = readFileSync(resolve(root, 'scripts/production-python312-wrapper.sh'), 'utf8');
  const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const shim = `#!/bin/sh
PRODUCTION_PYTHON312_BIN=${quote(config.python)}
PRODUCTION_PYTHON312_LIBRARY_PATH=${quote(config.libraries)}
export PRODUCTION_PYTHON312_BIN PRODUCTION_PYTHON312_LIBRARY_PATH
${wrapper.replace(/^#![^\n]*\n/, '')}`;
  mkdirSync(directory, { recursive: true });
  writeFileSync(shimFile, shim, { mode: 0o755 });
  chmodSync(shimFile, 0o755);
  writeFileSync(manifestFile, JSON.stringify({
    version: 1, roots: config.roots, python: config.python,
    libraries, shimSha256: hash(shim),
  }, null, 2) + '\n');
  verify();
  console.log('Production Python shim prepared from active Nix closure');
} else {
  fail('usage: prepare-production-runtime.mjs [--verify]');
}
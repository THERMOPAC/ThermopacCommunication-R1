---
name: Local Document Agent technical debt
description: Dead code and technical debt in the Windows Document Agent to clean up in a future version.
---

## Rule
The `node-windows` service installation path in `local-document-agent/src/index.ts` is effectively dead code in the deployed product and should be removed in a future version (post-v1.0.6).

**Why:** `package.json` pkg config explicitly excludes `node_modules/node-windows/**` from the bundle. When `ThermopacDocAgent.exe` is run with `--install-service`, `require('node-windows')` throws a module-not-found error. The service is never registered. NSSM (via `install-service.bat` and the Inno Setup `.iss` installer) is the only live service registration mechanism.

**How to apply:** Do not reference or extend the `node-windows` path for any new feature. Do not treat `--install-service` / `--uninstall-service` CLI flags as functional.

## Items to remove in future cleanup
- `src/index.ts`: `installWindowsService()`, `uninstallWindowsService()`, the two `args.includes()` call blocks, header comment lines 8–9
- `package.json`: `install-service` and `uninstall-service` npm scripts, `node-windows` runtime dependency, the `"ignore"` pkg entry
- `README.md`: lines 51 and 59 documenting `--install-service` / `--uninstall-service`

## Decision (confirmed)
- v1.0.6 is frozen — no changes.
- Multi-instance deployment is handled by manually updating `config.json` and switching `erpBaseUrl` / `apiKey` / `agentCode` as needed.
- No v1.0.7 work planned. Dual-environment config.json restructuring proposal was superseded and dropped.
- NSSM deployment model is the permanent approach going forward.

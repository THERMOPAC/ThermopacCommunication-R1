---
name: Deployment image size boundary
description: Build-output size is not total publishing-image size; editor-hidden files are not documented publishing exclusions.
---

Do not use `dist` size or workspace `du` totals as the deployment image size. The publishing limit applies to combined image layers, including Nix/runtime layers whose inclusion and sizes are not fully exposed by build metadata.

**Why:** Publishing still exceeded the image limit after the current-only scientific runtime reduced `dist` substantially. Logs identify the combined-layer limit but do not report individual layer sizes.

**How to apply:** Report exact build-output savings separately from unverified image savings. The `.replit` `hidden` property controls file-tree visibility, not documented publishing exclusions. Never delete Replit-managed state, historical assets, or mixed evidence directories based only on their size. Audit active PDF and scientific consumers before removing system dependencies.
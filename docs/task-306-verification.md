# Automatic end-sizing source qualification — verification

## Outcome

No complete qualified end-sizing chain was found. No live diameter or height
is claimed. The source audit distinguishes equation candidates from admitted
end-duty models and records the evidence still needed.

The process adapter binds and scales the uniquely accepted, frozen-referenced
seven-component trial where available. It stops at product mass rates:
operating product densities cannot be inferred from feed densities.
The independent model authority is versioned separately from Stage 1/2/5.

## Checks

- Focused Vitest run: 5 files, 40 tests passed (normal product source, end
  service, system models including rendered PDF, end equations, and UI).
- Numerical calculation tests use explicitly labelled fixtures, not production
  model admissions. Their success does not establish real end performance.
- `git diff --check` passed.
- Full repository TypeScript check attempted during implementation but exhausted
  the default 2 GB Node heap; no full type-check success is claimed.
- Application workflow restarted successfully; preview login screen rendered.
  Existing background GCS indexing reported varchar-length errors outside this
  work; the restart is not represented as an entirely error-free log.
- Read-only development-DB check: all eight frozen Stage 5 revisions for
  Project 236 were rejected as not CURRENT. See
  `task-306-current-end-authority.json`. Downstream process/model evidence was
  not reached, so historical values are not reported as current results.

No frozen scientific snapshot was modified and no density, droplet size,
margin, shell diameter or fabrication series was invented. S/O 1.5 and 120%
remain nozzle-only; normal process authority governs shell D/H.
# Current Stage-2 integration contract

Authoritative reference: integration-source/server/ecr-pre-pilot/predictive-nt-job-service.ts and the exact current worker in the runtime. This note describes 7C-1.6.0, not the older 7C-1.1 orchestration.

## HTTP boundary

All job endpoints require authentication and owner/design checks:

    POST /api/ecr-pre-pilot/designs/:id/predictive-nt/jobs
    GET  /api/ecr-pre-pilot/designs/:id/predictive-nt/jobs/latest
    GET  /api/ecr-pre-pilot/designs/:id/predictive-nt/jobs/:jobId
    POST /api/ecr-pre-pilot/designs/:id/predictive-nt/jobs/:jobId/stop
    GET  /api/ecr-pre-pilot/designs/:id/predictive-nt/jobs/:jobId/report

The route/service reads the owned saved Stage-1 snapshot; do not replace it with arbitrary unvalidated browser JSON. Exact handlers are preserved in integration-source/server/ecr-pre-pilot/routes.ts. That file imports other stage services not supplied as a runnable route closure: extract/adapt only the relevant handlers.

## Worker invocation

Executable: compatible python3.12 with required native library paths.
Working directory: extracted dist/predictive-nt-runtime-7c-1-6.
Script: server/ecr-pre-pilot/predictive-nt-seven-component-v1-6/worker.py relative to that runtime.
Pipes: stdin, stdout, stderr must remain independently open and drained.

Send one compact JSON line to stdin. The exported worker-request.json is a complete example. Required authority includes:

- engineContractVersion exactly "7C-1.6.0"
- engineHash matching the recorded/validated engine
- maximumStages exactly 10
- stage1Authority.source.stage1, including Celsius and Kelvin and wet-solvent composition
- the complete scientific binding/input fields from the validated input_snapshot
- _checkpointProtocol "ACK_V3_ENGINE_CONTRACT"

Do not supply ntTest: current orchestration forbids single-test execution.
Do not close stdin after the initial request; checkpoint ACKs also use stdin.
Do not run `cat worker-request.json | python worker.py` as a complete controller.

## Checkpoints: stderr, NOT stdout

Each completed trial emits one line:

    PREDICTIVE_NT_CHECKPOINT <stageCount> <payloadSha256> <base64Payload>

Decoded UTF-8 JSON payload:

    {
      "protocol": "ACK_V3_ENGINE_CONTRACT",
      "engineContractVersion": "7C-1.6.0",
      "componentOrder": ["SAT","MONO","DI","POLY","PA","NMP","H2O"],
      "continuationState": {...},
      "continuationStageCount": <integer>,
      "trialCanonical": "<canonical JSON string>",
      "trialHash": "<sha256 of trialCanonical UTF-8>"
    }

Hash the decoded original payload bytes; do not parse and JSON.stringify floats before checking the payload hash. Validate trialHash from the exact trialCanonical string. Also enforce the canonical/contract/sequence/ownership checks in the service.

Validate, persist the checkpoint with durable ownership/lease fencing, then ACK:

    PREDICTIVE_NT_ACK <stageCount> <payloadSha256>\n

Do not ACK before persistence. A missing/mismatched ACK fails execution.
Continuously drain stderr and stdout to avoid child-process deadlocks. Preserve partial-line buffering.

Progress/telemetry lines on stderr include:

    PREDICTIVE_NT_PROGRESS <completed> 10
    PREDICTIVE_NT_INTERNAL_PROGRESS <completed> <maximum>
    PREDICTIVE_NT_PERFORMANCE <stageCount> <base64Metrics>

Progress is activity, not scientific acceptance. Only explicit persisted trial.accepted establishes computational acceptance.

## Resume

_resume must be constructed by the validated service from acknowledged durable evidence:
engineContractVersion, acknowledgedStageCount, trials, continuationState, continuationStageCount.
Trial counts must form an exact 1..acknowledgedStageCount prefix. Resume begins with the next trial. Never cross engine versions or resume from an unacknowledged in-memory result.

## Final result

Worker stdout contains the final JSON result, not checkpoint messages or a PDF.
Require successful process termination, no checkpoint failure, complete acknowledged trial prefix and the service's final validation. The current worker attempts all ten trials even if a lower trial passes. It selects the minimum accepted stageCount, otherwise predictiveNt is null.

The service enriches raw stdout through attachStage1ResultGovernance and persists result/report evidence. Therefore expected-result.json is a persisted-result comparison target; do not assume every key originated in stdout.

Preserve component balance, physical split and stability checks, targets, model identity, releaseEligible=false and pilotValidated=false. Do not widen tolerances.

## Stop and failure

The existing stop service records a stopped-by-user terminal failure/history rather than inventing a new successful status. It must also terminate the lease-owning Python process and descendants. Cross-process cancellation must be observed through durable state/lease checks, not only a process-local child map.

On lease loss, the implementation sends SIGTERM and escalates to SIGKILL after two seconds. Timeouts and checkpoint failures terminate execution. Preserve recorded history; do not promote partial trials to a final accepted prediction.

## Reports

generatePredictiveNtReport takes:

    { id, projectNumber, modelHash, engineHash, completedAt, input, result }

It returns PDF bytes. Source report/evidence modules are included. The job service stores report bytes and associated filename/hash; the HTTP report handler enforces access and returns application/pdf. PDFs are not emitted by the Python solver.

Reference projectNumber is 236; id is the frozen job UUID. Render from its saved input/result, not current UI fields. A rerendered PDF can differ bytewise because of metadata while preserving scientific contents.

## Infrastructure boundary

See SOURCE-DEPENDENCIES.json for explicitly omitted infrastructure imports (notably server/db). Supply the new app's independent database pool, session/user mapping and necessary base tables. Do not copy ERP bootstrap, background schedulers or credentials.
The included predictive migration is reference SQL only; it was not executed for this export.
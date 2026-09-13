# ECR Job-C strict continuation anchor boundary

A completed strict partial-transfer diagnostic at 2 m and λ=8e-9 is only a
read-only continuation seed, never a physical-sizing or engineering anchor.
The new full Job-C request must preserve the original source checkpoint hash
and request hash, copy its exact hash-verified 189-variable state into a
server-built immutable continuation contract, and begin the normal continuation
from that state. It must make two uncached exact re-evaluations at the anchor
before any higher λ target. Completion is admissible only as normal
`CALCULATED_PRELIMINARY_JOB_C` with an attestation binding the source state and
showing a higher target (including λ=1); a block is permitted, while diagnostic,
workflow-only, malformed, or unattested success responses are rejected.

The source worker may be either the current hash or the one explicitly pinned
historical diagnostic worker hash. Its scientific dependencies, geometry, gate
evidence, state, and source record remain revalidated at enqueue and execution.
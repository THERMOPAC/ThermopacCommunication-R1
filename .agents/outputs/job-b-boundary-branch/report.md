# Job-B boundary-compatible branch qualification

## Governed decision

**Job C remains blocked.** No distinct credible Job-B branch was found at the
H = 2 m local continuation boundary.

The strict deterministic inlet search found three numerical roots. To avoid
missing a boundary-local basin, the local replay used a conservative catalog of
seven exploratory basin seeds. Each seed was independently re-solved from two
perturbed starts at each of the seven local bulk states in the last strictly
positive, closed continuation state. Seeds were never treated as accepted
roots. This made 98 local root attempts and produced 30 distinct cell-local
numerical roots. Every cell had exactly one credible physical root. All seven
credible roots belonged to the existing R1 branch family; no distinct credible
family survived the unchanged gates.

This is a reproducible finite local multistart seeded by seven deterministic
inlet-derived exploratory basins. It is not a formal proof that no mathematical
root exists anywhere in the continuous search domain.

## Frozen authority and gates

- Component order: SAT, MONO, DI, POLY, PA, NMP, H2O
- Temperature: 298.15 K
- Stage-2 engine contract: 7C-1.5.0
- Stage-2 engine SHA-256:
  `4f0b57dd41a2d768e1964e49ecee23e87de358ad7de697a2b315ab94a79091ac`
- Job-B interface worker SHA-256:
  `70229d3eacfde61d906f39bc3dec8a29387cabfc96944493ffb5318653e02f2d`
- Maximum isoactivity log residual: 1e-7
- Maximum scaled two-film equality residual: 1e-8
- Required numerical Jacobian rank: 13 of 13
- Raw and scaled FV acceptance gates: 1e-7
- Phase-separation, NMP-rich continuous-phase orientation, local-stability,
  TPD-refinement, and independent-reproduction gates were unchanged.
- No clipping, source-sign reversal, unconstrained negative-flow acceptance,
  tolerance relaxation, or arbitrary trace inventory was used.

## H = 2 m local boundary

The frozen continuation reproduced the previously governed failure:

- last strictly positive closed state:
  lambda = 6.922973632812502e-5
- next failed continuation target:
  lambda = 6.923828125000002e-5
- minimum flow in the captured positive state:
  1.1108207020353998e-12 mol/s

The phase-component flows at the accepted state were captured without changing
the equations. Their normalized values supplied the 14 local bulk boundary
conditions used by the cell-by-cell Job-B qualification. Stage-3 holdup was not
used as thermodynamic composition.

## Root classification

The strict global inlet search found:

- R1: separated, correctly oriented, and canonically independently reproduced;
  it is the existing selected branch family.
- R2: separated but has the wrong phase orientation.
- R3: fails the minimum phase-separation gate.

Four additional exploratory basin seeds that did not survive the strict inlet
numerical gate were retained only to broaden the local search. Every local
candidate was re-solved and had to pass the unchanged strict gates independently.

At the captured local boundary:

| Cell | Distinct numerical roots | Credible roots | Credible family | Result |
|---:|---:|---:|---|---|
| 1 | 5 | 1 | R1 | No alternate |
| 2 | 4 | 1 | R1 | No alternate |
| 3 | 4 | 1 | R1 | No alternate |
| 4 | 3 | 1 | R1 | No alternate |
| 5 | 6 | 1 | R1 | No alternate |
| 6 | 6 | 1 | R1 | No alternate |
| 7 | 2 | 1 | R1 | No alternate |

Every credible local root had Jacobian rank 13, passed the unchanged
isoactivity and two-film residual gates, was independently reproduced, and
passed the unchanged stability and TPD checks. Any other local numerical root
failed at least one physical or reproduction gate.

## 98-flow positivity result

Because the local qualification found no distinct credible family, the only
qualified branch available to the next FV step remains R1. The independent
98-flow diagnostic at the failed continuation target closed the original
equations to:

- maximum raw FV residual: 7.101786888079553e-14 mol/s
- maximum scaled FV residual: 1.465275606911908e-14
- optimizer success: true

That closure required 14 nonpositive flows: dispersed NMP in all seven cells
and dispersed H2O in all seven cells. The minimum was
-6.998436664072421e-7 mol/s. These unconstrained values were retained only as a
diagnostic and were never admitted as an initialization or accepted state.

The inlet-level conservative audit is consistent with this result: R1 removes
NMP and H2O from a dispersed inlet whose governed inventories for both
components are exactly zero. It is supporting evidence for this frozen
root/boundary pairing, not a proof of full local-state physical infeasibility.

No distinct credible family was available for a coupled alternate-branch FV
continuation. The only qualified family at the sampled R1 boundary states is R1,
and its next 98-flow step fails strict positivity as described above. The
qualification therefore supplies no admissible alternate branch from which Job
C can resume. It does not claim to predict the coupled flow field of a
hypothetical branch that was not found.

## Governed representation change required

Before another Job-C attempt, both physical inlet phases must have
evidence-backed component inventories compatible with applying the two-phase
interfacial constitutive law directly at the boundary.

For the RRBO dispersed inlet, the required evidence is measured or independently
governed, phase-resolved NMP and H2O composition or detection-limit evidence.
That evidence must be admitted into a new immutable Stage-2 boundary result and
provenance hash. Job B must then be rerun and pass the same equations and gates
before Job C can resume.

An arbitrary numerical trace, clipping, source-sign reversal, tolerance
relaxation, or acceptance of negative flows is not an admissible change.

## Reproduction artifacts

- `server/research/ecr-pre-pilot-job-b-boundary-branch/run.py`
- `server/research/ecr-pre-pilot-job-b-boundary-branch/capture_boundary.py`
- `server/research/ecr-pre-pilot-job-b-boundary-branch/qualify_local_cell.py`
- `server/research/ecr-pre-pilot-job-b-boundary-branch/assemble.py`
- `server/research/ecr-pre-pilot-job-b-boundary-branch/verify.py`
- `.agents/outputs/job-b-boundary-branch/frozen-input.json`
- `.agents/outputs/job-b-boundary-branch/candidate-root-seeds.json`
- `.agents/outputs/job-b-boundary-branch/results.json`
- `.agents/outputs/job-b-boundary-branch/h2-local-boundary-state.json`
- `.agents/outputs/job-b-boundary-branch/h2-local-cell-1-roots.json` through
  `h2-local-cell-7-roots.json`
- `.agents/outputs/job-b-boundary-branch/local-boundary-results.json`
- `.agents/outputs/job-b-boundary-branch/h2-continuation-diagnostic.json`

Local-boundary qualification SHA-256:
`4ee94175497b5128a01ffef8fd33443bbe7dfd4905c56c4c44fe4e6e65461b80`
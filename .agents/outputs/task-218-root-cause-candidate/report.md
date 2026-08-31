# Task 218 root-cause-informed candidate recalibration

Status: `BLOCKED_FAIL_CLOSED`. This is a research development candidate, never a qualification.

## Ordered parameter vector
[3.365497320557158,-0.5879240516550435,-0.664866304526682,2.9140318809505605,-0.22665756925989441,-0.5732253147179449,2.256712702535509,-0.6818671467499456,-0.5450282721324957]

## Frozen validation
- training: RMSD=0.268874062352, ceiling=0.03, FAIL
- heldOutTemperature: RMSD=0.069999175055, ceiling=0.03, FAIL
- heldOutMolecularSystem: RMSD=0.0563166209984, ceiling=0.03, FAIL

## Development constraints
All 57 old exact Task216 pairs are diagnostic development constraints: True; minimum TPD=9.99999638651e-10. They are not candidate-generated endpoints or qualification.

## Carried gates and Stage1 flash
- Topology recall=1: PASS
- Tie-line RMSD=0.220520723603: FAIL
- Direct matching six-component evidence=False
- Valid accepted two-liquid seed exists=True

## Governance
No cascade stage count, products, sulfur, or desired outcome entered the objective or constraints. No candidate cascade was run.
Blockers: FROZEN_COMPOSITION_VALIDATION_FAILED, CARRIED_TIE_LINE_GATE_FAILED, DIRECT_MATCHING_SIX_COMPONENT_LLE_EVIDENCE_MISSING
Candidate model SHA-256: `92700b3b8e24ba63253c33fab7349d605e88101235121a3c5b96cda696860c6b`

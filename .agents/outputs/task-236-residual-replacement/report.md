# Task 236 Residual Replacement Qualification

## Decision

The nine-parameter residual is not refit. Its MONO–NMP block is the demonstrated source of the false basin, but neither the historical residual nor native cCOSMO reproduces the declared dry LLE evidence within the frozen 0.03 RMSD gate. No admissible direct water-bearing LLE partition exists.

New jobs therefore use separately versioned **7C-1.3.0 native seven-component cCOSMO**. Historical 7C-1.1.0 and 7C-1.2.0 hashes remain preserved for exact replay. The 14×N cascade, lattice sizes, and TPD thresholds are unchanged.

## Replayed qualification

- Frozen wet daughter states: 110
- Native negative TPD states: 0
- Residual-added negative TPD states: 110
- Native training composition RMSD: 0.513223968
- Native held-temperature composition RMSD: 0.413383157
- Native held-system composition RMSD: 0.437761500

## Governance

**FAIL CLOSED — NOT QUALIFIED — NOT RELEASE ELIGIBLE.** Native wet stability passes this frozen daughter-state replay, but LLE reproduction and direct wet-LLE qualification do not pass.

# Native boundary source evidence

Status: **source-grounded diagnostic evidence only**. The finite-film
`BoundaryExcessAdapter` remains
`RESEARCH_UNQUALIFIED_SOURCE_GROUNDED_PENDING_INDEPENDENT_QUALIFICATION` until
the independent qualification harness accepts the mathematical and ABI
agreement.

## Provenance ledger

- Repository: `usnistgov/COSMOSAC`
- Commit: `1b82456be38026719b16cad4076109bef3fcb309`
- `COSMO.hpp` SHA-256:
  `88eba46ea1da365caea99820fc37e596f8d6a444a31f8a95fa51b910ca039fdb`
- `pybind11_interface.cxx` SHA-256:
  `1a169a1cf75f61520dfe8d796673342c6861ad06e5015f4e1ac7f67be8af54ac`
- `LICENSE` SHA-256:
  `6d7ce940d10c2d4582fb1e5cba72cbaca4d91a0febf0237b21714cb06b8a112d`
- Pinned binary SHA-256:
  `a90b34a97bfc9b3fe06ac247a3feae7263f83aa1a29b4d79fea758bec587ce61`

The runtime provenance manifest declares the same source commit and binary
hash. Archiving establishes source provenance; it does not prove that an
arbitrary binary was built from a source tree. Agreement probes therefore
remain necessary and do not replace independent qualification.

The probe loads the governed sigma files through the pinned binary's
`DirectImport`/`FluidProfiles` ABI and reads its parsed areas, volumes, and
three profile blocks. It reads `q0`, `r0`, and coordination number from the
active native model's bound combinatorial constants. Thus its independent
combinatorial calculation uses ABI-parsed geometry rather than rounded JSON
header values.

## Literal-zero domain

`COSMO.hpp` lines 69-87 obtains profile area and volume for every component,
forms reduced `q=A/q0`, `r=V/r0`, and evaluates `r_i/(x·r)` and
`(q_i/(x·q))/(r_i/(x·r))`. Although local variables `theta_i` and `phi_i`
contain `x_i`, the returned expression uses only the reduced ratios. It does
not evaluate `log(x_i)`, so its combinatorial result is finite at `x_i=0`
provided the full-simplex mixture has positive area and volume. The adapter's
independent expression follows these exact returned terms rather than
inventing a separate `phi/x` boundary formula.

`COSMO.hpp` lines 101-115 constructs each mixture sigma profile as
`sum_i x_i*psigmaA_i / sum_i x_i*A_i`; an absent species therefore contributes
exactly zero to the numerator while its pure profile remains available.
Lines 489-499 solve the mixture segment activity coefficients and then
evaluate every pure-component residual contribution. Lines 472-481 show that
the pure component's area and profile are retained even when its mixture mole
fraction is zero.

For COSMO3, lines 403-419 and 436-459 iterate positive segment activity
coefficients and throw if the configured tolerance is not reached by 2000
iterations. The ABI binds `get_Gamma`, `get_AA`, combinatorial constants,
combinatorial and residual activity coefficients, and profile fields in
`pybind11_interface.cxx`. A finite returned `get_Gamma` call therefore implies
that this source-level stopping branch did not throw for that probe. The
adapter additionally checks finite positive Gamma and reconstructs the
positive exponential kernel from `get_AA` on nonzero profile support.

## Caveat

The probes establish formula-level and observed pinned-ABI agreement at the
archived compositions. They do not establish every boundary limit, analytic
derivative regularity, binary/source identity beyond the governed hashes, or
fitness for a saved-cell or film solve. No cCOSMO rebuild or replacement was
performed.

## Conditional segment regularity

This argument is conditional on the runtime probes verifying the actual
source kernel as finite, symmetric, and strictly positive, each pure and
mixture profile as a nonempty probability support, and the returned segment
Gamma as satisfying the source iteration's fixed-point residual bound.

On an active probability support, write the segment equation as
`Gamma_i * sum_j(K_ij p_j Gamma_j) = 1`. For symmetric strictly positive
`K`, this is the stationarity condition of the convex log-scaling potential

`Phi(y) = 1/2 sum_ij p_i p_j K_ij exp(y_i+y_j) - sum_i p_i y_i`,

with `y=log(Gamma)`. Strict positivity and nonempty probability support give
a positive solution on that support. The Jacobian of the log fixed-point
equations has form `I+P`, where `P` is row-stochastic and strictly positive
on active support. It is irreducible with positive diagonal, so `-1` is
excluded from its spectrum and `I+P` is invertible. Inactive profile columns
are zero and do not enter the active equation; the adapter reports them
separately when `fast_Gamma` truncates the iteration rather than treating
their initialized return values as solved equations.
Inactive zero-profile rows receive finite positive Gamma from the solved
support, while zero columns make the full Jacobian block triangular with an
identity inactive block, so the same argument covers support-changing
boundaries.

Consequently, while the same finite full kernel and active support conditions
hold, the positive segment solution and native residual extension are smooth
in composition by the implicit-function theorem. This is a conditional
source-level result, not a conclusion drawn from finite differences.

The source uses damped updates and tests
`|(Gamma-Gamma_new)/Gamma| <= t` after setting
`Gamma=(Gamma_old+Gamma_new)/2`. Therefore both
`Gamma_old/Gamma` and `Gamma_new/Gamma` lie in `[1-t,1+t]`, and positivity of
the kernel yields
`F(Gamma)/Gamma in [(1-t)^2,(1+t)^2]`. The exact implied fixed-point residual
bound is thus `2t+t^2`, not `t`. The evidence records both the unchanged
declared tolerance and the actual residual and fails rather than widening
the engine tolerance.
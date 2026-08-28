# ECR pre-pilot descriptor transfer qualification

**Decision: REJECT; simulator integration: NOT PERFORMED.**

A task-local frozen pre-fit protocol (SHA-enforced, without an external timestamp claim) fixed a hierarchical molecular-descriptor mapping and was fitted once after removing a true unseen molecular system and a complete temperature. The unchanged qualified UNIQUAC flash machinery was invoked for every held row. Unavailable final-phase checks on nonconverged/boundary rows are explicit qualification failures, not successful checks.

| Holdout | rows | topology recall | tie-line RMSD |
|---|---:|---:|---:|
| true unseen system | 28 | 0.857143 | 0.09826348296302705 |
| leave 323.2 K out | 8 | 0.875000 | 0.12988000025238497 |

Tie-line RMSD is the square root of summed squared mole-fraction errors over both endpoints and measured active components only; inactive zeros are excluded. Gates remain topology recall >=0.90 and tie-line RMSD <=0.03. DI/POLY temperature transfer, polar heteroatom transfer, and sulfur transfer fail closed for lack of direct evidence. The fitted Jacobian has rank 20 of 20, 10 practically weak directions; uncertainty and the applicability-domain extrapolations preclude deployment.

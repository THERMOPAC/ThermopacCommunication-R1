# COSMO-SAC-2010 + PROJECT_NMP_LLE_RESIDUAL

Research-only, calibration-required, non-pilot-validated, and non-release-eligible.

## Stage 1 equilibrium
- Status: `ACCEPTED_TWO_LIQUID_RESEARCH_PREDICTION`
- Minimum TPD: -1.160648089589e-01
- Gibbs reduction: 7.185283689896e-02
- Isoactivity residual: 1.759703494031e-14
- Material-balance residual: 1.110223024625e-16
- Extract molar phase fraction: 0.6062868456

## Phase mole fractions
- SAT: raffinate=0.7646941430; extract=0.0491884392; K=0.0643243310
- MONO: raffinate=0.0435030269; extract=0.0354452689; K=0.8147770720
- DI: raffinate=0.0213048698; extract=0.0169303418; K=0.7946700438
- POLY: raffinate=0.0070035390; extract=0.0062671816; K=0.8948592360
- PA: raffinate=0.0023458668; extract=0.0038698323; K=1.6496385291
- NMP: raffinate=0.1611485545; extract=0.8882989363; K=5.5122985074

## Full tangent-space phase stability

Each returned phase was checked in all five independent composition-tangent dimensions. The eigenspectrum was reconstructed independently from reduced-Gibbs differences and from the projected chemical-potential Jacobian at log-ratio steps 1e-3, 5e-4, and 2.5e-4.
- raffinate: minimum eigenvalue=2.311983834733e-03; maximum modewise relative reconstruction difference=1.503609980156e-04; post-split minimum TPD=1.039883349889e-18; global/reference seeds=7; local seeds=10.
- extract: minimum eigenvalue=3.810973704920e-03; maximum modewise relative reconstruction difference=6.881965082641e-06; post-split minimum TPD=1.148659753722e-16; global/reference seeds=7; local seeds=10.

## Blind validation
- training: {'rows': 143, 'activityEqualityRms': 0.21942289558690914, 'compositionRmsd': 0.3502450827232224, 'ceiling': 0.03, 'status': 'FAIL'}
- heldOutTemperature: {'rows': 41, 'activityEqualityRms': 0.16898369016556222, 'compositionRmsd': 0.07856508126243697, 'ceiling': 0.03, 'status': 'FAIL'}
- heldOutMolecularSystem: {'rows': 35, 'activityEqualityRms': 0.30712473850470634, 'compositionRmsd': 0.06944244443913729, 'ceiling': 0.03, 'status': 'FAIL'}
- cotoFiveComponentTransfer: {'rows': 17, 'activityEqualityRms': 0.6223938183888572, 'role': 'EXTERNAL_DI_POLY_TRANSFER_CHECK_NOT_FITTED_NOT_RECONSTRUCTED_AS_FEEDS'}

## Process targets
- minimumRaffinateSaturatesWt: {'target': 90.0, 'calculated': np.float64(92.45728048611765), 'basis': 'NMP-free five-family hydrocarbon mass', 'status': 'PASS'}
- maximumRaffinateTotalAromaticsWt: {'target': 5.0, 'calculated': np.float64(6.867368047847888), 'basis': 'MONO+DI+POLY on NMP-free hydrocarbon mass', 'status': 'FAIL'}
- maximumRaffinatePolarAromaticsWt: {'target': 0.5, 'calculated': np.float64(0.6753514660344667), 'basis': 'PA on NMP-free hydrocarbon mass', 'status': 'FAIL'}
- minimumNmpFreeRecoveryPct: {'target': 95.0, 'calculated': np.float64(83.64859408598569), 'basis': 'recovered five-family hydrocarbon mass / oil-feed hydrocarbon mass', 'status': 'FAIL'}
- maximumNmpRaffinateWt: {'target': 0.5, 'calculated': np.float64(10.18445545850597), 'basis': 'total raffinate mass', 'status': 'FAIL'}
- targetRaffinateSulfurPpm: {'target': 1000.0, 'calculated': None, 'basis': 'independent sulfur model required', 'status': 'NOT_CALCULABLE'}
- maximumStages: {'target': 10.0, 'calculated': None, 'basis': 'counter-current multistage extraction requirement N_T <= 10', 'status': 'NOT_EVALUATED_BY_EQUILIBRIUM_FLASH'}

## Decision
`FULL_SIX_COMPONENT_MODEL_QUALIFICATION = NOT_QUALIFIED`

Blind analogue composition RMSD exceeds the frozen 0.03 ceiling.
Sulfur remains `NOT_CALCULABLE`. PA transfer is provisional and is not sulfur removal.

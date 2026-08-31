# Task 218 frozen Task216 root-cause investigation

Frozen coverage: 57 genuine, 14 local-artifact controls, 39 unresolved-negative controls. No candidate was fitted and no production source or parameter was changed.

## Quantitative fixed-state evidence
Active TPD min/median/max: -0.781178740345 / -0.716860309037 / -0.104425902566.
Native p=0 TPD at the identical active w* min/median/max: 2.35944639501 / 2.64929404066 / 3.56156116949.
Amendment effect (active minus native) min/median/max: -3.66598707206 / -3.35637478669 / -3.14062513536. It flips the native nonnegative sign to active negative in 57/57 cases.
Independent native minimum min/median/max: -3.19687172081e-14 / -6.45733463612e-15 / 0; classifications={'LOCAL_HESSIAN_ONLY_ARTIFACT': 57}; governed genuine count=0.
Active TPD distribution Q1/Q3 -0.751751421576/-0.537620555077; median log10 magnitude/threshold 7.8554345.

## Separate basin-identity analysis
Decision: **ONE_SYSTEMATIC_MONO_RICH_BASIN_FAMILY**. All w* are MONO-rich (0.94513483 to 0.96379931 MONO).
CLR(w*) all-pair min/median/max distance: 1.1388429924e-06 / 0.684361866657 / 2.45976208687; centroid distance: 0.252716475701 / 0.796186454663 / 1.63720064814.
For 26 matched NT/stage raffinate-extract pairs, CLR(w*) distance min/median/max is 1.1388429924e-06 / 3.67033209995e-06 / 3.45854371578e-05. Paired minima coincide to at most 3.4585437e-05; phase labels do not establish distinct basins.
The spread is a continuous endpoint-conditioned displacement within one MONO-rich basin family; paired raffinate/extract minima coincide numerically. No separate basin identity is demonstrated.

## Endpoint-conditioned correlation classes
Full-feature silhouettes K=2..6: {'2': 0.39967871809074207, '3': 0.24269014413300652, '4': 0.374965073512856, '5': 0.40590691542975577, '6': 0.3556049717636389}; selected K=5; counts={'endpoint-correlation-class-1': 17, 'endpoint-correlation-class-2': 10, 'endpoint-correlation-class-3': 4, 'endpoint-correlation-class-4': 17, 'endpoint-correlation-class-5': 9}. These are endpoint-conditioned correlation classes only—not mechanisms, root causes, or basin identities.

## Ranked fixed-state ablation sensitivity
Delta is ablated TPD minus active TPD; positive is stabilizing at the frozen state.
| Rank | Ablation | Median delta | Min | Max | Positive / 57 |
|---:|---|---:|---:|---:|---:|
| 1 | SAT_MONO+MONO_NMP | 3.50459842 | 3.2692833 | 3.76237908 | 57 |
| 2 | MONO_NMP_block | 3.10203532 | 0.238666104 | 3.64894492 | 57 |
| 3 | SAT_NMP+MONO_NMP | 2.97371618 | 0.136596502 | 3.55819838 | 57 |
| 4 | ref_class | 2.74657936 | 2.45570167 | 3.63159028 | 57 |
| 5 | A_MONO_NMP_ref | 2.39536498 | 0.184889552 | 2.71389978 | 57 |
| 6 | temperature_class | 0.372799745 | 0.317562314 | 0.418002291 | 57 |
| 7 | A_MONO_NMP_temperature | 0.363217769 | 0.0280354648 | 0.411518342 | 57 |
| 8 | A_MONO_NMP_asymmetry | 0.343452571 | 0.00770141837 | 0.53981168 | 57 |
| 9 | asymmetry_class | 0.314681139 | -0.429387249 | 0.512813811 | 30 |
| 10 | SAT_MONO_block | 0.17363953 | 0.107788687 | 3.42903602 | 57 |
| 11 | A_SAT_MONO_ref | 0.15720276 | 0.100746651 | 3.60311869 | 57 |
| 12 | SAT_MONO+SAT_NMP | 0.045320389 | 0.0170421545 | 3.32696642 | 57 |
| 13 | A_SAT_MONO_temperature | 0.0150345628 | 0.00963521162 | 0.344595187 | 57 |
| 14 | A_SAT_MONO_asymmetry | -0.00200525287 | -0.518677862 | 0.00144069805 | 17 |
| 15 | A_SAT_NMP_temperature | -0.00545258671 | -0.0135405751 | -0.00368569749 | 0 |
| 16 | A_SAT_NMP_asymmetry | -0.0252472176 | -0.0302161856 | 0.0662859205 | 27 |
| 17 | A_SAT_NMP_ref | -0.0926929145 | -0.230187146 | -0.0626561412 | 0 |
| 18 | SAT_NMP_block | -0.127363142 | -0.182315124 | -0.0907465327 | 0 |

MONO_NMP_block is dominant (median Δ=3.10203532, 57/57 positive), driven especially by A_MONO_NMP_ref (median Δ=2.39536498, 57/57). SAT_MONO_block is secondary and endpoint-heterogeneous in magnitude (median Δ=0.17363953, range 0.107788687 to 3.42903602). SAT_NMP_block is stabilizing in the active formulation: removing it is destabilizing (median Δ=-0.127363142, 0/57 positive). Coefficient-class medians are ref=2.74657936, temperature=0.372799745, asymmetry=0.314681139; the asymmetry response is heterogeneous (30/57 positive). These are sensitivity results, not fitted alternatives.

## Selected exact TPD decompositions
- representative, NT=10 stage=3 raffinate, z=[0.7769952590525234, 0.06319781100340224, 0.0322146820412516, 0.0092191413753446, 0.0008994579682326581, 0.11747364855924525], w*=[0.0016379995211709443, 0.9637992577270005, 0.011031244748014375, 0.0035697308892761277, 0.0006109977540801314, 0.019350769360457876], complete=-0.716860309037; per-component ideal/native/residual/complete=[-0.01009328516361045, 2.625980343138905, -0.011822081684555489, -0.003386931021553185, -0.00023627224556829898, -0.03489876155608944]/[-0.00011262398437029011, 0.03106820033689031, -0.0001883731356175873, -0.0004996692874438643, -0.0004289556781492111, 0.0025623254859182877]/[0.009031699018390576, -3.3479580088996044, 0.004102596287769742, 0.001327607629893013, 0.00022723429449572185, 0.01846464742765952]/[-0.0011742101295901639, -0.6909094654238088, -0.007907858532403333, -0.0025589926791040364, -0.00043799362922178825, -0.013871788642511628].
- medianSeverity, NT=10 stage=3 raffinate, z=[0.7769952590525234, 0.06319781100340224, 0.0322146820412516, 0.0092191413753446, 0.0008994579682326581, 0.11747364855924525], w*=[0.0016379995211709443, 0.9637992577270005, 0.011031244748014375, 0.0035697308892761277, 0.0006109977540801314, 0.019350769360457876], complete=-0.716860309037; per-component ideal/native/residual/complete=[-0.01009328516361045, 2.625980343138905, -0.011822081684555489, -0.003386931021553185, -0.00023627224556829898, -0.03489876155608944]/[-0.00011262398437029011, 0.03106820033689031, -0.0001883731356175873, -0.0004996692874438643, -0.0004289556781492111, 0.0025623254859182877]/[0.009031699018390576, -3.3479580088996044, 0.004102596287769742, 0.001327607629893013, 0.00022723429449572185, 0.01846464742765952]/[-0.0011742101295901639, -0.6909094654238088, -0.007907858532403333, -0.0025589926791040364, -0.00043799362922178825, -0.013871788642511628].
- closestToThreshold, NT=4 stage=4 raffinate, z=[0.8598220429155577, 0.023777218749806577, 0.010314912073779926, 0.002831636714596241, 0.0002508474543685098, 0.10300334209189109], w*=[0.0036186480090015624, 0.9451348544180073, 0.00803546021137108, 0.0025231501205018577, 0.0004147248252800994, 0.04027316241583819], complete=-0.104425902566; per-component ideal/native/residual/complete=[-0.01979626613068673, 3.4805533252085494, -0.002006666141004396, -0.0002910370909128915, 0.0002085112940638746, -0.037819565629212924]/[-0.00026235481939280097, 0.03619819718694323, -0.00012825605331812166, -0.0003793273745521713, -0.00031869381863416815, 0.005248752501804625]/[0.01968074010339982, -3.615448091400522, 0.0012958068911999461, 0.0004068858817882696, 6.687896802589591e-05, 0.02836525785666749]/[-0.000377880846679709, -0.09869656900502927, -0.0008391153031225715, -0.0002634785836767932, -4.330355654439762e-05, -0.004205555270740813].
- deepest, NT=10 stage=1 extract, z=[0.03993537190068417, 0.06253073425255569, 0.03113635707291287, 0.011425557305271792, 0.005944777665686349, 0.8490272018028892], w*=[0.0015237241834820518, 0.9618085572863387, 0.012066238581974672, 0.004463672506028256, 0.002224191147742193, 0.017913616294434113], complete=-0.781178740345; per-component ideal/native/residual/complete=[-0.004976643153047985, 2.6287740238098816, -0.011438369699973142, -0.004195320335881056, -0.0021866463796477685, -0.06912022794245629]/[-0.00028255961572805425, -0.1777324474610457, -0.002166759626268213, -0.0008376344742261267, -0.00032121102662422513, 0.003930190915344768]/[0.004068908386307812, -3.2023859948899633, 0.00417924687543374, 0.0015460318679298966, 0.000770367985136236, 0.05119630441956989]/[-0.0011902943824682276, -0.7513444185411277, -0.009425882450807615, -0.003486922942177286, -0.0017374894211357576, -0.013993732607541632].

## A. Proven root causes
At every one of the 57 exact frozen z,w* states, native p=0 TPD is positive while complete active TPD is negative; the amendment effect is therefore necessary for the observed negative sign at those states (57/57). Source equations prove only the demonstrated algebraic scope: q is additive GE/RT, residual_feature_matrix@p is additive ln(gamma), and Euler sum(x_i ln(gamma_i,res))=q holds to the recorded numerical error. Frozen Task216 optimizer/KKT/gradient/witness gates prove the active lower-Gibbs basins. CLR(w*) evidence supports one systematic MONO-rich basin family, not multiple distinct identities.

## B. Strongly supported but not proven contributors
Fixed-state zero ablations make the MONO-NMP block the dominant sensitivity (median Δ 3.10203532), especially A_MONO_NMP_ref (2.39536498). SAT-MONO is secondary and heterogeneous; SAT-NMP is stabilizing because its removal makes TPD more negative in all 57. These ablations are sensitivity—not causal model qualification. Endpoint classes are correlation only.

## C. Factors ruled out by the evidence
No native genuine basin was found under the unchanged governed search (57/57 native classifications are LOCAL_HESSIAN_ONLY_ARTIFACT and minima are numerical zero). Matched raffinate/extract w* distances rule out distinct R/E basin identities at governed resolution. The genuine active results cannot be explained as local-artifact-only or pure optimizer artifacts because all corrected Task216 acceptance criteria passed. Controls remain separate: 14 local artifacts and 39 unresolved negatives.

## D. Remaining uncertainty
A finite deterministic lattice/refinement search cannot mathematically prove global absence of every possible native basin outside its governed resolution. Direct matching six-component LLE evidence remains missing. Ablation interactions do not establish a uniquely correct replacement form, and endpoint-conditioned correlations are not causation.

## E. Smallest scientifically defensible candidate-model changes
First govern a MONO-NMP block reformulation or regularization study, with SAT-MONO retained as a secondary interaction and the stabilizing SAT-NMP contribution protected unless independent evidence contradicts it. Preserve positive frozen validation, require direct six-component evidence, and require a fresh complete cascade/global-stability audit. Do not simply zero or tune coefficients to obtain a desired cascade output. Any later fitting must be separately declared and governed; no candidate was fit here.

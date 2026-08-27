# Independent equation-level implementation audit

Overall implementation audit: **FAIL**

The fitted parameter vector and 221/15 train/holdout split were frozen. An independent column/vector NRTL implementation was compared with the primary implementation over experimental, flash, structural-zero ternary, temperature, and interior-probe states. Maximum ln-gamma difference was 1.77636e-15.

All 212 accepted flashes carry homogeneous and selected two-phase reduced Gibbs values, Gibbs decrease, TPD minimum, isoactivity, and component closure. Aggregate isoactivity maximum is 1.32727e-05; mass-balance maximum is 2.22045e-16. All individual multistart summaries are retained and canonically labelled by NMP richness; alternate objectives are distinguished from equivalent best-objective starts.

Obligations: {"KKT_isoactivity": "PASS", "TPD_and_Gibbs": "PASS", "independentLngamma": "PASS", "massBalance": "PASS", "multistartAgreement": "FAIL"}.

Thermodynamic/model-form blame is not established because one or more implementation audit obligations failed.

Research complete. I ran the required four distinct searches before fetching; fetched artifacts are saved under `research/kuhni-drag-shape/sources/`.

## Key facts / equations
**Original framework evidence**
1. Wairegi & Grace, *The behaviour of large drops in immiscible liquids*, IJMF 3(1), 67–77 (1976), DOI 10.1016/0301-9322(76)90036-7. Publisher abstract says isolated large drops in tanks with negligible wall effects, up to **Eo = 1000**, displayed ellipsoidal/spherical caps (with/without skirts), crescents, biconcave disks, toroids and irregular wobbling; ellipsoidal-cap drops followed an extension of Davies–Taylor theory. This is direct primary evidence that liquid–liquid drops can be very non-spherical—not a drag closure for a stirred Kühni contactor. URL: https://www.sciencedirect.com/science/article/pii/0301932276900367 ; saved `03-wairegi-large-drops-publisher.html`.

2. Myint, Hosokawa & Tomiyama, *Shapes of Single Drops Rising Through Stagnant Liquids*, JFST 2(1), 184–195 (2007), DOI 10.1299/jfst.2.184. This is a later primary liquid–liquid experiment/recast, not an original Grace equation. Definitions reported exactly:
- `Eo = g d² |ρc−ρd| / σ`
- `M (Mo) = g μc⁴ |ρc−ρd| / (ρc² σ³)`
- `Re = ρc VT d / μc`
- `We = ρc VT² d / σ`
- `Ta = Re M^0.23`
- aspect ratio `E=(b1+b2)/(2a)`; distortion `γ=2b2/(b1+b2)`; viscosity ratio `κ=μd/μc`.
For clean drops it fitted `E = 1 − 0.0487 Ta − 0.0289 Ta²`, only over: `−11.6≤log M≤−0.9`, `0.015≤Re≤850`, `0.017≤Eo≤9.3`, `0.0074≤Ta≤3.6`, `0.1≤κ≤100`. It reports Grace et al.’s shape map as being in Eo/Re/M but **does not define a Grace X parameter**. URL: https://www.jstage.jst.go.jp/article/jfst/2/1/2_1_184/_pdf ; saved `05-myint-hosokawa-tomiyama-2007.pdf`.

3. The original Grace/Wairegi/Nguyen paper is bibliographically identified as *Shapes and velocities of single drops and bubbles moving freely through immiscible liquids*, Trans. IChemE (1976), but the located JST redirect was actually the 2007 Myint article, not the cited 1976 paper. Saved as an explicit retrieval mismatch: `01-jst-grace-wairegi-nguyen-1976.html`.

## Mapping and X=33.6
- The exact Eo/Mo/Re/We definitions above are source-supported. At terminal velocity, force balance with `Cd` referenced to projected spherical area gives the identity `Cd Re² = (4/3) Eo³/Mo`; it is a derived identity, **not an original Grace fitted equation**.
- A very likely meaning of the provided `X` is the standard dimensionless diameter/Archimedes-root group: `d* = (Eo³/Mo)^(1/6) = Eo^(1/2) Mo^(−1/6)`. If `X=d*`, `Mo=2.86×10⁻9` and `X=33.6` imply `Eo=X² Mo^(1/3)≈1.60`. This is compatible with the later clean-drop experimental Eo range.
- However, no located primary Grace source labels that group `X`; therefore do **not** state it as established fact in governed calculations. Another plausible undocumented convention, `X=Eo Mo^(−1/6)`, would instead yield `Eo≈1.27`. The supplied model/source must define X before selecting either mapping.
- No terminal `Re` or `We` follows from Mo and X alone without a selected drag/terminal-velocity closure (or measured VT). Once VT is known, calculate directly by the source definitions.

## Exact applicability / verdict
- The Grace/Clift/Wairegi framework is an **unbounded, single-drop/bubble, quiescent-terminal-motion regime framework**. It supports a qualitative prediction that deformed liquid drops are possible; the 1976 Wairegi–Grace primary paper directly documents non-spherical liquid–liquid shapes.
- It does **not** by itself qualify an RRBO/NMP dispersed phase in a mechanically agitated Kühni column: there are no RRBO/NMP physical-property/interface-mobility data, no proof of clean interface, no local slip velocity, no wall/impeller/swarm/coalescence treatment, and no original primary equation located that turns `X=33.6` into a Reynolds-dependent drag law.
- Verdict: **source-supported as pre-pilot isolated-drop shape/terminal-velocity screening only; pre-pilot extrapolation for RRBO/NMP/Kühni drag closure; not release-ready or direct validation.** Direct RRBO/NMP experimental validation is not required to make that bounded pre-pilot classification.

## Conflicts / quality gaps
- Original Grace map is chart/regime-map evidence; later algebraic correlations must not be attributed to it without an exact page/equation from the 1976 source or Clift–Grace–Weber book.
- Wairegi–Grace covers very large Eo through 1000 and dramatic shapes; Myint et al. provides quantified clean-drop shape correlation only to Eo 9.3. Neither is a stirred-column closure.
- Fetches that did not provide usable requested primary content were retained transparently: `02-utah-bubbles-drops.pdf` was a breakup chapter without the terminal framework; `04-experimental-liquid-drop-drag.pdf` was a DTIC maintenance response. The Bhaga–Weber publisher fetch failed and was not used. Bhaga–Weber is bubble, not liquid–liquid, evidence in any event.

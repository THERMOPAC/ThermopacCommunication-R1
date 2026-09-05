Research completed: 4 targeted webSearch calls were run. Four fetched artifacts are saved under `research/kuhni-drag-shape/sources/gap-hua-*` (2013 ScienceDirect extract, PolyU record, and full primary Myint 2006/2007 texts).

**Bibliographic correction:** S0045793013001205 is not Hua/Lou/Li. It is Lili Liu, Hui Tang & Shaoping Quan, “Shapes and terminal velocities of a drop rising in stagnant liquids,” *Computers & Fluids* 81 (2013) 17–25, DOI `10.1016/j.compfluid.2013.03.022`. OpenAlex reports it closed-access with no repository full text.

**Liu–Tang–Quan exact recoverable definitions**
- `η=ρd/ρs`, `λ=μd/μs`
- `Nf = [ρs(ρs−ρd)gD³]^(1/2)/μs`; `Ar=Nf²`
- `Eo=(ρs−ρd)gD²/σ`
- `Fr=UT[ρs/((ρs−ρd)gD)]^(1/2)`
- `ReT=ρsUTD/μs`; `WeT=ρsUT²D/σ`
- Simulated silicone-oil drops in glycerol/water, axisymmetric, `R=0.01 m`, tube radius `6R`, height `40R`; ranges `0.65<η<0.79`, `0.1<λ<10`, `5<Nf<100`, `16<Eo<47`.

The paper says it fitted quantitative `Fr(λ,Nf,Eo)` relations, but the exact fitted equations are behind the paywall and were **not recoverable** from publisher, repository, citation, or author searches. Therefore no exact executable Liu et al. deformation-aware terminal law can responsibly be supplied.

**Exact primary-predecessor drag closure (Myint–Hosokawa–Tomiyama 2006, DOI 10.1299/jfst.1.72)**
- `Re=ρc VT d/μc`, `κ=μd/μc`
- `Eo=(ρc−ρd)gd²/σ`
- `M=g μc⁴(ρc−ρd)/(ρc²σ³)`
- Hadamard–Rybczynski: `CD=(8/Re)(2+3κ)/(1+κ)`.
- Levich with surfactant retardation: `CD=(8/Re)(2+3κ+3C/μ)/(1+κ+C/μ)`.
- Their recommended finite-Re combination:
  `CD = [8(2+3κ+3C/μ)/(Re(1+κ+C/μ))] [1+0.15 Re^0.687]`.
  Clean interface: `C=0`; fully contaminated: `C/μ→∞`, reducing to Schiller–Naumann `24/Re(1+0.15Re^0.687)`.
- Validated ranges: `−11.6<log10 M<−0.9`, `0.17<Re<200`, `0.017<Eo<12.1`, `0.1<κ<100`; maximum terminal-velocity error about 10%.
- At terminal force balance: `CD=4(ρc−ρd)gd/(3ρcVT²)`, equivalently `CD Re²=(4/3)Nf²`.

**Exact shape closure (Myint et al. 2007, DOI 10.1299/jfst.2.184)**
- `E=(b1+b2)/(2a)`; `γ=2b2/(b1+b2)`.
- `Ta=Re M^0.23`.
- Clean-drop fit: `E=1−0.0487Ta−0.0289Ta²`.
- Range: `−11.6≤log10M≤−0.9`, `0.015≤Re≤850`, `0.017≤Eo≤9.3`, `0.0074≤Ta≤3.6`, `0.1≤κ≤100`.
- Wellek contaminated-drop predecessors: `E=1/(1+0.091We^0.95)` and `E=1/(1+0.163Eo^0.757)`, with `We=ρcVT²d/σ`.

**Project 236 verdict:** `Mo=2.8603e−9` (`log10Mo≈−8.54`) and `κ=33.6` fall inside Myint’s ranges; over 0.5–5 mm, `Eo≈0.033–3.33`, also inside. However, Myint’s `CD` is `CD(Re,κ,interface state)`, not `CD(Re,shape,κ)`, and the shape law is based on isolated drops at terminal conditions. It can provide terminal screening, but does not validate Garthe characteristic or swarm-slip states. Garthe Eq. 8.3 requires `CD,o(Re)` at both states: `vs/vo={[CD,o(Reo)/CD,o(Res)](1−h)^4.65}^1/2`; using the Myint law there is an extrapolation to nonterminal/swarm conditions, not a deformation-aware constitutive closure.
# Stage-3 ranking correction — design 269 / project 236

## Scope and method

This is a read-only pure calculation from the current immutable Stage-1
snapshot. No database row was inserted, updated, or deleted; no actor identity
was read or reported. The Stage-1 snapshot hash is
`e4137f46b51c7eb17e0ec7bb7077fb5dd24cb93acedce531d40420b53bb4f8af`.

The immutable ranking engine is **ECR_STAGE3_STAGE4_OPTIMIZER_V1.1.0**
(`35a2b0900aac2de58877f4699b174441da715ec5b8329232afc2beedbe77dd56`). The existing hydraulic equations,
signed force/capacity gates, fixed design \(N_T=7\), HETS \(=1.0\) m screening
basis, and geometry/RPM bounds are unchanged. A contiguous window width of
**15 rpm** is a visible ranking
preference only, not a hydraulic limit. Among candidates meeting it, the
smallest adequate column is selected; the non-dominated diameter/window
frontier is retained without cost or fabricated power weights.

## Selected result

| Field | Value |
| --- | --- |
| Stage-1 orientation | rrbo-continuous-nmp-dispersed |
| Column diameter | 0.500 m |
| Compartment ratio \(h_c/D\) | 0.30 |
| Compartment height | 0.150 m |
| Rotor diameter | 0.165 m |
| Rotor ratio \(D_R/D\) | 0.33 |
| Free area | 0.40 |
| Selected RPM | 40 |
| Useful window | 30–45 rpm (15 rpm) |
| Representative loading | 0.542 |
| Representative d32 | 0.00656 m |
| Representative holdup | 0.1524 |
| Preference met | true |

## Occupied-grid size/window comparison

This table deliberately keeps the new lower-diameter selected candidate and
the occupied-grid comparison candidates visible. It is evidence, not a cost
optimization: a candidate is not removed merely because another candidate
dominates it on the diameter/window frontier. The selected-result metrics above
use the actual persisted selected trial; comparison rows use a deterministic
midpoint representative trial so each occupied geometry can be compared on
loading, tip speed, d32, and holdup.

| Role | D (m) | hc (m) | hc/D | Rotor (m) | rotor/D | Free area | Window (rpm) | Width | Representative RPM | Tip speed | Loading | Flood fraction | d32 (m) | Meets preference | Rationale |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| SELECTED_COMPACT | 0.500 | 0.150 | 0.30 | 0.165 | 0.33 | 0.40 | 30–45 | 15 | 40.0 | 0.346 | 0.542 | 0.70 | 0.00656 | yes | It is the selected smallest adequate occupied-grid geometry. |
| SIZE_WINDOW_COMPARISON | 0.600 | 0.180 | 0.30 | 0.198 | 0.33 | 0.40 | 30–45 | 15 | 40.0 | 0.415 | 0.495 | 0.70 | 0.00567 | yes | Its contiguous window is the same width as the selected 0.500 m candidate; the diameter-first rule therefore retains the smaller selected geometry without a cost assumption. |
| SIZE_WINDOW_COMPARISON | 0.700 | 0.210 | 0.30 | 0.231 | 0.33 | 0.40 | 30–45 | 15 | 40.0 | 0.484 | 0.465 | 0.70 | 0.00501 | yes | Its contiguous window is the same width as the selected 0.500 m candidate; the diameter-first rule therefore retains the smaller selected geometry without a cost assumption. |
| WIDER_FRONTIER | 1.200 | 0.360 | 0.30 | 0.396 | 0.33 | 0.40 | 30–50 | 20 | 40.0 | 0.829 | 0.403 | 0.70 | 0.00326 | yes | It adds 5 rpm of window width versus the selected 0.500 m candidate and is retained as an occupied-grid size/window comparison. |

The selected **0.500 m** candidate is retained alongside the occupied-grid **0.700 m** candidate with the same window width: the explicit 15 rpm preference is met and diameter-first ranking selects the smallest adequate geometry, without inventing an equipment-cost weight.

## Retained frontier alternatives

| Role | D (m) | hc (m) | hc/D | Rotor (m) | rotor/D | Free area | Window (rpm) | Width | Representative RPM | Tip speed | Loading | Flood fraction | d32 (m) | Meets preference | Rationale |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| SIZE_WINDOW_COMPARISON | 0.600 | 0.180 | 0.30 | 0.198 | 0.33 | 0.40 | 30–45 | 15 | 40.0 | 0.415 | 0.495 | 0.70 | 0.00567 | yes | Its contiguous window is the same width as the selected 0.500 m candidate; the diameter-first rule therefore retains the smaller selected geometry without a cost assumption. |
| SIZE_WINDOW_COMPARISON | 0.700 | 0.210 | 0.30 | 0.231 | 0.33 | 0.40 | 30–45 | 15 | 40.0 | 0.484 | 0.465 | 0.70 | 0.00501 | yes | Its contiguous window is the same width as the selected 0.500 m candidate; the diameter-first rule therefore retains the smaller selected geometry without a cost assumption. |
| WIDER_FRONTIER | 1.200 | 0.360 | 0.30 | 0.396 | 0.33 | 0.40 | 30–50 | 20 | 40.0 | 0.829 | 0.403 | 0.70 | 0.00326 | yes | It adds 5 rpm of window width versus the selected 0.500 m candidate and is retained as an occupied-grid size/window comparison. |
| FRONTIER_ALTERNATIVE | 0.300 | 0.090 | 0.30 | 0.099 | 0.33 | 0.40 | 30–35 | 5 | 35.0 | 0.181 | 0.632 | 0.70 | 0.01159 | no | It is retained as a below-preference hydraulic fallback/frontier point. |
| FRONTIER_ALTERNATIVE | 0.300 | 0.075 | 0.25 | 0.099 | 0.33 | 0.40 | 30–35 | 5 | 35.0 | 0.181 | 0.679 | 0.70 | 0.01077 | no | It is retained as a below-preference hydraulic fallback/frontier point. |
| FRONTIER_ALTERNATIVE | 0.400 | 0.120 | 0.30 | 0.132 | 0.33 | 0.40 | 30–40 | 10 | 35.0 | 0.242 | 0.490 | 0.70 | 0.00921 | no | It is retained as a below-preference hydraulic fallback/frontier point. |
| FRONTIER_ALTERNATIVE | 0.400 | 0.100 | 0.25 | 0.132 | 0.33 | 0.40 | 30–40 | 10 | 35.0 | 0.242 | 0.533 | 0.70 | 0.00856 | no | It is retained as a below-preference hydraulic fallback/frontier point. |

The selected compact/wider labels are derived from the numerical Pareto
frontier; no diameter is hardcoded as the winner. If a future Stage-1 basis
produces a different smallest adequate diameter, that value is selected and
reported.

## Hydraulic invariant checks

* Feasible trial count: 1431
* All feasible tip speeds \(\le 4.5\) m/s: true
* All feasible trials pass the existing hydraulic gate: true
* All feasible loading values \(\le 0.7\): true
* Bounds retained: \(D=0.2..1.5\) m in 0.1 m steps; 30..70 rpm in 5 rpm
  steps; \(h_c/D=0.20,0.25,0.30\); \(D_R/D=0.33,0.40,0.50\); free area
  \(=0.20,0.30,0.40\).

The complete ranking evidence, rejection reasons, root diagnostics, and
immutable Stage-1 process basis are in
[`research/design269-stage3-ranking-correction.json`](./design269-stage3-ranking-correction.json).

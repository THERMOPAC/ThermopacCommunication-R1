"""Reproducible research calculation for a pre-pilot Kühni hydraulic screen.

This file is intentionally separate from KUHNI_PHASE1_V1.0.3.  It evaluates
published equations against the immutable Stage-1/run-2 basis without changing
the production engine.
"""

from __future__ import annotations

import math


G = 9.80665

# Immutable saved process basis: design 269, hydrodynamic run 2.
RHO_D = 878.0
MU_D = 0.106
RHO_C = 1028.0
MU_C = 0.001666
SIGMA = 0.012
Q_D = 0.0011111111111111111
Q_C = 0.0004744920017293558

# Immutable saved geometry/agitation scenario, scaled at fixed ratios.
ROTOR_RATIO = 0.50
COMPARTMENT_RATIO = 0.50
STATOR_FREE_FRACTION = 0.35
SAVED_POWER_NUMBER = 1.20
REFERENCE_COLUMN_DIAMETER = 0.15
RPMS = (60.0, 120.0, 180.0, 240.0, 300.0)


def bisect(func, low: float, high: float, *, iterations: int = 160) -> float:
    f_low = func(low)
    f_high = func(high)
    if not math.isfinite(f_low) or not math.isfinite(f_high):
        raise ValueError("non-finite bracket")
    if f_low == 0.0:
        return low
    if f_high == 0.0:
        return high
    if f_low * f_high > 0.0:
        raise ValueError(f"root not bracketed: {f_low=}, {f_high=}")
    for _ in range(iterations):
        mid = 0.5 * (low + high)
        f_mid = func(mid)
        if not math.isfinite(f_mid):
            raise ValueError("non-finite residual")
        if f_low * f_mid <= 0.0:
            high = mid
            f_high = f_mid
        else:
            low = mid
            f_low = f_mid
    return 0.5 * (low + high)


def golden_max(func, low: float, high: float, *, iterations: int = 180) -> tuple[float, float]:
    ratio = (math.sqrt(5.0) - 1.0) / 2.0
    c = high - ratio * (high - low)
    d = low + ratio * (high - low)
    fc = func(c)
    fd = func(d)
    for _ in range(iterations):
        if fc > fd:
            high, d, fd = d, c, fc
            c = high - ratio * (high - low)
            fc = func(c)
        else:
            low, c, fc = c, d, fd
            d = low + ratio * (high - low)
            fd = func(d)
    x = 0.5 * (low + high)
    return x, func(x)


def calabrese_d32(column_diameter_m: float, rpm: float) -> dict[str, float]:
    """Calabrese-Chang-Dang Eq. 18-19 with Eq. 1 inviscid baseline."""
    n = rpm / 60.0
    rotor_diameter = ROTOR_RATIO * column_diameter_m
    we = RHO_C * n * n * rotor_diameter**3 / SIGMA
    d0 = 0.053 * rotor_diameter * we ** (-3.0 / 5.0)
    epsilon = 0.97 * n**3 * rotor_diameter**2
    k = 11.5 * math.sqrt(RHO_C / RHO_D) * MU_D * epsilon ** (1.0 / 3.0) / SIGMA

    def residual(diameter: float) -> float:
        return (diameter / d0) ** (5.0 / 3.0) - 1.0 - k * diameter ** (1.0 / 3.0)

    d32 = bisect(residual, 1.0e-9, 0.10)
    nv = math.sqrt(RHO_C / RHO_D) * MU_D * epsilon ** (1.0 / 3.0) * d32 ** (1.0 / 3.0) / SIGMA
    return {"d32": d32, "d0": d0, "we": we, "epsilon": epsilon, "nv": nv}


def fluid_sphere_drag(reynolds: float) -> tuple[float, str]:
    """Published liquid-drop drag branches with explicit viscosity ratio."""
    if reynolds <= 0.0:
        raise ValueError("Re must be positive")
    x = MU_D / MU_C
    if reynolds <= 2.0:
        chi = 8.0 / 5.0
        drag = (
            16.0 * (1.0 + 1.5 * x) / (reynolds * (1.0 + x))
            + chi * (1.0 + 1.5 * x) ** 2 / (1.0 + x) ** 2
        )
        return drag, "OLIVER_CHUNG_RE_LE_2"
    if reynolds <= 50.0:
        drag = (
            x * (24.0 / reynolds + 4.0 * reynolds ** (-1.0 / 3.0))
            + 14.9 * reynolds ** (-0.78)
        ) / (1.0 + x)
        return drag, "RIVKIND_RYSKIN_2_LT_RE_LE_50"
    raise ValueError("terminal Re exceeds the equation-level audited range")


def terminal_velocity(diameter_m: float) -> dict[str, float | str]:
    archimedes = RHO_C * (RHO_C - RHO_D) * G * diameter_m**3 / MU_C**2

    def residual(reynolds: float) -> float:
        drag, _ = fluid_sphere_drag(reynolds)
        return drag * reynolds**2 - 4.0 * archimedes / 3.0

    reynolds = bisect(residual, 1.0e-12, 50.0)
    drag, branch = fluid_sphere_drag(reynolds)
    velocity = reynolds * MU_C / (RHO_C * diameter_m)
    eotvos = (RHO_C - RHO_D) * G * diameter_m**2 / SIGMA
    return {"velocity": velocity, "re": reynolds, "drag": drag, "eotvos": eotvos, "branch": branch}


def garthe_characteristic_factor(column_diameter_m: float, rpm: float, d32_m: float) -> dict[str, float]:
    n = rpm / 60.0
    rotor_diameter = ROTOR_RATIO * column_diameter_m
    compartment_height = COMPARTMENT_RATIO * column_diameter_m
    rotor_re = RHO_C * n * rotor_diameter**2 / MU_C
    source_power_number = 1.08 + 10.94 / math.sqrt(rotor_re) + 257.37 / rotor_re**1.5
    factor = (
        1.0
        - 1.669 * source_power_number ** (-3.945)
        - 2.807 * (d32_m / (column_diameter_m - rotor_diameter)) ** 1.336
        - 1.159 * (compartment_height / column_diameter_m) ** 2.049
        + 2.1 * STATOR_FREE_FRACTION**1.032
    )
    if not math.isfinite(factor) or factor <= 0.0:
        raise ValueError("Garthe Eq. 5.6 gives non-positive characteristic velocity")
    return {"factor": factor, "rotor_re": rotor_re, "source_power_number": source_power_number}


def richardson_zaki_exponent(reynolds: float) -> float:
    if reynolds < 0.2:
        return 4.65
    if reynolds < 1.0:
        return 4.35 * reynolds ** (-0.03)
    if reynolds < 500.0:
        return 4.45 * reynolds ** (-0.10)
    return 2.39


def garthe_swarm_velocity(
    holdup: float,
    characteristic_velocity: float,
    characteristic_re: float,
    d32_m: float,
) -> float:
    """Garthe/Stichlmair Eq. 8.3 with the audited fluid-sphere drag law."""
    drag_characteristic, _ = fluid_sphere_drag(characteristic_re)

    def residual(velocity: float) -> float:
        swarm_re = RHO_C * velocity * d32_m / MU_C
        drag_swarm, _ = fluid_sphere_drag(swarm_re)
        ratio = math.sqrt(
            (drag_characteristic / drag_swarm) * (1.0 - holdup) ** 4.65
        )
        return velocity - characteristic_velocity * ratio

    return bisect(residual, 1.0e-14, characteristic_velocity)


def hydraulic_capacity(column_diameter_m: float, rpm: float, swarm_model: str) -> dict[str, float | str]:
    drop = calabrese_d32(column_diameter_m, rpm)
    d32 = drop["d32"]
    terminal = terminal_velocity(d32)
    characteristic = garthe_characteristic_factor(column_diameter_m, rpm, d32)
    v_characteristic = float(terminal["velocity"]) * characteristic["factor"]
    re_characteristic = RHO_C * v_characteristic * d32 / MU_C

    if swarm_model == "GARTHE_STICHLMAIR":
        swarm_velocity = lambda h: garthe_swarm_velocity(
            h, v_characteristic, re_characteristic, d32
        )
        swarm_n = math.nan
    elif swarm_model == "RICHARDSON_ZAKI":
        swarm_n = richardson_zaki_exponent(re_characteristic)
        swarm_velocity = lambda h: v_characteristic * (1.0 - h) ** swarm_n
    else:
        raise ValueError("unknown swarm model")

    flow_ratio = Q_D / Q_C

    def total_superficial_capacity(holdup: float) -> float:
        denominator = flow_ratio / holdup + 1.0 / (1.0 - holdup)
        return (1.0 + flow_ratio) * swarm_velocity(holdup) / denominator

    flood_holdup, flood_j_total = golden_max(total_superficial_capacity, 1.0e-7, 1.0 - 1.0e-7)
    shell_area = math.pi * column_diameter_m**2 / 4.0
    flood_total_flow = shell_area * flood_j_total
    actual_loading = (Q_D + Q_C) / flood_total_flow

    return {
        "diameter": column_diameter_m,
        "rpm": rpm,
        "swarm_model": swarm_model,
        "d32": d32,
        "d0": drop["d0"],
        "we": drop["we"],
        "epsilon": drop["epsilon"],
        "nv": drop["nv"],
        "terminal_velocity": terminal["velocity"],
        "terminal_re": terminal["re"],
        "terminal_drag": terminal["drag"],
        "terminal_eotvos": terminal["eotvos"],
        "terminal_branch": terminal["branch"],
        "characteristic_factor": characteristic["factor"],
        "characteristic_velocity": v_characteristic,
        "characteristic_re": re_characteristic,
        "source_power_number": characteristic["source_power_number"],
        "saved_power_number": SAVED_POWER_NUMBER,
        "swarm_n": swarm_n,
        "flood_holdup": flood_holdup,
        "flood_j_total": flood_j_total,
        "flood_total_flow": flood_total_flow,
        "actual_loading": actual_loading,
    }


def solve_diameter(rpm: float, swarm_model: str, design_fraction: float) -> dict[str, float | str]:
    def residual(diameter: float) -> float:
        return float(hydraulic_capacity(diameter, rpm, swarm_model)["actual_loading"]) - design_fraction

    # The coupled fixed-RPM scale-up can require very large extrapolated roots.
    # The broad bracket is for diagnosis, not an assertion of feasible equipment.
    grid = [0.05 * (1.05**index) for index in range(225)]
    valid: list[tuple[float, float]] = []
    for diameter in grid:
        try:
            valid.append((diameter, residual(diameter)))
        except ValueError:
            continue
    brackets: list[tuple[float, float]] = []
    for (d1, r1), (d2, r2) in zip(valid, valid[1:]):
        if r1 == 0.0 or r1 * r2 < 0.0:
            brackets.append((d1, d2))
    if not brackets:
        raise ValueError("no positive diameter root in the audited equation domain")
    diameter = bisect(residual, *brackets[-1])
    result = hydraulic_capacity(diameter, rpm, swarm_model)
    result["design_fraction"] = design_fraction
    return result


def scaled_rpm(column_diameter_m: float, reference_rpm: float) -> float:
    """Geometric-similarity scale-up at constant P/V (N^3 D^2 constant)."""
    return reference_rpm * (REFERENCE_COLUMN_DIAMETER / column_diameter_m) ** (2.0 / 3.0)


def solve_diameter_constant_power(
    reference_rpm: float, swarm_model: str, design_fraction: float
) -> dict[str, float | str]:
    def residual(diameter: float) -> float:
        rpm = scaled_rpm(diameter, reference_rpm)
        return float(hydraulic_capacity(diameter, rpm, swarm_model)["actual_loading"]) - design_fraction

    grid = [0.05 * (1.04**index) for index in range(175)]
    valid: list[tuple[float, float]] = []
    for diameter in grid:
        try:
            valid.append((diameter, residual(diameter)))
        except ValueError:
            continue
    brackets: list[tuple[float, float]] = []
    for (d1, r1), (d2, r2) in zip(valid, valid[1:]):
        if r1 == 0.0 or r1 * r2 < 0.0:
            brackets.append((d1, d2))
    if not brackets:
        raise ValueError("no positive diameter root in the audited equation domain")
    diameter = bisect(residual, *brackets[-1])
    actual_rpm = scaled_rpm(diameter, reference_rpm)
    result = hydraulic_capacity(diameter, actual_rpm, swarm_model)
    rotor_diameter = ROTOR_RATIO * diameter
    compartment_height = COMPARTMENT_RATIO * diameter
    shell_area = math.pi * diameter**2 / 4.0
    compartment_volume = shell_area * compartment_height
    power = (
        SAVED_POWER_NUMBER
        * RHO_C
        * (actual_rpm / 60.0) ** 3
        * rotor_diameter**5
    )
    result["design_fraction"] = design_fraction
    result["reference_rpm"] = reference_rpm
    result["actual_rpm"] = actual_rpm
    result["tip_speed"] = math.pi * rotor_diameter * actual_rpm / 60.0
    result["power_w"] = power
    result["engineering_epsilon_w_kg"] = power / (RHO_C * compartment_volume)
    return result


def print_results() -> None:
    print("Immutable Stage-1 and run-2 basis")
    print(
        f"QD={Q_D:.12g} m3/s QC={Q_C:.12g} m3/s "
        f"muD/muC={MU_D/MU_C:.4f} dR/D={ROTOR_RATIO:.2f} "
        f"hc/D={COMPARTMENT_RATIO:.2f} phi_s={STATOR_FREE_FRACTION:.2f}"
    )
    header = (
        "model,rpm,fraction,D_m,d32_mm,epsilon_Wkg,We,Nv,"
        "vt_mps,Re_t,Eo,k_char,vchar_mps,Re_char,h_flood,loading"
    )
    print(header)
    for model in ("GARTHE_STICHLMAIR", "RICHARDSON_ZAKI"):
        for rpm in RPMS:
            for fraction in (1.0, 0.8, 0.7, 0.6):
                try:
                    result = solve_diameter_constant_power(rpm, model, fraction)
                    print(
                        f"{model},{rpm:.0f}->{result['actual_rpm']:.3f},{fraction:.2f},"
                        f"{result['diameter']:.6f},{1000*float(result['d32']):.6f},"
                        f"{result['epsilon']:.6f},{result['we']:.3f},{result['nv']:.6f},"
                        f"{result['terminal_velocity']:.6f},{result['terminal_re']:.6f},"
                        f"{result['terminal_eotvos']:.6g},{result['characteristic_factor']:.6f},"
                        f"{result['characteristic_velocity']:.6f},{result['characteristic_re']:.6f},"
                        f"{result['flood_holdup']:.6f},{result['actual_loading']:.6f}"
                    )
                except ValueError as exc:
                    print(f"{model},{rpm:.0f},{fraction:.2f},REJECTED,{exc}")


if __name__ == "__main__":
    print_results()
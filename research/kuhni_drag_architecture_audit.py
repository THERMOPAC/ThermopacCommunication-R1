"""Project 236 drag-architecture source-audit calculations.

This is a standalone research calculation. It does not modify
KUHNI_PHASE1_V1.0.3, production code, the database, historical runs, or the
diameter optimizer.

The final equipment context is a multistage counter-current Kuhni/ECR column.
The calculations here concern representative-drop and local-compartment
hydrodynamic submodels only.
"""

from __future__ import annotations

import csv
import math
from pathlib import Path


G = 9.80665
RHO_C = 1006.0
RHO_D = 862.0
MU_C = 0.00125
MU_D = 0.042
SIGMA = 0.0106
MU_WATER_REFERENCE = 0.0009

DIAMETERS_MM = (0.5, 1.0, 1.47, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0)

SHAPE_EVIDENCE_STATUS = "UNCONFIRMED"
DEFORMED_DRAG_CLOSURE_STATUS = "UNAVAILABLE"
GARTHE_EQ_8_3_STATUS = "DEPENDENCY_BLOCKED"
OPTIMIZER_RELEASE_STATUS = "HOLD"

VISCOSITY_RATIO = MU_D / MU_C
DENSITY_RATIO = RHO_D / RHO_C
MORTON = (
    G
    * MU_C**4
    * (RHO_C - RHO_D)
    / (RHO_C**2 * SIGMA**3)
)

# Barry & Parlange (2018), Eqs. 6-8 and 10-12.
BARRY_ALPHA = 2.5891
BARRY_BETA = 0.9879
BARRY_A = (
    (2.0 / 5.0)
    * math.sqrt(2.0 / math.pi)
    * (6.0 * math.sqrt(3.0) + 5.0 * math.sqrt(2.0) - 14.0)
)
BARRY_Z = 1.0 + (
    (BARRY_ALPHA - 2.0) * math.sqrt(VISCOSITY_RATIO * DENSITY_RATIO)
    + (BARRY_BETA - 1.0) * VISCOSITY_RATIO * DENSITY_RATIO
) / (1.0 + math.sqrt(VISCOSITY_RATIO * DENSITY_RATIO)) ** 2
BARRY_TAU_RHS = (
    (8.0 / 9.0)
    * (4.0 + 3.0 * VISCOSITY_RATIO)
    / (1.0 + VISCOSITY_RATIO)
)
BARRY_TAU = (
    -BARRY_A * BARRY_Z
    + math.sqrt((BARRY_A * BARRY_Z) ** 2 + 4.0 * BARRY_TAU_RHS)
) / 2.0
BARRY_LAMBDA = 1.0 / BARRY_TAU
BARRY_OMEGA = 1.0 / (
    3.0 * (1.0 + VISCOSITY_RATIO) * BARRY_TAU
)


def bisect(func, low: float, high: float, iterations: int = 180) -> float:
    """Return a bracketed positive root."""
    f_low = func(low)
    f_high = func(high)
    if not math.isfinite(f_low) or not math.isfinite(f_high):
        raise ValueError("non-finite bracket")
    if f_low * f_high > 0.0:
        raise ValueError("root not bracketed")
    for _ in range(iterations):
        midpoint = 0.5 * (low + high)
        f_midpoint = func(midpoint)
        if not math.isfinite(f_midpoint):
            raise ValueError("non-finite residual")
        if f_low * f_midpoint <= 0.0:
            high = midpoint
        else:
            low = midpoint
            f_low = f_midpoint
    return 0.5 * (low + high)


def barry_drag(reynolds: float) -> float:
    """Barry & Parlange Eq. 10 for a steady, non-oscillating fluid sphere."""
    if reynolds <= 0.0:
        raise ValueError("Reynolds number must be positive")
    sqrt_re = math.sqrt(reynolds)
    numerator = (
        sqrt_re
        + BARRY_A * BARRY_Z
        + BARRY_TAU * math.exp(-BARRY_LAMBDA * sqrt_re)
    )
    denominator = (
        sqrt_re / (1.0 + VISCOSITY_RATIO)
        + 3.0 * BARRY_A * BARRY_Z
        + 3.0 * BARRY_TAU * math.exp(-BARRY_OMEGA * sqrt_re)
    )
    return (
        48.0
        / (reynolds * (1.0 + VISCOSITY_RATIO))
        * (1.0 + 1.5 * VISCOSITY_RATIO)
        * numerator
        / denominator
    )


def oliver_chung_drag(reynolds: float) -> float:
    """Oliver-Chung expression as Barry & Parlange Eq. 5, chi=8/5."""
    x = VISCOSITY_RATIO
    return (
        16.0 * (1.0 + 1.5 * x) / (reynolds * (1.0 + x))
        + (8.0 / 5.0) * (1.0 + 1.5 * x) ** 2 / (1.0 + x) ** 2
    )


def rivkind_ryskin_drag(reynolds: float) -> float:
    """Rivkind-Ryskin interpolation as Barry & Parlange Eq. 1."""
    x = VISCOSITY_RATIO
    return (
        x * (24.0 / reynolds + 4.0 * reynolds ** (-1.0 / 3.0))
        + 14.9 * reynolds ** (-0.78)
    ) / (1.0 + x)


def terminal_force_balance(
    diameter_m: float, drag_function
) -> tuple[float, float, float]:
    """Solve Cd Re^2 = 4 Ar / 3 for Re, Cd, and terminal velocity."""
    archimedes = (
        RHO_C
        * (RHO_C - RHO_D)
        * G
        * diameter_m**3
        / MU_C**2
    )

    def residual(reynolds: float) -> float:
        return drag_function(reynolds) * reynolds**2 - 4.0 * archimedes / 3.0

    high = 1.0
    while residual(high) < 0.0:
        high *= 2.0
        if high > 1.0e7:
            raise ValueError("terminal Reynolds root not bracketed")
    reynolds = bisect(residual, 1.0e-12, high)
    drag = drag_function(reynolds)
    velocity = reynolds * MU_C / (RHO_C * diameter_m)
    return reynolds, drag, velocity


def grace_terminal_velocity(
    diameter_m: float,
) -> tuple[float, float | None, float | None, float | None]:
    """Grace Eo-Mo terminal-velocity sensitivity.

    This empirical drops-and-bubbles map has no dispersed-viscosity term and is
    not a constitutive Cd(Re) law for use in the Garthe swarm ratio.
    """
    eotvos = (RHO_C - RHO_D) * G * diameter_m**2 / SIGMA
    h_value = (
        (4.0 / 3.0)
        * eotvos
        * MORTON ** (-0.149)
        * (MU_C / MU_WATER_REFERENCE) ** (-0.14)
    )
    if h_value < 2.0:
        return h_value, None, None, None
    if h_value <= 59.3:
        j_value = 0.94 * h_value**0.757
    else:
        j_value = 3.42 * h_value**0.441
    reynolds = MORTON ** (-0.149) * (j_value - 0.857)
    velocity = reynolds * MU_C / (RHO_C * diameter_m)
    drag = (
        (4.0 / 3.0)
        * math.sqrt(eotvos**3 / MORTON)
        / reynolds**2
    )
    return h_value, reynolds, drag, velocity


def row_for_diameter(diameter_mm: float) -> dict[str, object]:
    diameter_m = diameter_mm / 1000.0
    eotvos = (RHO_C - RHO_D) * G * diameter_m**2 / SIGMA
    reynolds, drag, velocity = terminal_force_balance(
        diameter_m, barry_drag
    )
    weber = RHO_C * velocity**2 * diameter_m / SIGMA

    # Wellek-Agrawal-Skelland: major/minor axis ratio of a non-oscillating drop.
    major_minor_axis_ratio = 1.0 + 0.163 * eotvos**0.757
    minor_major_axis_ratio = 1.0 / major_minor_axis_ratio

    h_value, grace_re, grace_drag, grace_velocity = grace_terminal_velocity(
        diameter_m
    )

    if reynolds <= 200.0:
        architecture_status = (
            "SPHERICAL_STATE_UNCONFIRMED; "
            "BARRY_WITHIN_DEMONSTRATED_RE_RANGE"
        )
    else:
        architecture_status = (
            "SPHERICAL_STATE_UNCONFIRMED; "
            "BARRY_HIGH_RE_OUTSIDE_DEMONSTRATED_RANGE"
        )

    return {
        "diameter_mm": diameter_mm,
        "eotvos": eotvos,
        "morton": MORTON,
        "viscosity_ratio": VISCOSITY_RATIO,
        "density_ratio": DENSITY_RATIO,
        "barry_re": reynolds,
        "barry_cd": drag,
        "barry_velocity_m_s": velocity,
        "barry_weber": weber,
        "wellek_major_minor_axis_ratio": major_minor_axis_ratio,
        "wellek_minor_major_axis_ratio": minor_major_axis_ratio,
        "grace_h": h_value,
        "grace_re": grace_re,
        "grace_cd_from_terminal_force_balance": grace_drag,
        "grace_velocity_m_s": grace_velocity,
        "shape_evidence_status": SHAPE_EVIDENCE_STATUS,
        "deformed_drag_closure_status": DEFORMED_DRAG_CLOSURE_STATUS,
        "garthe_eq_8_3_status": GARTHE_EQ_8_3_STATUS,
        "optimizer_release_status": OPTIMIZER_RELEASE_STATUS,
        "architecture_status": architecture_status,
    }


def validate_qualification_gate(rows: list[dict[str, object]]) -> None:
    """Fail if an unqualified shape state can be mistaken for optimizer-ready."""
    if not rows:
        raise ValueError("qualification grid is empty")
    for row in rows:
        if row["shape_evidence_status"] != "CONFIRMED_SPHERICAL":
            if row["garthe_eq_8_3_status"] != GARTHE_EQ_8_3_STATUS:
                raise ValueError("unconfirmed shape must block Garthe Eq. 8.3")
            if row["optimizer_release_status"] != OPTIMIZER_RELEASE_STATUS:
                raise ValueError("unconfirmed shape must hold optimizer release")
        if (
            float(row["barry_re"]) > 200.0
            and "OUTSIDE_DEMONSTRATED_RANGE"
            not in str(row["architecture_status"])
        ):
            raise ValueError("high-Re Barry result is missing its evidence warning")


def write_results() -> Path:
    rows = [row_for_diameter(value) for value in DIAMETERS_MM]
    validate_qualification_gate(rows)
    path = Path(__file__).with_name("kuhni_drag_architecture_results.csv")
    with path.open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(
            output, fieldnames=list(rows[0]), lineterminator="\n"
        )
        writer.writeheader()
        writer.writerows(rows)
    return path


if __name__ == "__main__":
    result_path = write_results()
    print(f"wrote {result_path}")
    print(
        f"X={VISCOSITY_RATIO:.12g} P={DENSITY_RATIO:.12g} "
        f"Mo={MORTON:.12g}"
    )
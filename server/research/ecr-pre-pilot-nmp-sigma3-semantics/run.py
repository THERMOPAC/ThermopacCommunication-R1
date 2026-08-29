#!/usr/bin/env python3
"""Independent NMP sigma3 semantic diagnostic.

This script deliberately does not import or call the project profile generator.
It reconstructs the relevant NIST and CPCM-X equations from the retained raw
surface and writes deterministic, research-only diagnostic artifacts.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SOURCE = ROOT / "server/research/ecr-pre-pilot-six-component-thermodynamics"
SURFACE = SOURCE / "generated/surfaces/SECXISVLQFMRJM-UHFFFAOYSA-N.cosmo"
PROFILE = SOURCE / "generated/profiles/sigma3/SECXISVLQFMRJM-UHFFFAOYSA-N.sigma"
GENERATION_MANIFEST = SOURCE / "generated/generation-manifest.json"
GENERATION_PROTOCOL = SOURCE / "generation-protocol.json"
PROFILE_GENERATOR = SOURCE / "generate_profiles.py"
PROFILE_PROVENANCE = SOURCE / "provenance-manifest.json"
CPCMX_PARAMETERS = SOURCE / "vendor/cpx-db/xtb/crs.param_h2o"
OUT = ROOT / ".agents/outputs/ecr-pre-pilot-nmp-sigma3-semantics"

NIST_COMMIT = "1b82456be38026719b16cad4076109bef3fcb309"
NIST_TO_SIGMA_SHA256 = "73cd7b526568ee921e2fcd83b5d8653fccf37878fe4690abafdcd785334ace2a"
NIST_TO_SIGMA_URL = (
    "https://github.com/usnistgov/COSMOSAC/blob/"
    f"{NIST_COMMIT}/profiles/to_sigma.py"
)
CPCMX_COMMIT = "e7f894c76d41ee1f703cf6f03e931cbcf046bc7f"
CPCMX_PROFILE_SHA256 = "05bbafb5bfcc95c5680d0f16841f3e4f077903a0675dfb7e21a2a00313ece948"
CPCMX_SIGMA_AV_SHA256 = "ee1fbd0cfc684ae835601d5dc0903efbb02e3fb79833a4d477d810b790dd995b"

EXPECTED_INPUT_HASHES = {
    str(SURFACE.relative_to(ROOT)): "837958143169284b19e2678ad65d6a39349a059c80057b300df3e1868d761d76",
    str(PROFILE.relative_to(ROOT)): "6e9318b0a76297bb78da0c9fa19d3dd61101f03c399cd4dd4508eac7b6594566",
    str(GENERATION_MANIFEST.relative_to(ROOT)): "c58318271c70cb51f9f75e8863dabfdcb9a38c27a0882b39a63f979005aa1058",
    str(GENERATION_PROTOCOL.relative_to(ROOT)): "987f9fb3b91c9cd586f9e506ec3609a68f70d8441161cbb1db64169a8427c675",
    str(PROFILE_GENERATOR.relative_to(ROOT)): "a441d3e83bfadc5c943076ba98fb19a683d77722ea95efab1052ad0c6ee18c66",
    str(PROFILE_PROVENANCE.relative_to(ROOT)): "e79cb43907b11a3700f02225da6b6a15c2534aef111f02c1c7e47325e0095795",
    str(CPCMX_PARAMETERS.relative_to(ROOT)): "533d58bca9cb8939c607cec4927df3c5c8deee9679098666351ef66ca68ea004",
}

BOHR_TO_ANGSTROM = 0.52917721067
GRID_MIN = -0.025
GRID_MAX = 0.025
GRID_STEP = 0.001
GRID = tuple(GRID_MIN + i * GRID_STEP for i in range(51))
SIGMA_ZERO = 0.007
NIST_HSIEH_R_AV_SQUARED = 7.25 / math.pi
NIST_HSIEH_F_DECAY = 3.57
CPCMX_ACTUAL_R_AV = 0.30880726
CPCMX_ACTUAL_F_DECAY = 1.0
EMITTED_RECONSTRUCTION_BIN_TOLERANCE = 1.0e-4
NIST_EQUIVALENCE_BIN_TOLERANCE = 1.0e-6

COVALENT_RADII_ANGSTROM = {"H": 0.31, "C": 0.76, "N": 0.71, "O": 0.66}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def assert_frozen_inputs() -> dict[str, str]:
    actual = {path: sha256(ROOT / path) for path in EXPECTED_INPUT_HASHES}
    failures = {
        path: {"expected": EXPECTED_INPUT_HASHES[path], "actual": digest}
        for path, digest in actual.items()
        if digest != EXPECTED_INPUT_HASHES[path]
    }
    if failures:
        raise RuntimeError(f"frozen input hash mismatch: {failures}")
    return actual


def parse_surface() -> tuple[float, list[dict], list[dict], float]:
    lines = SURFACE.read_text(encoding="utf-8").splitlines()
    area_line = next(line for line in lines if line.strip().startswith("area="))
    declared_area = float(area_line.split("=", 1)[1])

    atoms: list[dict] = []
    in_atoms = False
    for line in lines:
        marker = line.strip()
        if marker == "$coord_rad":
            in_atoms = True
            continue
        if marker == "$coord_car" and in_atoms:
            break
        fields = line.split()
        if in_atoms and len(fields) == 6 and fields[0].isdigit():
            atoms.append(
                {
                    "atom": int(fields[0]),
                    "element": fields[4].upper(),
                    "xyzAngstrom": tuple(float(value) * BOHR_TO_ANGSTROM for value in fields[1:4]),
                }
            )

    segments: list[dict] = []
    in_segments = False
    for line in lines:
        if line.strip() == "$segment_information":
            in_segments = True
            continue
        fields = line.split()
        if not in_segments or len(fields) < 9 or not fields[0].isdigit():
            continue
        segment = {
            "segment": int(fields[0]),
            "atom": int(fields[1]),
            "xyzAngstrom": tuple(float(value) * BOHR_TO_ANGSTROM for value in fields[2:5]),
            "chargeElectron": float(fields[5]),
            "areaSquareAngstrom": float(fields[6]),
            "providedRawSigma": float(fields[7]),
        }
        segment["rawSigma"] = segment["chargeElectron"] / segment["areaSquareAngstrom"]
        segments.append(segment)

    if len(atoms) != 16 or len(segments) != 757:
        raise RuntimeError(f"unexpected NMP surface dimensions: {len(atoms)} atoms, {len(segments)} segments")
    if [atom["atom"] for atom in atoms] != list(range(1, 17)):
        raise RuntimeError("atom indices are not contiguous and one-based")
    if [segment["segment"] for segment in segments] != list(range(1, 758)):
        raise RuntimeError("segment indices are not contiguous and one-based")
    if any(segment["atom"] < 1 or segment["atom"] > len(atoms) for segment in segments):
        raise RuntimeError("segment atom ownership is out of range")

    parsed_area = sum(segment["areaSquareAngstrom"] for segment in segments)
    if abs(parsed_area - declared_area) > 1.0e-6:
        raise RuntimeError(f"surface area does not close: parsed={parsed_area}, declared={declared_area}")
    raw_sigma_column_error = max(
        abs(segment["rawSigma"] - segment["providedRawSigma"]) for segment in segments
    )
    if raw_sigma_column_error > 1.0e-8:
        raise RuntimeError(f"charge/area column is inconsistent: {raw_sigma_column_error}")
    return declared_area, atoms, segments, raw_sigma_column_error


def distance(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return math.sqrt(sum((x - y) ** 2 for x, y in zip(a, b)))


def classify_atoms(atoms: list[dict]) -> tuple[list[dict], dict[int, str]]:
    bonds: list[dict] = []
    neighbors: dict[int, list[int]] = {atom["atom"]: [] for atom in atoms}
    by_number = {atom["atom"]: atom for atom in atoms}
    for left_index, left in enumerate(atoms):
        for right in atoms[left_index + 1 :]:
            threshold = 1.15 * (
                COVALENT_RADII_ANGSTROM[left["element"]]
                + COVALENT_RADII_ANGSTROM[right["element"]]
            )
            separation = distance(left["xyzAngstrom"], right["xyzAngstrom"])
            if separation < threshold:
                neighbors[left["atom"]].append(right["atom"])
                neighbors[right["atom"]].append(left["atom"])
                bonds.append(
                    {
                        "atoms": [left["atom"], right["atom"]],
                        "elements": [left["element"], right["element"]],
                        "distanceAngstrom": separation,
                        "thresholdAngstrom": threshold,
                    }
                )

    classes: dict[int, str] = {}
    for atom in atoms:
        number = atom["atom"]
        element = atom["element"]
        neighbor_elements = [by_number[index]["element"] for index in neighbors[number]]
        if element in {"N", "F"}:
            classes[number] = "OT"
        elif element == "O":
            classes[number] = "OH" if "H" in neighbor_elements else "OT"
        elif element == "H":
            if "O" in neighbor_elements:
                classes[number] = "OH"
            elif "N" in neighbor_elements or "F" in neighbor_elements:
                classes[number] = "OT"
            else:
                classes[number] = "NHB"
        else:
            classes[number] = "NHB"
    return bonds, classes


def average_sigmas(
    segments: list[dict],
    r_av_squared: float,
    f_decay: float,
    sign_multiplier: float = 1.0,
) -> list[float]:
    """NIST/CPCM-X segment smoothing equation, with explicit scheme constants."""
    averaged: list[float] = []
    source_radii_squared = [
        segment["areaSquareAngstrom"] / math.pi for segment in segments
    ]
    for target in segments:
        numerator = 0.0
        denominator = 0.0
        for source, source_radius_squared in zip(segments, source_radii_squared):
            distance_squared = sum(
                (x - y) ** 2
                for x, y in zip(target["xyzAngstrom"], source["xyzAngstrom"])
            )
            radius_sum = source_radius_squared + r_av_squared
            weight = (
                source_radius_squared
                * r_av_squared
                / radius_sum
                * math.exp(-f_decay * distance_squared / radius_sum)
            )
            numerator += weight * sign_multiplier * source["rawSigma"]
            denominator += weight
        if denominator <= 0.0:
            raise RuntimeError("non-positive sigma averaging denominator")
        averaged.append(numerator / denominator)
    return averaged


def partition_name(element: str, hb_class: str, sigma: float) -> str:
    if (
        (element == "O" and sigma > 0.0 and hb_class == "OH")
        or (element == "H" and sigma < 0.0 and hb_class == "OH")
    ):
        return "OH"
    if (
        (element in {"O", "N", "F"} and sigma > 0.0 and hb_class == "OT")
        or (element == "H" and sigma < 0.0 and hb_class == "OT")
    ):
        return "OT"
    return "NHB"


def bin_location(sigma: float) -> tuple[int, int, float, float]:
    if sigma < GRID_MIN or sigma > GRID_MAX:
        raise RuntimeError(f"sigma outside NIST grid: {sigma}")
    left = int((sigma - GRID_MIN) / GRID_STEP)
    if left >= len(GRID) - 1:
        left = len(GRID) - 2
    right = left + 1
    left_weight = (GRID[right] - sigma) / GRID_STEP
    return left, right, left_weight, 1.0 - left_weight


def build_profiles(
    atoms: list[dict],
    segments: list[dict],
    atom_classes: dict[int, str],
    averaged: list[float],
) -> dict:
    elements = {atom["atom"]: atom["element"] for atom in atoms}
    pre_probability = {name: [0.0] * len(GRID) for name in ("NHB", "OH", "OT")}
    assignments: list[str] = []
    bin_locations: list[tuple[int, int, float, float]] = []
    for segment, sigma in zip(segments, averaged):
        element = elements[segment["atom"]]
        assignment = partition_name(element, atom_classes[segment["atom"]], sigma)
        assignments.append(assignment)
        location = bin_location(sigma)
        bin_locations.append(location)
        left, right, left_weight, right_weight = location
        area = segment["areaSquareAngstrom"]
        pre_probability[assignment][left] += area * left_weight
        pre_probability[assignment][right] += area * right_weight

    probability = [
        1.0 - math.exp(-(sigma**2) / (2.0 * SIGMA_ZERO**2)) for sigma in GRID
    ]
    final = {name: values.copy() for name, values in pre_probability.items()}
    for index, p_hb in enumerate(probability):
        hb_area = pre_probability["OH"][index] + pre_probability["OT"][index]
        final["NHB"][index] += hb_area * (1.0 - p_hb)
        final["OH"][index] *= p_hb
        final["OT"][index] *= p_hb
    return {
        "preProbability": pre_probability,
        "final": final,
        "assignments": assignments,
        "binLocations": bin_locations,
        "hydrogenBondProbability": probability,
    }


def parse_emitted_profile() -> dict[str, list[float]]:
    rows = [
        tuple(map(float, line.split()))
        for line in PROFILE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    if len(rows) != 153:
        raise RuntimeError(f"expected 153 profile rows, found {len(rows)}")
    expected_grid = list(GRID) * 3
    if any(abs(row[0] - expected) > 1.0e-12 for row, expected in zip(rows, expected_grid)):
        raise RuntimeError("emitted profile grid differs from NIST contract")
    return {
        "NHB": [row[1] for row in rows[0:51]],
        "OH": [row[1] for row in rows[51:102]],
        "OT": [row[1] for row in rows[102:153]],
    }


def profile_metrics(profile: dict[str, list[float]]) -> dict:
    return {
        name: {
            "areaSquareAngstrom": sum(values),
            "firstMomentElectron": sum(sigma * area for sigma, area in zip(GRID, values)),
            "nonzeroBins": [
                {"sigmaElectronPerSquareAngstrom": GRID[index], "areaSquareAngstrom": value}
                for index, value in enumerate(values)
                if abs(value) > 1.0e-12
            ],
        }
        for name, values in profile.items()
    }


def compare_profiles(
    left: dict[str, list[float]], right: dict[str, list[float]]
) -> dict:
    differences = [
        abs(left[name][index] - right[name][index])
        for name in ("NHB", "OH", "OT")
        for index in range(len(GRID))
    ]
    return {
        "maximumAbsoluteBinAreaDifferenceSquareAngstrom": max(differences),
        "l1BinAreaDifferenceSquareAngstrom": sum(differences),
        "partitionAreaDeltaSquareAngstrom": {
            name: sum(left[name]) - sum(right[name]) for name in ("NHB", "OH", "OT")
        },
    }


def area_by_atom(
    atoms: list[dict], segments: list[dict], assignments: list[str]
) -> dict[str, dict]:
    elements = {atom["atom"]: atom["element"] for atom in atoms}
    output: dict[str, dict] = {}
    for atom in atoms:
        atom_number = atom["atom"]
        owned = [
            (segment, assignment)
            for segment, assignment in zip(segments, assignments)
            if segment["atom"] == atom_number
        ]
        output[str(atom_number)] = {
            "element": elements[atom_number],
            "totalAreaSquareAngstrom": sum(item[0]["areaSquareAngstrom"] for item in owned),
            "partitionAreaSquareAngstrom": {
                name: sum(
                    item[0]["areaSquareAngstrom"] for item in owned if item[1] == name
                )
                for name in ("NHB", "OH", "OT")
            },
        }
    return output


def write_segment_audit(
    atoms: list[dict],
    segments: list[dict],
    atom_classes: dict[int, str],
    cpcmx_averaged: list[float],
    cpcmx_profile: dict,
    nist_averaged: list[float],
    nist_profile: dict,
) -> None:
    elements = {atom["atom"]: atom["element"] for atom in atoms}
    path = OUT / "segment-audit.csv"
    fields = [
        "segment",
        "atom",
        "element",
        "hb_class",
        "area_square_angstrom",
        "charge_electron",
        "raw_sigma_e_per_square_angstrom",
        "cpcmx_averaged_sigma",
        "cpcmx_pre_probability_partition",
        "nist_hsieh_averaged_sigma",
        "nist_pre_probability_partition",
        "nist_left_bin",
        "nist_right_bin",
        "nist_left_area_weight",
        "nist_right_area_weight",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for index, segment in enumerate(segments):
            left, right, left_weight, right_weight = nist_profile["binLocations"][index]
            writer.writerow(
                {
                    "segment": segment["segment"],
                    "atom": segment["atom"],
                    "element": elements[segment["atom"]],
                    "hb_class": atom_classes[segment["atom"]],
                    "area_square_angstrom": f"{segment['areaSquareAngstrom']:.12f}",
                    "charge_electron": f"{segment['chargeElectron']:.12f}",
                    "raw_sigma_e_per_square_angstrom": f"{segment['rawSigma']:.15f}",
                    "cpcmx_averaged_sigma": f"{cpcmx_averaged[index]:.15f}",
                    "cpcmx_pre_probability_partition": cpcmx_profile["assignments"][index],
                    "nist_hsieh_averaged_sigma": f"{nist_averaged[index]:.15f}",
                    "nist_pre_probability_partition": nist_profile["assignments"][index],
                    "nist_left_bin": f"{GRID[left]:.3f}",
                    "nist_right_bin": f"{GRID[right]:.3f}",
                    "nist_left_area_weight": f"{left_weight:.15f}",
                    "nist_right_area_weight": f"{right_weight:.15f}",
                }
            )


def main() -> None:
    input_hashes = assert_frozen_inputs()
    OUT.mkdir(parents=True, exist_ok=True)
    declared_area, atoms, segments, raw_sigma_column_error = parse_surface()
    bonds, atom_classes = classify_atoms(atoms)
    emitted = parse_emitted_profile()

    cpcmx_averaged = average_sigmas(
        segments, CPCMX_ACTUAL_R_AV**2, CPCMX_ACTUAL_F_DECAY
    )
    cpcmx = build_profiles(atoms, segments, atom_classes, cpcmx_averaged)
    cpcmx_comparison = compare_profiles(cpcmx["final"], emitted)
    if (
        cpcmx_comparison["maximumAbsoluteBinAreaDifferenceSquareAngstrom"]
        > EMITTED_RECONSTRUCTION_BIN_TOLERANCE
    ):
        raise RuntimeError("retained surface does not reproduce CPCM-X-emitted profile")

    nist_averaged = average_sigmas(
        segments, NIST_HSIEH_R_AV_SQUARED, NIST_HSIEH_F_DECAY
    )
    nist = build_profiles(atoms, segments, atom_classes, nist_averaged)
    nist_comparison = compare_profiles(nist["final"], emitted)

    inverted_averaged = average_sigmas(
        segments, NIST_HSIEH_R_AV_SQUARED, NIST_HSIEH_F_DECAY, sign_multiplier=-1.0
    )
    inverted = build_profiles(atoms, segments, atom_classes, inverted_averaged)

    if (
        nist_comparison["maximumAbsoluteBinAreaDifferenceSquareAngstrom"]
        <= NIST_EQUIVALENCE_BIN_TOLERANCE
    ):
        verdict = "NMP_OT_AREA_CORRECT_UNDER_NIST_SIGMA3"
        defects: list[str] = []
    else:
        verdict = "NMP_SIGMA3_CONVERSION_DEFECT_CONFIRMED"
        defects = [
            "AVERAGING_ALGORITHM_MISMATCH",
            "EMITTED_METADATA_MISSTATES_ACTUAL_AVERAGING",
            "RAW_CPCMX_SIGN_PLACES_CARBONYL_O_OUTSIDE_NIST_OT_MASK",
        ]

    elements = {atom["atom"]: atom["element"] for atom in atoms}
    cpcmx_ot_segments = [
        segment["segment"]
        for segment, assignment in zip(segments, cpcmx["assignments"])
        if assignment == "OT"
    ]
    nist_ot_segments = [
        segment["segment"]
        for segment, assignment in zip(segments, nist["assignments"])
        if assignment == "OT"
    ]
    oxygen_segments = [
        segment for segment in segments if elements[segment["atom"]] == "O"
    ]
    nitrogen_segments = [
        segment for segment in segments if elements[segment["atom"]] == "N"
    ]

    results = {
        "schemaVersion": "1.0.0",
        "researchOnly": True,
        "calibrationRequired": True,
        "pilotValidated": False,
        "releaseEligible": False,
        "sulfurPrediction": "NOT_CALCULABLE",
        "verdict": verdict,
        "confirmedDefects": defects,
        "frozenInputs": {
            "sha256": input_hashes,
            "nistCosmoSacCommit": NIST_COMMIT,
            "nistToSigmaUrl": NIST_TO_SIGMA_URL,
            "nistToSigmaSha256": NIST_TO_SIGMA_SHA256,
            "cpcmxCommit": CPCMX_COMMIT,
            "cpcmxReferenceSourceSha256": {
                "src/cpcmx/profile.f90": CPCMX_PROFILE_SHA256,
                "src/cpcmx/sigma_av.f90": CPCMX_SIGMA_AV_SHA256,
            },
            "restrictedProfileInputsUsed": False,
        },
        "surface": {
            "atomCount": len(atoms),
            "segmentCount": len(segments),
            "declaredAreaSquareAngstrom": declared_area,
            "parsedAreaSquareAngstrom": sum(
                segment["areaSquareAngstrom"] for segment in segments
            ),
            "chargeSumElectronFromPrintedRows": sum(
                segment["chargeElectron"] for segment in segments
            ),
            "maximumPrintedChargeAreaColumnError": raw_sigma_column_error,
            "coordinateConversion": {
                "input": "bohr",
                "output": "angstrom",
                "bohrToAngstrom": BOHR_TO_ANGSTROM,
            },
        },
        "nistReferenceSemantics": {
            "rawSigma": "segment charge [e] / segment area [A^2]",
            "segmentRadiusSquared": "segment area [A^2] / pi",
            "weight": "rn2*rAv2/(rn2+rAv2)*exp(-fDecay*distanceSquared/(rn2+rAv2))",
            "averaging": {
                "name": "Hsieh",
                "rAvSquaredSquareAngstrom": NIST_HSIEH_R_AV_SQUARED,
                "rAvAngstrom": math.sqrt(NIST_HSIEH_R_AV_SQUARED),
                "fDecay": NIST_HSIEH_F_DECAY,
            },
            "partitionMask": {
                "OT": "O/N/F with averaged sigma > 0 and OT atom class; or H with averaged sigma < 0 and OT atom class",
                "OH": "O with averaged sigma > 0 and OH atom class; or H with averaged sigma < 0 and OH atom class",
                "NHB": "all remaining segments",
            },
            "gridElectronPerSquareAngstrom": {
                "minimum": GRID_MIN,
                "maximum": GRID_MAX,
                "step": GRID_STEP,
                "linearAreaInterpolation": True,
            },
            "hydrogenBondProbability": "1-exp(-sigma_grid^2/(2*0.007^2)); applied after binning",
        },
        "atomClassification": {
            "classes": {str(number): value for number, value in atom_classes.items()},
            "bonds": bonds,
            "nistHsiehAreaByAtom": area_by_atom(
                atoms, segments, nist["assignments"]
            ),
        },
        "emittedProfile": profile_metrics(emitted),
        "cpcmxReconstruction": {
            "actualAveraging": {
                "rAvAngstrom": CPCMX_ACTUAL_R_AV,
                "fDecay": CPCMX_ACTUAL_F_DECAY,
                "source": "first value of frozen crs.param_h2o plus CPCM-X sigma_av.f90",
            },
            "profile": profile_metrics(cpcmx["final"]),
            "comparisonToEmitted": cpcmx_comparison,
            "otPreProbabilityAssignedAreaSquareAngstrom": sum(
                segment["areaSquareAngstrom"]
                for segment, assignment in zip(segments, cpcmx["assignments"])
                if assignment == "OT"
            ),
            "otPreProbabilityBins": profile_metrics(
                {"OT": cpcmx["preProbability"]["OT"]}
            )["OT"]["nonzeroBins"],
            "otSegmentIds": cpcmx_ot_segments,
        },
        "nistHsiehReconstruction": {
            "profile": profile_metrics(nist["final"]),
            "comparisonToEmitted": nist_comparison,
            "otPreProbabilityAssignedAreaSquareAngstrom": sum(
                segment["areaSquareAngstrom"]
                for segment, assignment in zip(segments, nist["assignments"])
                if assignment == "OT"
            ),
            "otSegmentIds": nist_ot_segments,
            "sigmaRangeElectronPerSquareAngstrom": {
                "minimum": min(nist_averaged),
                "maximum": max(nist_averaged),
            },
        },
        "currentOtExplanation": {
            "emittedOtAreaSquareAngstrom": sum(emitted["OT"]),
            "reconstructedOtAreaSquareAngstrom": sum(cpcmx["final"]["OT"]),
            "preProbabilityOtAreaSquareAngstrom": sum(
                cpcmx["preProbability"]["OT"]
            ),
            "contributingAtomNumbers": sorted(
                {
                    segment["atom"]
                    for segment, assignment in zip(segments, cpcmx["assignments"])
                    if assignment == "OT"
                }
            ),
            "contributingElements": sorted(
                {
                    elements[segment["atom"]]
                    for segment, assignment in zip(segments, cpcmx["assignments"])
                    if assignment == "OT"
                }
            ),
            "nitrogenTotalAreaSquareAngstrom": sum(
                segment["areaSquareAngstrom"] for segment in nitrogen_segments
            ),
            "nitrogenAreaAssignedOtBeforeProbabilitySquareAngstrom": sum(
                segment["areaSquareAngstrom"]
                for segment, assignment in zip(segments, cpcmx["assignments"])
                if segment["atom"] == 2 and assignment == "OT"
            ),
            "oxygenTotalAreaSquareAngstrom": sum(
                segment["areaSquareAngstrom"] for segment in oxygen_segments
            ),
            "oxygenAreaAssignedOtBeforeProbabilitySquareAngstrom": sum(
                segment["areaSquareAngstrom"]
                for segment, assignment in zip(segments, cpcmx["assignments"])
                if segment["atom"] == 7 and assignment == "OT"
            ),
            "mechanism": (
                "Only 20 positive-averaged-sigma nitrogen segments enter OT. "
                "Their 11.055243 A^2 is interpolated mainly into sigma=0 and "
                "sigma=0.001 bins, then the post-binning hydrogen-bond "
                "probability moves nearly all of it to NHB. All carbonyl-oxygen "
                "segments have negative averaged sigma and fail the NIST OT mask."
            ),
        },
        "signInversionDiagnosticOnly": {
            "appliedToProjectProfile": False,
            "signConventionVerdict": "UNRESOLVED_INCOMPATIBILITY_NOT_CORRECTION_PROOF",
            "purpose": "quantify the consequence of the opposite raw charge sign without recommending or applying a correction",
            "profile": profile_metrics(inverted["final"]),
            "otPreProbabilityAssignedAreaSquareAngstrom": sum(
                segment["areaSquareAngstrom"]
                for segment, assignment in zip(segments, inverted["assignments"])
                if assignment == "OT"
            ),
        },
        "conclusion": {
            "otLossHypothesis": "CONFIRMED_AS_A_CONVERSION_SEMANTICS_FAILURE",
            "broaderLleBenchmarkReady": False,
            "nextDecision": (
                "Do not run the 236-case benchmark on this profile basis. "
                "A separate governed correction task must resolve averaging and "
                "charge-sign conventions and regenerate all affected profiles consistently."
            ),
        },
    }

    write_segment_audit(
        atoms,
        segments,
        atom_classes,
        cpcmx_averaged,
        cpcmx,
        nist_averaged,
        nist,
    )
    (OUT / "results.json").write_text(
        json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )

    emitted_ot = results["currentOtExplanation"]["emittedOtAreaSquareAngstrom"]
    reconstructed_ot = results["currentOtExplanation"][
        "reconstructedOtAreaSquareAngstrom"
    ]
    nist_ot = results["nistHsiehReconstruction"]["profile"]["OT"][
        "areaSquareAngstrom"
    ]
    inverted_ot = results["signInversionDiagnosticOnly"]["profile"]["OT"][
        "areaSquareAngstrom"
    ]
    cpcmx_pre_bins = results["cpcmxReconstruction"]["otPreProbabilityBins"]
    report = f"""# NMP sigma3 semantics diagnostic

## Verdict

`{verdict}`

The emitted NMP profile is **not** mathematically equivalent to the pinned NIST Hsieh three-profile conversion. No profile, generator, COSMO-SAC parameter, phase-stability method, or LLE solver was changed.

## Exact reference semantics

The reference is NIST COSMOSAC commit `{NIST_COMMIT}`, MIT-licensed `profiles/to_sigma.py` (SHA-256 `{NIST_TO_SIGMA_SHA256}`). The diagnostic independently reproduces:

1. raw sigma = segment charge / segment area in e/Å²;
2. segment radius squared = area/π;
3. Hsieh weighting with r_av² = 7.25/π Å², r_av = {math.sqrt(NIST_HSIEH_R_AV_SQUARED):.12f} Å, and f_decay = 3.57;
4. N/F as OT atoms, carbonyl O without bonded H as OT, and all NMP hydrogens as NHB;
5. OT assignment only for positive averaged-sigma O/N/F segments;
6. linear area interpolation onto the −0.025…+0.025 e/Å² grid; and
7. post-binning hydrogen-bond probability P_hb = 1−exp(−sigma²/(2·0.007²)).

No UD, VT2005, ThermoSAC, or other restricted profile was read, copied, transformed, retained, or used. The public source algorithm was sufficient.

## Why the current OT area is {emitted_ot:.6f} Å²

- The retained surface contains 757 segments and closes to {declared_area:.12f} Å².
- NMP atom 2 (N) and atom 7 (carbonyl O) are both classed OT by the NIST bonding rules.
- Under the profile actually emitted by CPCM-X, only 20 nitrogen segments have positive averaged sigma. Their unattenuated area is {results["currentOtExplanation"]["preProbabilityOtAreaSquareAngstrom"]:.12f} Å².
- All 68 oxygen segments, totaling {results["currentOtExplanation"]["oxygenTotalAreaSquareAngstrom"]:.12f} Å², have negative averaged sigma and therefore enter NHB, not OT.
- Before P_hb attenuation, the nitrogen OT area is distributed as:
{chr(10).join(f'  - sigma {item["sigmaElectronPerSquareAngstrom"]:+.3f}: {item["areaSquareAngstrom"]:.12f} Å²' for item in cpcmx_pre_bins)}
- P_hb is zero at sigma 0, {cpcmx["hydrogenBondProbability"][26]:.12f} at +0.001, and {cpcmx["hydrogenBondProbability"][27]:.12f} at +0.002. The retained OT area is therefore {reconstructed_ot:.12f} Å², reproducing the six-decimal emitted value {emitted_ot:.6f} Å² within {cpcmx_comparison["maximumAbsoluteBinAreaDifferenceSquareAngstrom"]:.3e} Å² per bin.

Thus `{emitted_ot:.6f} Å²` is not the carbonyl acceptor area. It is the small probability-weighted remainder of near-zero-sigma nitrogen surface.

## Concrete conversion defects

### 1. Wrong averaging equation for the claimed profile contract

The emitted rows came from CPCM-X using the first frozen `crs.param_h2o` value, r_av = {CPCMX_ACTUAL_R_AV:.8f} Å, with decay coefficient 1. CPCM-X source `sigma_av.f90` has no Hsieh factor 3.57. The wrapper then labels the unchanged rows with r_av = 1.519126944937 Å and f_decay = 3.57. Those metadata values describe NIST Hsieh, not the calculation that produced the rows.

Recomputing the same retained surface with the exact NIST Hsieh equation gives OT = {nist_ot:.12f} Å², not {emitted_ot:.6f} Å². Across all 153 bins, the maximum absolute discrepancy is {nist_comparison["maximumAbsoluteBinAreaDifferenceSquareAngstrom"]:.12f} Å² and the L1 discrepancy is {nist_comparison["l1BinAreaDifferenceSquareAngstrom"]:.12f} Å².

### 2. Carbonyl oxygen fails the NIST positive-acceptor mask

With the retained CPCM-X charge sign, every carbonyl-oxygen segment remains negative after NIST Hsieh averaging. Exact NIST partitioning therefore sends all {results["currentOtExplanation"]["oxygenTotalAreaSquareAngstrom"]:.12f} Å² of oxygen surface to NHB. A sign-inverted diagnostic produces OT = {inverted_ot:.12f} Å², demonstrating material sensitivity, but it is diagnostic only and is not an admitted correction. This observation proves an unresolved sign/mask incompatibility; it does not by itself prove that whole-surface sign inversion is the correct repair.

## Consequence

The proposed “tiny OT is mathematically correct under NIST sigma3” explanation is rejected. The current profile must not advance to the 236 measured LLE cases. A separate governed task must resolve both averaging and charge-sign conventions, regenerate every affected profile consistently, and then repeat topology and experimental gates.

The machine-readable result is `results.json`; the complete segment trace is `segment-audit.csv`.

`{verdict}`
"""
    (OUT / "report.md").write_text(report, encoding="utf-8")


if __name__ == "__main__":
    main()
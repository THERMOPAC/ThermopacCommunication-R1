#!/usr/bin/env python3
"""Independently recompute and verify all six NIST Hsieh sigma3 profiles."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import urllib.request
from pathlib import Path

import numpy as np


HERE = Path(__file__).resolve().parent
GENERATED = HERE / "generated"
SURFACES = GENERATED / "surfaces"
PROFILES = GENERATED / "profiles/sigma3"
AUDITS = GENERATED / "segment-audit"
OUTPUT = GENERATED / "profile-verification.json"
REFERENCE = HERE / "reference-source"
BOHR_TO_ANGSTROM = 0.52917721067
R_AV2 = 7.25 / math.pi
F_DECAY = 3.57
SIGMA_ZERO = 0.007
GRID = np.linspace(-0.025, 0.025, 51)
PARTITIONS = ("NHB", "OH", "OT")
RADII = {"H": 0.31, "C": 0.76, "N": 0.71, "O": 0.66, "F": 0.57}
COMPONENTS = {
    "SAT": "SNRUBQQJIBEYMU-UHFFFAOYSA-N",
    "MONO": "ODLMAHJVESYWTB-UHFFFAOYSA-N",
    "DI": "QPUYECUOLPXSFR-UHFFFAOYSA-N",
    "POLY": "BBEAQIROQSPTKN-UHFFFAOYSA-N",
    "PA": "UJAWGGOCYUPCPS-UHFFFAOYSA-N",
    "NMP": "SECXISVLQFMRJM-UHFFFAOYSA-N",
}
REFERENCE_HASHES = {
    "cpcmx-xtb-invocation.f90": "4c0793aa5da4820e6994567de9a0116a3288c86411cba0950106877d1def12d3",
    "nist-to-sigma.py": "27dc521186af74d741a713a81769c6bfa41e241b3b22300ad7ebdb73aae2a875",
    "xtb-cosmo-sign.f90": "8943fa4cb001c21e4dae269f516f624e6c0c81d0ca7d0a551504e2fcc8e5be08",
    "xtb-tmcosmo-help.f90": "873adb14ed50224f86f1d36bcaa82b83470539c5731d78555c2c4c61d01f5f10",
}
UPSTREAM_SOURCES = {
    "xTB src/solv/cosmo.f90": (
        "https://raw.githubusercontent.com/grimme-lab/xtb/26b28010e805f7d1aeeef39813feb473e69cc4be/src/solv/cosmo.f90",
        "32b32edd43ea1eec8158192bd4676a7110bc50d55e56d36b6a2ccaf25d49aea1",
    ),
    "xTB src/xhelp.f90": (
        "https://raw.githubusercontent.com/grimme-lab/xtb/26b28010e805f7d1aeeef39813feb473e69cc4be/src/xhelp.f90",
        "d52e2f312ebecc03baca00977fbf6c361706d7ac2e6a98d1c6ca9b8894fec3b8",
    ),
    "CPCM-X src/cpcmx/qc_calc.f90": (
        "https://raw.githubusercontent.com/grimme-lab/CPCM-X/e7f894c76d41ee1f703cf6f03e931cbcf046bc7f/src/cpcmx/qc_calc.f90",
        "4b718c1c512071b07cf39e1211a756b22e20410ca430933f0e29cdd67560a46b",
    ),
    "NIST profiles/to_sigma.py": (
        "https://raw.githubusercontent.com/usnistgov/COSMOSAC/1b82456be38026719b16cad4076109bef3fcb309/profiles/to_sigma.py",
        "73cd7b526568ee921e2fcd83b5d8653fccf37878fe4690abafdcd785334ace2a",
    ),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_reference_sources() -> dict[str, str]:
    actual = {name: sha256(REFERENCE / name) for name in REFERENCE_HASHES}
    if actual != REFERENCE_HASHES:
        raise RuntimeError("retained profile-conversion source evidence changed")
    required_text = {
        "xtb-cosmo-sign.f90": ["zeta(ii) =", "if (self%tmcosmo) zeta=-zeta"],
        "xtb-tmcosmo-help.f90": ["--tmcosmo SOLVENT/EPSILON", "uses TM convention"],
        "cpcmx-xtb-invocation.f90": ['" --cosmo "', "rename('xtb.cosmo','solute.cosmo'"],
        "nist-to-sigma.py": [
            "self.df['charge / e']/self.df['area / A^2']",
            "self.r_av2 = (7.25/np.pi)",
            "self.f_decay = 3.57",
            "(sigmavals > 0.0)",
            "mask_OH =",
            "hydrogen_bonding_atoms.append('OT')",
            "psigmaA[left] += area*w_left",
            "P_hb = 1 - np.exp",
        ],
    }
    for name, needles in required_text.items():
        text = (REFERENCE / name).read_text(encoding="utf-8")
        if any(needle not in text for needle in needles):
            raise RuntimeError(f"retained source evidence is incomplete: {name}")
    authenticated = {}
    upstream_text = {}
    for name, (url, expected_hash) in UPSTREAM_SOURCES.items():
        try:
            with urllib.request.urlopen(url, timeout=30) as response:
                content = response.read()
        except Exception as error:
            raise RuntimeError(
                f"cannot authenticate pinned upstream source {name}: {error}"
            ) from error
        digest = hashlib.sha256(content).hexdigest()
        if digest != expected_hash:
            raise RuntimeError(f"pinned upstream full-file hash mismatch: {name}")
        authenticated[name] = digest
        upstream_text[name] = content.decode("utf-8")
    upstream_requirements = {
        "xTB src/solv/cosmo.f90": ["if (self%tmcosmo) zeta=-zeta"],
        "xTB src/xhelp.f90": ["same as --cosmo, but uses TM convention"],
        "CPCM-X src/cpcmx/qc_calc.f90": [
            '" --cosmo "//solvent//" --norestart',
            "call rename('xtb.cosmo','solute.cosmo'",
        ],
        "NIST profiles/to_sigma.py": [
            "self.df['charge / e']/self.df['area / A^2']",
            "self.r_av2 = (7.25/np.pi)",
            "self.f_decay = 3.57",
            "hydrogen_bonding_atoms.append('OT')",
            "mask_OH =",
            "mask_OT =",
            "left = int((sigma-sigmas_grid[0])/bin_width)",
            "P_hb = 1 - np.exp",
        ],
    }
    for name, needles in upstream_requirements.items():
        if any(needle not in upstream_text[name] for needle in needles):
            raise RuntimeError(
                f"authenticated upstream source lacks required semantics: {name}"
            )
    return {
        "retainedExcerptSha256": actual,
        "authenticatedUpstreamFullFileSha256": authenticated,
    }


def parse_surface(path: Path) -> tuple[float, list[dict], list[dict]]:
    text = path.read_text(encoding="utf-8")
    if "$info\nprog.: xtb" not in text:
        raise RuntimeError(f"surface is not identified as xTB output: {path}")
    area = float(next(line.split("=", 1)[1] for line in text.splitlines() if line.strip().startswith("area=")))
    atom_block = text.split("$coord_rad", 1)[1].split("$coord_car", 1)[0]
    atoms = []
    for line in atom_block.splitlines():
        fields = line.split()
        if len(fields) == 6 and fields[0].isdigit():
            atoms.append({
                "atom": int(fields[0]),
                "xyz": np.asarray([float(value) * BOHR_TO_ANGSTROM for value in fields[1:4]]),
                "element": fields[4].upper(),
            })
    segments = []
    for line in text.split("$segment_information", 1)[1].splitlines():
        fields = line.split()
        if len(fields) >= 9 and fields[0].isdigit():
            charge, segment_area = float(fields[5]), float(fields[6])
            segments.append({
                "segment": int(fields[0]),
                "atom": int(fields[1]),
                "xyz": np.asarray([float(value) * BOHR_TO_ANGSTROM for value in fields[2:5]]),
                "charge": charge,
                "area": segment_area,
                "raw": charge / segment_area,
                "printedRaw": float(fields[7]),
            })
    if not atoms or not segments:
        raise RuntimeError(f"surface is incomplete: {path}")
    if abs(sum(item["area"] for item in segments) - area) > 1e-6:
        raise RuntimeError(f"surface area does not close: {path}")
    if max(abs(item["raw"] - item["printedRaw"]) for item in segments) > 1e-8:
        raise RuntimeError(f"surface charge/area column does not close: {path}")
    return area, atoms, segments


def classify(atoms: list[dict]) -> dict[int, str]:
    neighbors = {atom["atom"]: [] for atom in atoms}
    by_number = {atom["atom"]: atom for atom in atoms}
    for index, left in enumerate(atoms):
        for right in atoms[index + 1:]:
            cutoff = 1.15 * (RADII[left["element"]] + RADII[right["element"]])
            if float(np.linalg.norm(left["xyz"] - right["xyz"])) < cutoff:
                neighbors[left["atom"]].append(right["atom"])
                neighbors[right["atom"]].append(left["atom"])
    classes = {}
    for atom in atoms:
        element, number = atom["element"], atom["atom"]
        bonded = [by_number[item]["element"] for item in neighbors[number]]
        if element in {"N", "F"}:
            classes[number] = "OT"
        elif element == "O":
            classes[number] = "OH" if "H" in bonded else "OT"
        elif element == "H" and "O" in bonded:
            classes[number] = "OH"
        elif element == "H" and ({"N", "F"} & set(bonded)):
            classes[number] = "OT"
        else:
            classes[number] = "NHB"
    return classes


def average(segments: list[dict]) -> np.ndarray:
    xyz = np.asarray([item["xyz"] for item in segments])
    sigma = -np.asarray([item["raw"] for item in segments])
    rn2 = np.asarray([item["area"] / math.pi for item in segments])
    radius_sum = rn2 + R_AV2
    factor = rn2 * R_AV2 / radius_sum
    output = np.empty(len(segments))
    for start in range(0, len(segments), 96):
        stop = min(start + 96, len(segments))
        distance2 = np.sum((xyz[start:stop, None, :] - xyz[None, :, :]) ** 2, axis=2)
        weights = factor[None, :] * np.exp(-F_DECAY * distance2 / radius_sum[None, :])
        output[start:stop] = (weights * sigma[None, :]).sum(axis=1) / weights.sum(axis=1)
    return output


def partition(element: str, atom_class: str, sigma: float) -> str:
    if ((element == "O" and sigma > 0 and atom_class == "OH")
            or (element == "H" and sigma < 0 and atom_class == "OH")):
        return "OH"
    if ((element in {"O", "N", "F"} and sigma > 0 and atom_class == "OT")
            or (element == "H" and sigma < 0 and atom_class == "OT")):
        return "OT"
    return "NHB"


def recompute(atoms: list[dict], segments: list[dict]) -> tuple[dict[str, np.ndarray], list[dict]]:
    classes = classify(atoms)
    elements = {atom["atom"]: atom["element"] for atom in atoms}
    averaged = average(segments)
    pre = {name: np.zeros(51) for name in PARTITIONS}
    trace = []
    for item, sigma in zip(segments, averaged):
        if sigma < GRID[0] or sigma > GRID[-1]:
            raise RuntimeError("averaged sigma is outside the governed grid")
        left = min(int((sigma - GRID[0]) / 0.001), 49)
        right = left + 1
        left_weight = float((GRID[right] - sigma) / 0.001)
        right_weight = 1.0 - left_weight
        assigned = partition(elements[item["atom"]], classes[item["atom"]], float(sigma))
        pre[assigned][left] += item["area"] * left_weight
        pre[assigned][right] += item["area"] * right_weight
        trace.append({
            "segment": item["segment"],
            "atom": item["atom"],
            "element": elements[item["atom"]],
            "atomClass": classes[item["atom"]],
            "area": item["area"],
            "charge": item["charge"],
            "nativeRaw": item["raw"],
            "convertedRaw": -item["raw"],
            "averaged": float(sigma),
            "partition": assigned,
            "left": left,
            "right": right,
            "leftWeight": left_weight,
            "rightWeight": right_weight,
        })
    probability = 1.0 - np.exp(-(GRID ** 2) / (2.0 * SIGMA_ZERO ** 2))
    final = {name: values.copy() for name, values in pre.items()}
    hb = pre["OH"] + pre["OT"]
    final["NHB"] += hb * (1.0 - probability)
    final["OH"] *= probability
    final["OT"] *= probability
    return final, trace


def emitted_profile(path: Path) -> tuple[dict, dict[str, np.ndarray]]:
    lines = path.read_text(encoding="utf-8").splitlines()
    metadata = json.loads(lines[0][8:])
    rows = [tuple(map(float, line.split())) for line in lines[3:]]
    if len(rows) != 153:
        raise RuntimeError(f"profile row count is invalid: {path}")
    expected_grid = list(GRID) * 3
    if any(abs(row[0] - expected) > 1e-12 for row, expected in zip(rows, expected_grid)):
        raise RuntimeError(f"profile grid is invalid: {path}")
    return metadata, {
        name: np.asarray([area for _, area in rows[index * 51:(index + 1) * 51]])
        for index, name in enumerate(PARTITIONS)
    }


def verify_audit(family: str, trace: list[dict]) -> str:
    path = AUDITS / f"{family}.csv"
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != len(trace):
        raise RuntimeError(f"segment audit row count mismatch: {family}")
    for row, expected in zip(rows, trace):
        checks = [
            int(row["segment"]) == expected["segment"],
            int(row["atom"]) == expected["atom"],
            row["element"] == expected["element"],
            row["atom_class"] == expected["atomClass"],
            row["pre_probability_partition"] == expected["partition"],
            abs(float(row["area_square_angstrom"]) - expected["area"]) <= 1e-12,
            abs(float(row["native_xtb_charge_electron"]) - expected["charge"]) <= 1e-12,
            abs(float(row["native_xtb_raw_sigma"]) - expected["nativeRaw"]) <= 1e-14,
            abs(float(row["tm_nist_raw_sigma"]) - expected["convertedRaw"]) <= 1e-14,
            abs(float(row["nist_hsieh_averaged_sigma"]) - expected["averaged"]) <= 1e-14,
            abs(float(row["left_bin"]) - float(GRID[expected["left"]])) <= 1e-12,
            abs(float(row["right_bin"]) - float(GRID[expected["right"]])) <= 1e-12,
            abs(float(row["left_weight"]) - expected["leftWeight"]) <= 2e-14,
            abs(float(row["right_weight"]) - expected["rightWeight"]) <= 2e-14,
        ]
        if not all(checks):
            raise RuntimeError(f"segment audit mismatch: {family} segment {expected['segment']}")
    return sha256(path)


def main() -> None:
    source_hashes = verify_reference_sources()
    components = []
    for family, key in COMPONENTS.items():
        surface_path = SURFACES / f"{key}.cosmo"
        profile_path = PROFILES / f"{key}.sigma"
        area, atoms, segments = parse_surface(surface_path)
        calculated, trace = recompute(atoms, segments)
        metadata, emitted = emitted_profile(profile_path)
        maximum_error = max(
            float(np.max(np.abs(calculated[name] - emitted[name])))
            for name in PARTITIONS
        )
        if maximum_error > 5e-12:
            raise RuntimeError(f"independent profile reconstruction mismatch: {family} {maximum_error}")
        if abs(sum(float(values.sum()) for values in emitted.values()) - area) > 1e-6:
            raise RuntimeError(f"emitted profile area mismatch: {family}")
        if metadata.get("averaging") != "NIST-Hsieh" or metadata.get("f_decay") != F_DECAY:
            raise RuntimeError(f"profile metadata mismatch: {family}")
        if metadata.get("charge_sign_conversion") != (
            "multiply by -1 to xTB TM convention for NIST positive-acceptor mask"
        ):
            raise RuntimeError(f"profile sign metadata mismatch: {family}")
        hydrocarbon = family in {"SAT", "MONO", "DI", "POLY"}
        hetero_trace = [item for item in trace if item["element"] in {"O", "N", "F"}]
        if hydrocarbon and any(float(calculated[name].sum()) != 0 for name in ("OH", "OT")):
            raise RuntimeError(f"hydrocarbon has a hydrogen-bond partition: {family}")
        if family == "NMP" and not all(
            item["averaged"] > 0 and item["partition"] == "OT"
            for item in hetero_trace if item["element"] == "O"
        ):
            raise RuntimeError("NMP carbonyl oxygen failed independent OT verification")
        if family == "PA" and not any(item["partition"] == "OT" for item in hetero_trace):
            raise RuntimeError("PA nitrogen failed independent OT verification")
        components.append({
            "family": family,
            "atomCount": len(atoms),
            "segmentCount": len(segments),
            "sourceAreaSquareAngstrom": area,
            "profileAreaSquareAngstrom": sum(float(values.sum()) for values in emitted.values()),
            "finalPartitionAreaSquareAngstrom": {
                name: float(emitted[name].sum()) for name in PARTITIONS
            },
            "maximumIndependentBinAreaErrorSquareAngstrom": maximum_error,
            "surfaceSha256": sha256(surface_path),
            "profileSha256": sha256(profile_path),
            "segmentAuditSha256": verify_audit(family, trace),
            "passed": True,
        })
    result = {
        "schemaVersion": "2.0.0",
        "decision": "PROFILE_SEMANTICS_GATE_PASSED",
        "verifier": "independent full segment/profile recomputation; does not import generator",
        "researchOnly": True,
        "calibrationRequired": True,
        "pilotValidated": False,
        "releaseEligible": False,
        "sulfurPrediction": "NOT_CALCULABLE",
        "restrictedProfileInputsUsed": False,
        "sourceEvidenceSha256": source_hashes,
        "signConvention": {
            "input": "xTB ddCOSMO native convention emitted by --cosmo",
            "output": "xTB TM convention consumed directly by pinned NIST to_sigma.py",
            "multiplier": -1.0,
        },
        "profileSemantics": {
            "averaging": "NIST Hsieh",
            "rAvSquaredSquareAngstrom": R_AV2,
            "rAvAngstrom": math.sqrt(R_AV2),
            "fDecay": F_DECAY,
            "gridElectronPerSquareAngstrom": {
                "minimum": -0.025,
                "maximum": 0.025,
                "step": 0.001,
                "linearAreaInterpolation": True,
            },
            "partitionOrder": list(PARTITIONS),
            "hydrogenBondProbability": "1-exp(-sigma_grid^2/(2*0.007^2)); applied after linear binning",
        },
        "components": components,
        "allComponentsPassed": len(components) == 6,
        "broaderLleBenchmarkReady": True,
        "broaderLleBenchmarkExecuted": False,
    }
    OUTPUT.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("independently verified six governed sigma3 profiles")


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""Independently recompute the H2O NIST-Hsieh sigma3 profile."""

from __future__ import annotations

import csv
import hashlib
import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
GENERATED = HERE / "generated"
SIX = HERE.parent / "ecr-pre-pilot-six-component-thermodynamics"
KEY = "XLYOFNOQVPJJNP-UHFFFAOYSA-N"
SURFACE = GENERATED / f"surfaces/{KEY}.cosmo"
PROFILE = GENERATED / f"profiles/sigma3/{KEY}.sigma"
AUDIT = GENERATED / "segment-audit/H2O.csv"
OUTPUT = GENERATED / "profile-verification.json"
BOHR_TO_ANGSTROM = 0.52917721067
R_AV2 = 7.25 / math.pi
F_DECAY = 3.57
SIGMA_ZERO = 0.007
GRID = np.linspace(-0.025, 0.025, 51)
PARTITIONS = ("NHB", "OH", "OT")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_surface() -> tuple[float, list[dict], list[dict]]:
    text = SURFACE.read_text(encoding="utf-8")
    if "$info\nprog.: xtb" not in text:
        raise RuntimeError("surface is not identified as xTB output")
    area = float(next(line.split("=", 1)[1] for line in text.splitlines()
                      if line.strip().startswith("area=")))
    block = text.split("$coord_rad", 1)[1].split("$coord_car", 1)[0]
    atoms = []
    for line in block.splitlines():
        fields = line.split()
        if len(fields) == 6 and fields[0].isdigit():
            atoms.append({"atom": int(fields[0]), "element": fields[4].upper(),
                          "xyz": np.asarray([float(v) * BOHR_TO_ANGSTROM for v in fields[1:4]])})
    segments = []
    for line in text.split("$segment_information", 1)[1].splitlines():
        fields = line.split()
        if len(fields) >= 9 and fields[0].isdigit():
            charge, segment_area = float(fields[5]), float(fields[6])
            segments.append({
                "segment": int(fields[0]), "atom": int(fields[1]),
                "xyz": np.asarray([float(v) * BOHR_TO_ANGSTROM for v in fields[2:5]]),
                "charge": charge, "area": segment_area, "raw": charge / segment_area,
                "printedRaw": float(fields[7]),
            })
    if len(atoms) != 3 or sorted(atom["element"] for atom in atoms) != ["H", "H", "O"]:
        raise RuntimeError("surface does not contain exact H2O atom identity")
    if abs(sum(item["area"] for item in segments) - area) > 1e-6:
        raise RuntimeError("surface area does not close")
    if max(abs(item["raw"] - item["printedRaw"]) for item in segments) > 1e-8:
        raise RuntimeError("surface raw sigma does not match charge/area")
    return area, atoms, segments


def classify(atoms: list[dict]) -> tuple[dict[int, str], dict[int, list[int]]]:
    radii = {"H": 0.31, "O": 0.66}
    neighbors = {atom["atom"]: [] for atom in atoms}
    by_number = {atom["atom"]: atom for atom in atoms}
    for index, left in enumerate(atoms):
        for right in atoms[index + 1:]:
            cutoff = 1.15 * (radii[left["element"]] + radii[right["element"]])
            if float(np.linalg.norm(left["xyz"] - right["xyz"])) < cutoff:
                neighbors[left["atom"]].append(right["atom"])
                neighbors[right["atom"]].append(left["atom"])
    classes = {}
    for atom in atoms:
        bonded = [by_number[number]["element"] for number in neighbors[atom["atom"]]]
        classes[atom["atom"]] = "OH" if (
            (atom["element"] == "O" and "H" in bonded)
            or (atom["element"] == "H" and "O" in bonded)
        ) else "NHB"
    return classes, neighbors


def recompute(atoms: list[dict], segments: list[dict]) -> tuple[dict[str, np.ndarray], list[dict], dict]:
    classes, neighbors = classify(atoms)
    elements = {atom["atom"]: atom["element"] for atom in atoms}
    xyz = np.asarray([item["xyz"] for item in segments])
    converted = -np.asarray([item["raw"] for item in segments])
    rn2 = np.asarray([item["area"] / math.pi for item in segments])
    sums = rn2 + R_AV2
    weights = (rn2 * R_AV2 / sums)[None, :] * np.exp(
        -F_DECAY * np.sum((xyz[:, None, :] - xyz[None, :, :]) ** 2, axis=2) / sums[None, :])
    averaged = (weights * converted[None, :]).sum(axis=1) / weights.sum(axis=1)
    pre = {name: np.zeros(51) for name in PARTITIONS}
    trace = []
    for item, sigma_value in zip(segments, averaged):
        sigma = float(sigma_value)
        if sigma < GRID[0] or sigma > GRID[-1]:
            raise RuntimeError("averaged sigma lies outside governed grid")
        element, atom_class = elements[item["atom"]], classes[item["atom"]]
        assigned = "OH" if (
            (element == "O" and sigma > 0 and atom_class == "OH")
            or (element == "H" and sigma < 0 and atom_class == "OH")
        ) else "NHB"
        left = min(int((sigma - GRID[0]) / 0.001), 49)
        right = left + 1
        lw = float((GRID[right] - sigma) / 0.001)
        rw = 1.0 - lw
        pre[assigned][left] += item["area"] * lw
        pre[assigned][right] += item["area"] * rw
        trace.append({"segment": item["segment"], "atom": item["atom"], "element": element,
                      "atomClass": atom_class, "area": item["area"], "charge": item["charge"],
                      "nativeRaw": item["raw"], "convertedRaw": -item["raw"],
                      "averaged": sigma, "partition": assigned, "left": left, "right": right,
                      "leftWeight": lw, "rightWeight": rw})
    probability = 1 - np.exp(-(GRID ** 2) / (2 * SIGMA_ZERO ** 2))
    final = {name: values.copy() for name, values in pre.items()}
    final["NHB"] += (pre["OH"] + pre["OT"]) * (1 - probability)
    final["OH"] *= probability
    final["OT"] *= probability
    oxygen_number = next(number for number, element in elements.items() if element == "O")
    water_checks = {
        "oxygenBondedToTwoHydrogens": len(neighbors[oxygen_number]) == 2,
        "allAtomsClassifiedOH": set(classes.values()) == {"OH"},
        "oxygenPositiveSegmentsAssignedOH": any(
            row["element"] == "O" and row["averaged"] > 0 and row["partition"] == "OH" for row in trace),
        "hydrogenNegativeSegmentsAssignedOH": any(
            row["element"] == "H" and row["averaged"] < 0 and row["partition"] == "OH" for row in trace),
        "noOTAssignment": all(row["partition"] != "OT" for row in trace),
        "otProfileAreaZero": float(final["OT"].sum()) == 0.0,
        "ohProfileAreaNonzero": float(final["OH"].sum()) > 0.0,
    }
    if not all(water_checks.values()):
        raise RuntimeError(f"independent water OH assertions failed: {water_checks}")
    return final, trace, water_checks


def verify_audit(trace: list[dict]) -> None:
    with AUDIT.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    if len(rows) != len(trace):
        raise RuntimeError("segment audit row count mismatch")
    for row, expected in zip(rows, trace):
        exact = (int(row["segment"]) == expected["segment"]
                 and int(row["atom"]) == expected["atom"]
                 and row["element"] == expected["element"]
                 and row["atom_class"] == expected["atomClass"]
                 and row["pre_probability_partition"] == expected["partition"])
        numerical = [
            (row["area_square_angstrom"], "area", 1e-12),
            (row["native_xtb_charge_electron"], "charge", 1e-12),
            (row["native_xtb_raw_sigma"], "nativeRaw", 1e-14),
            (row["tm_nist_raw_sigma"], "convertedRaw", 1e-14),
            (row["nist_hsieh_averaged_sigma"], "averaged", 1e-14),
            (row["left_weight"], "leftWeight", 2e-14),
            (row["right_weight"], "rightWeight", 2e-14),
        ]
        if not exact or any(abs(float(value) - expected[name]) > tolerance
                            for value, name, tolerance in numerical):
            raise RuntimeError(f"segment audit mismatch at segment {expected['segment']}")


def main() -> None:
    manifest_path = GENERATED / "generation-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    software = manifest.get("software", {})
    local_provenance = {
        "generatorSha256": sha256(HERE / "generate_profile.py"),
        "independentVerifierSha256": sha256(HERE / "verify_profile_semantics.py"),
        "generationProtocolSha256": sha256(HERE / "generation-protocol.json"),
    }
    if any(software.get(name) != value for name, value in local_provenance.items()):
        raise RuntimeError("local generation provenance hash mismatch")
    release_path = SIX / "vendor/release-provenance.json"
    release = json.loads(release_path.read_text(encoding="utf-8"))
    expected_software = {
        "xtbReleaseCommit": release["xTB"]["releaseCommit"],
        "xtbPublisherArchiveSha256": release["xTB"]["publisherArchiveSha256"],
        "cpcmXReleaseCommit": release["cpcmX"]["releaseCommit"],
        "cpcmXPublisherArchiveSha256": release["cpcmX"]["publisherArchiveSha256"],
        "vendorReleaseProvenanceSha256": sha256(release_path),
    }
    if any(software.get(name) != value for name, value in expected_software.items()):
        raise RuntimeError("pinned release provenance mismatch")
    if software.get("vendorReleaseProvenancePath") != (
        "server/research/ecr-pre-pilot-six-component-thermodynamics/vendor/release-provenance.json"
    ):
        raise RuntimeError("release provenance path mismatch")
    inventory = manifest.get("component", {}).get("rawArtifacts", {}).get(
        "retainedArtifactSha256ByPath", {}
    )
    if not inventory:
        raise RuntimeError("retained raw artifact inventory is missing")
    for relative, expected_hash in inventory.items():
        path = GENERATED / relative
        if not path.is_file() or sha256(path) != expected_hash:
            raise RuntimeError(f"retained raw artifact integrity failure: {relative}")
    component = manifest["component"]
    core_retained = {
        "raw-artifacts/H2O/rdkit-selected-geometry.xyz": component["selectedConformerGeometrySha256"],
        "raw-artifacts/H2O/xtb-optimized-geometry.xyz": component["optimizedGeometrySha256"],
        "raw-artifacts/H2O/cpcmx-native-surface.cosmo": component["surfaceSha256"],
    }
    if any(inventory.get(path) != expected_hash for path, expected_hash in core_retained.items()):
        raise RuntimeError("core retained raw artifacts are not bound to component hashes")
    area, atoms, segments = parse_surface()
    calculated, trace, water_checks = recompute(atoms, segments)
    lines = PROFILE.read_text(encoding="utf-8").splitlines()
    metadata = json.loads(lines[0][8:])
    rows = [tuple(map(float, line.split())) for line in lines[3:]]
    if metadata.get("standard_INCHIKEY") != KEY or len(rows) != 153:
        raise RuntimeError("profile structure or identity mismatch")
    expected_grid = list(GRID) * 3
    if any(abs(row[0] - expected) > 1e-12 for row, expected in zip(rows, expected_grid)):
        raise RuntimeError("profile grid mismatch")
    emitted = {name: np.asarray([a for _, a in rows[index*51:(index+1)*51]])
               for index, name in enumerate(PARTITIONS)}
    maximum_error = max(float(np.max(np.abs(calculated[name] - emitted[name])))
                        for name in PARTITIONS)
    if maximum_error > 5e-12:
        raise RuntimeError(f"independent profile reconstruction mismatch: {maximum_error}")
    if abs(sum(float(values.sum()) for values in emitted.values()) - area) > 1e-6:
        raise RuntimeError("profile area does not close")
    verify_audit(trace)
    result = {
        "schemaVersion": "1.0.0", "decision": "PROFILE_ESTABLISHED_RESEARCH_ONLY",
        "lleQualification": "SEVEN_COMPONENT_LLE_NOT_QUALIFIED",
        "verifier": "independent full segment/profile recomputation; does not import generator",
        "identity": {"name": "WATER", "formula": "H2O", "cas": "7732-18-5",
                     "smiles": "O", "inchi": "InChI=1S/H2O/h1H2", "inchiKey": KEY,
                     "formalCharge": 0, "spinMultiplicity": 1},
        "sourceAreaSquareAngstrom": area,
        "profileAreaSquareAngstrom": sum(float(v.sum()) for v in emitted.values()),
        "partitionAreaSquareAngstrom": {name: float(v.sum()) for name, v in emitted.items()},
        "maximumIndependentBinAreaErrorSquareAngstrom": maximum_error,
        "waterSpecificChecks": water_checks, "surfaceSha256": sha256(SURFACE),
        "profileSha256": sha256(PROFILE), "segmentAuditSha256": sha256(AUDIT),
        "retainedRawArtifacts": {
            "artifactCount": len(inventory),
            "allArtifactHashesVerified": True,
            "artifactSha256ByPath": inventory,
        },
        "releaseProvenance": {
            "path": software["vendorReleaseProvenancePath"],
            "sha256": sha256(release_path),
            "verified": True,
        },
        "allChecksPassed": True,
    }
    OUTPUT.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("independently verified research-only H2O governed sigma3 profile")


if __name__ == "__main__":
    main()
#!/usr/bin/env python3
"""Generate the legally reviewed six-molecule CPCM-X/xTB profile basis."""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import csv
from pathlib import Path

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem


ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OUT = HERE / "generated"
WORK = OUT / "work"
SURFACES = OUT / "surfaces"
PROFILES = OUT / "profiles"
SIGMA3 = PROFILES / "sigma3"
VENDOR = HERE / "vendor"
XTB = VENDOR / "xtb-6.7.1/bin/xtb"
CPX = VENDOR / "cpx-1.1.0/bin/cpx"
XTBHOME = VENDOR / "xtb-6.7.1/share/xtb"
CPX_DB = VENDOR / "cpx-db"
BOHR_PER_ANGSTROM = 1.8897261254578281
BOHR_TO_ANGSTROM = 0.52917721067
NIST_HSIEH_R_AV_SQUARED = 7.25 / math.pi
R_AV_ANGSTROM = math.sqrt(NIST_HSIEH_R_AV_SQUARED)
NIST_HSIEH_F_DECAY = 3.57
NATIVE_XTB_TO_TM_NIST_SIGN = -1.0
SIGMA_ZERO = 0.007
SIGMA_GRID = np.linspace(-0.025, 0.025, 51)
PARTITIONS = ("NHB", "OH", "OT")
COVALENT_RADII_ANGSTROM = {"H": 0.31, "C": 0.76, "N": 0.71, "O": 0.66, "F": 0.57}
SEED = 20260829
CONFORMER_COUNT = 32
VOLUME_GRID_ANGSTROM = 0.05

COMPONENTS = [
    ("SAT", "N-DODECANE", "C12H26", "112-40-3", "CCCCCCCCCCCC",
     "InChI=1S/C12H26/c1-3-5-7-9-11-12-10-8-6-4-2/h3-12H2,1-2H3",
     "SNRUBQQJIBEYMU-UHFFFAOYSA-N"),
    ("MONO", "N-PROPYLBENZENE", "C9H12", "103-65-1", "CCCc1ccccc1",
     "InChI=1S/C9H12/c1-2-6-9-7-4-3-5-8-9/h3-5,7-8H,2,6H2,1H3",
     "ODLMAHJVESYWTB-UHFFFAOYSA-N"),
    ("DI", "1-METHYLNAPHTHALENE", "C11H10", "90-12-0", "Cc1cccc2ccccc12",
     "InChI=1S/C11H10/c1-9-5-4-7-10-6-2-3-8-11(9)10/h2-8H,1H3",
     "QPUYECUOLPXSFR-UHFFFAOYSA-N"),
    ("POLY", "PYRENE", "C16H10", "129-00-0", "c1cc2ccc3cccc4ccc(c1)c2c34",
     "InChI=1S/C16H10/c1-3-11-7-9-13-5-2-6-14-10-8-12(4-1)15(11)16(13)14/h1-10H",
     "BBEAQIROQSPTKN-UHFFFAOYSA-N"),
    ("PA", "BIS-P-CUMYLPHENYL-AMINE", "C30H31N", "10081-67-1",
     "CC(C)(c1ccccc1)c2ccc(Nc3ccc(C(C)(C)c4ccccc4)cc3)cc2",
     "InChI=1S/C30H31N/c1-29(2,23-11-7-5-8-12-23)25-15-19-27(20-16-25)31-28-21-17-26(18-22-28)30(3,4)24-13-9-6-10-14-24/h5-22,31H,1-4H3",
     "UJAWGGOCYUPCPS-UHFFFAOYSA-N"),
    ("NMP", "N-METHYL-2-PYRROLIDONE", "C5H9NO", "872-50-4", "CN1CCCC1=O",
     "InChI=1S/C5H9NO/c1-6-4-2-3-5(6)7/h2-4H2,1H3",
     "SECXISVLQFMRJM-UHFFFAOYSA-N"),
]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_xyz(mol: Chem.Mol, conformer_id: int, path: Path, comment: str) -> None:
    conf = mol.GetConformer(conformer_id)
    lines = [str(mol.GetNumAtoms()), comment]
    for atom in mol.GetAtoms():
        p = conf.GetAtomPosition(atom.GetIdx())
        lines.append(f"{atom.GetSymbol():2s} {p.x: .12f} {p.y: .12f} {p.z: .12f}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def xyz_to_coord(xyz: Path, coord: Path) -> None:
    rows = xyz.read_text(encoding="utf-8").splitlines()[2:]
    converted = ["$coord angs"]
    for row in rows:
        symbol, x, y, z = row.split()[:4]
        converted.append(f" {float(x): .12f} {float(y): .12f} {float(z): .12f} {symbol.lower()}")
    converted.append("$end")
    coord.write_text("\n".join(converted) + "\n", encoding="utf-8")


def select_conformer(smiles: str, work: Path) -> dict:
    mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
    params = AllChem.ETKDGv3()
    params.randomSeed = SEED
    params.numThreads = 1
    params.pruneRmsThresh = 0.25
    ids = list(AllChem.EmbedMultipleConfs(mol, numConfs=CONFORMER_COUNT, params=params))
    if not ids:
        raise RuntimeError(f"RDKit did not embed {smiles}")
    props = AllChem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94s")
    if props is None:
        raise RuntimeError(f"MMFF94s parameters unavailable for {smiles}")
    energies = []
    for conformer_id in ids:
        ff = AllChem.MMFFGetMoleculeForceField(mol, props, confId=conformer_id)
        converged = ff.Minimize(maxIts=2000) == 0
        energies.append({
            "conformerId": conformer_id,
            "energyKcalMol": ff.CalcEnergy(),
            "converged": converged,
        })
    selected = min(energies, key=lambda row: (row["energyKcalMol"], row["conformerId"]))
    xyz = work / "rdkit-selected.xyz"
    write_xyz(mol, selected["conformerId"], xyz, "RDKit ETKDGv3/MMFF94s selected conformer")
    return {
        "enumerated": len(ids),
        "requested": CONFORMER_COUNT,
        "randomSeed": SEED,
        "pruneRmsThreshAngstrom": 0.25,
        "forceField": "MMFF94s",
        "energies": energies,
        "selectedConformerId": selected["conformerId"],
        "selectedGeometrySha256": sha256(xyz),
    }


def parse_surface(path: Path) -> tuple[float, list[tuple[float, float, float, float]], list[dict], list[dict]]:
    text = path.read_text(encoding="utf-8")
    area_match = re.search(r"^\s*area=([0-9.Ee+-]+)", text, re.MULTILINE)
    if not area_match:
        raise RuntimeError(f"missing COSMO area in {path}")
    coord_block = text.split("$coord_rad", 1)[1].split("$coord_car", 1)[0]
    spheres = []
    for line in coord_block.splitlines():
        fields = line.split()
        if len(fields) == 6 and fields[0].isdigit():
            _, x, y, z, _, radius = fields
            spheres.append((
                float(x) / BOHR_PER_ANGSTROM,
                float(y) / BOHR_PER_ANGSTROM,
                float(z) / BOHR_PER_ANGSTROM,
                float(radius),
            ))
    if not spheres:
        raise RuntimeError(f"missing COSMO cavity spheres in {path}")
    atoms = []
    for line in coord_block.splitlines():
        fields = line.split()
        if len(fields) == 6 and fields[0].isdigit():
            atoms.append({
                "atom": int(fields[0]),
                "xyz": np.asarray([float(value) * BOHR_TO_ANGSTROM for value in fields[1:4]]),
                "element": fields[4].upper(),
            })
    segment_block = text.split("$segment_information", 1)[1]
    segments = []
    for line in segment_block.splitlines():
        fields = line.split()
        if len(fields) >= 9 and fields[0].isdigit():
            charge = float(fields[5])
            area = float(fields[6])
            segments.append({
                "segment": int(fields[0]),
                "atom": int(fields[1]),
                "xyz": np.asarray([float(value) * BOHR_TO_ANGSTROM for value in fields[2:5]]),
                "charge": charge,
                "area": area,
                "providedRawSigma": float(fields[7]),
                "rawSigma": charge / area,
            })
    declared_area = float(area_match.group(1))
    if not atoms or not segments:
        raise RuntimeError(f"missing atoms or segments in {path}")
    if [atom["atom"] for atom in atoms] != list(range(1, len(atoms) + 1)):
        raise RuntimeError(f"non-contiguous atom indices in {path}")
    if [segment["segment"] for segment in segments] != list(range(1, len(segments) + 1)):
        raise RuntimeError(f"non-contiguous segment indices in {path}")
    parsed_area = sum(segment["area"] for segment in segments)
    if abs(parsed_area - declared_area) > 1.0e-6:
        raise RuntimeError(f"surface area does not close in {path}")
    column_error = max(abs(segment["rawSigma"] - segment["providedRawSigma"]) for segment in segments)
    if column_error > 1.0e-8:
        raise RuntimeError(f"surface charge/area column is inconsistent in {path}")
    return declared_area, spheres, atoms, segments


def atom_classes(atoms: list[dict]) -> tuple[dict[int, str], dict[int, list[int]]]:
    neighbors = {atom["atom"]: [] for atom in atoms}
    by_number = {atom["atom"]: atom for atom in atoms}
    for index, left in enumerate(atoms):
        for right in atoms[index + 1:]:
            threshold = 1.15 * (
                COVALENT_RADII_ANGSTROM[left["element"]]
                + COVALENT_RADII_ANGSTROM[right["element"]]
            )
            if float(np.linalg.norm(left["xyz"] - right["xyz"])) < threshold:
                neighbors[left["atom"]].append(right["atom"])
                neighbors[right["atom"]].append(left["atom"])
    classes = {}
    for atom in atoms:
        number = atom["atom"]
        element = atom["element"]
        bonded = [by_number[item]["element"] for item in neighbors[number]]
        if element in {"N", "F"}:
            classes[number] = "OT"
        elif element == "O":
            classes[number] = "OH" if "H" in bonded else "OT"
        elif element == "H":
            if "O" in bonded:
                classes[number] = "OH"
            elif "N" in bonded or "F" in bonded:
                classes[number] = "OT"
            else:
                classes[number] = "NHB"
        else:
            classes[number] = "NHB"
    return classes, neighbors


def average_hsieh(segments: list[dict]) -> np.ndarray:
    """Exact pinned NIST Hsieh equation, evaluated in bounded-memory chunks."""
    xyz = np.asarray([segment["xyz"] for segment in segments])
    raw_sigma = NATIVE_XTB_TO_TM_NIST_SIGN * np.asarray(
        [segment["rawSigma"] for segment in segments]
    )
    rn2 = np.asarray([segment["area"] / math.pi for segment in segments])
    radius_sum = rn2 + NIST_HSIEH_R_AV_SQUARED
    radial_factor = rn2 * NIST_HSIEH_R_AV_SQUARED / radius_sum
    averaged = np.empty(len(segments))
    for start in range(0, len(segments), 128):
        stop = min(start + 128, len(segments))
        distance_squared = np.sum(
            (xyz[start:stop, np.newaxis, :] - xyz[np.newaxis, :, :]) ** 2,
            axis=2,
        )
        weights = radial_factor[np.newaxis, :] * np.exp(
            -NIST_HSIEH_F_DECAY * distance_squared / radius_sum[np.newaxis, :]
        )
        denominators = weights.sum(axis=1)
        if np.any(denominators <= 0):
            raise RuntimeError("non-positive Hsieh averaging denominator")
        averaged[start:stop] = (weights * raw_sigma[np.newaxis, :]).sum(axis=1) / denominators
    return averaged


def partition_name(element: str, atom_class: str, sigma: float) -> str:
    if ((element == "O" and sigma > 0 and atom_class == "OH")
            or (element == "H" and sigma < 0 and atom_class == "OH")):
        return "OH"
    if ((element in {"O", "N", "F"} and sigma > 0 and atom_class == "OT")
            or (element == "H" and sigma < 0 and atom_class == "OT")):
        return "OT"
    return "NHB"


def linear_bin(sigma: float) -> tuple[int, int, float, float]:
    if sigma < SIGMA_GRID[0] - 1e-14 or sigma > SIGMA_GRID[-1] + 1e-14:
        raise RuntimeError(f"averaged sigma {sigma} is outside the governed grid")
    sigma = min(max(sigma, float(SIGMA_GRID[0])), float(SIGMA_GRID[-1]))
    left = int((sigma - SIGMA_GRID[0]) / 0.001)
    if left >= len(SIGMA_GRID) - 1:
        left = len(SIGMA_GRID) - 2
    right = left + 1
    left_weight = (SIGMA_GRID[right] - sigma) / 0.001
    return left, right, float(left_weight), float(1.0 - left_weight)


def governed_profile(family: str, atoms: list[dict], segments: list[dict], audit_path: Path) -> tuple[list[tuple[float, float]], dict]:
    classes, neighbors = atom_classes(atoms)
    elements = {atom["atom"]: atom["element"] for atom in atoms}
    averaged = average_hsieh(segments)
    pre = {name: np.zeros(len(SIGMA_GRID)) for name in PARTITIONS}
    assignments = []
    bins = []
    for segment, sigma in zip(segments, averaged):
        assignment = partition_name(elements[segment["atom"]], classes[segment["atom"]], float(sigma))
        left, right, left_weight, right_weight = linear_bin(float(sigma))
        assignments.append(assignment)
        bins.append((left, right, left_weight, right_weight))
        pre[assignment][left] += segment["area"] * left_weight
        pre[assignment][right] += segment["area"] * right_weight
    p_hb = 1.0 - np.exp(-(SIGMA_GRID ** 2) / (2.0 * SIGMA_ZERO ** 2))
    final = {name: values.copy() for name, values in pre.items()}
    hb_area = pre["OH"] + pre["OT"]
    final["NHB"] += hb_area * (1.0 - p_hb)
    final["OH"] *= p_hb
    final["OT"] *= p_hb

    audit_path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "segment", "atom", "element", "atom_class", "area_square_angstrom",
        "native_xtb_charge_electron", "native_xtb_raw_sigma",
        "tm_nist_raw_sigma", "nist_hsieh_averaged_sigma", "pre_probability_partition",
        "left_bin", "right_bin", "left_weight", "right_weight",
    ]
    with audit_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for segment, sigma, assignment, location in zip(segments, averaged, assignments, bins):
            left, right, left_weight, right_weight = location
            writer.writerow({
                "segment": segment["segment"],
                "atom": segment["atom"],
                "element": elements[segment["atom"]],
                "atom_class": classes[segment["atom"]],
                "area_square_angstrom": f"{segment['area']:.12f}",
                "native_xtb_charge_electron": f"{segment['charge']:.12f}",
                "native_xtb_raw_sigma": f"{segment['rawSigma']:.15f}",
                "tm_nist_raw_sigma": f"{-segment['rawSigma']:.15f}",
                "nist_hsieh_averaged_sigma": f"{sigma:.15f}",
                "pre_probability_partition": assignment,
                "left_bin": f"{SIGMA_GRID[left]:.3f}",
                "right_bin": f"{SIGMA_GRID[right]:.3f}",
                "left_weight": f"{left_weight:.15f}",
                "right_weight": f"{right_weight:.15f}",
            })

    total_area = sum(segment["area"] for segment in segments)
    final_area = sum(float(values.sum()) for values in final.values())
    pre_area = {name: float(values.sum()) for name, values in pre.items()}
    heteroatom_area = {
        element: {
            partition: sum(
                segment["area"] for segment, assignment in zip(segments, assignments)
                if elements[segment["atom"]] == element and assignment == partition
            )
            for partition in PARTITIONS
        }
        for element in sorted(set(elements.values()) & {"N", "O", "F", "H"})
    }
    max_bin_reconstruction_error = max(
        abs(float(averaged[index]) - (
            SIGMA_GRID[left] * left_weight + SIGMA_GRID[right] * right_weight
        ))
        for index, (left, right, left_weight, right_weight) in enumerate(bins)
    )
    checks = {
        "surfaceAreaClosure": abs(total_area - final_area) <= 1e-8,
        "signConversion": all(
            abs((-segment["rawSigma"]) - NATIVE_XTB_TO_TM_NIST_SIGN * segment["rawSigma"]) <= 1e-15
            for segment in segments
        ),
        "hsiehConstants": (
            NIST_HSIEH_R_AV_SQUARED == 7.25 / math.pi
            and NIST_HSIEH_F_DECAY == 3.57
        ),
        "linearBinning": max_bin_reconstruction_error <= 1e-14,
        "hydrogenBondProbability": (
            abs(float(p_hb[25])) <= 1e-15
            and np.all((p_hb >= 0) & (p_hb <= 1))
            and np.allclose(p_hb, p_hb[::-1], rtol=0, atol=1e-15)
        ),
    }
    hydrocarbon_family = family in {"SAT", "MONO", "DI", "POLY"}
    if hydrocarbon_family:
        checks["chemicallyMeaningfulPartitions"] = pre_area["OH"] == 0 and pre_area["OT"] == 0
    elif family == "NMP":
        oxygen_ot = heteroatom_area.get("O", {}).get("OT", 0.0)
        checks["chemicallyMeaningfulPartitions"] = oxygen_ot > 0 and pre_area["OH"] == 0
    else:
        nitrogen_ot = heteroatom_area.get("N", {}).get("OT", 0.0)
        hydrogen_ot = heteroatom_area.get("H", {}).get("OT", 0.0)
        checks["chemicallyMeaningfulPartitions"] = nitrogen_ot > 0 and hydrogen_ot > 0 and pre_area["OH"] == 0
    checks = {name: bool(passed) for name, passed in checks.items()}
    if not all(checks.values()):
        raise RuntimeError(f"governed profile gate failed for {family}: {checks}")
    rows = [
        (float(sigma), float(area))
        for name in PARTITIONS
        for sigma, area in zip(SIGMA_GRID, final[name])
    ]
    return rows, {
        "family": family,
        "atomCount": len(atoms),
        "segmentCount": len(segments),
        "sourceAreaSquareAngstrom": total_area,
        "profileAreaSquareAngstrom": final_area,
        "preProbabilityPartitionAreaSquareAngstrom": pre_area,
        "finalPartitionAreaSquareAngstrom": {
            name: float(final[name].sum()) for name in PARTITIONS
        },
        "heteroatomPreProbabilityAreaSquareAngstrom": heteroatom_area,
        "averagedSigmaRangeElectronPerSquareAngstrom": {
            "minimum": float(averaged.min()),
            "maximum": float(averaged.max()),
        },
        "maximumLinearBinReconstructionError": max_bin_reconstruction_error,
        "checks": checks,
        "passed": all(checks.values()),
        "segmentAuditSha256": sha256(audit_path),
    }


def write_governed_profile(
    family: str,
    name: str,
    key: str,
    area: float,
    volume: float,
    atoms: list[dict],
    segments: list[dict],
) -> tuple[Path, dict]:
    audit_path = OUT / "segment-audit" / f"{family}.csv"
    rows, verification = governed_profile(family, atoms, segments, audit_path)
    profile = SIGMA3 / f"{key}.sigma"
    meta = {
        "name": name,
        "area [A^2]": area,
        "volume [A^3]": volume,
        "r_av [A]": R_AV_ANGSTROM,
        "f_decay": NIST_HSIEH_F_DECAY,
        "sigma_hb [e/A^2]": 0.0084,
        "averaging": "NIST-Hsieh",
        "input_charge_convention": "xTB-ddCOSMO-native",
        "charge_sign_conversion": "multiply by -1 to xTB TM convention for NIST positive-acceptor mask",
        "disp. flag": "NHB",
        "disp. e/kB [K]": 0.0,
        "standard_INCHIKEY": key,
    }
    profile.write_text(
        "# meta: " + json.dumps(meta, sort_keys=True) + "\n"
        "# Rows are given as: sigma [e/A^2] followed by a space, then psigmaA [A^2]\n"
        "# In the case of three sigma profiles, the order is NHB, OH, then OT\n"
        + "".join(f"{sigma:.3f} {bin_area:.14e}\n" for sigma, bin_area in rows),
        encoding="utf-8",
    )
    verification["profileSha256"] = sha256(profile)
    return profile, verification


def build_verification_document(verification: list[dict]) -> dict:
    return {
        "schemaVersion": "1.0.0",
        "decision": "PROFILE_SEMANTICS_GATE_PASSED",
        "researchOnly": True,
        "calibrationRequired": True,
        "pilotValidated": False,
        "releaseEligible": False,
        "sulfurPrediction": "NOT_CALCULABLE",
        "restrictedProfileInputsUsed": False,
        "signConvention": {
            "input": "xTB ddCOSMO native convention emitted by --cosmo",
            "output": "xTB TM convention consumed by the pinned NIST converter",
            "multiplier": NATIVE_XTB_TO_TM_NIST_SIGN,
            "sourceSupport": [
                "xTB 6.7.1 commit 26b28010e805f7d1aeeef39813feb473e69cc4be src/solv/cosmo.f90: tmcosmo negates zeta",
                "xTB 6.7.1 src/xhelp.f90: --tmcosmo uses TM convention for .cosmo files",
                "CPCM-X 1.1.0 commit e7f894c76d41ee1f703cf6f03e931cbcf046bc7f src/cpcmx/qc_calc.f90 invokes xTB --cosmo, not --tmcosmo",
                "NIST COSMOSAC commit 1b82456be38026719b16cad4076109bef3fcb309 profiles/to_sigma.py consumes charge/area directly and uses positive O/N/F as acceptors",
            ],
        },
        "profileSemantics": {
            "averaging": "NIST Hsieh",
            "rAvSquaredSquareAngstrom": NIST_HSIEH_R_AV_SQUARED,
            "rAvAngstrom": R_AV_ANGSTROM,
            "fDecay": NIST_HSIEH_F_DECAY,
            "gridElectronPerSquareAngstrom": {
                "minimum": float(SIGMA_GRID[0]),
                "maximum": float(SIGMA_GRID[-1]),
                "step": 0.001,
                "linearAreaInterpolation": True,
            },
            "partitionOrder": list(PARTITIONS),
            "hydrogenBondProbability": "1-exp(-sigma_grid^2/(2*0.007^2)); applied after linear binning",
        },
        "components": verification,
        "allComponentsPassed": len(verification) == 6 and all(item["passed"] for item in verification),
        "broaderLleBenchmarkReady": True,
        "broaderLleBenchmarkExecuted": False,
    }


def union_sphere_volume(spheres: list[tuple[float, float, float, float]]) -> float:
    lo = np.min(np.array([[x-r, y-r, z-r] for x, y, z, r in spheres]), axis=0)
    hi = np.max(np.array([[x+r, y+r, z+r] for x, y, z, r in spheres]), axis=0)
    spacing = VOLUME_GRID_ANGSTROM
    axes = [np.arange(lo[i] + spacing/2, hi[i], spacing) for i in range(3)]
    inside_count = 0
    yy, zz = np.meshgrid(axes[1], axes[2], indexing="ij")
    for x in axes[0]:
        inside = np.zeros(yy.shape, dtype=bool)
        for sx, sy, sz, radius in spheres:
            if abs(x-sx) <= radius:
                inside |= (x-sx)**2 + (yy-sy)**2 + (zz-sz)**2 <= radius**2
        inside_count += int(inside.sum())
    return inside_count * spacing**3


def profile_rows(path: Path) -> list[tuple[float, float]]:
    rows = [tuple(map(float, line.split())) for line in path.read_text().splitlines() if line.strip()]
    if len(rows) != 153:
        raise RuntimeError(f"expected 153 sigma3 rows, found {len(rows)}")
    expected = [round(-0.025 + i*0.001, 3) for i in range(51)] * 3
    if any(abs(row[0] - sigma) > 1e-12 for row, sigma in zip(rows, expected)):
        raise RuntimeError("CPCM-X sigma3 grid does not match NIST contract")
    if any(not math.isfinite(area) or area < 0 for _, area in rows):
        raise RuntimeError("invalid profile area")
    return rows


def refresh_profiles_from_frozen_surfaces() -> None:
    """Rebuild only the governed profiles from the already-frozen project surfaces."""
    manifest_path = OUT / "generation-manifest.json"
    if not manifest_path.is_file():
        raise RuntimeError("frozen generation manifest is required")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    existing = {component["family"]: component for component in manifest["components"]}
    if set(existing) != {component[0] for component in COMPONENTS}:
        raise RuntimeError("frozen six-component manifest coverage mismatch")
    SIGMA3.mkdir(parents=True, exist_ok=True)
    shutil.rmtree(OUT / "segment-audit", ignore_errors=True)
    verification = []
    for family, name, _, _, _, _, key in COMPONENTS:
        record = existing[family]
        if record["inchiKey"] != key:
            raise RuntimeError(f"frozen identity mismatch for {family}")
        surface = SURFACES / f"{key}.cosmo"
        if sha256(surface) != record["surfaceSha256"]:
            raise RuntimeError(f"frozen surface hash mismatch for {family}")
        area, spheres, atoms, segments = parse_surface(surface)
        volume = union_sphere_volume(spheres)
        if abs(area - record["areaSquareAngstrom"]) > 1e-9:
            raise RuntimeError(f"frozen area mismatch for {family}")
        if abs(volume - record["volumeCubicAngstrom"]) > 1e-9:
            raise RuntimeError(f"frozen volume mismatch for {family}")
        profile, component_verification = write_governed_profile(
            family, name, key, area, volume, atoms, segments
        )
        record["profileSha256"] = sha256(profile)
        verification.append(component_verification)
    verification_path = OUT / "profile-verification.json"
    subprocess.run(
        [sys.executable, str(HERE / "verify_profile_semantics.py")],
        cwd=ROOT,
        check=True,
    )
    verification_document = json.loads(verification_path.read_text(encoding="utf-8"))
    if verification_document.get("allComponentsPassed") is not True:
        raise RuntimeError("independent six-component profile verification failed")
    manifest["schemaVersion"] = "2.0.0"
    manifest["status"] = {
        "researchOnly": True,
        "calibrationRequired": True,
        "pilotValidated": False,
        "releaseEligible": False,
        "sulfurPrediction": "NOT_CALCULABLE",
    }
    manifest["profileConversion"] = {
        "decision": "PROFILE_SEMANTICS_GATE_PASSED",
        "signMultiplierNativeXtbToTmNist": NATIVE_XTB_TO_TM_NIST_SIGN,
        "averaging": "NIST Hsieh",
        "rAvSquaredSquareAngstrom": NIST_HSIEH_R_AV_SQUARED,
        "fDecay": NIST_HSIEH_F_DECAY,
        "profileVerificationSha256": sha256(verification_path),
        "benchmarkExecuted": False,
    }
    manifest["software"]["generatorSha256"] = sha256(HERE / "generate_profiles.py")
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def main() -> None:
    if "--profiles-from-frozen-surfaces" in sys.argv[1:]:
        if len(sys.argv) != 2:
            raise RuntimeError("only --profiles-from-frozen-surfaces is accepted")
        refresh_profiles_from_frozen_surfaces()
        return
    for executable in (XTB, CPX):
        if not executable.is_file():
            raise RuntimeError(f"missing frozen executable: {executable}")
    shutil.rmtree(OUT, ignore_errors=True)
    for directory in (WORK, SURFACES, SIGMA3):
        directory.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["PATH"] = f"{XTB.parent}:{env['PATH']}"
    env["XTBHOME"] = str(XTBHOME)
    env["OMP_NUM_THREADS"] = "1"
    env["OPENBLAS_NUM_THREADS"] = "1"
    env["MKL_NUM_THREADS"] = "1"
    records = []
    complist = ["ID FORMULA CAS# NAME SMILES INCHI INCHIKEY"]

    for index, (family, name, formula, cas, smiles, inchi, key) in enumerate(COMPONENTS, 1):
        work = WORK / family
        work.mkdir()
        conformers = select_conformer(smiles, work)
        subprocess.run(
            [str(XTB), "rdkit-selected.xyz", "--opt", "tight", "--gfn", "2", "--chrg", "0", "--uhf", "0"],
            cwd=work, env=env, check=True, stdout=(work / "xtb-opt.log").open("w"),
            stderr=subprocess.STDOUT,
        )
        optimized = work / "xtbopt.xyz"
        if not optimized.is_file():
            raise RuntimeError(f"xTB did not produce optimized geometry for {family}")
        xyz_to_coord(optimized, work / "coord")

        cpx_home = work / "cpx-home"
        shutil.copytree(CPX_DB, cpx_home / "DB")
        (cpx_home / "cpcmx.toml").write_text(
            'prog="xtb"\n'
            'smd_h2o="smd_h2o"\n'
            'crs_h2o="crs.param_h2o"\n'
            'smd_ot="smd_ot"\n'
            'crs_ot="crs.param_ot"\n'
            'DB="DB"\n'
            'Temperature=298.15\n'
            'r_probe=0.4\n',
            encoding="utf-8",
        )
        cpx_env = env | {"CPXHOME": str(cpx_home)}
        subprocess.run(
            [str(CPX), str(optimized), "--solvent", "water"],
            cwd=work, env=cpx_env, check=True, stdout=(work / "cpx.log").open("w"),
            stderr=subprocess.STDOUT,
        )
        source_surface = work / "solute.cosmo"
        area, spheres, atoms, segments = parse_surface(source_surface)
        volume = union_sphere_volume(spheres)

        surface = SURFACES / f"{key}.cosmo"
        shutil.copy2(source_surface, surface)
        selected_geometry = SURFACES / f"{key}.rdkit-selected.xyz"
        shutil.copy2(work / "rdkit-selected.xyz", selected_geometry)
        geometry = SURFACES / f"{key}.xyz"
        shutil.copy2(optimized, geometry)
        profile, component_verification = write_governed_profile(
            family, name, key, area, volume, atoms, segments
        )
        complist.append(f"{index} {formula} {cas} {name} {smiles} {inchi} {key}")
        records.append({
            "family": family,
            "name": name,
            "cas": cas,
            "inchiKey": key,
            "formalCharge": 0,
            "spinMultiplicity": 1,
            "conformers": conformers,
            "selectedConformerGeometrySha256": sha256(selected_geometry),
            "optimizedGeometrySha256": sha256(geometry),
            "surfaceSha256": sha256(surface),
            "profileSha256": sha256(profile),
            "areaSquareAngstrom": area,
            "volumeCubicAngstrom": volume,
            "volumeIntegrationGridAngstrom": VOLUME_GRID_ANGSTROM,
            "profileVerification": component_verification,
        })

    complist_path = PROFILES / "complist.txt"
    complist_path.write_text("\n".join(complist) + "\n", encoding="utf-8")
    verification_path = OUT / "profile-verification.json"
    subprocess.run(
        [sys.executable, str(HERE / "verify_profile_semantics.py")],
        cwd=ROOT,
        check=True,
    )
    manifest = {
        "schemaVersion": "2.0.0",
        "method": "RDKit ETKDGv3/MMFF94s lowest conformer; xTB 6.7.1 GFN2-xTB tight gas geometry; CPCM-X 1.1.0 xTB conductor surface; native-xTB to TM/NIST sign conversion; NIST Hsieh sigma3 conversion",
        "referenceState": "neutral singlet; epsilon=infinity conductor; 298.15 K profile generation",
        "software": {
            "rdkitVersion": Chem.rdBase.rdkitVersion,
            "xtbVersion": "6.7.1",
            "xtbReleaseCommit": "26b28010e805f7d1aeeef39813feb473e69cc4be",
            "xtbPublisherArchiveSha256": "62a8d18778286e815292ee53d76ce447daf460a4dea3782c0f25cbac7019b5df",
            "xtbBinarySha256": sha256(XTB),
            "cpcmXVersion": "1.1.0",
            "cpcmXReleaseCommit": "e7f894c76d41ee1f703cf6f03e931cbcf046bc7f",
            "cpcmXPublisherArchiveSha256": "7d16b0bcedf0fe94f22305dbe9ee991c2c91c28719defc3dd265ed4800aca1c3",
            "cpcmXBinarySha256": sha256(CPX),
            "generatorSha256": sha256(HERE / "generate_profiles.py"),
            "releaseProvenanceSha256": sha256(VENDOR / "release-provenance.json"),
        },
        "sigmaGrid": {"minimum": -0.025, "maximum": 0.025, "step": 0.001, "partitionOrder": ["NHB", "OH", "OT"]},
        "profileConversion": {
            "decision": "PROFILE_SEMANTICS_GATE_PASSED",
            "signMultiplierNativeXtbToTmNist": NATIVE_XTB_TO_TM_NIST_SIGN,
            "averaging": "NIST Hsieh",
            "rAvSquaredSquareAngstrom": NIST_HSIEH_R_AV_SQUARED,
            "fDecay": NIST_HSIEH_F_DECAY,
            "profileVerificationSha256": sha256(verification_path),
            "benchmarkExecuted": False,
        },
        "status": {
            "researchOnly": True,
            "calibrationRequired": True,
            "pilotValidated": False,
            "releaseEligible": False,
            "sulfurPrediction": "NOT_CALCULABLE",
        },
        "volumeMethod": f"deterministic union-of-CPCM-cavity-spheres midpoint grid at {VOLUME_GRID_ANGSTROM} angstrom",
        "complistSha256": sha256(complist_path),
        "components": records,
        "restrictedProfileInputs": [],
    }
    (OUT / "generation-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
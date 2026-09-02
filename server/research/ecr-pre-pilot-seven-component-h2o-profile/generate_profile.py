#!/usr/bin/env python3
"""Generate the research-only H2O CPCM-X/NIST-Hsieh sigma3 profile."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from rdkit import Chem
from rdkit.Chem import AllChem

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SIX = HERE.parent / "ecr-pre-pilot-six-component-thermodynamics"
OUT = HERE / "generated"
WORK = OUT / "work/H2O"
SURFACES = OUT / "surfaces"
PROFILES = OUT / "profiles"
SIGMA3 = PROFILES / "sigma3"
VENDOR = SIX / "vendor"
XTB = VENDOR / "xtb-6.7.1/bin/xtb"
CPX = VENDOR / "cpx-1.1.0/bin/cpx"
XTBHOME = VENDOR / "xtb-6.7.1/share/xtb"
CPX_DB = VENDOR / "cpx-db"
KEY = "XLYOFNOQVPJJNP-UHFFFAOYSA-N"
IDENTITY = {
    "family": "H2O", "name": "WATER", "formula": "H2O", "cas": "7732-18-5",
    "smiles": "O", "inchi": "InChI=1S/H2O/h1H2", "inchiKey": KEY,
    "formalCharge": 0, "spinMultiplicity": 1,
}
BOHR_TO_ANGSTROM = 0.52917721067
BOHR_PER_ANGSTROM = 1.8897261254578281
R_AV2 = 7.25 / math.pi
R_AV = math.sqrt(R_AV2)
F_DECAY = 3.57
SIGMA_ZERO = 0.007
GRID = np.linspace(-0.025, 0.025, 51)
PARTITIONS = ("NHB", "OH", "OT")
RADII = {"H": 0.31, "O": 0.66}
SEED = 20260829
VOLUME_GRID = 0.05


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def copy_artifact(source: Path, relative: str, inventory: dict[str, str]) -> None:
    destination = OUT / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    inventory[relative] = sha256(destination)


def write_xyz(mol: Chem.Mol, conformer_id: int, path: Path) -> None:
    conf = mol.GetConformer(conformer_id)
    lines = [str(mol.GetNumAtoms()), "RDKit ETKDGv3/MMFF94s selected conformer"]
    for atom in mol.GetAtoms():
        p = conf.GetAtomPosition(atom.GetIdx())
        lines.append(f"{atom.GetSymbol():2s} {p.x: .12f} {p.y: .12f} {p.z: .12f}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def select_conformer() -> dict:
    mol = Chem.AddHs(Chem.MolFromSmiles(IDENTITY["smiles"]))
    params = AllChem.ETKDGv3()
    params.randomSeed = SEED
    params.numThreads = 1
    params.pruneRmsThresh = 0.25
    ids = list(AllChem.EmbedMultipleConfs(mol, numConfs=32, params=params))
    if not ids:
        raise RuntimeError("RDKit did not embed water")
    props = AllChem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94s")
    if props is None:
        raise RuntimeError("MMFF94s parameters unavailable for water")
    energies = []
    for conformer_id in ids:
        force_field = AllChem.MMFFGetMoleculeForceField(mol, props, confId=conformer_id)
        converged = force_field.Minimize(maxIts=2000) == 0
        energies.append({
            "conformerId": conformer_id,
            "energyKcalMol": force_field.CalcEnergy(),
            "converged": converged,
        })
    selected = min(energies, key=lambda row: (row["energyKcalMol"], row["conformerId"]))
    path = WORK / "rdkit-selected.xyz"
    write_xyz(mol, selected["conformerId"], path)
    return {
        "enumerated": len(ids), "requested": 32, "randomSeed": SEED,
        "pruneRmsThreshAngstrom": 0.25, "forceField": "MMFF94s",
        "energies": energies, "selectedConformerId": selected["conformerId"],
        "selectedGeometrySha256": sha256(path),
    }


def xyz_to_coord(source: Path, destination: Path) -> None:
    rows = source.read_text(encoding="utf-8").splitlines()[2:]
    lines = ["$coord angs"]
    for row in rows:
        element, x, y, z = row.split()[:4]
        lines.append(f" {float(x): .12f} {float(y): .12f} {float(z): .12f} {element.lower()}")
    destination.write_text("\n".join(lines + ["$end"]) + "\n", encoding="utf-8")


def parse_surface(path: Path) -> tuple[float, list[tuple[float, float, float, float]], list[dict], list[dict]]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"^\s*area=([0-9.Ee+-]+)", text, re.MULTILINE)
    if not match:
        raise RuntimeError("missing COSMO area")
    block = text.split("$coord_rad", 1)[1].split("$coord_car", 1)[0]
    atoms, spheres = [], []
    for line in block.splitlines():
        fields = line.split()
        if len(fields) == 6 and fields[0].isdigit():
            xyz = np.asarray([float(value) * BOHR_TO_ANGSTROM for value in fields[1:4]])
            atoms.append({"atom": int(fields[0]), "xyz": xyz, "element": fields[4].upper()})
            spheres.append((*xyz.tolist(), float(fields[5])))
    segments = []
    for line in text.split("$segment_information", 1)[1].splitlines():
        fields = line.split()
        if len(fields) >= 9 and fields[0].isdigit():
            charge, area = float(fields[5]), float(fields[6])
            segments.append({
                "segment": int(fields[0]), "atom": int(fields[1]),
                "xyz": np.asarray([float(value) * BOHR_TO_ANGSTROM for value in fields[2:5]]),
                "charge": charge, "area": area, "rawSigma": charge / area,
                "providedRawSigma": float(fields[7]),
            })
    area = float(match.group(1))
    if [a["atom"] for a in atoms] != list(range(1, len(atoms) + 1)):
        raise RuntimeError("non-contiguous atoms")
    if [s["segment"] for s in segments] != list(range(1, len(segments) + 1)):
        raise RuntimeError("non-contiguous segments")
    if abs(sum(s["area"] for s in segments) - area) > 1e-6:
        raise RuntimeError("surface area does not close")
    if max(abs(s["rawSigma"] - s["providedRawSigma"]) for s in segments) > 1e-8:
        raise RuntimeError("surface charge/area column mismatch")
    return area, spheres, atoms, segments


def classify(atoms: list[dict]) -> tuple[dict[int, str], dict[int, list[int]]]:
    neighbors = {atom["atom"]: [] for atom in atoms}
    for index, left in enumerate(atoms):
        for right in atoms[index + 1:]:
            cutoff = 1.15 * (RADII[left["element"]] + RADII[right["element"]])
            if float(np.linalg.norm(left["xyz"] - right["xyz"])) < cutoff:
                neighbors[left["atom"]].append(right["atom"])
                neighbors[right["atom"]].append(left["atom"])
    elements = {atom["atom"]: atom["element"] for atom in atoms}
    classes = {}
    for atom in atoms:
        bonded = [elements[number] for number in neighbors[atom["atom"]]]
        classes[atom["atom"]] = "OH" if (
            (atom["element"] == "O" and "H" in bonded)
            or (atom["element"] == "H" and "O" in bonded)
        ) else "NHB"
    return classes, neighbors


def average(segments: list[dict]) -> np.ndarray:
    xyz = np.asarray([segment["xyz"] for segment in segments])
    native_to_tm_nist = -np.asarray([segment["rawSigma"] for segment in segments])
    rn2 = np.asarray([segment["area"] / math.pi for segment in segments])
    radius_sum = rn2 + R_AV2
    radial_factor = rn2 * R_AV2 / radius_sum
    distance2 = np.sum((xyz[:, None, :] - xyz[None, :, :]) ** 2, axis=2)
    weights = radial_factor[None, :] * np.exp(-F_DECAY * distance2 / radius_sum[None, :])
    if np.any(weights.sum(axis=1) <= 0):
        raise RuntimeError("non-positive Hsieh denominator")
    return (weights * native_to_tm_nist[None, :]).sum(axis=1) / weights.sum(axis=1)


def partition(element: str, atom_class: str, sigma: float) -> str:
    if ((element == "O" and sigma > 0 and atom_class == "OH")
            or (element == "H" and sigma < 0 and atom_class == "OH")):
        return "OH"
    return "NHB"


def governed_profile(atoms: list[dict], segments: list[dict], audit: Path) -> tuple[list[tuple[float, float]], dict]:
    classes, neighbors = classify(atoms)
    elements = {atom["atom"]: atom["element"] for atom in atoms}
    averaged = average(segments)
    pre = {name: np.zeros(51) for name in PARTITIONS}
    trace = []
    for segment, sigma in zip(segments, averaged):
        if sigma < GRID[0] - 1e-14 or sigma > GRID[-1] + 1e-14:
            raise RuntimeError(f"averaged sigma outside governed grid: {sigma}")
        sigma = min(max(float(sigma), float(GRID[0])), float(GRID[-1]))
        left = min(int((sigma - GRID[0]) / 0.001), 49)
        right = left + 1
        left_weight = float((GRID[right] - sigma) / 0.001)
        right_weight = 1.0 - left_weight
        assignment = partition(elements[segment["atom"]], classes[segment["atom"]], sigma)
        pre[assignment][left] += segment["area"] * left_weight
        pre[assignment][right] += segment["area"] * right_weight
        trace.append((segment, sigma, assignment, left, right, left_weight, right_weight))
    probability = 1.0 - np.exp(-(GRID ** 2) / (2.0 * SIGMA_ZERO ** 2))
    final = {name: values.copy() for name, values in pre.items()}
    final["NHB"] += (pre["OH"] + pre["OT"]) * (1.0 - probability)
    final["OH"] *= probability
    final["OT"] *= probability
    audit.parent.mkdir(parents=True, exist_ok=True)
    fields = ["segment", "atom", "element", "atom_class", "area_square_angstrom",
              "native_xtb_charge_electron", "native_xtb_raw_sigma", "tm_nist_raw_sigma",
              "nist_hsieh_averaged_sigma", "pre_probability_partition", "left_bin",
              "right_bin", "left_weight", "right_weight"]
    with audit.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for segment, sigma, assignment, left, right, lw, rw in trace:
            writer.writerow({
                "segment": segment["segment"], "atom": segment["atom"],
                "element": elements[segment["atom"]], "atom_class": classes[segment["atom"]],
                "area_square_angstrom": f"{segment['area']:.12f}",
                "native_xtb_charge_electron": f"{segment['charge']:.12f}",
                "native_xtb_raw_sigma": f"{segment['rawSigma']:.15f}",
                "tm_nist_raw_sigma": f"{-segment['rawSigma']:.15f}",
                "nist_hsieh_averaged_sigma": f"{sigma:.15f}",
                "pre_probability_partition": assignment, "left_bin": f"{GRID[left]:.3f}",
                "right_bin": f"{GRID[right]:.3f}", "left_weight": f"{lw:.15f}",
                "right_weight": f"{rw:.15f}",
            })
    oxygen = [item for item in trace if elements[item[0]["atom"]] == "O"]
    hydrogen = [item for item in trace if elements[item[0]["atom"]] == "H"]
    positive_oxygen = [item for item in oxygen if item[1] > 0]
    negative_hydrogen = [item for item in hydrogen if item[1] < 0]
    checks = {
        "waterHasOneOxygenTwoHydrogens": list(elements.values()).count("O") == 1 and list(elements.values()).count("H") == 2,
        "oxygenBondedToBothHydrogens": len(neighbors[next(n for n, e in elements.items() if e == "O")]) == 2,
        "allAtomsClassifiedOH": set(classes.values()) == {"OH"},
        "oxygenPositiveAssignedOH": bool(positive_oxygen) and all(item[2] == "OH" for item in positive_oxygen),
        "hydrogenNegativeAssignedOH": bool(negative_hydrogen) and all(item[2] == "OH" for item in negative_hydrogen),
        "otPartitionEmpty": float(pre["OT"].sum()) == 0.0 and float(final["OT"].sum()) == 0.0,
        "ohPartitionNonzero": float(pre["OH"].sum()) > 0 and float(final["OH"].sum()) > 0,
        "surfaceAreaClosure": abs(sum(s["area"] for s in segments) - sum(float(v.sum()) for v in final.values())) <= 1e-8,
    }
    if not all(checks.values()):
        raise RuntimeError(f"water profile assertions failed: {checks}")
    rows = [(float(sigma), float(area)) for name in PARTITIONS for sigma, area in zip(GRID, final[name])]
    return rows, {
        "family": "H2O", "atomCount": len(atoms), "segmentCount": len(segments),
        "sourceAreaSquareAngstrom": sum(s["area"] for s in segments),
        "profileAreaSquareAngstrom": sum(float(v.sum()) for v in final.values()),
        "preProbabilityPartitionAreaSquareAngstrom": {n: float(v.sum()) for n, v in pre.items()},
        "finalPartitionAreaSquareAngstrom": {n: float(v.sum()) for n, v in final.items()},
        "averagedSigmaRangeElectronPerSquareAngstrom": {
            "minimum": float(averaged.min()), "maximum": float(averaged.max())},
        "waterSpecificChecks": checks, "segmentAuditSha256": sha256(audit), "passed": True,
    }


def union_volume(spheres: list[tuple[float, float, float, float]]) -> float:
    lo = np.min([[x-r, y-r, z-r] for x, y, z, r in spheres], axis=0)
    hi = np.max([[x+r, y+r, z+r] for x, y, z, r in spheres], axis=0)
    axes = [np.arange(lo[i] + VOLUME_GRID/2, hi[i], VOLUME_GRID) for i in range(3)]
    count = 0
    yy, zz = np.meshgrid(axes[1], axes[2], indexing="ij")
    for x in axes[0]:
        inside = np.zeros(yy.shape, dtype=bool)
        for sx, sy, sz, radius in spheres:
            inside |= (x-sx)**2 + (yy-sy)**2 + (zz-sz)**2 <= radius**2
        count += int(inside.sum())
    return count * VOLUME_GRID**3


def main() -> None:
    if any(not path.is_file() for path in (XTB, CPX)):
        raise RuntimeError("pinned six-component xTB/CPCM-X executables are required")
    shutil.rmtree(OUT, ignore_errors=True)
    for directory in (WORK, SURFACES, SIGMA3):
        directory.mkdir(parents=True, exist_ok=True)
    conformers = select_conformer()
    env = os.environ.copy()
    env.update({"PATH": f"{XTB.parent}:{env['PATH']}", "XTBHOME": str(XTBHOME),
                "OMP_NUM_THREADS": "1", "OPENBLAS_NUM_THREADS": "1", "MKL_NUM_THREADS": "1"})
    with (WORK / "xtb-opt.log").open("w") as log:
        subprocess.run([str(XTB), "rdkit-selected.xyz", "--opt", "tight", "--gfn", "2",
                        "--chrg", "0", "--uhf", "0"], cwd=WORK, env=env, check=True,
                       stdout=log, stderr=subprocess.STDOUT)
    optimized = WORK / "xtbopt.xyz"
    xyz_to_coord(optimized, WORK / "coord")
    cpx_home = WORK / "cpx-home"
    shutil.copytree(CPX_DB, cpx_home / "DB")
    (cpx_home / "cpcmx.toml").write_text(
        'prog="xtb"\nsmd_h2o="smd_h2o"\ncrs_h2o="crs.param_h2o"\n'
        'smd_ot="smd_ot"\ncrs_ot="crs.param_ot"\nDB="DB"\n'
        'Temperature=298.15\nr_probe=0.4\n', encoding="utf-8")
    with (WORK / "cpx.log").open("w") as log:
        subprocess.run([str(CPX), str(optimized), "--solvent", "water"], cwd=WORK,
                       env=env | {"CPXHOME": str(cpx_home)}, check=True,
                       stdout=log, stderr=subprocess.STDOUT)
    area, spheres, atoms, segments = parse_surface(WORK / "solute.cosmo")
    volume = union_volume(spheres)
    selected = SURFACES / f"{KEY}.rdkit-selected.xyz"
    geometry = SURFACES / f"{KEY}.xyz"
    surface = SURFACES / f"{KEY}.cosmo"
    shutil.copy2(WORK / "rdkit-selected.xyz", selected)
    shutil.copy2(optimized, geometry)
    shutil.copy2(WORK / "solute.cosmo", surface)
    retained = {}
    copy_artifact(WORK / "rdkit-selected.xyz", "raw-artifacts/H2O/rdkit-selected-geometry.xyz", retained)
    copy_artifact(optimized, "raw-artifacts/H2O/xtb-optimized-geometry.xyz", retained)
    copy_artifact(WORK / "solute.cosmo", "raw-artifacts/H2O/cpcmx-native-surface.cosmo", retained)
    copy_artifact(WORK / "xtb-opt.log", "raw-artifacts/H2O/xtb-optimization-output.txt", retained)
    copy_artifact(WORK / "cpx.log", "raw-artifacts/H2O/cpcmx-execution-output.txt", retained)
    copy_artifact(cpx_home / "cpcmx.toml", "raw-artifacts/H2O/cpcmx-input.toml", retained)
    for input_path in sorted((cpx_home / "DB").rglob("*")):
        if input_path.is_file():
            copy_artifact(input_path, f"raw-artifacts/H2O/cpx-db/{input_path.relative_to(cpx_home / 'DB')}", retained)
    audit = OUT / "segment-audit/H2O.csv"
    rows, verification = governed_profile(atoms, segments, audit)
    copy_artifact(audit, "raw-artifacts/H2O/segment-audit.csv", retained)
    profile = SIGMA3 / f"{KEY}.sigma"
    metadata = {
        "name": "WATER", "area [A^2]": area, "volume [A^3]": volume,
        "r_av [A]": R_AV, "f_decay": F_DECAY, "sigma_hb [e/A^2]": 0.0084,
        "averaging": "NIST-Hsieh", "input_charge_convention": "xTB-ddCOSMO-native",
        "charge_sign_conversion": "multiply by -1 to xTB TM convention for NIST positive-acceptor mask",
        "disp. flag": "NHB", "disp. e/kB [K]": 0.0, "standard_INCHIKEY": KEY,
    }
    profile.write_text(
        "# meta: " + json.dumps(metadata, sort_keys=True) + "\n"
        "# Rows are given as: sigma [e/A^2] followed by a space, then psigmaA [A^2]\n"
        "# In the case of three sigma profiles, the order is NHB, OH, then OT\n"
        + "".join(f"{sigma:.3f} {bin_area:.14e}\n" for sigma, bin_area in rows),
        encoding="utf-8")
    (PROFILES / "complist.txt").write_text(
        "ID FORMULA CAS# NAME SMILES INCHI INCHIKEY\n"
        f"1 H2O 7732-18-5 WATER O InChI=1S/H2O/h1H2 {KEY}\n", encoding="utf-8")
    record = {
        **IDENTITY, "conformers": conformers,
        "selectedConformerGeometrySha256": sha256(selected),
        "optimizedGeometrySha256": sha256(geometry), "surfaceSha256": sha256(surface),
        "profileSha256": sha256(profile), "areaSquareAngstrom": area,
        "volumeCubicAngstrom": volume, "volumeIntegrationGridAngstrom": VOLUME_GRID,
        "profileVerification": verification,
        "rawArtifacts": {"xtbLogSha256": sha256(WORK / "xtb-opt.log"),
                         "cpcmXLogSha256": sha256(WORK / "cpx.log"),
                         "segmentAuditSha256": sha256(audit),
                         "retainedArtifactSha256ByPath": retained},
    }
    manifest = {
        "schemaVersion": "1.0.0", "status": "PROFILE_ESTABLISHED_RESEARCH_ONLY",
        "lleQualification": "SEVEN_COMPONENT_LLE_NOT_QUALIFIED",
        "method": "RDKit ETKDGv3/MMFF94s; pinned xTB 6.7.1 GFN2 tight; pinned CPCM-X 1.1.0; native-xTB sign conversion; NIST-Hsieh sigma3",
        "referenceState": "neutral singlet; epsilon=infinity conductor; 298.15 K profile generation",
        "software": {"rdkitVersion": Chem.rdBase.rdkitVersion, "xtbVersion": "6.7.1",
                     "xtbBinarySha256": sha256(XTB), "cpcmXVersion": "1.1.0",
                     "cpcmXBinarySha256": sha256(CPX),
                     "xtbReleaseCommit": "26b28010e805f7d1aeeef39813feb473e69cc4be",
                     "xtbPublisherArchiveSha256": "62a8d18778286e815292ee53d76ce447daf460a4dea3782c0f25cbac7019b5df",
                     "cpcmXReleaseCommit": "e7f894c76d41ee1f703cf6f03e931cbcf046bc7f",
                     "cpcmXPublisherArchiveSha256": "7d16b0bcedf0fe94f22305dbe9ee991c2c91c28719defc3dd265ed4800aca1c3",
                     "vendorReleaseProvenancePath": "server/research/ecr-pre-pilot-six-component-thermodynamics/vendor/release-provenance.json",
                     "vendorReleaseProvenanceSha256": sha256(VENDOR / "release-provenance.json"),
                     "generatorSha256": sha256(HERE / "generate_profile.py"),
                     "independentVerifierSha256": sha256(HERE / "verify_profile_semantics.py"),
                     "generationProtocolSha256": sha256(HERE / "generation-protocol.json")},
        "profileConversion": {"signMultiplierNativeXtbToTmNist": -1.0,
                              "averaging": "NIST Hsieh", "rAvSquaredSquareAngstrom": R_AV2,
                              "fDecay": F_DECAY, "partitionOrder": list(PARTITIONS)},
        "component": record, "complistSha256": sha256(PROFILES / "complist.txt"),
        "restrictedProfileInputs": [],
    }
    (OUT / "generation-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    subprocess.run([sys.executable, str(HERE / "verify_profile_semantics.py")],
                   cwd=ROOT, check=True)
    verification_path = OUT / "profile-verification.json"
    manifest["profileConversion"]["profileVerificationSha256"] = sha256(verification_path)
    (OUT / "generation-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("generated and independently verified research-only H2O sigma3 profile")


if __name__ == "__main__":
    main()
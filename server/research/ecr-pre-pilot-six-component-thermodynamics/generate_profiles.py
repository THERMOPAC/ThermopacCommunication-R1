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
R_AV_ANGSTROM = 1.5191269449366247
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


def parse_surface(path: Path) -> tuple[float, list[tuple[float, float, float, float]]]:
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
    return float(area_match.group(1)), spheres


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


def main() -> None:
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
        source_profile = work / "solute_sigma3.txt"
        area, spheres = parse_surface(source_surface)
        volume = union_sphere_volume(spheres)
        rows = profile_rows(source_profile)
        if abs(sum(a for _, a in rows) - area) / area > 2e-7:
            raise RuntimeError(f"sigma3 area does not close for {family}")

        surface = SURFACES / f"{key}.cosmo"
        shutil.copy2(source_surface, surface)
        selected_geometry = SURFACES / f"{key}.rdkit-selected.xyz"
        shutil.copy2(work / "rdkit-selected.xyz", selected_geometry)
        geometry = SURFACES / f"{key}.xyz"
        shutil.copy2(optimized, geometry)
        profile = SIGMA3 / f"{key}.sigma"
        meta = {
            "name": name,
            "area [A^2]": area,
            "volume [A^3]": volume,
            "r_av [A]": R_AV_ANGSTROM,
            "f_decay": 3.57,
            "sigma_hb [e/A^2]": 0.0084,
            "averaging": "CPCM-X-1.1.0",
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
        })

    complist_path = PROFILES / "complist.txt"
    complist_path.write_text("\n".join(complist) + "\n", encoding="utf-8")
    manifest = {
        "schemaVersion": "1.0.0",
        "method": "RDKit ETKDGv3/MMFF94s lowest conformer; xTB 6.7.1 GFN2-xTB tight gas geometry; CPCM-X 1.1.0 xTB conductor surface",
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
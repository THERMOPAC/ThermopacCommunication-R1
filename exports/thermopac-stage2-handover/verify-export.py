#!/usr/bin/env python3
"""Read-only export verifier. No application/native imports, DB, or execution."""
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
digest = lambda data: hashlib.sha256(data).hexdigest()
inventory = json.loads((root / "INVENTORY.json").read_text())
listed = set()
for row in inventory["files"]:
    rel = Path(row["path"])
    assert not rel.is_absolute() and ".." not in rel.parts, "Unsafe path"
    p = root / rel
    assert p.is_file() and not p.is_symlink(), f"Missing/linked: {rel}"
    data = p.read_bytes()
    assert len(data) == row["bytes"] and digest(data) == row["sha256"], f"Changed: {rel}"
    listed.add(rel.as_posix())
actual = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
assert actual == listed | {"INVENTORY.json", "SHA256SUMS"}, "Unexpected/missing export files"
for line in (root / "SHA256SUMS").read_text().splitlines():
    expected, name = line.split("  ", 1)
    assert digest((root / name).read_bytes()) == expected, f"Checksum mismatch: {name}"
runtime = root / "dist/predictive-nt-runtime-7c-1-6"
manifest = json.loads((runtime / "predictive-nt-runtime-manifest.json").read_text())
assert digest((runtime / "predictive-nt-runtime-manifest.json").read_bytes()) == \
    "2482213baab825170ffd9af67b66319674095f5864a9ceccb897b25a5b72e017"
for row in manifest["files"]:
    data = (runtime / row["path"]).read_bytes()
    assert len(data) == row["bytes"] and digest(data) == row["sha256"], row["path"]
assert len(manifest["files"]) == manifest["fileCount"]
aggregate = "\n".join(f"{r['path']}:{r['bytes']}:{r['sha256']}" for r in manifest["files"])
assert digest(aggregate.encode()) == manifest["aggregateSha256"]
actual_runtime = {p.relative_to(runtime).as_posix() for p in runtime.rglob("*") if p.is_file()}
assert actual_runtime == {r["path"] for r in manifest["files"]} | {"predictive-nt-runtime-manifest.json"}
print(f"PASS: {len(listed)} export files and {manifest['fileCount']} runtime payload files verified.")
print("This is byte/inventory verification, not a new scientific calculation.")
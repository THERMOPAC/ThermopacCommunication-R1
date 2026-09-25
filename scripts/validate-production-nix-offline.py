#!/usr/bin/env python3
"""Offline component checks only; never starts ERP, DB, storage or workers."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def isolated(node):
    import fcntl
    import socket
    import struct
    # Only loopback is enabled in the new network namespace.
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    fcntl.ioctl(sock.fileno(), 0x8914, struct.pack("16sH14s", b"lo", 0x49, b""))
    sock.close()
    routes = Path("/proc/net/route").read_text().splitlines()
    if len(routes) != 1:
        raise RuntimeError("Unexpected network route in isolated namespace")
    print("PASS: no external routes; allowlisted environment; Python-scoped libraries", flush=True)
    assert "LD_LIBRARY_PATH" not in os.environ
    chromium = subprocess.check_output(["which", "chromium"], text=True).strip()
    assert chromium.startswith("/nix/store/") and chromium.endswith("/bin/chromium")
    print("PASS: portable Chromium discovery; no global library override", flush=True)
    runtime = Path("dist/predictive-nt-runtime-7c-1-6")
    vendor = runtime / "server/research/ecr-pre-pilot-cosmosac/vendor/python"
    imports = """
import pathlib, sys
v = pathlib.Path(sys.argv[1]).resolve()
sys.path.insert(0, str(v))
import numpy, scipy, cCOSMO
from scipy import optimize, linalg
for module in (numpy, scipy, cCOSMO):
    assert pathlib.Path(module.__file__).resolve().is_relative_to(v)
assert numpy.__version__ == '2.1.3'
assert scipy.__version__ == '1.14.1'
print('PASS: pinned vendored numerical/native imports')
"""
    subprocess.run(["python3.12", "-S", "-c", imports, str(vendor)],
                   check=True, timeout=60)
    subprocess.run(["python3.12", str(runtime / "server/ecr-pre-pilot/"
                    "predictive-nt-seven-component-v1-6/worker.py"), "--preflight"],
                   check=True, timeout=120)
    subprocess.run([
        node, "node_modules/vitest/vitest.mjs", "run", "--maxWorkers=1",
        "--no-file-parallelism", "--testTimeout=90000",
        "tests/production-nix-document-smoke.test.ts",
        "tests/predictive-nt-production-evidence-paths.test.ts",
        "tests/predictive-nt-report-evidence.test.ts",
        "tests/ecr-pre-pilot-predictive-nt-report.test.ts",
    ], check=True, timeout=240)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--isolated":
        isolated(sys.argv[2])
        return
    source = Path(__file__).resolve().parents[1]
    candidate = Path(sys.argv[1] if len(sys.argv) > 1 else
                     "/tmp/thermopac-clean-release-candidate").resolve()
    if not candidate.is_relative_to(Path("/tmp")) or not candidate.is_dir():
        raise RuntimeError("An existing external /tmp release candidate is required")
    expression = """let pkgs=import <nixpkgs> {}; in {
      roots = map (p: p.outPath)
        (import ./docs/production-nix-candidate.nix {inherit pkgs;}).deps;
      python = pkgs.python312.outPath;
      libraries = pkgs.lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib pkgs.zlib ];
      locales = pkgs.glibcLocales.outPath;
    }"""
    config = json.loads(subprocess.check_output([
        "nix-instantiate", "--eval", "--strict", "--json", "-E", expression,
    ], cwd=source))
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node module required")
    python = config["python"] + "/bin/python3.12"
    shutil.copyfile(source / "tests/production-nix-document-smoke.test.ts",
                    candidate / "tests/production-nix-document-smoke.test.ts")
    with tempfile.TemporaryDirectory(prefix="production-nix-smoke-") as temporary:
        wrapper = Path(temporary) / "python3.12"
        shutil.copyfile(source / "scripts/production-python312-wrapper.sh", wrapper)
        wrapper.chmod(0o700)
        env = {
            "PATH": ":".join([temporary] + [p + "/bin" for p in config["roots"]]
                             + [str(Path(node).parent)]),
            "PYTHONDONTWRITEBYTECODE": "1",
            "HOME": temporary, "TMPDIR": temporary, "NODE_ENV": "test",
            "ISOLATED_NIX_SMOKE": "1", "LANG": "en_US.UTF-8",
            "PRODUCTION_PYTHON312_BIN": python,
            "PRODUCTION_PYTHON312_LIBRARY_PATH": config["libraries"],
            "LOCALE_ARCHIVE": config["locales"] + "/lib/locale/locale-archive",
        }
        subprocess.run([
            "/usr/bin/unshare", "--user", "--map-root-user", "--net",
            python, str(Path(__file__).resolve()), "--isolated", node,
        ], cwd=candidate, env=env, check=True, timeout=450)


if __name__ == "__main__":
    main()
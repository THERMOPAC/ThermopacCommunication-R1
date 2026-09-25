#!/usr/bin/env python3
"""Offline component checks only; never starts ERP, DB, storage or workers."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile


def check_production_command(launcher):
    """Stub *only* Node so the exact production command never runs migrations."""
    with tempfile.TemporaryDirectory(prefix="production-command-") as directory:
        directory = Path(directory)
        node = directory / "node"
        node.write_text("""#!/bin/sh
if [ "$1" = scripts/prepare-production-runtime.mjs ] && [ "$2" = --verify ]; then
  exit 0
fi
printf '%s|%s|%s\\n' "$1" "${NODE_ENV-unset}" "${LD_LIBRARY_PATH-unset}" >> "$TEST_NODE_LOG"
if [ "$1" = scripts/apply-ecr-pre-pilot-predictive-nt-schema.mjs ]; then
  exit "${TEST_SCHEMA_STATUS:-0}"
fi
if [ "${TEST_SLEEP:-0}" = 1 ]; then exec /bin/sleep 30; fi
exit 37
""")
        node.chmod(0o700)
        env = dict(os.environ, PATH=str(directory) + ":" + os.environ["PATH"],
                   TEST_NODE_LOG=str(directory / "calls"), NODE_ENV="test")
        script = ["/bin/sh", "scripts/production-run.sh"]
        result = subprocess.run(script, env=env, check=False, timeout=20)
        assert result.returncode == 37, result.returncode
        calls = (directory / "calls").read_text().splitlines()
        assert calls == [
            "scripts/apply-ecr-pre-pilot-predictive-nt-schema.mjs|test|unset",
            "dist/index.js|production|unset",
        ], calls
        (directory / "calls").unlink()
        result = subprocess.run(script, env=dict(env, TEST_SCHEMA_STATUS="23"),
                                check=False, timeout=20)
        assert result.returncode == 23
        assert (directory / "calls").read_text().splitlines() == calls[:1]
        (directory / "calls").unlink()
        process = subprocess.Popen(script, env=dict(env, TEST_SLEEP="1"))
        try:
            import time
            for _ in range(100):
                if (directory / "calls").exists() and len(
                        (directory / "calls").read_text().splitlines()) == 2:
                    break
                time.sleep(0.05)
            else:
                raise AssertionError("production exec did not reach final command")
            process.send_signal(signal.SIGTERM)
            assert process.wait(timeout=5) == -signal.SIGTERM
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
        assert shutil.which("python3.12") == str(launcher)
        print("PASS: production command order, exit codes, exec/signal and Node isolation",
              flush=True)


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
    launcher = str(Path.cwd() / "dist/production-bin/python3.12")
    assert shutil.which("python3.12") == launcher
    subprocess.run([node, "scripts/prepare-production-runtime.mjs", "--verify"],
                   check=True, timeout=30)
    check_production_command(launcher)
    python_check = """
import os, sys
assert sys.executable == os.environ["EXPECTED_PYTHON"]
assert os.environ["LD_LIBRARY_PATH"] == os.environ["EXPECTED_LIBRARIES"]
print("PASS: pinned Python and child-only GCC/zlib")
"""
    subprocess.run(["python3.12", "-c", python_check], check=True, timeout=30)
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
        "tests/production-nix-active.test.ts",
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
    expression = """let pkgs=import <nixpkgs> {};
      deps = (import ./replit.nix {inherit pkgs;}).deps;
    in {
      roots = map (p: p.outPath) deps;
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
    if len(config["roots"]) != 6:
        raise RuntimeError("Unexpected active replit.nix root list")
    manifest = json.loads((source / "dist/production-bin/manifest.json").read_text())
    if manifest["roots"] != config["roots"] or \
            manifest["python"] != config["python"] + "/bin/python3.12" or \
            ":".join(manifest["libraries"]) != config["libraries"]:
        raise RuntimeError("Build-generated launcher does not match active Nix roots")
    python = config["python"] + "/bin/python3.12"
    shutil.copyfile(source / "tests/production-nix-document-smoke.test.ts",
                    candidate / "tests/production-nix-document-smoke.test.ts")
    shutil.copyfile(source / "tests/production-nix-active.test.ts",
                    candidate / "tests/production-nix-active.test.ts")
    shutil.copyfile(source / "replit.nix", candidate / "replit.nix")
    shutil.copyfile(source / "scripts/production-run.sh",
                    candidate / "scripts/production-run.sh")
    shutil.copyfile(source / "scripts/prepare-production-runtime.mjs",
                    candidate / "scripts/prepare-production-runtime.mjs")
    (candidate / "dist/production-bin").mkdir(exist_ok=True)
    shutil.copyfile(source / "dist/production-bin/python3.12",
                    candidate / "dist/production-bin/python3.12")
    (candidate / "dist/production-bin/python3.12").chmod(0o755)
    shutil.copyfile(source / "dist/production-bin/manifest.json",
                    candidate / "dist/production-bin/manifest.json")
    with tempfile.TemporaryDirectory(prefix="production-nix-smoke-") as temporary:
        env = {
            "PATH": ":".join([str(candidate / "dist/production-bin")]
                             + [p + "/bin" for p in config["roots"]]
                             + [str(Path(node).parent)]),
            "PYTHONDONTWRITEBYTECODE": "1",
            "HOME": temporary, "TMPDIR": temporary, "NODE_ENV": "test",
            "ISOLATED_NIX_SMOKE": "1", "LANG": "en_US.UTF-8",
            "EXPECTED_PYTHON": python,
            "EXPECTED_LIBRARIES": config["libraries"],
            "ACTIVE_REPLIT_PATH": str(source / ".replit"),
            "LOCALE_ARCHIVE": config["locales"] + "/lib/locale/locale-archive",
        }
        subprocess.run([
            "/usr/bin/unshare", "--user", "--map-root-user", "--net",
            python, str(Path(__file__).resolve()), "--isolated", node,
        ], cwd=candidate, env=env, check=True, timeout=450)


if __name__ == "__main__":
    main()
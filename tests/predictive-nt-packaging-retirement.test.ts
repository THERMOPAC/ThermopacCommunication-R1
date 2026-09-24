import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const distRoot = path.join(root, "dist");
const runtimeName = "predictive-nt-runtime-7c-1-6";
const runtimeRoot = path.join(distRoot, runtimeName);
const manifestName = "predictive-nt-runtime-manifest.json";
const retiredDirectories = [
  "predictive-nt-runtime",
  "predictive-nt-runtime-7c",
  "predictive-nt-runtime-7c-1-2",
  "predictive-nt-runtime-7c-1-3",
  "predictive-nt-runtime-7c-1-4",
  "predictive-nt-runtime-7c-1-5",
  "job-b-interface-runtime",
  "stage4-job-b-dogbox-runtime",
  "job-c-runtime",
  "stage4-seven-component-adapter-runtime",
];

async function filesUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  }));
  return files.flat();
}

describe("Predictive N_T production packaging", () => {
  it("deploys only runtime 7C-1.6 and removes retired runtime and adapter roots", async () => {
    const directories = (await readdir(distRoot, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    expect(directories).toContain(runtimeName);
    expect(directories.filter(name => name.startsWith("predictive-nt-runtime")))
      .toEqual([runtimeName]);
    expect(directories).not.toEqual(expect.arrayContaining(retiredDirectories));
  });

  it("has an exact, internally verified manifest with no untracked runtime files", async () => {
    const manifestBytes = await readFile(path.join(runtimeRoot, manifestName));
    const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
      schemaVersion: string;
      hashAlgorithm: string;
      fileCount: number;
      aggregateSha256: string;
      files: Array<{ path: string; bytes: number; sha256: string }>;
    };
    const diskFiles = (await filesUnder(runtimeRoot))
      .filter(file => path.basename(file) !== manifestName)
      .sort();
    const diskPaths = diskFiles.map(file =>
      path.relative(runtimeRoot, file).split(path.sep).join("/"));

    expect(manifest.schemaVersion).toBe("PREDICTIVE_NT_RUNTIME_MANIFEST_V1");
    expect(manifest.hashAlgorithm).toBe("sha256");
    expect(manifest.fileCount).toBe(manifest.files.length);
    expect(manifest.files.map(record => record.path)).toEqual(diskPaths);

    for (const [index, absolute] of diskFiles.entries()) {
      const content = await readFile(absolute);
      expect(manifest.files[index]).toMatchObject({
        bytes: (await stat(absolute)).size,
        sha256: createHash("sha256").update(content).digest("hex"),
      });
    }
    const recordText = manifest.files
      .map(record => `${record.path}:${record.bytes}:${record.sha256}`)
      .join("\n");
    expect(manifest.aggregateSha256)
      .toBe(createHash("sha256").update(recordText).digest("hex"));
  });

  it("keeps retired packagers out of the production build command", async () => {
    const packageJson = JSON.parse(await readFile(
      path.join(root, "package.json"), "utf8",
    )) as { scripts: Record<string, string> };

    expect(packageJson.scripts.build).toContain("package-predictive-nt-runtime.mjs");
    expect(packageJson.scripts.build).not.toContain("package-job-b-interface.mjs");
    expect(packageJson.scripts.build).not.toContain("package-stage4-job-b-dogbox.mjs");
    expect(packageJson.scripts.build).not.toContain("package-job-c-runtime.mjs");
  });
});

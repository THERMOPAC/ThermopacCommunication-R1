import { describe, expect, it } from "vitest";

// Explicit opt-in. Existing DEVELOPMENT records only; no accounts, sessions,
// optimizer jobs, schema writes, saved selections or snapshots are created.
describe.skipIf(process.env.STAGE5_LIVE_READ !== "1")("development stored Stage 5 read integration", () => {
  it("concurrently reads actual revision/end authority and produces matching GA and Design Data PDF without changing stored business data", async () => {
    if (process.env.NODE_ENV === "production") throw new Error("Development-only integration");
    const { pool } = await import("../server/db");
    const { getStage5Revisions, getStage5FrozenRevision } = await import("../server/ecr-pre-pilot/stage5-geometry-service");
    const { getAutomaticStage5EndSections } = await import("../server/ecr-pre-pilot/stage5-end-sections-service");
    const { createStage5DesignDataPdf } = await import("../server/ecr-pre-pilot/stage5-design-data-report");
    const { renderEndSchematic } = await import("../shared/ecr-stage5-end-schematic");
    const design = 269, revisionId = "8";
    const fingerprint = async () => ({
      design: (await pool.query("SELECT md5(input_data::text) AS hash FROM ecr_pre_pilot_designs WHERE id=$1", [design])).rows,
      revisions: (await pool.query("SELECT id,revision,source_hash,immutable_hash FROM ecr_pre_pilot_stage5_geometry_revisions WHERE design_id=$1 ORDER BY id", [design])).rows,
      selections: (await pool.query("SELECT selection,source_hash,updated_at FROM ecr_pre_pilot_stage5_end_sections WHERE design_id=$1", [design])).rows,
    });
    try {
      const before = await fingerprint();
      const owner = (await pool.query("SELECT created_by FROM ecr_pre_pilot_designs WHERE id=$1", [design])).rows[0];
      expect(owner).toBeTruthy();
      const start = Date.now();
      const [ends, records, pdfRecord] = await Promise.all([
        getAutomaticStage5EndSections(owner.created_by, design, revisionId),
        getStage5Revisions(owner.created_by, design, revisionId),
        getStage5FrozenRevision(owner.created_by, design, revisionId),
      ]);
      expect(records[0].currentness).toBe("CURRENT");
      expect(ends.active.sourceHash).toBe(records[0].sourceHash);
      expect(ends.active).toMatchObject({ revisionId, diameterM: .7, compartmentCount: 20, installedActiveHeightM: 4.2 });
      const svg = renderEndSchematic(ends, "ga");
      expect(svg).toContain('data-projection="current-conditional-ga"');
      expect(svg).toContain('data-system-design="pending"');
      expect(svg).not.toContain('data-shell-width');
      expect(ends.assemblies.top.diameterM).toBeNull();
      expect(ends.assemblies.bottom.diameterM).toBeNull();
      const pdf = await createStage5DesignDataPdf(pdfRecord, design);
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(1000);
      expect(await fingerprint()).toEqual(before);
      process.stdout.write(JSON.stringify({ evidence: "DEVELOPMENT REAL-DATA READ SUCCESS", design, revisionId, milliseconds: Date.now() - start,
        currentness: records[0].currentness, gaBytes: svg.length, pdfBytes: pdf.length,
        normalAuthority: ends.normalProductAuthority.status, storedBusinessDataUnchanged: true }) + "\n");
    } finally { await pool.end(); }
  }, 180000);
});
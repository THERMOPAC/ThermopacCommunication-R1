import { Router } from "express";
import { db } from "./db";
import { departmentMaster } from "@shared/schema";
import { eq, asc } from "drizzle-orm";

export const departmentRouter = Router();

// GET /api/departments
// C1: Public — no authentication required. Returns active departments only.
// Cache-Control: max-age=300 (departments change rarely)
departmentRouter.get("/departments", async (req, res) => {
  try {
    const rows = await db
      .select({
        id:        departmentMaster.id,
        name:      departmentMaster.name,
        code:      departmentMaster.code,
        sortOrder: departmentMaster.sortOrder,
      })
      .from(departmentMaster)
      .where(eq(departmentMaster.isActive, true))
      .orderBy(asc(departmentMaster.sortOrder));

    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(rows);
  } catch (error) {
    console.error("[DeptRoute] Failed to fetch departments:", error);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

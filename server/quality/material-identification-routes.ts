import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { validateSchema } from "../utils/validate-schema";

const router = Router();

// Schema for material identification validation 
const materialIdentificationSchema = z.object({
  materialIdentificationId: z.string(),
  projectId: z.number().or(z.string().transform(id => parseInt(id))),
  projectNumber: z.string(),
  projectName: z.string(),
  inspectionOrderNumber: z.string(),
  materialDescription: z.string(),
  materialCode: z.string(),
  specification: z.string(),
  materialGrade: z.string(),
  heatNumber: z.string(),
  batchNumber: z.string().optional(),
  millName: z.string(),
  millTestCertificateNumber: z.string(),
  quantity: z.string(),
  dimensions: z.string(),
  materialStatus: z.string(),
  inspectorName: z.string(),
  inspectionDate: z.string().or(z.date().transform(date => date.toISOString().split('T')[0])),
  remarks: z.string().optional(),
  createdBy: z.number().optional(),
  updatedBy: z.number().optional()
});

// Get all material identifications
router.get("/", async (req, res) => {
  try {
    const materialIdentifications = await db.execute(sql`
      SELECT * FROM material_identification
      ORDER BY created_at DESC
    `);
    
    res.json(materialIdentifications);
  } catch (error) {
    console.error("Error getting material identifications:", error);
    res.status(500).json({ error: "Failed to get material identifications" });
  }
});

// Get next Material Identification ID (format: MI-YYYY-N)
router.get("/next-id", async (req, res) => {
  try {
    // Get current year
    const currentYear = new Date().getFullYear();
    
    // Check if counter exists for current year
    const counterResult = await db.execute(sql`
      SELECT * FROM material_identification_counter
      WHERE year = ${currentYear}
    `);
    
    let sequence = 1;
    
    if (!counterResult || counterResult.length === 0) {
      // Insert new counter for current year
      await db.execute(sql`
        INSERT INTO material_identification_counter (year, sequence)
        VALUES (${currentYear}, ${sequence})
      `);
    } else {
      // Use existing counter
      sequence = counterResult[0].sequence;
    }
    
    // Format next ID
    const nextId = `MI-${currentYear}-${sequence}`;
    
    res.json({ nextId });
  } catch (error) {
    console.error("Error getting next Material Identification ID:", error);
    res.status(500).json({ error: "Failed to generate next ID" });
  }
});

// Create new material identification
router.post("/", validateSchema(materialIdentificationSchema), async (req, res) => {
  try {
    const data = req.body;
    
    // If user is authenticated, add user ID as creator
    if (req.user) {
      data.createdBy = req.user.id;
      data.updatedBy = req.user.id;
    }
    
    // Insert material identification record
    const result = await db.execute(sql`
      INSERT INTO material_identification (
        material_identification_id,
        project_id,
        project_number,
        project_name,
        inspection_order_number,
        material_description,
        material_code,
        specification,
        material_grade,
        heat_number,
        batch_number,
        mill_name,
        mill_test_certificate_number,
        quantity,
        dimensions,
        material_status,
        inspector_name,
        inspection_date,
        remarks,
        created_by,
        updated_by
      ) VALUES (
        ${data.materialIdentificationId},
        ${data.projectId},
        ${data.projectNumber},
        ${data.projectName},
        ${data.inspectionOrderNumber},
        ${data.materialDescription},
        ${data.materialCode},
        ${data.specification},
        ${data.materialGrade},
        ${data.heatNumber},
        ${data.batchNumber || null},
        ${data.millName},
        ${data.millTestCertificateNumber},
        ${data.quantity},
        ${data.dimensions},
        ${data.materialStatus},
        ${data.inspectorName},
        ${data.inspectionDate},
        ${data.remarks || null},
        ${data.createdBy || null},
        ${data.updatedBy || null}
      ) RETURNING *
    `);
    
    // Increment the sequence for the next material identification
    const currentYear = new Date().getFullYear();
    await db.execute(sql`
      UPDATE material_identification_counter
      SET sequence = sequence + 1, updated_at = CURRENT_TIMESTAMP
      WHERE year = ${currentYear}
    `);
    
    res.status(201).json(result[0]);
  } catch (error) {
    console.error("Error creating material identification:", error);
    res.status(500).json({ error: "Failed to create material identification" });
  }
});

// Get material identification by ID
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    
    const materialIdentification = await db.execute(sql`
      SELECT * FROM material_identification
      WHERE id = ${id}
    `);
    
    if (materialIdentification.length === 0) {
      return res.status(404).json({ error: "Material identification not found" });
    }
    
    res.json(materialIdentification[0]);
  } catch (error) {
    console.error("Error getting material identification:", error);
    res.status(500).json({ error: "Failed to get material identification" });
  }
});

// Get material identifications by project ID
router.get("/project/:projectId", async (req, res) => {
  try {
    const projectId = req.params.projectId;
    
    const materialIdentifications = await db.execute(sql`
      SELECT * FROM material_identification
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
    `);
    
    res.json(materialIdentifications);
  } catch (error) {
    console.error("Error getting material identifications for project:", error);
    res.status(500).json({ error: "Failed to get material identifications for project" });
  }
});

export default router;
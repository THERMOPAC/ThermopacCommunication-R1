import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { Request, Response, NextFunction } from "express";
import { AnyZodObject } from "zod";

// Inline middleware to validate request body against a Zod schema
const validateSchema = (schema: AnyZodObject) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = schema.parse(req.body);
      req.body = validatedData;
      next();
    } catch (error) {
      console.error("Validation error:", error);
      return res.status(400).json({
        error: "Validation failed",
        details: error
      });
    }
  };
};

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

// Get all material identifications with optional filters
router.get("/", async (req, res) => {
  try {
    const {
      search,
      projectId,
      materialGrade,
      status,
      fromDate,
      toDate,
      page = "1", 
      limit = "20"
    } = req.query;

    // Build where conditions
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (search) {
      conditions.push(`
        (
          material_identification_id ILIKE ${sql.placeholder} OR
          material_description ILIKE ${sql.placeholder} OR
          material_code ILIKE ${sql.placeholder} OR
          heat_number ILIKE ${sql.placeholder} OR
          mill_test_certificate_number ILIKE ${sql.placeholder} OR
          inspector_name ILIKE ${sql.placeholder}
        )
      `);
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam, searchParam, searchParam, searchParam);
    }
    
    if (projectId) {
      conditions.push(`project_id = ${sql.placeholder}`);
      params.push(projectId);
    }
    
    if (materialGrade) {
      conditions.push(`material_grade = ${sql.placeholder}`);
      params.push(materialGrade);
    }
    
    if (status) {
      conditions.push(`material_status = ${sql.placeholder}`);
      params.push(status);
    }
    
    if (fromDate) {
      conditions.push(`inspection_date >= ${sql.placeholder}`);
      params.push(fromDate);
    }
    
    if (toDate) {
      conditions.push(`inspection_date <= ${sql.placeholder}`);
      params.push(toDate);
    }
    
    // Parse pagination parameters
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;
    
    // Create base query
    let baseQuery = sql`SELECT * FROM material_identification`;
    
    // Add where conditions if there are any
    if (conditions.length > 0) {
      baseQuery = sql`${baseQuery} WHERE ${sql.join(conditions.map(c => sql.raw(c)), sql` AND `)}`;
    }
    
    // Add order by and pagination
    baseQuery = sql`${baseQuery} ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offset}`;
    
    // Execute the query
    const materialIdentifications = await db.execute(baseQuery) as any;
    
    // Count query for pagination
    let countQuery = sql`SELECT COUNT(*) FROM material_identification`;
    
    // Add the same conditions to count query
    if (conditions.length > 0) {
      countQuery = sql`${countQuery} WHERE ${sql.join(conditions.map(c => sql.raw(c)), sql` AND `)}`;
    }
    
    // Execute count query
    const countResult = await db.execute(countQuery) as any;
    
    const totalCount = parseInt(countResult.rows[0]?.count || '0', 10);
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({
      data: materialIdentifications.rows || [],
      pagination: {
        total: totalCount,
        page: pageNum,
        limit: limitNum,
        totalPages
      }
    });
  } catch (error) {
    console.error("Error getting material identifications:", error);
    res.status(500).json({ error: "Failed to get material identifications" });
  }
});

// Define the type for the counter table rows
interface MaterialIdentificationCounter {
  id: number;
  year: number;
  sequence: number;
  updated_at: Date;
}

// Get next Material Identification ID (format: MI-YYYY-N)
router.get("/next-id", async (req, res) => {
  try {
    // Get current year
    const currentYear = new Date().getFullYear();
    
    // Check if counter exists for current year
    const counterResult = await db.execute(sql`
      SELECT * FROM material_identification_counter
      WHERE year = ${currentYear}
    `) as any;
    
    let sequence = 1;
    
    if (!counterResult || !counterResult.rows || counterResult.rows.length === 0) {
      // Insert new counter for current year
      await db.execute(sql`
        INSERT INTO material_identification_counter (year, sequence)
        VALUES (${currentYear}, ${sequence})
      `);
    } else {
      // Use existing counter
      sequence = counterResult.rows[0].sequence;
    }
    
    // Format next ID
    const nextId = `MI-${currentYear}-${sequence}`;
    
    res.json({ nextId });
  } catch (error) {
    console.error("Error getting next Material Identification ID:", error);
    res.status(500).json({ error: "Failed to generate next ID" });
  }
});

// Define the interface for Material Identification records
interface MaterialIdentification {
  id: number;
  material_identification_id: string;
  project_id: number;
  project_number: string;
  project_name: string;
  inspection_order_number: string;
  material_description: string;
  material_code: string;
  specification: string;
  material_grade: string;
  heat_number: string;
  batch_number: string | null;
  mill_name: string;
  mill_test_certificate_number: string;
  quantity: string;
  dimensions: string;
  material_status: string;
  inspector_name: string;
  inspection_date: string;
  remarks: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: number | null;
  updated_by: number | null;
}

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
    
    if (result && result.rows && result.rows.length > 0) {
      res.status(201).json(result.rows[0]);
    } else {
      throw new Error("No data returned from insert operation");
    }
  } catch (error) {
    console.error("Error creating material identification:", error);
    res.status(500).json({ error: "Failed to create material identification" });
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
    `) as any;
    
    res.json(materialIdentifications.rows || []);
  } catch (error) {
    console.error("Error getting material identifications for project:", error);
    res.status(500).json({ error: "Failed to get material identifications for project" });
  }
});

// Special case for "new" record creation
router.get("/new", async (req, res) => {
  try {
    // Return an empty template for a new record
    return res.json({
      material_identification_id: '',
      project_id: null,
      project_number: '',
      project_name: '',
      inspection_order_number: '',
      material_description: '',
      material_code: '',
      specification: '',
      material_grade: '',
      heat_number: '',
      batch_number: null,
      mill_name: '',
      mill_test_certificate_number: '',
      quantity: '',
      dimensions: '',
      material_status: '',
      inspector_name: '',
      inspection_date: new Date().toISOString().split('T')[0],
      remarks: null
    });
  } catch (error) {
    console.error("Error creating new material identification template:", error);
    res.status(500).json({ error: "Failed to create new material identification template" });
  }
});

// Update (edit) material identification record
router.put("/:id", validateSchema(materialIdentificationSchema), async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;
    
    // If user is authenticated, add user ID as updater
    if (req.user) {
      data.updatedBy = req.user.id;
    }
    
    // Check if the record exists
    const checkRecord = await db.execute(sql`
      SELECT id FROM material_identification WHERE id = ${id}
    `) as any;
    
    if (!checkRecord || !checkRecord.rows || checkRecord.rows.length === 0) {
      return res.status(404).json({ error: "Material identification record not found" });
    }
    
    // Update the record
    const result = await db.execute(sql`
      UPDATE material_identification SET
        material_identification_id = ${data.materialIdentificationId},
        project_id = ${data.projectId},
        project_number = ${data.projectNumber},
        project_name = ${data.projectName},
        inspection_order_number = ${data.inspectionOrderNumber},
        material_description = ${data.materialDescription},
        material_code = ${data.materialCode},
        specification = ${data.specification},
        material_grade = ${data.materialGrade},
        heat_number = ${data.heatNumber},
        batch_number = ${data.batchNumber || null},
        mill_name = ${data.millName},
        mill_test_certificate_number = ${data.millTestCertificateNumber},
        quantity = ${data.quantity},
        dimensions = ${data.dimensions},
        material_status = ${data.materialStatus},
        inspector_name = ${data.inspectorName},
        inspection_date = ${data.inspectionDate},
        remarks = ${data.remarks || null},
        updated_by = ${data.updatedBy || null},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
      RETURNING *
    `);
    
    if (result && result.rows && result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      throw new Error("No data returned from update operation");
    }
  } catch (error) {
    console.error("Error updating material identification:", error);
    res.status(500).json({ error: "Failed to update material identification" });
  }
});

// Get material identification by ID - this must come after all other specific routes
router.get("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    
    // Regular case - get by ID
    const materialIdentification = await db.execute(sql`
      SELECT * FROM material_identification
      WHERE id = ${id}
    `) as any;
    
    if (!materialIdentification || !materialIdentification.rows || materialIdentification.rows.length === 0) {
      return res.status(404).json({ error: "Material identification not found" });
    }
    
    res.json(materialIdentification.rows[0]);
  } catch (error) {
    console.error("Error getting material identification:", error);
    res.status(500).json({ error: "Failed to get material identification" });
  }
});

export default router;
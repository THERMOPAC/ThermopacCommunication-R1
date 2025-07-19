import express from "express";
import { db } from "./db";
import { projects, customers, designProjects } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = express.Router();

// Get dashboard statistics
router.get("/dashboard/stats", async (req, res) => {
  try {
    // Get total projects count
    const totalProjects = await db.select().from(projects);
    
    // Get design projects count (projects that have design activities)
    const designProjectsCount = await db.select().from(designProjects);
    
    // For now, return basic stats - can be enhanced later
    const stats = {
      totalProjects: totalProjects.length,
      designProjects: designProjectsCount.length,
      activeDrawings: 0, // Will be implemented when drawing registry is active
      pendingReviews: 0, // Will be implemented when review system is active
      completedTransmittals: 0 // Will be implemented when transmittal system is active
    };

    res.json(stats);
  } catch (error) {
    console.error("Error fetching design dashboard stats:", error);
    res.status(500).json({ error: "Failed to fetch dashboard statistics" });
  }
});

// Get all projects with customer information for design management
router.get("/projects", async (req, res) => {
  try {
    // Use raw SQL to avoid complex Drizzle ORM issues
    const result = await db.execute(`
      SELECT 
        p.id,
        p.name as "projectName",
        p.code as "projectCode", 
        c.customer_name as "customerName",
        p.customer_id as "customerId",
        p.status,
        p.start_date as "startDate",
        p.target_end_date as "targetEndDate",
        p.actual_end_date as "actualEndDate",
        p.estimated_budget as "estimatedBudget",
        p.actual_cost as "actualCost",
        p.currency,
        p.description,
        p.progress,
        p.priority,
        p.financial_year as "financialYear"
      FROM projects p
      LEFT JOIN customers c ON p.customer_id = c.id
      ORDER BY p.created_at DESC
    `);

    res.json(result.rows || []);
  } catch (error) {
    console.error("Error fetching projects for design management:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// Get design project details by project ID
router.get("/projects/:id", async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    
    // Get project by ID
    const projectData = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    
    if (projectData.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    
    const projectRecord = projectData[0];
    
    // Get customer if project has one
    let customer = null;
    if (projectRecord.customerId) {
      const customerData = await db
        .select()
        .from(customers)
        .where(eq(customers.id, projectRecord.customerId))
        .limit(1);
      customer = customerData[0] || null;
    }
    
    // Map project with customer information
    const project = [{
      id: projectRecord.id,
      projectName: projectRecord.name,
      projectCode: projectRecord.code,
      customerName: customer?.customerName || null,
      customerId: projectRecord.customerId,
      status: projectRecord.status,
      startDate: projectRecord.startDate,
      targetEndDate: projectRecord.targetEndDate,
      actualEndDate: projectRecord.actualEndDate,
      estimatedBudget: projectRecord.estimatedBudget,
      actualCost: projectRecord.actualCost,
      currency: projectRecord.currency,
      description: projectRecord.description,
      progress: projectRecord.progress,
      priority: projectRecord.priority,
      financialYear: projectRecord.financialYear
    }];

    if (project.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(project[0]);
  } catch (error) {
    console.error("Error fetching project details:", error);
    res.status(500).json({ error: "Failed to fetch project details" });
  }
});

export default router;
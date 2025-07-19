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
    // Get all projects with customer details
    const projectsWithCustomers = await db
      .select({
        id: projects.id,
        projectName: projects.projectName,
        projectCode: projects.projectCode,
        customerName: customers.customerName,
        customerId: projects.customerId,
        status: projects.status,
        startDate: projects.startDate,
        endDate: projects.endDate,
        projectValue: projects.projectValue,
        currency: projects.currency,
        description: projects.description
      })
      .from(projects)
      .leftJoin(customers, eq(projects.customerId, customers.id));

    res.json(projectsWithCustomers);
  } catch (error) {
    console.error("Error fetching projects for design management:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// Get design project details by project ID
router.get("/projects/:id", async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    
    // Get project with customer details
    const project = await db
      .select({
        id: projects.id,
        projectName: projects.projectName,
        projectCode: projects.projectCode,
        customerName: customers.customerName,
        customerId: projects.customerId,
        status: projects.status,
        startDate: projects.startDate,
        endDate: projects.endDate,
        projectValue: projects.projectValue,
        currency: projects.currency,
        description: projects.description
      })
      .from(projects)
      .leftJoin(customers, eq(projects.customerId, customers.id))
      .where(eq(projects.id, projectId))
      .limit(1);

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
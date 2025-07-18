import { Router } from "express";
import { db } from "./db";
import { designProjects, projects, users } from "@shared/schema";
import { eq, desc, asc, like, and, or } from "drizzle-orm";
import { ensureAuthenticated } from "./auth-middleware";

const router = Router();

// Get all design projects with project details
router.get("/design-projects", ensureAuthenticated, async (req, res) => {
  try {
    const { search, status, designPhase, projectId } = req.query;
    
    let conditions = [];
    
    if (search) {
      conditions.push(
        or(
          like(designProjects.designProjectName, `%${search}%`),
          like(designProjects.description, `%${search}%`),
          like(designProjects.projectCode, `%${search}%`)
        )
      );
    }
    
    if (status) {
      conditions.push(eq(designProjects.status, status as string));
    }
    
    if (designPhase) {
      conditions.push(eq(designProjects.designPhase, designPhase as string));
    }
    
    if (projectId) {
      conditions.push(eq(designProjects.projectId, parseInt(projectId as string)));
    }

    const designProjectsList = await db
      .select({
        id: designProjects.id,
        projectId: designProjects.projectId,
        projectCode: designProjects.projectCode,
        designProjectName: designProjects.designProjectName,
        description: designProjects.description,
        designPhase: designProjects.designPhase,
        status: designProjects.status,
        designManagerId: designProjects.designManagerId,
        teamMembers: designProjects.teamMembers,
        startDate: designProjects.startDate,
        targetEndDate: designProjects.targetEndDate,
        actualEndDate: designProjects.actualEndDate,
        clientApprovalRequired: designProjects.clientApprovalRequired,
        clientContactInfo: designProjects.clientContactInfo,
        overallProgress: designProjects.overallProgress,
        createdBy: designProjects.createdBy,
        createdAt: designProjects.createdAt,
        updatedAt: designProjects.updatedAt,
        // Project details
        projectName: projects.projectName,
        projectStatus: projects.status,
        customerName: projects.customerName,
        // Design Manager details
        designManagerName: users.username,
        designManagerFirstName: users.firstName,
        designManagerLastName: users.lastName,
      })
      .from(designProjects)
      .leftJoin(projects, eq(designProjects.projectId, projects.id))
      .leftJoin(users, eq(designProjects.designManagerId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(designProjects.createdAt));

    res.json(designProjectsList);
  } catch (error) {
    console.error("Error fetching design projects:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single design project by ID
router.get("/design-projects/:id", ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    
    const designProject = await db
      .select({
        id: designProjects.id,
        projectId: designProjects.projectId,
        projectCode: designProjects.projectCode,
        designProjectName: designProjects.designProjectName,
        description: designProjects.description,
        designPhase: designProjects.designPhase,
        status: designProjects.status,
        designManagerId: designProjects.designManagerId,
        teamMembers: designProjects.teamMembers,
        startDate: designProjects.startDate,
        targetEndDate: designProjects.targetEndDate,
        actualEndDate: designProjects.actualEndDate,
        clientApprovalRequired: designProjects.clientApprovalRequired,
        clientContactInfo: designProjects.clientContactInfo,
        overallProgress: designProjects.overallProgress,
        createdBy: designProjects.createdBy,
        createdAt: designProjects.createdAt,
        updatedAt: designProjects.updatedAt,
        // Project details
        projectName: projects.projectName,
        projectStatus: projects.status,
        customerName: projects.customerName,
        projectDescription: projects.description,
        // Design Manager details
        designManagerName: users.username,
        designManagerFirstName: users.firstName,
        designManagerLastName: users.lastName,
      })
      .from(designProjects)
      .leftJoin(projects, eq(designProjects.projectId, projects.id))
      .leftJoin(users, eq(designProjects.designManagerId, users.id))
      .where(eq(designProjects.id, parseInt(id)))
      .limit(1);

    if (designProject.length === 0) {
      return res.status(404).json({ error: "Design project not found" });
    }

    res.json(designProject[0]);
  } catch (error) {
    console.error("Error fetching design project:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create new design project
router.post("/design-projects", ensureAuthenticated, async (req, res) => {
  try {
    const {
      projectId,
      projectCode,
      designProjectName,
      description,
      designPhase,
      status,
      designManagerId,
      teamMembers,
      startDate,
      targetEndDate,
      clientApprovalRequired,
      clientContactInfo,
      overallProgress
    } = req.body;

    // Validate required fields
    if (!projectId || !designProjectName || !designPhase || !designManagerId) {
      return res.status(400).json({ 
        error: "Missing required fields: projectId, designProjectName, designPhase, designManagerId" 
      });
    }

    // Verify project exists
    const project = await db
      .select({ id: projects.id, projectCode: projects.projectCode })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (project.length === 0) {
      return res.status(400).json({ error: "Invalid project ID" });
    }

    const newDesignProject = await db
      .insert(designProjects)
      .values({
        projectId,
        projectCode: projectCode || project[0].projectCode,
        designProjectName,
        description,
        designPhase,
        status: status || 'Draft',
        designManagerId,
        teamMembers: teamMembers || [],
        startDate: startDate ? new Date(startDate) : null,
        targetEndDate: targetEndDate ? new Date(targetEndDate) : null,
        clientApprovalRequired: clientApprovalRequired || false,
        clientContactInfo,
        overallProgress: overallProgress || 0,
        createdBy: req.user!.id,
      })
      .returning();

    res.status(201).json(newDesignProject[0]);
  } catch (error) {
    console.error("Error creating design project:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update design project
router.put("/design-projects/:id", ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      projectId,
      projectCode,
      designProjectName,
      description,
      designPhase,
      status,
      designManagerId,
      teamMembers,
      startDate,
      targetEndDate,
      actualEndDate,
      clientApprovalRequired,
      clientContactInfo,
      overallProgress
    } = req.body;

    // Check if design project exists
    const existingProject = await db
      .select()
      .from(designProjects)
      .where(eq(designProjects.id, parseInt(id)))
      .limit(1);

    if (existingProject.length === 0) {
      return res.status(404).json({ error: "Design project not found" });
    }

    // If projectId is being updated, verify the new project exists
    if (projectId && projectId !== existingProject[0].projectId) {
      const project = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (project.length === 0) {
        return res.status(400).json({ error: "Invalid project ID" });
      }
    }

    const updatedDesignProject = await db
      .update(designProjects)
      .set({
        projectId,
        projectCode,
        designProjectName,
        description,
        designPhase,
        status,
        designManagerId,
        teamMembers,
        startDate: startDate ? new Date(startDate) : null,
        targetEndDate: targetEndDate ? new Date(targetEndDate) : null,
        actualEndDate: actualEndDate ? new Date(actualEndDate) : null,
        clientApprovalRequired,
        clientContactInfo,
        overallProgress,
        updatedAt: new Date(),
      })
      .where(eq(designProjects.id, parseInt(id)))
      .returning();

    res.json(updatedDesignProject[0]);
  } catch (error) {
    console.error("Error updating design project:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete design project
router.delete("/design-projects/:id", ensureAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedProject = await db
      .delete(designProjects)
      .where(eq(designProjects.id, parseInt(id)))
      .returning();

    if (deletedProject.length === 0) {
      return res.status(404).json({ error: "Design project not found" });
    }

    res.json({ message: "Design project deleted successfully" });
  } catch (error) {
    console.error("Error deleting design project:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get design project statistics
router.get("/design-projects-stats", ensureAuthenticated, async (req, res) => {
  try {
    const stats = await db
      .select({
        status: designProjects.status,
        designPhase: designProjects.designPhase,
        count: designProjects.id,
      })
      .from(designProjects);

    const statusCounts = stats.reduce((acc: any, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + 1;
      return acc;
    }, {});

    const phaseCounts = stats.reduce((acc: any, curr) => {
      acc[curr.designPhase] = (acc[curr.designPhase] || 0) + 1;
      return acc;
    }, {});

    const totalProjects = stats.length;
    const activeProjects = stats.filter(s => 
      ['In Progress', 'Under Review'].includes(s.status)
    ).length;

    res.json({
      totalProjects,
      activeProjects,
      statusCounts,
      phaseCounts,
    });
  } catch (error) {
    console.error("Error fetching design project stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
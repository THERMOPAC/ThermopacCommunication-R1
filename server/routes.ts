import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertTaskSchema, insertUserSchema, insertRecurringPatternSchema, insertRecurringTaskSchema } from "@shared/schema";
import { canManage, roleHierarchy } from "@shared/roles";
import { scrypt, timingSafeEqual, randomBytes } from "crypto";
import { promisify } from "util";
import { eq, sql } from "drizzle-orm";
import { setupGmailRoutes } from "./gmail-routes";
import { setupGoogleAuth } from "./google-auth";
import { setupInternalMessagesRoutes } from "./internal-messages-routes";
import { setupProjectRoutes } from "./project-routes";
import { setupCustomerImportRoutes } from "./customer-import";
import { setupProjectItemsImportRoutes } from "./project-items-import";
import { setupMasterItemsImportRoutes } from "./master-items-import";
import { setupFileStorageRoutes } from "./file-storage-routes";
import { setupItemComponentsImportRoutes } from "./item-components-import";
import { setupProductionRoutes } from "./production-routes";
import { setupProcurementRoutes } from "./procurement-routes";
import { setupQualityRoutes } from "./quality-routes";
import { setupDispatchRoutes } from "./dispatch-routes";
import { setupEngineeringChangeRoutes } from "./engineering-change-routes";
import { default as afterSalesRoutes } from "./after-sales-routes";
import { default as modulePermissionRoutes } from "./module-permission-routes";
import { default as standaloneRoutes } from "./standalone-routes";
import { hashPassword as updatePasswordHash } from "./update-password";
import { setupTestWelderRoute } from "./quality/test-welder-route";
import { setupApiTestRoutes } from "./api-test-route";
import { setupDedicatedTestRoutes } from "./dedicated-test-route";
import { setupSalesMarketingRoutes } from "./sales-marketing-routes";
import { default as financeRoutes } from "./finance-routes";
import { default as simpleFinanceRoutes } from "./simple-finance-routes";
import { financeReportRouter } from "./finance-report-routes";
import { paymentAllocationApi } from "./payment-allocation-api";
import { default as financeWriteOffsRouter } from "./finance-write-offs";
import { registerFileUploadTestRoutes } from "./test/file-upload-test";
import calibrationTestRoutes from "./testapi/calibration-test-routes";
import { registerTemplateManagementRoutes } from "./template-management/register-routes";
import { registerCalibrationTestRoutes } from "./calibration-test-routes";
import { db } from "./db";
import { masterItems as masterItemsTable, projectItems as projectItemsTable } from "@shared/schema";
import { checkGcsPermissions } from "./utils/gcs-permissions-check";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Register finance report routes
  app.use('/api/finance-reports', financeReportRouter);
  setupAuth(app);
  
  // Set up Gmail integration routes
  setupGmailRoutes(app);
  
  // Set up Google OAuth authentication
  setupGoogleAuth(app);
  
  // Set up internal messages routes
  setupInternalMessagesRoutes(app);
  
  // Set up project management routes
  setupProjectRoutes(app);
  
  // Set up customer import routes
  setupCustomerImportRoutes(app);
  
  // Set up project items import routes
  setupProjectItemsImportRoutes(app);
  
  // Set up master items import routes
  setupMasterItemsImportRoutes(app);
  
  // Set up file storage routes
  setupFileStorageRoutes(app);
  
  // Set up item components import routes
  setupItemComponentsImportRoutes(app);
  
  // Set up production management routes
  setupProductionRoutes(app);
  
  // Set up sales and marketing routes
  setupSalesMarketingRoutes(app);
  
  // Set up procurement management routes
  setupProcurementRoutes(app);
  
  // Set up quality management routes
  setupQualityRoutes(app);
  
  // Set up test welder route (for debugging)
  setupTestWelderRoute(app);
  
  // Set up API test routes for troubleshooting
  setupApiTestRoutes(app);
  
  // Set up dedicated test routes that bypass React app
  // These should be registered BEFORE app.use("*", ...) in setupVite
  setupDedicatedTestRoutes(app);
  
  // Set up file upload test routes for GCS diagnostics
  registerFileUploadTestRoutes(app);
  
  // Set up calibration test routes
  registerCalibrationTestRoutes(app);
  
  // Set up dispatch and shipping routes
  setupDispatchRoutes(app);
  
  // Set up engineering change routes
  setupEngineeringChangeRoutes(app);
  
  // Set up after-sales module routes
  app.use('/api/after-sales', afterSalesRoutes);
  
  // Set up finance module routes
  app.use('/api/finance', financeRoutes);
  
  // Set up payment allocation API
  app.use('/api/finance', paymentAllocationApi);
  
  // Set up simplified finance routes (no database connection required)
  app.use('/api/simple-finance', simpleFinanceRoutes);
  
  // Set up template management routes
  registerTemplateManagementRoutes(app);
  
  // Set up module permissions routes
  app.use(modulePermissionRoutes);
  
  // GCS Storage Diagnostics Route - only accessible by Superusers
  app.get("/api/gcs-permissions-check", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      // Only allow Superusers to run diagnostics
      if (req.user!.role !== "Superuser") {
        return res.status(403).json({ error: 'Only Superusers can access storage diagnostics' });
      }
      
      const diagnosticResults = await checkGcsPermissions();
      res.json(diagnosticResults);
    } catch (error) {
      console.error("Error checking GCS permissions:", error);
      res.status(500).json({ 
        error: 'Failed to check GCS permissions',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Database Maintenance Routes
  app.post("/api/db-maintenance/reset-master-items", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      // Only allow Superuser to perform this operation
      if (req.user!.role !== "Superuser") {
        return res.status(403).json({ error: 'Only Superuser can perform this operation' });
      }
      
      // Count project items that reference master items
      const projectItems = await db
        .select()
        .from(projectItemsTable)
        .where(sql`${projectItemsTable.itemId} IS NOT NULL`);
      const projectItemCount = projectItems.length;
      
      console.log(`Found ${projectItemCount} project items referencing master items`);
      
      // Determine if we need to keep a placeholder item
      if (projectItemCount > 0) {
        let placeholderId;
        let usingExistingPlaceholder = false;
        
        // Check if a placeholder item already exists
        const existingPlaceholders = await db.select()
          .from(masterItemsTable)
          .where(eq(masterItemsTable.itemCode, "PLACEHOLDER-RESET-REFERENCE"));
        
        if (existingPlaceholders.length > 0) {
          // Use existing placeholder
          placeholderId = existingPlaceholders[0].id;
          usingExistingPlaceholder = true;
          console.log(`Using existing placeholder with ID: ${placeholderId}`);
          
          // First update all project items to reference the placeholder
          console.log(`Updating ${projectItemCount} project items to reference placeholder ${placeholderId}`);
          
          // Loop through each project item and update them one by one to prevent constraint violations
          for (const projectItem of projectItems) {
            await db.update(projectItemsTable)
              .set({ itemId: placeholderId })
              .where(eq(projectItemsTable.id, projectItem.id));
            console.log(`Updated project item ${projectItem.id} to reference placeholder ${placeholderId}`);
          }
          
          console.log(`Updated all ${projectItemCount} project items to reference placeholder`);
          
          // Then delete all other master items
          console.log("Deleting all other master items");
          await db.delete(masterItemsTable)
            .where(sql`${masterItemsTable.id} != ${placeholderId}`);
          console.log("Successfully deleted all other master items");
        } else {
          // First create a new placeholder
          console.log("Creating a new placeholder");
          const placeholderItem = await db.insert(masterItemsTable)
            .values({
              itemCode: "PLACEHOLDER-RESET-REFERENCE",
              description: "Placeholder reference for reset master items",
              uom: "EA",
              makeOrBuy: "N/A",
              createdAt: new Date(),
              updatedAt: new Date(),
              drawingNo: "N/A",
              notes: "This is a placeholder item created during database reset. This item replaces references to deleted master items."
            })
            .returning();
          
          placeholderId = placeholderItem[0].id;
          console.log(`Created new placeholder with ID: ${placeholderId}`);
          
          // Then update all project items to reference this placeholder
          console.log(`Updating ${projectItemCount} project items to reference placeholder ${placeholderId}`);
          
          // Loop through each project item and update them one by one to prevent constraint violations
          for (const projectItem of projectItems) {
            await db.update(projectItemsTable)
              .set({ itemId: placeholderId })
              .where(eq(projectItemsTable.id, projectItem.id));
            console.log(`Updated project item ${projectItem.id} to reference placeholder ${placeholderId}`);
          }
          
          console.log(`Updated all ${projectItemCount} project items to reference new placeholder`);
          
          // Now it's safe to delete all other master items
          console.log("Deleting all other master items");
          await db.delete(masterItemsTable)
            .where(sql`${masterItemsTable.id} != ${placeholderId}`);
          console.log("Successfully deleted all other master items");
        }
        
        // Reset auto-increment counter
        const maxIdResult = await db.select({ maxId: sql`MAX(id)` }).from(masterItemsTable);
        const maxId = typeof maxIdResult[0].maxId === 'number' ? maxIdResult[0].maxId : 0;
        const nextId = maxId + 1;
        
        await db.execute(sql`ALTER SEQUENCE master_items_id_seq RESTART WITH ${nextId}`);
        console.log(`Reset auto-increment counter to ${nextId}`);
        
        // Return success response
        res.status(200).json({ 
          message: 'Master items table reset successfully', 
          details: `${usingExistingPlaceholder ? 'Used existing' : 'Created new'} placeholder master item and updated ${projectItemCount} project item references.` 
        });
      } else {
        // No project items referencing master items, can safely delete all
        await db.delete(masterItemsTable);
        console.log("Deleted all master items");
        
        // Reset auto-increment counter
        await db.execute(sql`ALTER SEQUENCE master_items_id_seq RESTART WITH 1`);
        console.log("Reset auto-increment counter to 1");
        
        // Return success response
        res.status(200).json({ 
          message: 'Master items table reset successfully', 
          details: 'All master items deleted. No project item references needed to be updated.' 
        });
      }
    } catch (error) {
      console.error("Error resetting master items table:", error);
      res.status(500).json({ 
        error: 'Failed to reset master items table',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Master Items Management Routes
  app.get("/api/master-items", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const items = await storage.getAllMasterItems();
      res.json(items);
    } catch (error) {
      console.error("Error fetching master items:", error);
      res.status(500).json({ 
        error: 'Failed to fetch master items',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get("/api/master-items/by-code/:itemCode", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const itemCode = req.params.itemCode;
      console.log(`Looking up master item by code: ${itemCode}`);
      
      // Get item from database by code
      const [item] = await db.select().from(masterItemsTable).where(eq(masterItemsTable.itemCode, itemCode));
      
      if (!item) {
        return res.status(404).json({ error: 'Master item not found' });
      }
      
      res.json(item);
    } catch (error) {
      console.error("Error fetching master item by code:", error);
      res.status(500).json({ 
        error: 'Failed to fetch master item by code',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.get("/api/master-items/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const itemId = parseInt(req.params.id);
      const item = await storage.getMasterItem(itemId);
      
      if (!item) {
        return res.status(404).json({ error: 'Master item not found' });
      }
      
      res.json(item);
    } catch (error) {
      console.error(`Error fetching master item ${req.params.id}:`, error);
      res.status(500).json({ 
        error: 'Failed to fetch master item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.post("/api/master-items", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      // Check if the user has permission to create master items
      if (!canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to create master items' });
      }
      
      // Check if item code already exists
      const existingItem = await storage.getMasterItemByCode(req.body.itemCode);
      if (existingItem) {
        return res.status(400).json({ error: 'Item code already exists' });
      }
      
      const newItem = await storage.createMasterItem({
        ...req.body,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      res.status(201).json(newItem);
    } catch (error) {
      console.error("Error creating master item:", error);
      res.status(500).json({ 
        error: 'Failed to create master item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.put("/api/master-items/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      // Check if the user has permission to update master items
      if (!canManage(req.user!.role, 'Manager')) {
        return res.status(403).json({ error: 'Not authorized to update master items' });
      }
      
      const itemId = parseInt(req.params.id);
      
      // Check if the item exists
      const existingItem = await storage.getMasterItem(itemId);
      if (!existingItem) {
        return res.status(404).json({ error: 'Master item not found' });
      }
      
      // If item code is being changed, check if the new code already exists
      if (req.body.itemCode && req.body.itemCode !== existingItem.itemCode) {
        const itemWithSameCode = await storage.getMasterItemByCode(req.body.itemCode);
        if (itemWithSameCode && itemWithSameCode.id !== itemId) {
          return res.status(400).json({ error: 'Item code already exists' });
        }
      }
      
      const updatedItem = await storage.updateMasterItem(itemId, {
        ...req.body,
        updatedAt: new Date()
      });
      
      res.json(updatedItem);
    } catch (error) {
      console.error(`Error updating master item ${req.params.id}:`, error);
      res.status(500).json({ 
        error: 'Failed to update master item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  app.delete("/api/master-items/:id", async (req, res) => {
    try {
      const itemId = parseInt(req.params.id);
      
      // Check if the user has permission to delete master items
      if (!canManage(req.user!.role, 'Senior Manager')) {
        return res.status(403).json({ error: 'Not authorized to delete master items' });
      }
      
      // Check if the item exists
      const existingItem = await storage.getMasterItem(itemId);
      if (!existingItem) {
        return res.status(404).json({ error: 'Master item not found' });
      }
      
      // Check if the item is used in any project
      const projectItems = await storage.getProjectItemsByMasterId(itemId);
      if (projectItems && projectItems.length > 0) {
        return res.status(400).json({ 
          error: 'Cannot delete master item with associated project items',
          details: `Item is used in ${projectItems.length} project(s)`
        });
      }
      
      await storage.deleteMasterItem(itemId);
      res.status(204).send();
    } catch (error) {
      console.error(`Error deleting master item ${req.params.id}:`, error);
      res.status(500).json({ 
        error: 'Failed to delete master item',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Logout endpoint with proper error handling
  app.post("/api/logout", (req, res) => {
    try {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).json({ message: "Logout failed" });
          }
          res.clearCookie("connect.sid");
          res.status(200).json({ message: "Logged out successfully" });
        });
      } else {
        res.status(200).json({ message: "Already logged out" });
      }
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Add password change endpoint
  app.post("/api/change-password", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      // Get current user
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Verify current password
      const isValid = await comparePasswords(currentPassword, user.password);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      // Hash and update new password
      const hashedPassword = await updatePasswordHash(newPassword);
      await storage.updateUser(user.id, { password: hashedPassword });

      console.log(`Password updated successfully for user ${user.username}`);
      res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      console.error('Error changing password:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to change password" 
      });
    }
  });

  // Add password change endpoint
  app.post("/api/admin/change-password", async (req, res) => {
    try {
      // Check authentication and authorization
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "You must be logged in to perform this action" });
      }
      
      if (req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Only Superusers can change other users' passwords" });
      }

      const { userId, newPassword } = req.body;
      
      // Validate input
      if (!userId || !newPassword) {
        return res.status(400).json({ message: "Missing required fields: userId and newPassword" });
      }
      
      // Password complexity validation
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }
      
      // Additional server-side password validation
      const hasUppercase = /[A-Z]/.test(newPassword);
      const hasLowercase = /[a-z]/.test(newPassword);
      const hasNumber = /[0-9]/.test(newPassword);
      const hasSpecial = /[^A-Za-z0-9]/.test(newPassword);
      
      if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
        return res.status(400).json({ 
          message: "Password must include at least one uppercase letter, one lowercase letter, one number, and one special character" 
        });
      }

      // Get user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Hash and update new password
      const hashedPassword = await updatePasswordHash(newPassword);
      await storage.updateUser(user.id, { password: hashedPassword });

      // Log password change for audit purposes (without sensitive data)
      console.log(`Password updated for user ${userId} by Superuser ${req.user!.id} on ${new Date().toISOString()}`);

      res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "An error occurred while changing the password" });
    }
  });

  // User Management Routes
  app.delete("/api/users/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user!.role !== "Superuser") return res.sendStatus(403);

    const userId = parseInt(req.params.id);
    await storage.deleteUser(userId);
    res.sendStatus(200);
  });

  app.patch("/api/users/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      if (req.user!.role !== "Superuser") return res.status(403).json({ message: "Not authorized" });

      const userId = parseInt(req.params.id);
      let userData = insertUserSchema.partial().parse(req.body);

      console.log(`Attempting to update user ${userId}`, {
        ...userData,
        password: userData.password ? '[REDACTED]' : undefined
      });

      // If password is being updated, hash it
      if (userData.password) {
        userData = {
          ...userData,
          password: await updatePasswordHash(userData.password)
        };
      }

      const updatedUser = await storage.updateUser(userId, userData);
      console.log(`Successfully updated user ${userId}`);

      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update user" 
      });
    }
  });

  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user!.role !== "Superuser") return res.sendStatus(403);

    const users = await storage.getAllUsers();
    res.json(users);
  });

  // Task Management Routes
  app.post("/api/tasks", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);

      const taskData = insertTaskSchema.parse({
        ...req.body,
        createdBy: req.user!.id,
        createdAt: new Date().toISOString(),
      });

      console.log('Creating new task:', taskData);
      const task = await storage.createTask(taskData);
      console.log('Created task:', task);
      res.status(201).json(task);
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create task" 
      });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);

      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);

      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Task completion and task editing are separate operations with different permissions
      const isTaskCompletion = req.body.status === 'completed';
      const isTaskEditing = !isTaskCompletion;

      if (isTaskCompletion) {
        // Only allow completing a task if user is the assignee or a superuser
        if (task.assignedTo !== req.user!.id && req.user!.role !== "Superuser") {
          return res.status(403).json({ message: "Only the assigned user or a Superuser can complete this task" });
        }

        const updateData = {
          status: 'completed',
          completedAt: new Date().toISOString()
        };

        const updatedTask = await storage.updateTask(taskId, updateData);
        
        console.log(`Task ${taskId} completed by user ${req.user!.id}`);
        
        // Update productivity metrics
        let productivityMetric = await storage.getProductivityMetric(req.user!.id);
        
        if (!productivityMetric) {
          // Create new metric if it doesn't exist
          productivityMetric = await storage.createProductivityMetric({
            userId: req.user!.id,
            tasksCompleted: 1,
            tasksCreated: 0,
            recommendationsAccepted: 0,
            averageCompletionTime: 0,
            onTimeCompletion: 0,
            weeklyScore: 10, // Initial score for completing a task
            monthlyScore: 10, // Initial score for completing a task
            totalPoints: 10, // Initial points for completing a task
            lastUpdated: new Date().toISOString()
          });
        } else {
          // Update existing metric
          productivityMetric = await storage.updateProductivityMetric(req.user!.id, {
            tasksCompleted: productivityMetric.tasksCompleted + 1,
            weeklyScore: productivityMetric.weeklyScore + 10,
            monthlyScore: productivityMetric.monthlyScore + 10,
            totalPoints: productivityMetric.totalPoints + 10,
            lastUpdated: new Date().toISOString()
          });
        }
        
        // Check and award achievements
        await storage.checkAndAwardAchievements(req.user!.id);
        
        // Add task history entry
        await storage.createTaskHistory({
          taskId: taskId,
          userId: req.user!.id,
          action: 'status_changed',
          timestamp: new Date().toISOString(),
          oldValue: task.status || 'pending',
          newValue: 'completed'
        });
        
        res.json(updatedTask);
        return;
      }
      
      if (isTaskEditing) {
        // Only allow editing a task if user is the creator or a superuser
        if (task.createdBy !== req.user!.id && req.user!.role !== "Superuser") {
          return res.status(403).json({ 
            message: "Only the task creator or a Superuser can edit this task"
          });
        }
        
        // Prepare task update data (only allowed fields)
        const allowedFields = ['title', 'description', 'priority', 'finishDate', 'assignedTo'];
        const updateData: Record<string, any> = {};
        
        for (const field of allowedFields) {
          if (field in req.body) {
            updateData[field] = req.body[field];
          }
        }
        
        // If assignee is being changed, log it in task history
        if ('assignedTo' in updateData && updateData.assignedTo !== task.assignedTo) {
          await storage.createTaskHistory({
            taskId: taskId,
            userId: req.user!.id,
            action: 'assignee_changed',
            timestamp: new Date().toISOString(),
            oldValue: JSON.stringify({ assignedTo: task.assignedTo }),
            newValue: JSON.stringify({ assignedTo: updateData.assignedTo })
          });
        }
        
        const updatedTask = await storage.updateTask(taskId, updateData);
        console.log(`Task ${taskId} edited by user ${req.user!.id}`);
        
        res.json(updatedTask);
        return;
      }
      
      res.status(400).json({ message: "Invalid task update request" });
    } catch (error) {
      console.error('Error updating task:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update task" 
      });
    }
  });

  app.get("/api/tasks", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);
      console.log(`Getting tasks for authenticated user: ${req.user!.username} (${req.user!.role})`);

      const tasks = await storage.getTasksForUser(req.user!.id);
      console.log(`Returning ${tasks.length} tasks for user ${req.user!.username}`);
      res.json(tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch tasks" 
      });
    }
  });

  app.post("/api/tasks/:id/forward", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

      const taskId = parseInt(req.params.id);
      const { newAssignee } = req.body;

      if (!newAssignee) {
        return res.status(400).json({ message: "New assignee ID is required" });
      }

      // Get current task
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Check permissions - only Superuser, General Manager, Senior Manager, and Manager can forward tasks
      const allowedRoles = ["Superuser", "General Manager", "Senior Manager", "Manager"];
      if (!allowedRoles.includes(req.user!.role)) {
        return res.status(403).json({ message: "Not authorized to forward tasks" });
      }

      // Update task assignee
      const updatedTask = await storage.updateTask(taskId, {
        assignedTo: newAssignee
      });

      console.log(`Task ${taskId} forwarded to user ${newAssignee} by ${req.user!.username}`);
      res.json(updatedTask);
    } catch (error) {
      console.error('Error forwarding task:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to forward task" 
      });
    }
  });

  app.get("/api/subordinates", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const subordinates = await storage.getSubordinates(req.user!.id);
    res.json(subordinates);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      console.log('Registration attempt:', {
        username: req.body.username,
        role: req.body.role,
        email: req.body.email,
        countryCode: req.body.countryCode,
        mobileNumber: req.body.mobileNumber
      });

      // If not authenticated, can only register as Employee
      if (!req.isAuthenticated()) {
        if (req.body.role !== 'Employee') {
          return res.status(403).json({ message: "New registrations must be Employee role" });
        }
      } else {
        // Check if authenticated user has permission to create the requested role
        const currentUserRole = req.user!.role;
        const requestedRole = req.body.role;

        // Use roleHierarchy imported from shared/roles
        // This is already imported at the top of the file

        // Employee cannot create any users
        if (currentUserRole === 'Employee') {
          return res.status(403).json({ message: "Employees cannot create new users" });
        }

        // Others can only create roles of lower rank
        if (requestedRole in roleHierarchy && currentUserRole in roleHierarchy) {
          if (roleHierarchy[requestedRole] <= roleHierarchy[currentUserRole]) {
            return res.status(403).json({
              message: "You can only create users with roles below your rank"
            });
          }
        } else {
          return res.status(400).json({
            message: "Invalid role specified"
          });
        }
      }

      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log(`Registration failed: Username ${req.body.username} already exists`);
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await updatePasswordHash(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      console.log(`User created successfully: ${user.username} (${user.role})`);

      if (user.role === "Superuser") {
        await storage.updateUser(user.id, { reportingManagerId: user.id });
        console.log(`Set superuser ${user.username} as their own reporting manager`);
      }

      req.login(user, (err) => {
        if (err) {
          console.error('Login after registration failed:', err);
          return next(err);
        }
        console.log(`Auto-login successful for new user: ${user.username}`);
        res.status(201).json(user);
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({message: "Registration failed"});
      next(error);
    }
  });

  // Workflow Recommendations API Routes
  app.get("/api/recommendations", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      console.log(`Getting workflow recommendations for user ${req.user!.username} (${req.user!.id})`);
      const recommendations = await storage.getRecommendationsForUser(req.user!.id);
      
      console.log(`Found ${recommendations.length} recommendations for user ${req.user!.id}`);
      res.json(recommendations);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch recommendations" 
      });
    }
  });

  app.get("/api/recommendations/active", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      console.log(`Getting active workflow recommendations for user ${req.user!.username} (${req.user!.id})`);
      const recommendations = await storage.getActiveRecommendations(req.user!.id);
      
      console.log(`Found ${recommendations.length} active recommendations for user ${req.user!.id}`);
      res.json(recommendations);
    } catch (error) {
      console.error('Error fetching active recommendations:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch active recommendations" 
      });
    }
  });

  app.patch("/api/recommendations/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const recommendationId = parseInt(req.params.id);
      const { status } = req.body;
      
      if (!status || !['accepted', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "Valid status (accepted/rejected) is required" });
      }
      
      console.log(`Updating recommendation ${recommendationId} to status: ${status}`);
      
      // Update recommendation with new status
      const updatedRecommendation = await storage.updateRecommendation(recommendationId, {
        status,
        isRead: true
      });
      
      console.log(`Recommendation ${recommendationId} updated successfully`);
      res.json(updatedRecommendation);
    } catch (error) {
      console.error('Error updating recommendation:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update recommendation" 
      });
    }
  });

  app.post("/api/recommendations/generate", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      console.log(`Generating new workflow recommendations for user ${req.user!.username} (${req.user!.id})`);
      
      // Generate recommendations from different categories
      const taskAssignmentRecommendations = await storage.generateTaskAssignmentRecommendations(req.user!.id);
      const priorityAdjustmentRecommendations = await storage.generatePriorityAdjustmentRecommendations(req.user!.id);
      const followUpRecommendations = await storage.generateFollowUpRecommendations(req.user!.id);
      
      const allRecommendations = [
        ...taskAssignmentRecommendations,
        ...priorityAdjustmentRecommendations,
        ...followUpRecommendations
      ];
      
      console.log(`Generated ${allRecommendations.length} new recommendations for user ${req.user!.id}`);
      
      res.json({
        count: allRecommendations.length,
        recommendations: allRecommendations
      });
    } catch (error) {
      console.error('Error generating recommendations:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to generate recommendations" 
      });
    }
  });

  // Add task history recording
  app.post("/api/tasks/:id/history", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const taskId = parseInt(req.params.id);
      const { action, oldValue, newValue } = req.body;
      
      if (!action) {
        return res.status(400).json({ message: "Action is required" });
      }
      
      // Create history record
      const historyRecord = await storage.createTaskHistory({
        taskId,
        userId: req.user!.id,
        action,
        timestamp: new Date().toISOString(),
        oldValue,
        newValue
      });
      
      console.log(`Task history record created for task ${taskId}, action: ${action}`);
      res.status(201).json(historyRecord);
    } catch (error) {
      console.error('Error creating task history:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create task history" 
      });
    }
  });

  // Get task history
  app.get("/api/tasks/:id/history", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const taskId = parseInt(req.params.id);
      const task = await storage.getTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      // Check if user has permission to view this task
      const userRole = req.user!.role;
      if (userRole !== "Superuser" && task.createdBy !== req.user!.id && task.assignedTo !== req.user!.id) {
        return res.status(403).json({ message: "Not authorized to view this task's history" });
      }
      
      const history = await storage.getTaskHistory(taskId);
      console.log(`Fetched ${history.length} history records for task ${taskId}`);
      
      res.json(history);
    } catch (error) {
      console.error('Error fetching task history:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch task history" 
      });
    }
  });

  // Achievement and Gamification API Routes
  
  // Get all achievements
  app.get("/api/achievements", async (req, res) => {
    try {
      const achievements = await storage.getAllAchievements();
      res.json(achievements);
    } catch (error) {
      console.error('Error fetching achievements:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch achievements" 
      });
    }
  });

  // Get achievements for the current user
  app.get("/api/my-achievements", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const userId = req.user!.id;
      const achievements = await storage.getUserAchievements(userId);
      res.json(achievements);
    } catch (error) {
      console.error('Error fetching user achievements:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch user achievements" 
      });
    }
  });

  // Get achievements for a specific user (managers can view their team's achievements)
  app.get("/api/users/:userId/achievements", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const targetUserId = parseInt(req.params.userId);
      const requestingUserId = req.user!.id;
      
      // Check if requesting user has permission to view target user's achievements
      if (targetUserId !== requestingUserId) {
        // Only superusers can see anyone's achievements
        // Otherwise, user must be the reporting manager of the target user
        if (req.user!.role !== "Superuser") {
          const subordinates = await storage.getSubordinates(requestingUserId);
          const isManager = subordinates.some(s => s.id === targetUserId);
          
          if (!isManager) {
            return res.status(403).json({ 
              message: "Not authorized to view this user's achievements" 
            });
          }
        }
      }
      
      const achievements = await storage.getUserAchievements(targetUserId);
      res.json(achievements);
    } catch (error) {
      console.error('Error fetching user achievements:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch user achievements" 
      });
    }
  });

  // Leaderboard APIs
  
  // Get team leaderboard
  app.get("/api/leaderboard/team", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const user = req.user!;
      // If reportingManagerId is null, use user's own ID (for Superusers)
      const teamId = user.reportingManagerId !== null ? user.reportingManagerId : user.id;
      
      const leaderboard = await storage.getTeamLeaderboard(teamId);
      res.json(leaderboard);
    } catch (error) {
      console.error('Error fetching team leaderboard:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch team leaderboard" 
      });
    }
  });

  // Get company-wide leaderboard (top performers)
  app.get("/api/leaderboard/company", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      // Optional limit parameter
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      
      const topPerformers = await storage.getTopPerformers(limit);
      res.json(topPerformers);
    } catch (error) {
      console.error('Error fetching company leaderboard:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch company leaderboard" 
      });
    }
  });

  // Get current user's rank
  app.get("/api/leaderboard/my-rank", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const userId = req.user!.id;
      const rankInfo = await storage.getUserRank(userId);
      res.json(rankInfo);
    } catch (error) {
      console.error('Error fetching user rank:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch user rank" 
      });
    }
  });

  // Get productivity metrics for current user
  app.get("/api/productivity", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const userId = req.user!.id;
      let metrics = await storage.getProductivityMetric(userId);
      
      // If metrics don't exist yet, update them
      if (!metrics) {
        metrics = await storage.updateUserProductivityStats(userId);
      }
      
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching productivity metrics:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch productivity metrics" 
      });
    }
  });

  // Force refresh productivity metrics for current user
  app.post("/api/productivity/refresh", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const userId = req.user!.id;
      const updatedMetrics = await storage.updateUserProductivityStats(userId);
      
      res.json(updatedMetrics);
    } catch (error) {
      console.error('Error refreshing productivity metrics:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to refresh productivity metrics" 
      });
    }
  });

  // Create achievement (admin only)
  app.post("/api/achievements", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      // Only superusers can create achievements
      if (req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Only superusers can create achievements" });
      }
      
      const achievementData = {
        ...req.body,
        createdAt: new Date().toISOString()
      };
      
      const achievement = await storage.createAchievement(achievementData);
      res.status(201).json(achievement);
    } catch (error) {
      console.error('Error creating achievement:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create achievement" 
      });
    }
  });

  // Recurring Pattern Endpoints
  app.post("/api/recurring-patterns", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        console.error("❌ Authentication failed for recurring pattern creation");
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      console.log("✅ RECEIVED RECURRING PATTERN CREATION REQUEST:");
      console.log(JSON.stringify(req.body, null, 2));
      
      // Always ensure the userId is set to the authenticated user's ID
      console.log(`📝 Setting userId to authenticated user's ID: ${req.user!.id}`);
      req.body.userId = req.user!.id;
      
      // Parse and validate the pattern data
      try {
        console.log("📝 Preparing data for schema validation");
        const dataForValidation = {
          ...req.body,
          userId: req.user!.id, // Make absolutely sure userId is set
          createdBy: req.user!.id,
          createdAt: new Date().toISOString(),
          isActive: req.body.isActive ?? true,
          generatedCount: 0
        };
        
        console.log("📝 Data for validation:", JSON.stringify(dataForValidation, null, 2));
        console.log("📝 Schema requirements:", Object.keys(insertRecurringPatternSchema.shape));
        
        console.log("📝 CHECKING REQUIRED FIELDS:");
        // Check if all required fields are present
        const requiredFields = ['pattern', 'interval', 'startDate', 'templateTitle', 'templateDescription', 'templatePriority', 'userId', 'createdBy', 'createdAt'];
        const missingFields = requiredFields.filter(field => !(field in dataForValidation));
        
        if (missingFields.length > 0) {
          console.error(`❌ MISSING REQUIRED FIELDS: ${missingFields.join(', ')}`);
          return res.status(400).json({ 
            message: `Missing required fields: ${missingFields.join(', ')}`,
            details: { missingFields }
          });
        }
        
        // Extra debug for specific fields
        console.log(`📝 pattern field: ${dataForValidation.pattern}, type: ${typeof dataForValidation.pattern}`);
        console.log(`📝 interval field: ${dataForValidation.interval}, type: ${typeof dataForValidation.interval}`);
        console.log(`📝 userId field: ${dataForValidation.userId}, type: ${typeof dataForValidation.userId}`);
        console.log(`📝 createdBy field: ${dataForValidation.createdBy}, type: ${typeof dataForValidation.createdBy}`);
        
        // Try to parse the data
        try {
          const patternData = insertRecurringPatternSchema.parse(dataForValidation);
          console.log(`✅ VALIDATION PASSED. Creating recurring pattern for user ${req.user!.username}:`);
          console.log(JSON.stringify(patternData, null, 2));
          
          // Create the pattern
          const pattern = await storage.createRecurringPattern(patternData);
          
          // If no nextGenerationDate is provided, set it to startDate
          if (!pattern.nextGenerationDate) {
            console.log(`📝 Setting nextGenerationDate to startDate: ${pattern.startDate}`);
            await storage.updateRecurringPattern(pattern.id, {
              nextGenerationDate: pattern.startDate
            });
          }
          
          console.log("✅ SUCCESSFULLY CREATED RECURRING PATTERN:", JSON.stringify(pattern, null, 2));
          res.status(201).json(pattern);
        } catch (schemaError) {
          console.error('❌ SCHEMA VALIDATION ERROR:');
          console.error(schemaError);
          return res.status(400).json({ 
            message: schemaError instanceof Error ? schemaError.message : "Schema validation failed",
            details: schemaError
          });
        }
      } catch (parseError) {
        console.error('❌ VALIDATION ERROR FOR RECURRING PATTERN:');
        if (parseError instanceof Error) {
          console.error(parseError.message);
        } else {
          console.error(parseError);
        }
        
        return res.status(400).json({ 
          message: parseError instanceof Error ? parseError.message : "Invalid recurring pattern data",
          details: parseError
        });
      }
    } catch (error) {
      console.error('❌ ERROR CREATING RECURRING PATTERN:');
      if (error instanceof Error) {
        console.error(error.message);
        console.error(error.stack);
      } else {
        console.error(error);
      }
      
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to create recurring pattern" 
      });
    }
  });
  
  app.get("/api/recurring-patterns", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      console.log(`Getting recurring patterns for user ${req.user!.username}`);
      const patterns = await storage.getUserRecurringPatterns(req.user!.id);
      
      res.json(patterns);
    } catch (error) {
      console.error('Error fetching recurring patterns:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch recurring patterns" 
      });
    }
  });
  
  app.get("/api/recurring-patterns/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const patternId = parseInt(req.params.id);
      console.log(`Getting recurring pattern ${patternId} for user ${req.user!.username}`);
      
      const pattern = await storage.getRecurringPattern(patternId);
      
      if (!pattern) {
        return res.status(404).json({ message: "Recurring pattern not found" });
      }
      
      // Only allow access to user's own patterns or superuser
      if (pattern.createdBy !== req.user!.id && req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Not authorized to view this pattern" });
      }
      
      res.json(pattern);
    } catch (error) {
      console.error('Error fetching recurring pattern:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch recurring pattern" 
      });
    }
  });
  
  app.patch("/api/recurring-patterns/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const patternId = parseInt(req.params.id);
      console.log(`Updating recurring pattern ${patternId} for user ${req.user!.username}`);
      
      const pattern = await storage.getRecurringPattern(patternId);
      
      if (!pattern) {
        return res.status(404).json({ message: "Recurring pattern not found" });
      }
      
      // Only allow updates to user's own patterns or superuser
      if (pattern.createdBy !== req.user!.id && req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Not authorized to update this pattern" });
      }
      
      // Parse and validate the update data
      const updateData = insertRecurringPatternSchema.partial().parse(req.body);
      
      // Update the pattern
      const updatedPattern = await storage.updateRecurringPattern(patternId, updateData);
      
      res.json(updatedPattern);
    } catch (error) {
      console.error('Error updating recurring pattern:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update recurring pattern" 
      });
    }
  });
  
  app.delete("/api/recurring-patterns/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const patternId = parseInt(req.params.id);
      console.log(`Deleting recurring pattern ${patternId} for user ${req.user!.username}`);
      
      const pattern = await storage.getRecurringPattern(patternId);
      
      if (!pattern) {
        return res.status(404).json({ message: "Recurring pattern not found" });
      }
      
      // Only allow deletion of user's own patterns or superuser
      if (pattern.createdBy !== req.user!.id && req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Not authorized to delete this pattern" });
      }
      
      // Delete the pattern
      await storage.deleteRecurringPattern(patternId);
      
      res.sendStatus(204);
    } catch (error) {
      console.error('Error deleting recurring pattern:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to delete recurring pattern" 
      });
    }
  });
  
  app.post("/api/recurring-patterns/process", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      // Only allow Superuser to manually trigger processing
      if (req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Not authorized to process recurring patterns" });
      }
      
      console.log(`Processing recurring patterns triggered by user ${req.user!.username}`);
      
      // Process the patterns
      await storage.processRecurringPatterns();
      
      res.status(200).json({ 
        message: "Recurring patterns processed successfully" 
      });
    } catch (error) {
      console.error('Error processing recurring patterns:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to process recurring patterns" 
      });
    }
  });
  
  // Additional endpoint with consistent naming for the Button in the UI
  app.post("/api/process-recurring-patterns", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      // Only allow Superuser to manually trigger processing
      if (req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Not authorized to process recurring patterns" });
      }
      
      console.log(`Processing recurring patterns triggered by user ${req.user!.username}`);
      
      // Process the patterns and get the count of newly generated tasks
      const tasksGenerated = await storage.processRecurringPatterns();
      
      res.status(200).json({ 
        message: "Recurring patterns processed successfully",
        tasksGenerated
      });
    } catch (error) {
      console.error('Error processing recurring patterns:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to process recurring patterns" 
      });
    }
  });

  // Recurring Tasks API Routes
  app.get("/api/recurring-tasks", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      console.log(`Getting recurring tasks for user ${req.user!.username}`);
      const tasks = await storage.getRecurringTasksForUser(req.user!.id);
      
      res.json(tasks);
    } catch (error) {
      console.error('Error fetching recurring tasks:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch recurring tasks" 
      });
    }
  });

  app.get("/api/recurring-tasks/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const taskId = parseInt(req.params.id);
      console.log(`Getting recurring task ${taskId} for user ${req.user!.username}`);
      
      const task = await storage.getRecurringTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: "Recurring task not found" });
      }
      
      // Check if user has access to this task (creator, assignee, or superuser)
      if (task.assignedTo !== req.user!.id && req.user!.role !== "Superuser") {
        return res.status(403).json({ message: "Not authorized to view this recurring task" });
      }
      
      res.json(task);
    } catch (error) {
      console.error('Error fetching recurring task:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to fetch recurring task" 
      });
    }
  });

  app.patch("/api/recurring-tasks/:id", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
      
      const taskId = parseInt(req.params.id);
      console.log(`Updating recurring task ${taskId} for user ${req.user!.username}`);
      
      const task = await storage.getRecurringTask(taskId);
      
      if (!task) {
        return res.status(404).json({ message: "Recurring task not found" });
      }
      
      // Task completion and task editing are separate operations with different permissions
      const isTaskCompletion = req.body.status === 'completed';
      const isTaskEditing = !isTaskCompletion;
      
      if (isTaskCompletion) {
        // Only allow completing a task if user is the assignee or a superuser
        if (task.assignedTo !== req.user!.id && req.user!.role !== "Superuser") {
          return res.status(403).json({ message: "Only the assigned user or a Superuser can complete this recurring task" });
        }
        
        const updateData = {
          status: 'completed',
          completedAt: new Date().toISOString()
        };
        
        const updatedTask = await storage.updateRecurringTask(taskId, updateData);
        
        console.log(`Recurring task ${taskId} completed by user ${req.user!.id}`);
        
        // Update productivity metrics
        let productivityMetric = await storage.getProductivityMetric(req.user!.id);
        
        if (!productivityMetric) {
          // Create new metric if it doesn't exist
          productivityMetric = await storage.createProductivityMetric({
            userId: req.user!.id,
            tasksCompleted: 1,
            tasksCreated: 0,
            recommendationsAccepted: 0,
            averageCompletionTime: 0,
            onTimeCompletion: 0,
            weeklyScore: 10, // Initial score for completing a task
            monthlyScore: 10, // Initial score for completing a task
            totalPoints: 10, // Initial points for completing a task
            lastUpdated: new Date().toISOString()
          });
        } else {
          // Update existing metric
          productivityMetric = await storage.updateProductivityMetric(req.user!.id, {
            tasksCompleted: productivityMetric.tasksCompleted + 1,
            weeklyScore: productivityMetric.weeklyScore + 10,
            monthlyScore: productivityMetric.monthlyScore + 10,
            totalPoints: productivityMetric.totalPoints + 10,
            lastUpdated: new Date().toISOString()
          });
        }
        
        // Check and award achievements
        await storage.checkAndAwardAchievements(req.user!.id);
        
        return res.json(updatedTask);
      }
      
      if (isTaskEditing) {
        // Only allow editing a task if user has admin privileges
        if (req.user!.role !== "Superuser") {
          return res.status(403).json({ 
            message: "Only a Superuser can edit recurring tasks"
          });
        }
        
        // Prepare task update data (only allowed fields)
        const allowedFields = ['title', 'description', 'priority', 'finishDate', 'dueDate', 'assignedTo'];
        const updateData: Record<string, any> = {};
        
        for (const field of allowedFields) {
          if (field in req.body) {
            updateData[field] = req.body[field];
          }
        }
        
        const updatedTask = await storage.updateRecurringTask(taskId, updateData);
        console.log(`Recurring task ${taskId} edited by user ${req.user!.id}`);
        
        return res.json(updatedTask);
      }
      
      res.status(400).json({ message: "Invalid recurring task update request" });
    } catch (error) {
      console.error('Error updating recurring task:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to update recurring task" 
      });
    }
  });

  app.post("/api/recurring-tasks/:id/forward", async (req, res) => {
    try {
      if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

      const taskId = parseInt(req.params.id);
      const { newAssignee } = req.body;

      if (!newAssignee) {
        return res.status(400).json({ message: "New assignee ID is required" });
      }

      // Get current task
      const task = await storage.getRecurringTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Recurring task not found" });
      }

      // Check permissions - only Superuser, General Manager, Senior Manager, and Manager can forward tasks
      const allowedRoles = ["Superuser", "General Manager", "Senior Manager", "Manager"];
      if (!allowedRoles.includes(req.user!.role)) {
        return res.status(403).json({ message: "Not authorized to forward recurring tasks" });
      }

      // Update task assignee
      const updatedTask = await storage.updateRecurringTask(taskId, {
        assignedTo: newAssignee
      });

      console.log(`Recurring task ${taskId} forwarded to user ${newAssignee} by ${req.user!.username}`);
      res.json(updatedTask);
    } catch (error) {
      console.error('Error forwarding recurring task:', error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to forward recurring task" 
      });
    }
  });

  // Setup automatic processing of recurring patterns (every day at midnight)
  setInterval(async () => {
    try {
      console.log('Automatic processing of recurring patterns (daily check)');
      const tasksGenerated = await storage.processRecurringPatterns();
      console.log(`Automatic processing complete. Generated ${tasksGenerated} new tasks.`);
    } catch (error) {
      console.error('Error in automatic processing of recurring patterns:', error);
    }
  }, 24 * 60 * 60 * 1000); // Run once per day

  // Use finance write-offs router
  app.use('/api/finance/write-offs', financeWriteOffsRouter);
  console.log('Write-off routes registered at /api/finance/write-offs');

  // Use standalone routes that bypass middleware (for special cases only)
  app.use('/api/standalone', standaloneRoutes);
  console.log('Registered standalone routes that bypass middleware at /api/standalone');

  const httpServer = createServer(app);
  return httpServer;
}
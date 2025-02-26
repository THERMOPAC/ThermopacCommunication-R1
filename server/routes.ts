import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertTaskSchema, insertUserSchema } from "@shared/schema";
import { canManage } from "@shared/roles";
import { scrypt, timingSafeEqual, randomBytes } from "crypto";
import { promisify } from "util";

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
  setupAuth(app);

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
      const hashedPassword = await hashPassword(newPassword);
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
    if (!req.isAuthenticated() || req.user!.role !== "Superuser") {
      return res.sendStatus(403);
    }

    const { userId, newPassword } = req.body;

    // Get user
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Hash and update new password
    const hashedPassword = await hashPassword(newPassword);
    await storage.updateUser(user.id, { password: hashedPassword });

    res.sendStatus(200);
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
          password: await hashPassword(userData.password)
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
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const taskData = insertTaskSchema.parse({
      ...req.body,
      createdBy: req.user!.id,
      createdAt: new Date().toISOString(),
    });

    const task = await storage.createTask(taskData);
    res.status(201).json(task);
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const taskId = parseInt(req.params.id);
    const task = await storage.getTask(taskId);

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    // Only allow updating task if user is either:
    // 1. The task creator
    // 2. The task assignee
    // 3. A superuser
    if (task.createdBy !== req.user!.id &&
        task.assignedTo !== req.user!.id &&
        req.user!.role !== "Superuser") {
      return res.status(403).json({ message: "Not authorized to update this task" });
    }

    const updateData = {
      ...req.body,
      updatedAt: new Date().toISOString()
    };

    const updatedTask = await storage.updateTask(taskId, updateData);
    res.json(updatedTask);
  });

  app.get("/api/tasks", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    console.log(`Getting tasks for authenticated user: ${req.user!.username} (${req.user!.role})`);

    const tasks = await storage.getTasksForUser(req.user!.id);
    console.log(`Returning ${tasks.length} tasks for user ${req.user!.username}`);
    res.json(tasks);
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

        // Define role hierarchy levels
        const roleLevels = {
          'Superuser': 0,
          'General Manager': 1,
          'Senior Manager': 2,
          'Manager': 3,
          'Employee': 4
        };

        // Employee cannot create any users
        if (currentUserRole === 'Employee') {
          return res.status(403).json({ message: "Employees cannot create new users" });
        }

        // Others can only create roles of lower rank
        if (roleLevels[requestedRole] <= roleLevels[currentUserRole]) {
          return res.status(403).json({
            message: "You can only create users with roles below your rank"
          });
        }
      }

      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log(`Registration failed: Username ${req.body.username} already exists`);
        return res.status(400).json({ message: "Username already exists" });
      }

      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      console.log(`User created successfully: ${user.username} (${user.role})`);

      if (user.role === "Superuser") {
        await storage.updateUserReportingManager(user.id, user.id);
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


  const httpServer = createServer(app);
  return httpServer;
}
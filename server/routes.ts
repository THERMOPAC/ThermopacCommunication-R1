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

  // Add password change endpoint
  app.post("/api/change-password", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const { currentPassword, newPassword } = req.body;

    // Get current user
    const user = await storage.getUser(req.user!.id);
    if (!user) return res.sendStatus(404);

    // Verify current password
    const isValid = await comparePasswords(currentPassword, user.password);
    if (!isValid) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

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
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user!.role !== "Superuser") return res.sendStatus(403);

    const userId = parseInt(req.params.id);
    const userData = insertUserSchema.partial().parse(req.body);
    const updatedUser = await storage.updateUser(userId, userData);
    res.json(updatedUser);
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

  const httpServer = createServer(app);
  return httpServer;
}
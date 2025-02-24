import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertTaskSchema, insertUserSchema } from "@shared/schema";
import { canManage } from "@shared/roles";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

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

    const tasks = await storage.getTasksForUser(req.user!.id);
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
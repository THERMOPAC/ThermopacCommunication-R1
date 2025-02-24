import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertTaskSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Debug route to check users
  app.get("/api/debug/users", async (req, res) => {
    const users = await storage.getAllUsers();
    console.log("All registered users:", users);
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
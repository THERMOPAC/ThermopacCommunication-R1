import { IStorage } from "./types";
import type { User, Task, InsertUser, InsertTask } from "@shared/schema";
import { roleHierarchy, canManage } from "@shared/roles";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private tasks: Map<number, Task>;
  private currentUserId: number;
  private currentTaskId: number;
  sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.tasks = new Map();
    this.currentUserId = 1;
    this.currentTaskId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createTask(task: InsertTask): Promise<Task> {
    const id = this.currentTaskId++;
    const newTask: Task = { ...task, id };
    this.tasks.set(id, newTask);
    return newTask;
  }

  async getTasksForUser(userId: number): Promise<Task[]> {
    const user = await this.getUser(userId);
    if (!user) return [];

    return Array.from(this.tasks.values()).filter((task) => {
      if (task.assignedTo === userId) return true;
      if (task.createdBy === userId) return true;
      
      // Check if user can see this task based on role hierarchy
      const taskOwner = this.users.get(task.createdBy);
      return taskOwner && canManage(user.role, taskOwner.role);
    });
  }

  async getSubordinates(managerId: number): Promise<User[]> {
    const manager = await this.getUser(managerId);
    if (!manager) return [];

    return Array.from(this.users.values()).filter(
      (user) => user.reportingManagerId === managerId || 
                (canManage(manager.role, user.role))
    );
  }

  async updateUserReportingManager(userId: number, managerId: number): Promise<User> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    user.reportingManagerId = managerId;
    this.users.set(userId, user);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }
}

export const storage = new MemStorage();
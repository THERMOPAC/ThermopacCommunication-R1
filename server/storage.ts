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
    console.log(`Getting user with ID: ${id}`);
    const user = this.users.get(id);
    console.log(`Found user:`, user);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    console.log(`Looking for user with username: ${username}`);
    const user = Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
    console.log(`Found user:`, user);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    console.log(`Creating new user:`, insertUser);
    const id = this.currentUserId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    console.log(`Created user with ID ${id}:`, user);
    console.log(`Current users in storage:`, Array.from(this.users.values()));
    return user;
  }

  async createTask(task: InsertTask): Promise<Task> {
    console.log(`Creating new task:`, task);
    const id = this.currentTaskId++;
    const newTask: Task = { ...task, id };
    this.tasks.set(id, newTask);
    console.log(`Created task with ID ${id}:`, newTask);
    return newTask;
  }

  async getTasksForUser(userId: number): Promise<Task[]> {
    console.log(`Getting tasks for user ${userId}`);
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
    console.log(`Getting subordinates for manager ${managerId}`);
    const manager = await this.getUser(managerId);
    if (!manager) return [];

    const subordinates = Array.from(this.users.values()).filter(
      (user) => user.reportingManagerId === managerId || 
                (canManage(manager.role, user.role))
    );
    console.log(`Found subordinates:`, subordinates);
    return subordinates;
  }

  async updateUserReportingManager(userId: number, managerId: number): Promise<User> {
    console.log(`Updating reporting manager for user ${userId} to ${managerId}`);
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

    user.reportingManagerId = managerId;
    this.users.set(userId, user);
    console.log(`Updated user:`, user);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    const users = Array.from(this.users.values());
    console.log(`Getting all users:`, users);
    return users;
  }
}

export const storage = new MemStorage();
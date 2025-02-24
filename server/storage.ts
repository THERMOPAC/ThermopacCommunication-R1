import { IStorage } from "./types";
import type { User, Task, InsertUser, InsertTask } from "@shared/schema";
import { roleHierarchy, canManage } from "@shared/roles";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { users, tasks as tasksTable } from "@shared/schema";
import { eq, or, and } from "drizzle-orm";

const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required");
    }
    this.sessionStore = new PostgresSessionStore({
      conObject: {
        connectionString: process.env.DATABASE_URL,
      },
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    console.log(`Getting user with ID: ${id}`);
    const [user] = await db.select().from(users).where(eq(users.id, id));
    console.log(`Found user:`, user);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    console.log(`Looking for user with username: ${username}`);
    const [user] = await db.select().from(users).where(eq(users.username, username));
    console.log(`Found user:`, user);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    console.log(`Creating new user:`, insertUser);
    const [user] = await db.insert(users).values(insertUser).returning();
    console.log(`Created user:`, user);
    return user;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    console.log(`Creating new task:`, insertTask);
    const [task] = await db.insert(tasksTable).values(insertTask).returning();
    console.log(`Created task:`, task);
    return task;
  }

  async getTasksForUser(userId: number): Promise<Task[]> {
    console.log(`Getting tasks for user ${userId}`);
    const user = await this.getUser(userId);
    if (!user) return [];

    const userTasks = await db.select()
      .from(tasksTable)
      .where(
        or(
          eq(tasksTable.assignedTo, userId),
          eq(tasksTable.createdBy, userId)
        )
      );

    console.log(`Found tasks:`, userTasks);
    return userTasks;
  }

  async getSubordinates(managerId: number): Promise<User[]> {
    console.log(`Getting subordinates for manager ${managerId}`);
    const manager = await this.getUser(managerId);
    if (!manager) return [];

    const subordinates = await db.select()
      .from(users)
      .where(
        or(
          eq(users.reportingManagerId, managerId),
          and(
            eq(users.reportingManagerId, managerId),
            eq(users.role, manager.role)
          )
        )
      );

    console.log(`Found subordinates:`, subordinates);
    return subordinates;
  }

  async updateUserReportingManager(userId: number, managerId: number): Promise<User> {
    console.log(`Updating reporting manager for user ${userId} to ${managerId}`);
    const [user] = await db
      .update(users)
      .set({ reportingManagerId: managerId })
      .where(eq(users.id, userId))
      .returning();

    if (!user) throw new Error("User not found");
    console.log(`Updated user:`, user);
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    const allUsers = await db.select().from(users);
    console.log(`Getting all users:`, allUsers);
    return allUsers;
  }
}

export const storage = new DatabaseStorage();
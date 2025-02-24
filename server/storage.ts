import { IStorage } from "./types";
import type { User, Task, InsertUser, InsertTask } from "@shared/schema";
import { roleHierarchy, canManage } from "@shared/roles";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { users, tasks as tasksTable } from "@shared/schema";
import { eq, or, and, inArray, notInArray, isNull } from "drizzle-orm";

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
    const result = await db.select().from(users).where(eq(users.id, id));
    const user = result[0] as User | undefined;
    console.log(`Found user:`, user);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    console.log(`Looking for user with username: ${username}`);
    const result = await db.select().from(users).where(eq(users.username, username));
    const user = result[0] as User | undefined;
    console.log(`Found user:`, user);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    console.log(`Creating new user:`, insertUser);
    const result = await db.insert(users).values(insertUser).returning();
    const user = result[0] as User;
    console.log(`Created user:`, user);
    return user;
  }

  async updateUser(id: number, updateData: Partial<InsertUser>): Promise<User> {
    console.log(`Updating user ${id} with data:`, updateData);
    const result = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    const user = result[0] as User;

    if (!user) throw new Error("User not found");
    console.log(`Updated user:`, user);
    return user;
  }

  async updateUserReportingManager(userId: number, managerId: number): Promise<User> {
    console.log(`Updating reporting manager for user ${userId} to ${managerId}`);
    const result = await db
      .update(users)
      .set({ reportingManagerId: managerId })
      .where(eq(users.id, userId))
      .returning();
    const user = result[0] as User;

    if (!user) throw new Error("User not found");
    console.log(`Updated user:`, user);
    return user;
  }

  async deleteUser(id: number): Promise<void> {
    console.log(`Deleting user ${id}`);
    await db.delete(users).where(eq(users.id, id));
    console.log(`Deleted user ${id}`);
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    console.log(`Creating new task:`, insertTask);
    const result = await db.insert(tasksTable).values(insertTask).returning();
    const task = result[0] as Task;
    console.log(`Created task:`, task);
    return task;
  }

  async getTasksForUser(userId: number): Promise<Task[]> {
    console.log(`Getting tasks for user ${userId}`);
    const user = await this.getUser(userId);
    if (!user) return [];

    let tasks: Task[] = [];

    switch (user.role) {
      case "Superuser":
        // Get all tasks
        tasks = await db.select().from(tasksTable);
        break;

      case "General Manager":
        // Get all tasks except those assigned to Superusers
        const superusers = await db
          .select()
          .from(users)
          .where(eq(users.role, "Superuser"));
        const superuserIds = superusers.map(u => u.id);

        tasks = await db
          .select()
          .from(tasksTable)
          .where(
            or(
              notInArray(tasksTable.assignedTo, superuserIds),
              isNull(tasksTable.assignedTo)
            )
          );
        break;

      case "Senior Manager":
      case "Manager":
        // Get tasks for themselves and their direct subordinates
        const subordinates = await this.getSubordinates(userId);
        const subordinateIds = subordinates.map(s => s.id);
        tasks = await db
          .select()
          .from(tasksTable)
          .where(
            or(
              eq(tasksTable.assignedTo, userId),
              inArray(tasksTable.assignedTo, subordinateIds)
            )
          );
        break;

      case "Employee":
        // Get only their own tasks
        tasks = await db
          .select()
          .from(tasksTable)
          .where(eq(tasksTable.assignedTo, userId));
        break;
    }

    console.log(`Found tasks:`, tasks);
    return tasks as Task[];
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
    return subordinates as User[];
  }

  async getAllUsers(): Promise<User[]> {
    const allUsers = await db.select().from(users);
    console.log(`Getting all users:`, allUsers);
    return allUsers as User[];
  }
}

export const storage = new DatabaseStorage();
import { IStorage } from "./types";
import type { User, Task, InsertUser, InsertTask } from "@shared/schema";
import { roleHierarchy, canManage } from "@shared/roles";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { users, tasks as tasksTable } from "@shared/schema";
import { eq, or, inArray } from "drizzle-orm";

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

    console.log(`Getting tasks for ${user.username} (${user.role})`);

    // Case 1: Superuser sees all tasks
    if (user.role === 'Superuser') {
      console.log(`User is Superuser, returning all tasks`);
      const tasks = await db.select().from(tasksTable);
      console.log(`Found ${tasks.length} total tasks for superuser, tasks:`, tasks);
      return tasks as Task[];
    }

    // Case 2: Employee sees only their tasks
    if (user.role === 'Employee') {
      console.log(`User is Employee, returning only their tasks`);
      const tasks = await db.select()
        .from(tasksTable)
        .where(eq(tasksTable.assignedTo, userId));
      console.log(`Found ${tasks.length} tasks for employee`);
      return tasks as Task[];
    }

    // Case 3: Managers (General Manager, Senior Manager, Manager)
    // Get their own tasks + tasks of users where they are the reporting manager
    console.log(`Getting tasks for manager ${userId} and their direct reports`);

    // First get all users where this manager is their reporting manager
    const directReports = await db.select()
      .from(users)
      .where(eq(users.reportingManagerId, userId));

    const directReportIds = directReports.map(u => u.id);
    console.log(`Users reporting to ${user.username}:`, 
      directReports.map(u => `${u.username} (${u.role})`));

    // Get tasks for the manager and their direct reports
    const tasks = await db.select()
      .from(tasksTable)
      .where(
        or(
          // Manager's own tasks
          eq(tasksTable.assignedTo, userId),
          // Tasks of direct reports
          inArray(tasksTable.assignedTo, directReportIds)
        )
      );

    console.log(`Found ${tasks.length} total tasks for ${user.role} ${user.username}`);
    return tasks as Task[];
  }

  async getSubordinates(managerId: number): Promise<User[]> {
    console.log(`Getting subordinates for manager ${managerId}`);
    const manager = await this.getUser(managerId);
    if (!manager) return [];

    // Get direct subordinates (users who have this manager as their reporting manager)
    const subordinates = await db.select()
      .from(users)
      .where(eq(users.reportingManagerId, managerId));

    console.log(`Found ${subordinates.length} subordinates for manager ${managerId}:`, 
      subordinates.map(s => `${s.username} (${s.role})`));
    return subordinates as User[];
  }

  async getAllUsers(): Promise<User[]> {
    const allUsers = await db.select().from(users);
    console.log(`Getting all users:`, allUsers);
    return allUsers as User[];
  }
}

export const storage = new DatabaseStorage();
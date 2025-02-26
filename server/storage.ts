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
    const user = await this.getUser(userId);
    if (!user) return [];

    console.log(`Getting tasks for ${user.username} (${user.role})`);

    // Case 1: Superuser sees all tasks
    if (user.role === 'Superuser') {
      console.log(`User is Superuser, returning all tasks`);
      const tasks = await db.select().from(tasksTable);
      console.log(`Found ${tasks.length} total tasks for superuser`);
      return tasks as Task[];
    }

    // Case 2: For regular users (including managers and employees)
    // A user should ONLY see tasks where they are either:
    // 1. The assignee (assignedTo = userId) OR
    // 2. The creator (createdBy = userId)
    console.log(`Getting tasks for ${user.username} (${user.role}) with ID ${userId}`);

    // Query tasks with strict visibility rules
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(
        or(
          eq(tasksTable.assignedTo, userId),    // Tasks where user is the assignee
          eq(tasksTable.createdBy, userId)      // Tasks where user is the creator
        )
      )
      .orderBy(tasksTable.finishDate);         // Order by due date

    // Log task details for debugging
    console.log(`Tasks found for ${user.username} (${user.role}):`, 
      tasks.map(t => ({
        id: t.id,
        title: t.title,
        assignedTo: t.assignedTo,
        createdBy: t.createdBy,
        reason: t.assignedTo === userId ? 'Assigned to user' : 'Created by user',
        visibility: `User ${userId} can see this task because they are the ${t.assignedTo === userId ? 'assignee' : 'creator'}`
      }))
    );

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
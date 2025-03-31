import { IStorage, UserUpdate } from "./types";
import type { 
  User, Task, InsertUser, InsertTask,
  TaskHistory, InsertTaskHistory,
  WorkflowRecommendation, InsertWorkflowRecommendation 
} from "@shared/schema";
import { roleHierarchy, canManage } from "@shared/roles";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { 
  users, 
  tasks as tasksTable, 
  taskHistory as taskHistoryTable,
  workflowRecommendations as workflowRecommendationsTable
} from "@shared/schema";
import { eq, or, inArray, desc, and, sql, like, not } from "drizzle-orm";

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

  async updateUser(id: number, updateData: UserUpdate): Promise<User> {
    console.log(`Updating user ${id} with data:`, {
      ...updateData,
      password: updateData.password ? '[REDACTED]' : undefined
    });

    try {
      const result = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, id))
        .returning();
      const user = result[0] as User;

      if (!user) throw new Error("User not found");
      console.log(`Updated user:`, {
        ...user,
        password: '[REDACTED]'
      });
      return user;
    } catch (error) {
      console.error(`Error updating user ${id}:`, error);
      throw error;
    }
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
    if (!user) {
      console.log(`No user found for ID ${userId}`);
      return [];
    }

    console.log(`Getting tasks for user: ${user.username} (${user.role}, ID: ${userId})`);

    // Rule 1: Superuser sees all tasks
    if (user.role === 'Superuser') {
      const tasks = await db.select().from(tasksTable);
      console.log(`Found ${tasks.length} tasks total for Superuser ${user.username}`);
      return tasks as Task[];
    }

    // Rule 2: Regular users see ONLY tasks where they are:
    // a) The assignee OR b) The creator 
    console.log(`Getting tasks for ${user.username} where userId=${userId} is either assignee or creator`);

    const tasks = await db
      .select({
        id: tasksTable.id,
        title: tasksTable.title,
        description: tasksTable.description,
        status: tasksTable.status,
        priority: tasksTable.priority,
        startDate: tasksTable.startDate,
        finishDate: tasksTable.finishDate,
        assignedTo: tasksTable.assignedTo,
        createdBy: tasksTable.createdBy,
        createdAt: tasksTable.createdAt
      })
      .from(tasksTable)
      .where(
        or(
          eq(tasksTable.assignedTo, userId),
          eq(tasksTable.createdBy, userId)
        )
      )
      .orderBy(tasksTable.finishDate);

    // Log each task and why it's visible
    console.log(`Tasks found for ${user.username}:`,
      tasks.map(t => ({
        id: t.id,
        title: t.title,
        assignedTo: t.assignedTo,
        createdBy: t.createdBy,
        visibility_reason: `Visible because user ${userId} is the ${
          t.assignedTo === userId ? 'assignee' : 'creator'
        }`
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

  async getTask(id: number): Promise<Task | undefined> {
    const result = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    return result[0] as Task | undefined;
  }

  async updateTask(id: number, updateData: Partial<Task>): Promise<Task> {
    console.log(`Updating task ${id} with data:`, updateData);
    const result = await db
      .update(tasksTable)
      .set(updateData)
      .where(eq(tasksTable.id, id))
      .returning();
    const task = result[0] as Task;

    if (!task) throw new Error("Task not found");
    console.log(`Updated task:`, task);
    return task;
  }

  // Task History Implementation
  async createTaskHistory(taskHistory: InsertTaskHistory): Promise<TaskHistory> {
    console.log(`Creating task history record:`, taskHistory);
    const result = await db.insert(taskHistoryTable).values(taskHistory).returning();
    const history = result[0] as TaskHistory;
    console.log(`Created task history record:`, history);
    return history;
  }

  async getTaskHistory(taskId: number): Promise<TaskHistory[]> {
    console.log(`Getting history for task ${taskId}`);
    const history = await db
      .select()
      .from(taskHistoryTable)
      .where(eq(taskHistoryTable.taskId, taskId))
      .orderBy(desc(taskHistoryTable.timestamp));
    
    console.log(`Found ${history.length} history records for task ${taskId}`);
    return history as TaskHistory[];
  }

  // Workflow Recommendations Implementation
  async createRecommendation(recommendation: InsertWorkflowRecommendation): Promise<WorkflowRecommendation> {
    console.log(`Creating workflow recommendation:`, recommendation);
    const result = await db.insert(workflowRecommendationsTable).values(recommendation).returning();
    const newRecommendation = result[0] as WorkflowRecommendation;
    console.log(`Created workflow recommendation:`, newRecommendation);
    return newRecommendation;
  }

  async getRecommendationsForUser(userId: number): Promise<WorkflowRecommendation[]> {
    console.log(`Getting all recommendations for user ${userId}`);
    const recommendations = await db
      .select()
      .from(workflowRecommendationsTable)
      .where(eq(workflowRecommendationsTable.userId, userId))
      .orderBy(desc(workflowRecommendationsTable.createdAt));
    
    console.log(`Found ${recommendations.length} recommendations for user ${userId}`);
    return recommendations as WorkflowRecommendation[];
  }

  async getActiveRecommendations(userId: number): Promise<WorkflowRecommendation[]> {
    console.log(`Getting active (pending) recommendations for user ${userId}`);
    const recommendations = await db
      .select()
      .from(workflowRecommendationsTable)
      .where(
        and(
          eq(workflowRecommendationsTable.userId, userId),
          eq(workflowRecommendationsTable.status, 'pending')
        )
      )
      .orderBy(desc(workflowRecommendationsTable.createdAt));
    
    console.log(`Found ${recommendations.length} active recommendations for user ${userId}`);
    return recommendations as WorkflowRecommendation[];
  }

  async updateRecommendation(id: number, updateData: Partial<WorkflowRecommendation>): Promise<WorkflowRecommendation> {
    console.log(`Updating recommendation ${id} with data:`, updateData);
    const result = await db
      .update(workflowRecommendationsTable)
      .set(updateData)
      .where(eq(workflowRecommendationsTable.id, id))
      .returning();
    
    const recommendation = result[0] as WorkflowRecommendation;
    if (!recommendation) throw new Error("Recommendation not found");
    
    console.log(`Updated recommendation:`, recommendation);
    return recommendation;
  }

  // Recommendation Generation Logic
  async generateTaskAssignmentRecommendations(userId: number): Promise<WorkflowRecommendation[]> {
    console.log(`Generating task assignment recommendations for user ${userId}`);
    const user = await this.getUser(userId);
    if (!user) return [];
    
    // Get user's role and reporting structure
    const userRole = user.role;
    const recommendations: WorkflowRecommendation[] = [];
    
    // Only managers and above can get task assignment recommendations
    if (roleHierarchy[userRole] >= roleHierarchy['Manager']) {
      // Get all tasks assigned to user
      const userTasks = await db
        .select()
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.assignedTo, userId),
            eq(tasksTable.status, 'pending')
          )
        );
      
      // Check if user has too many tasks (more than 5 pending tasks)
      if (userTasks.length > 5) {
        // Get subordinates to recommend task assignments
        const subordinates = await this.getSubordinates(userId);
        
        // Only recommend if there are subordinates
        if (subordinates.length > 0) {
          // Find least busy subordinate
          const subordinateTaskCounts = await Promise.all(
            subordinates.map(async (sub) => {
              const tasks = await db
                .select()
                .from(tasksTable)
                .where(
                  and(
                    eq(tasksTable.assignedTo, sub.id),
                    eq(tasksTable.status, 'pending')
                  )
                );
              
              return { 
                subordinate: sub, 
                taskCount: tasks.length 
              };
            })
          );
          
          // Sort by task count (ascending)
          subordinateTaskCounts.sort((a, b) => a.taskCount - b.taskCount);
          
          // Get the least busy subordinate
          const leastBusySubordinate = subordinateTaskCounts[0]?.subordinate;
          
          if (leastBusySubordinate) {
            // Create recommendation for task redistribution
            const newRecommendation: InsertWorkflowRecommendation = {
              userId,
              title: 'Consider Task Redistribution',
              description: `You currently have ${userTasks.length} pending tasks. Consider forwarding some tasks to ${leastBusySubordinate.username} who currently has ${subordinateTaskCounts[0].taskCount} pending tasks.`,
              recommendationType: 'task_assignment',
              recommendationData: { 
                taskCount: userTasks.length,
                recommendedAssigneeId: leastBusySubordinate.id,
                recommendedAssigneeName: leastBusySubordinate.username,
                recommendedAssigneeTaskCount: subordinateTaskCounts[0].taskCount
              },
              status: 'pending',
              createdAt: new Date().toISOString(),
              isRead: false
            };
            
            // Store and return the recommendation
            const recommendation = await this.createRecommendation(newRecommendation);
            recommendations.push(recommendation);
          }
        }
      }
    }
    
    return recommendations;
  }

  async generatePriorityAdjustmentRecommendations(userId: number): Promise<WorkflowRecommendation[]> {
    console.log(`Generating priority adjustment recommendations for user ${userId}`);
    
    // Find tasks that are close to their due date but not high priority
    const today = new Date();
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);
    
    const threeDayThreshold = threeDaysFromNow.toISOString().split('T')[0];
    
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          or(
            eq(tasksTable.assignedTo, userId),
            eq(tasksTable.createdBy, userId)
          ),
          eq(tasksTable.status, 'pending'),
          not(eq(tasksTable.priority, 'High')),
          sql`${tasksTable.finishDate} <= ${threeDayThreshold}`
        )
      );
    
    console.log(`Found ${tasks.length} tasks approaching deadline with non-high priority`);
    
    const recommendations: WorkflowRecommendation[] = [];
    
    for (const task of tasks) {
      // Create recommendation for priority adjustment
      const dueDate = new Date(task.finishDate);
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      const newRecommendation: InsertWorkflowRecommendation = {
        userId,
        title: 'Consider Priority Adjustment',
        description: `Task "${task.title}" is due in ${daysUntilDue} days but is set to ${task.priority} priority. Consider increasing the priority to High.`,
        recommendationType: 'priority_adjustment',
        recommendationData: { 
          taskId: task.id,
          taskTitle: task.title,
          currentPriority: task.priority,
          dueDate: task.finishDate,
          daysUntilDue
        },
        status: 'pending',
        createdAt: new Date().toISOString(),
        isRead: false
      };
      
      // Store and return the recommendation
      const recommendation = await this.createRecommendation(newRecommendation);
      recommendations.push(recommendation);
    }
    
    return recommendations;
  }

  async generateFollowUpRecommendations(userId: number): Promise<WorkflowRecommendation[]> {
    console.log(`Generating follow-up recommendations for user ${userId}`);
    const user = await this.getUser(userId);
    if (!user) return [];
    
    const recommendations: WorkflowRecommendation[] = [];
    
    // Only for managers and above
    if (roleHierarchy[user.role] < roleHierarchy['Employee']) {
      // Find tasks assigned to subordinates that are overdue
      const subordinates = await this.getSubordinates(userId);
      const subordinateIds = subordinates.map(s => s.id);
      
      if (subordinateIds.length === 0) return [];
      
      const today = new Date().toISOString().split('T')[0];
      
      const overdueTasks = await db
        .select({
          task: tasksTable,
          username: users.username
        })
        .from(tasksTable)
        .innerJoin(users, eq(tasksTable.assignedTo, users.id))
        .where(
          and(
            inArray(tasksTable.assignedTo, subordinateIds),
            eq(tasksTable.status, 'pending'),
            sql`${tasksTable.finishDate} < ${today}`
          )
        );
      
      console.log(`Found ${overdueTasks.length} overdue tasks for subordinates`);
      
      // Group by assignee to avoid too many recommendations
      const tasksByAssignee: Record<number, { tasks: Task[], name: string }> = {};
      
      for (const { task, username } of overdueTasks) {
        const assigneeId = task.assignedTo!;
        if (!tasksByAssignee[assigneeId]) {
          tasksByAssignee[assigneeId] = { tasks: [], name: username };
        }
        tasksByAssignee[assigneeId].tasks.push(task as Task);
      }
      
      // Create a follow-up recommendation for each assignee with overdue tasks
      for (const [assigneeId, { tasks, name }] of Object.entries(tasksByAssignee)) {
        const newRecommendation: InsertWorkflowRecommendation = {
          userId,
          title: 'Follow-up Required',
          description: `${name} has ${tasks.length} overdue task${tasks.length > 1 ? 's' : ''}. Consider checking in on their progress.`,
          recommendationType: 'follow_up',
          recommendationData: { 
            assigneeId: parseInt(assigneeId),
            assigneeName: name,
            taskCount: tasks.length,
            taskIds: tasks.map(t => t.id)
          },
          status: 'pending',
          createdAt: new Date().toISOString(),
          isRead: false
        };
        
        // Store and return the recommendation
        const recommendation = await this.createRecommendation(newRecommendation);
        recommendations.push(recommendation);
      }
    }
    
    return recommendations;
  }
}

export const storage = new DatabaseStorage();
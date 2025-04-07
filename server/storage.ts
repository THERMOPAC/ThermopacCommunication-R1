import { IStorage, UserUpdate } from "./types";
import type { 
  User, Task, InsertUser, InsertTask,
  TaskHistory, InsertTaskHistory,
  WorkflowRecommendation, InsertWorkflowRecommendation,
  Achievement, InsertAchievement,
  UserAchievement, InsertUserAchievement,
  ProductivityMetric, InsertProductivityMetric,
  RecurringPattern, InsertRecurringPattern,
  RecurringTask, InsertRecurringTask,
  GmailToken, InsertGmailToken,
  GmailMessage, InsertGmailMessage,
  GmailSettings, InsertGmailSettings,
  InternalMessage, InsertInternalMessage
} from "@shared/schema";
import { roleHierarchy, canManage } from "@shared/roles";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { 
  users, 
  tasks as tasksTable, 
  taskHistory as taskHistoryTable,
  workflowRecommendations as workflowRecommendationsTable,
  achievements as achievementsTable,
  userAchievements as userAchievementsTable,
  productivityMetrics as productivityMetricsTable,
  recurringPatterns as recurringPatternsTable,
  recurringTasks as recurringTasksTable,
  gmailTokens as gmailTokensTable,
  gmailMessages as gmailMessagesTable,
  gmailSettings as gmailSettingsTable,
  internalMessages as internalMessagesTable
} from "@shared/schema";
import { eq, or, inArray, desc, and, sql, like, not } from "drizzle-orm";

const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;
  
  // Expose db and tables for direct access when needed
  db = db;
  usersTable = users;
  tasksTable = tasksTable;
  taskHistoryTable = taskHistoryTable;
  workflowRecommendationsTable = workflowRecommendationsTable;
  achievementsTable = achievementsTable;
  userAchievementsTable = userAchievementsTable;
  productivityMetricsTable = productivityMetricsTable;
  recurringPatternsTable = recurringPatternsTable;
  recurringTasksTable = recurringTasksTable;
  gmailTokensTable = gmailTokensTable;
  gmailMessagesTable = gmailMessagesTable;
  gmailSettingsTable = gmailSettingsTable;
  internalMessagesTable = internalMessagesTable;

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
        // Get most overdue task for details
        const mostOverdueTask = tasks.reduce((prev, current) => {
          return new Date(prev.finishDate) < new Date(current.finishDate) ? prev : current;
        }, tasks[0]);

        const newRecommendation: InsertWorkflowRecommendation = {
          userId,
          title: 'Follow-up Required',
          description: `${name} has ${tasks.length} overdue task${tasks.length > 1 ? 's' : ''}. Consider checking in on their progress.`,
          recommendationType: 'follow_up',
          recommendationData: { 
            assigneeId: parseInt(assigneeId),
            assigneeName: name,
            taskCount: tasks.length,
            taskIds: tasks.map(t => t.id),
            // Add task details for the most overdue task
            taskTitle: mostOverdueTask.title,
            dueDate: mostOverdueTask.finishDate,
            daysOverdue: Math.ceil((new Date().getTime() - new Date(mostOverdueTask.finishDate).getTime()) / (1000 * 60 * 60 * 24))
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

  // Achievement Management
  async getAllAchievements(): Promise<Achievement[]> {
    console.log('Getting all achievements');
    const achievements = await db.select().from(achievementsTable);
    console.log(`Found ${achievements.length} achievements`);
    return achievements as Achievement[];
  }

  async getAchievement(id: number): Promise<Achievement | undefined> {
    console.log(`Getting achievement with ID: ${id}`);
    const result = await db.select().from(achievementsTable).where(eq(achievementsTable.id, id));
    const achievement = result[0] as Achievement | undefined;
    console.log('Found achievement:', achievement);
    return achievement;
  }

  async createAchievement(achievement: InsertAchievement): Promise<Achievement> {
    console.log('Creating achievement:', achievement);
    const result = await db.insert(achievementsTable).values(achievement).returning();
    const newAchievement = result[0] as Achievement;
    console.log('Created achievement:', newAchievement);
    return newAchievement;
  }

  async getUserAchievements(userId: number): Promise<UserAchievement[]> {
    console.log(`Getting achievements for user ${userId}`);
    const userAchievements = await db
      .select({
        userAchievement: userAchievementsTable,
        achievement: achievementsTable
      })
      .from(userAchievementsTable)
      .innerJoin(
        achievementsTable,
        eq(userAchievementsTable.achievementId, achievementsTable.id)
      )
      .where(eq(userAchievementsTable.userId, userId))
      .orderBy(desc(userAchievementsTable.earnedAt));
    
    console.log(`Found ${userAchievements.length} achievements for user ${userId}`);
    return userAchievements.map(ua => ({
      ...ua.userAchievement,
      achievementDetails: ua.achievement
    })) as unknown as UserAchievement[];
  }

  async awardAchievement(userAchievement: InsertUserAchievement): Promise<UserAchievement> {
    console.log('Awarding achievement:', userAchievement);
    const result = await db.insert(userAchievementsTable).values(userAchievement).returning();
    const newUserAchievement = result[0] as UserAchievement;
    console.log('Awarded achievement:', newUserAchievement);
    
    // Update productivity metrics with points from this achievement
    const achievement = await this.getAchievement(userAchievement.achievementId);
    if (achievement) {
      // Get current metrics
      const metrics = await this.getProductivityMetric(userAchievement.userId);
      const currentPoints = metrics?.totalPoints || 0;
      
      await this.updateProductivityMetric(userAchievement.userId, {
        totalPoints: currentPoints + achievement.points
      });
    }
    
    return newUserAchievement;
  }

  // Productivity Metrics
  async getProductivityMetric(userId: number): Promise<ProductivityMetric | undefined> {
    console.log(`Getting productivity metrics for user ${userId}`);
    const result = await db.select().from(productivityMetricsTable).where(eq(productivityMetricsTable.userId, userId));
    const metric = result[0] as ProductivityMetric | undefined;
    console.log('Found productivity metric:', metric);
    return metric;
  }

  async createProductivityMetric(metric: InsertProductivityMetric): Promise<ProductivityMetric> {
    console.log('Creating productivity metric:', metric);
    const result = await db.insert(productivityMetricsTable).values(metric).returning();
    const newMetric = result[0] as ProductivityMetric;
    console.log('Created productivity metric:', newMetric);
    return newMetric;
  }

  async updateProductivityMetric(userId: number, updates: Partial<ProductivityMetric>): Promise<ProductivityMetric> {
    console.log(`Updating productivity metrics for user ${userId}:`, updates);
    
    // Check if metric exists
    const existingMetric = await this.getProductivityMetric(userId);
    
    if (!existingMetric) {
      // Create a new metric if it doesn't exist
      return this.createProductivityMetric({
        userId,
        tasksCompleted: updates.tasksCompleted || 0,
        tasksCreated: updates.tasksCreated || 0,
        recommendationsAccepted: updates.recommendationsAccepted || 0,
        averageCompletionTime: updates.averageCompletionTime || 0,
        onTimeCompletion: updates.onTimeCompletion || 0,
        weeklyScore: updates.weeklyScore || 0,
        monthlyScore: updates.monthlyScore || 0,
        totalPoints: updates.totalPoints || 0,
        lastUpdated: new Date().toISOString()
      });
    }
    
    // Update existing metric
    const result = await db
      .update(productivityMetricsTable)
      .set({
        ...updates,
        lastUpdated: new Date().toISOString()
      })
      .where(eq(productivityMetricsTable.userId, userId))
      .returning();
    
    const updatedMetric = result[0] as ProductivityMetric;
    console.log('Updated productivity metric:', updatedMetric);
    return updatedMetric;
  }

  // Leaderboard
  async getTeamLeaderboard(teamId?: number): Promise<ProductivityMetric[]> {
    console.log(`Getting team leaderboard${teamId ? ` for team ${teamId}` : ''}`);
    
    // Create the base query
    let results;
    
    if (teamId) {
      // Filter by team (users with the same reporting manager)
      results = await db
        .select({
          metric: productivityMetricsTable,
          user: {
            id: users.id,
            username: users.username,
            role: users.role,
            reportingManagerId: users.reportingManagerId
          }
        })
        .from(productivityMetricsTable)
        .innerJoin(users, eq(productivityMetricsTable.userId, users.id))
        .where(eq(users.reportingManagerId, teamId))
        .orderBy(desc(productivityMetricsTable.weeklyScore));
    } else {
      // Get all users if no teamId specified
      results = await db
        .select({
          metric: productivityMetricsTable,
          user: {
            id: users.id,
            username: users.username,
            role: users.role,
            reportingManagerId: users.reportingManagerId
          }
        })
        .from(productivityMetricsTable)
        .innerJoin(users, eq(productivityMetricsTable.userId, users.id))
        .orderBy(desc(productivityMetricsTable.weeklyScore));
    }
    
    console.log(`Found ${results.length} entries for leaderboard`);
    return results.map(r => ({
      ...r.metric,
      userDetails: r.user
    })) as unknown as ProductivityMetric[];
  }

  async getTopPerformers(limit: number = 10): Promise<ProductivityMetric[]> {
    console.log(`Getting top ${limit} performers`);
    
    const result = await db
      .select({
        metric: productivityMetricsTable,
        user: {
          id: users.id,
          username: users.username,
          role: users.role
        }
      })
      .from(productivityMetricsTable)
      .innerJoin(users, eq(productivityMetricsTable.userId, users.id))
      .orderBy(desc(productivityMetricsTable.weeklyScore))
      .limit(limit);
    
    console.log(`Found ${result.length} top performers`);
    return result.map(r => ({
      ...r.metric,
      userDetails: r.user
    })) as unknown as ProductivityMetric[];
  }

  async getUserRank(userId: number): Promise<{ rank: number; totalUsers: number }> {
    console.log(`Getting rank for user ${userId}`);
    
    // Get all metrics ordered by score
    const allMetrics = await db
      .select()
      .from(productivityMetricsTable)
      .orderBy(desc(productivityMetricsTable.weeklyScore));
    
    const totalUsers = allMetrics.length;
    const userIndex = allMetrics.findIndex(m => m.userId === userId);
    const rank = userIndex === -1 ? totalUsers : userIndex + 1;
    
    console.log(`User ${userId} has rank ${rank} out of ${totalUsers}`);
    return { rank, totalUsers };
  }

  // Achievement Tracking
  async checkAndAwardAchievements(userId: number): Promise<UserAchievement[]> {
    console.log(`Checking achievement criteria for user ${userId}`);
    
    const user = await this.getUser(userId);
    if (!user) return [];
    
    const existingAchievements = await db
      .select()
      .from(userAchievementsTable)
      .where(eq(userAchievementsTable.userId, userId));
    
    const existingAchievementIds = existingAchievements.map(a => a.achievementId);
    
    // Get all potential achievements
    const eligibleAchievements = await db
      .select()
      .from(achievementsTable)
      .where(
        not(inArray(achievementsTable.id, existingAchievementIds))
      );
    
    console.log(`Found ${eligibleAchievements.length} eligible achievements to check`);
    
    // Check each achievement criteria
    const newlyAwardedAchievements: UserAchievement[] = [];
    
    for (const achievement of eligibleAchievements) {
      let isAchieved = false;
      
      // Get user's productivity metrics
      const metrics = await this.getProductivityMetric(userId);
      if (!metrics) continue;
      
      // Check achievement criteria based on category
      switch (achievement.category) {
        case 'task':
          if (achievement.name === 'Task Master' && metrics.tasksCompleted >= achievement.threshold) {
            isAchieved = true;
          } else if (achievement.name === 'Delegator' && metrics.tasksCreated >= achievement.threshold) {
            isAchieved = true;
          } else if (achievement.name === 'On-Time Hero' && metrics.onTimeCompletion >= achievement.threshold) {
            isAchieved = true;
          }
          break;
        
        case 'productivity':
          if (achievement.name === 'Efficiency Expert' && metrics.averageCompletionTime <= achievement.threshold) {
            isAchieved = true;
          } else if (achievement.name === 'Point Collector' && metrics.totalPoints >= achievement.threshold) {
            isAchieved = true;
          }
          break;
        
        case 'collaboration':
          // Check collaboration-based achievements
          if (achievement.name === 'Team Player') {
            // Count tasks forwarded to others
            const taskHistory = await db
              .select()
              .from(taskHistoryTable)
              .where(
                and(
                  eq(taskHistoryTable.userId, userId),
                  eq(taskHistoryTable.action, 'forwarded')
                )
              );
            
            if (taskHistory.length >= achievement.threshold) {
              isAchieved = true;
            }
          }
          break;
        
        case 'leadership':
          // Check leadership-based achievements (for managers and above)
          if (roleHierarchy[user.role] < roleHierarchy['Employee']) {
            if (achievement.name === 'Mentor') {
              // Check if manager has at least X subordinates
              const subordinates = await this.getSubordinates(userId);
              if (subordinates.length >= achievement.threshold) {
                isAchieved = true;
              }
            }
          }
          break;
      }
      
      // Award achievement if criteria met
      if (isAchieved) {
        console.log(`User ${userId} has earned achievement: ${achievement.name}`);
        
        const userAchievement = await this.awardAchievement({
          userId,
          achievementId: achievement.id,
          earnedAt: new Date().toISOString(),
          level: 1
        });
        
        newlyAwardedAchievements.push(userAchievement);
      }
    }
    
    console.log(`Awarded ${newlyAwardedAchievements.length} new achievements to user ${userId}`);
    return newlyAwardedAchievements;
  }

  async calculateProductivityScore(userId: number): Promise<number> {
    console.log(`Calculating productivity score for user ${userId}`);
    
    // Get metrics
    const metrics = await this.getProductivityMetric(userId);
    if (!metrics) return 0;
    
    // Score calculation formula:
    // (10 × tasksCompleted) + (5 × tasksCreated) + (15 × onTimeCompletion) + (5 × recommendationsAccepted)
    const score = (10 * metrics.tasksCompleted) + 
                  (5 * metrics.tasksCreated) + 
                  (15 * metrics.onTimeCompletion) + 
                  (5 * metrics.recommendationsAccepted);
    
    console.log(`Calculated productivity score for user ${userId}: ${score}`);
    return score;
  }

  async updateUserProductivityStats(userId: number): Promise<ProductivityMetric> {
    console.log(`Updating productivity statistics for user ${userId}`);
    
    // Count completed tasks
    const completedTasks = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.assignedTo, userId),
          eq(tasksTable.status, 'completed')
        )
      );
    
    // Count created tasks
    const createdTasks = await db
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.createdBy, userId));
    
    // Count accepted recommendations
    const acceptedRecommendations = await db
      .select()
      .from(workflowRecommendationsTable)
      .where(
        and(
          eq(workflowRecommendationsTable.userId, userId),
          eq(workflowRecommendationsTable.status, 'accepted')
        )
      );
    
    // Calculate average completion time
    let averageCompletionTime = 0;
    let onTimeCount = 0;
    
    if (completedTasks.length > 0) {
      let totalCompletionTimeHours = 0;
      
      for (const task of completedTasks) {
        if (task.completedAt && task.createdAt) {
          const startTime = new Date(task.createdAt).getTime();
          const endTime = new Date(task.completedAt).getTime();
          const durationHours = (endTime - startTime) / (1000 * 60 * 60);
          totalCompletionTimeHours += durationHours;
          
          // Check if completed on time
          const dueDate = new Date(task.finishDate).getTime();
          if (endTime <= dueDate) {
            onTimeCount++;
          }
        }
      }
      
      if (completedTasks.length > 0) {
        averageCompletionTime = Math.round(totalCompletionTimeHours / completedTasks.length);
      }
    }
    
    // Calculate weekly score
    const weeklyScore = await this.calculateProductivityScore(userId);
    
    // Update metric
    const updatedMetric = await this.updateProductivityMetric(userId, {
      tasksCompleted: completedTasks.length,
      tasksCreated: createdTasks.length,
      recommendationsAccepted: acceptedRecommendations.length,
      averageCompletionTime,
      onTimeCompletion: onTimeCount,
      weeklyScore,
      lastUpdated: new Date().toISOString()
    });
    
    // Check if user earned any achievements
    await this.checkAndAwardAchievements(userId);
    
    return updatedMetric;
  }

  // Recurring Pattern Implementation
  async createRecurringPattern(pattern: InsertRecurringPattern): Promise<RecurringPattern> {
    try {
      console.log(`🟢 STORAGE: Creating recurring pattern with data:`);
      console.log(JSON.stringify(pattern, null, 2));
      
      // Verify critical fields explicitly
      if (!pattern.userId) {
        console.error(`🔴 CRITICAL ERROR: Missing userId in pattern data`);
        throw new Error('Missing required field: userId');
      }
      
      if (!pattern.pattern) {
        console.error(`🔴 CRITICAL ERROR: Missing pattern type in pattern data`);
        throw new Error('Missing required field: pattern');
      }
      
      if (!pattern.templateTitle) {
        console.error(`🔴 CRITICAL ERROR: Missing templateTitle in pattern data`);
        throw new Error('Missing required field: templateTitle');
      }
      
      // Make sure required fields have the correct type
      const numericFields = ['userId', 'createdBy', 'interval', 'templateDurationDays'];
      for (const field of numericFields) {
        if (field in pattern) {
          if (typeof pattern[field as keyof typeof pattern] !== 'number') {
            console.error(`🔴 CRITICAL ERROR: Field ${field} must be a number, got ${typeof pattern[field as keyof typeof pattern]}`);
            // Convert to number if possible
            const value = pattern[field as keyof typeof pattern];
            if (value !== undefined && value !== null) {
              const numValue = Number(value);
              if (!isNaN(numValue)) {
                (pattern as any)[field] = numValue;
                console.log(`🟡 Converted ${field} from ${typeof value} to number: ${numValue}`);
              } else {
                throw new Error(`Field ${field} must be a number`);
              }
            }
          }
        }
      }
      
      console.log(`🟢 STORAGE: Final pattern data to insert:`);
      console.log(JSON.stringify(pattern, null, 2));
      
      const result = await db.insert(recurringPatternsTable).values(pattern).returning();
      const newPattern = result[0] as RecurringPattern;
      
      console.log(`🟢 STORAGE: Successfully created recurring pattern:`);
      console.log(JSON.stringify(newPattern, null, 2));
      
      return newPattern;
    } catch (error) {
      console.error(`🔴 STORAGE ERROR creating recurring pattern:`, error);
      throw error;
    }
  }

  async getRecurringPattern(id: number): Promise<RecurringPattern | undefined> {
    console.log(`Getting recurring pattern with ID ${id}`);
    const result = await db.select().from(recurringPatternsTable).where(eq(recurringPatternsTable.id, id));
    return result[0] as RecurringPattern | undefined;
  }

  async updateRecurringPattern(id: number, updateData: Partial<RecurringPattern>): Promise<RecurringPattern> {
    console.log(`Updating recurring pattern ${id} with data:`, updateData);
    const result = await db
      .update(recurringPatternsTable)
      .set(updateData)
      .where(eq(recurringPatternsTable.id, id))
      .returning();
    
    const pattern = result[0] as RecurringPattern;
    if (!pattern) throw new Error("Recurring pattern not found");
    
    console.log(`Updated recurring pattern:`, pattern);
    return pattern;
  }

  async deleteRecurringPattern(id: number): Promise<void> {
    console.log(`Deleting recurring pattern ${id}`);
    await db.delete(recurringPatternsTable).where(eq(recurringPatternsTable.id, id));
    console.log(`Deleted recurring pattern ${id}`);
  }

  async getUserRecurringPatterns(userId: number): Promise<RecurringPattern[]> {
    console.log(`Getting recurring patterns for user ${userId}`);
    // Use the userId field instead of createdBy to get patterns
    const patterns = await db
      .select()
      .from(recurringPatternsTable)
      .where(eq(recurringPatternsTable.userId, userId))
      .orderBy(desc(recurringPatternsTable.createdAt));
    
    console.log(`Found ${patterns.length} recurring patterns for user ${userId}`);
    return patterns as RecurringPattern[];
  }
  
  // Recurring Task methods
  async createRecurringTask(insertRecurringTask: InsertRecurringTask): Promise<RecurringTask> {
    console.log(`Creating new recurring task:`, insertRecurringTask);
    const result = await db.insert(recurringTasksTable).values(insertRecurringTask).returning();
    const task = result[0] as RecurringTask;
    console.log(`Created recurring task:`, task);
    return task;
  }
  
  async getRecurringTasksForUser(userId: number): Promise<RecurringTask[]> {
    console.log(`Getting recurring tasks for user ${userId}`);
    
    const user = await this.getUser(userId);
    if (!user) {
      console.log(`No user found for ID ${userId}`);
      return [];
    }
    
    // Superuser can see all recurring tasks
    if (user.role === 'Superuser') {
      const tasks = await db.select().from(recurringTasksTable);
      console.log(`Found ${tasks.length} recurring tasks for Superuser ${user.username}`);
      return tasks as RecurringTask[];
    }
    
    // Regular users see only recurring tasks assigned to them
    const tasks = await db
      .select()
      .from(recurringTasksTable)
      .where(eq(recurringTasksTable.assignedTo, userId));
    
    console.log(`Found ${tasks.length} recurring tasks assigned to user ${userId}`);
    return tasks as RecurringTask[];
  }
  
  async getRecurringTask(id: number): Promise<RecurringTask | undefined> {
    console.log(`Getting recurring task ${id}`);
    const result = await db
      .select()
      .from(recurringTasksTable)
      .where(eq(recurringTasksTable.id, id));
    return result[0] as RecurringTask | undefined;
  }
  
  async updateRecurringTask(id: number, updateData: Partial<RecurringTask>): Promise<RecurringTask> {
    console.log(`Updating recurring task ${id} with data:`, updateData);
    const result = await db
      .update(recurringTasksTable)
      .set(updateData)
      .where(eq(recurringTasksTable.id, id))
      .returning();
    const task = result[0] as RecurringTask;
    
    if (!task) throw new Error("Recurring task not found");
    console.log(`Updated recurring task:`, task);
    return task;
  }
  
  async getRecurringTasksByPattern(patternId: number): Promise<RecurringTask[]> {
    console.log(`Getting recurring tasks for pattern ${patternId}`);
    const tasks = await db
      .select()
      .from(recurringTasksTable)
      .where(eq(recurringTasksTable.recurringPatternId, patternId))
      .orderBy(recurringTasksTable.dueDate);
    
    console.log(`Found ${tasks.length} recurring tasks for pattern ${patternId}`);
    return tasks as RecurringTask[];
  }

  async getActiveRecurringPatterns(): Promise<RecurringPattern[]> {
    console.log('Getting all active recurring patterns');
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    // For manual processing, just get all active patterns
    // This ensures we can force processing of patterns through the UI
    let patterns = await db
      .select()
      .from(recurringPatternsTable)
      .where(eq(recurringPatternsTable.isActive, true));
    
    console.log(`Found ${patterns.length} active recurring patterns for potential processing`);
    
    // Check each pattern to see if it's ready to be processed based on its settings
    // This allows more accurate logging and helps with debugging
    const readyPatterns: RecurringPattern[] = [];
    const pendingPatterns: RecurringPattern[] = [];
    
    for (const pattern of patterns) {
      // If nextGenerationDate is null or today or earlier, it's ready
      if (!pattern.nextGenerationDate || pattern.nextGenerationDate <= todayStr) {
        readyPatterns.push(pattern);
      } else {
        pendingPatterns.push(pattern);
      }
    }
    
    console.log(`Found ${readyPatterns.length} patterns ready for processing based on date criteria`);
    if (pendingPatterns.length > 0) {
      console.log(`Found ${pendingPatterns.length} active patterns that are not yet due`);
    }
    
    // Return all active patterns for manual processing via superuser
    return patterns as RecurringPattern[];
  }

  async processRecurringPatterns(): Promise<number> {
    let tasksGeneratedCount = 0;
    console.log('Processing recurring patterns to generate tasks');
    const patterns = await this.getActiveRecurringPatterns();
    
    for (const pattern of patterns) {
      try {
        console.log(`Processing pattern ${pattern.id}: ${pattern.templateTitle}`);
        
        // Check if pattern has reached its maximum occurrences
        if (pattern.maxOccurrences && pattern.generatedCount >= pattern.maxOccurrences) {
          console.log(`Pattern ${pattern.id} has reached maximum occurrences (${pattern.maxOccurrences})`);
          
          // Deactivate the pattern
          await this.updateRecurringPattern(pattern.id, { isActive: false });
          continue;
        }
        
        // Check if pattern has reached its end date
        if (pattern.endDate) {
          const endDate = new Date(pattern.endDate);
          const today = new Date();
          
          if (today > endDate) {
            console.log(`Pattern ${pattern.id} has passed its end date (${pattern.endDate})`);
            
            // Deactivate the pattern
            await this.updateRecurringPattern(pattern.id, { isActive: false });
            continue;
          }
        }
        
        // Generate the new recurring task
        const startDate = new Date().toISOString().split('T')[0]; // Today
        
        // Create task due date based on pattern type
        let taskDueDate = new Date();
        
        // For monthly patterns with specified day (like AMEX card payment on 10th)
        if (pattern.pattern === 'monthly' && pattern.dayOfMonth) {
          // Get current month and year
          const currentMonth = taskDueDate.getMonth();
          const currentYear = taskDueDate.getFullYear();
          const currentDay = taskDueDate.getDate();
          
          // Set the due date to the specified day of the current month
          taskDueDate = new Date(currentYear, currentMonth, pattern.dayOfMonth);
          
          // If the specified day has already passed this month, move to next month
          if (currentDay > pattern.dayOfMonth) {
            taskDueDate.setMonth(currentMonth + 1);
          }
          
          console.log(`Monthly pattern with day ${pattern.dayOfMonth}: Setting due date to ${taskDueDate.toISOString()}`);
        } else {
          // For other patterns, use the default approach (due date = start + duration)
          taskDueDate.setDate(taskDueDate.getDate() + pattern.templateDurationDays);
        }
        
        // Calculate finish date (same as due date)
        const finishDate = new Date(taskDueDate);
        const dueDate = taskDueDate.toISOString().split('T')[0];
        
        const newRecurringTask: InsertRecurringTask = {
          title: pattern.templateTitle,
          description: pattern.templateDescription,
          priority: pattern.templatePriority as 'Low' | 'Medium' | 'High',
          startDate,
          finishDate: finishDate.toISOString().split('T')[0],
          assignedTo: pattern.templateAssignedTo,
          createdAt: new Date().toISOString(),
          category: pattern.templateCategory,
          recurringPatternId: pattern.id,
          dueDate: dueDate,
          occurrenceNumber: (pattern.generatedCount || 0) + 1,
          status: 'pending'
        };
        
        // Check if a task with this due date and pattern already exists
        const existingTasks = await db
          .select()
          .from(recurringTasksTable)
          .where(
            and(
              eq(recurringTasksTable.recurringPatternId, pattern.id),
              eq(recurringTasksTable.dueDate, dueDate)
            )
          );
        
        if (existingTasks.length > 0) {
          console.log(`Skipping task creation - already exists for pattern ${pattern.id} on date ${dueDate}`);
          continue; // Skip to the next pattern
        }
        
        // Create the recurring task in the dedicated table
        const task = await this.createRecurringTask(newRecurringTask);
        tasksGeneratedCount++; // Increment the counter for each new task created
        console.log(`Created recurring task ${task.id} from pattern ${pattern.id} (occurrence #${task.occurrenceNumber})`);
        
        // Calculate next generation date based on pattern
        let nextGenerationDate = new Date();
        
        switch (pattern.pattern) {
          case 'daily':
            nextGenerationDate.setDate(nextGenerationDate.getDate() + pattern.interval);
            break;
            
          case 'weekly':
            nextGenerationDate.setDate(nextGenerationDate.getDate() + (7 * pattern.interval));
            break;
            
          case 'monthly':
            // Get current month and year
            const currentMonth = nextGenerationDate.getMonth();
            const currentYear = nextGenerationDate.getFullYear();
            const currentDay = nextGenerationDate.getDate();
            
            // Initialize next generation date as 1 day from now
            // This ensures if we're processing on or after the scheduled day this month,
            // we'll generate for next month
            let nextMonth;
            
            if (pattern.dayOfMonth) {
              // If we're processing on or after the scheduled day this month,
              // we want the next occurrence to be next month
              if (currentDay >= pattern.dayOfMonth) {
                nextMonth = currentMonth + pattern.interval;
              } else {
                // If we're processing before the scheduled day,
                // we want the next occurrence to be this month
                nextMonth = currentMonth;
              }
            } else {
              // No specific day set, just add the interval
              nextMonth = currentMonth + pattern.interval;
            }
            
            // Set to the next month based on our calculation
            nextGenerationDate.setMonth(nextMonth);
            
            // Adjust for day of month if specified
            if (pattern.dayOfMonth) {
              // First set to the 1st of the month to avoid issues with months of different lengths
              nextGenerationDate.setDate(1);
              // Then set to the day of month
              nextGenerationDate.setDate(pattern.dayOfMonth);
            }
            
            console.log(`Monthly pattern next generation date: ${nextGenerationDate.toISOString()}`);
            break;
            
          case 'yearly':
            nextGenerationDate.setFullYear(nextGenerationDate.getFullYear() + pattern.interval);
            
            // Adjust for month and day if specified
            if (pattern.monthOfYear) {
              nextGenerationDate.setMonth(pattern.monthOfYear - 1); // 0-indexed months
            }
            
            if (pattern.dayOfMonth) {
              nextGenerationDate.setDate(pattern.dayOfMonth);
            }
            break;
        }
        
        // Update the pattern with new information
        await this.updateRecurringPattern(pattern.id, {
          lastGeneratedDate: new Date().toISOString(),
          nextGenerationDate: nextGenerationDate.toISOString().split('T')[0],
          generatedCount: pattern.generatedCount + 1
        });
        
        console.log(`Updated pattern ${pattern.id} with next generation date: ${nextGenerationDate.toISOString().split('T')[0]}`);
      } catch (error) {
        console.error(`Error processing recurring pattern ${pattern.id}:`, error);
      }
    }
    
    console.log(`Finished processing recurring patterns. Generated ${tasksGeneratedCount} new tasks.`);
    return tasksGeneratedCount;
  }
  
  // Gmail Integration Methods
  async saveGmailToken(token: InsertGmailToken): Promise<GmailToken> {
    console.log(`Saving Gmail token for user ${token.userId}`);
    const result = await db.insert(gmailTokensTable).values(token).returning();
    const gmailToken = result[0] as GmailToken;
    console.log(`Saved Gmail token for user ${token.userId}`);
    return gmailToken;
  }

  // Method to save Google OAuth tokens from the response
  async saveGoogleTokens(userId: number, tokens: any): Promise<GmailToken> {
    console.log(`Saving Google OAuth tokens for user ${userId}`);
    // Check if token already exists for this user
    const existingToken = await this.getGmailToken(userId);
    
    if (existingToken) {
      // Update existing token
      return this.updateGmailToken(userId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || existingToken.refreshToken, // Keep old refresh token if not provided
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      });
    } else {
      // Create new token
      const tokenData: InsertGmailToken = {
        userId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      };
      return this.saveGmailToken(tokenData);
    }
  }

  async getGmailToken(userId: number): Promise<GmailToken | undefined> {
    console.log(`Getting Gmail token for user ${userId}`);
    const result = await db
      .select()
      .from(gmailTokensTable)
      .where(eq(gmailTokensTable.userId, userId));
    return result[0] as GmailToken | undefined;
  }
  
  // Alias for getGmailToken to match naming convention in google-auth.ts
  async getGoogleTokens(userId: number): Promise<GmailToken | undefined> {
    return this.getGmailToken(userId);
  }

  async updateGmailToken(userId: number, updateData: Partial<GmailToken>): Promise<GmailToken> {
    console.log(`Updating Gmail token for user ${userId}`);
    const result = await db
      .update(gmailTokensTable)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(gmailTokensTable.userId, userId))
      .returning();
    
    const token = result[0] as GmailToken;
    if (!token) throw new Error(`No Gmail token found for user ${userId}`);
    
    console.log(`Updated Gmail token for user ${userId}`);
    return token;
  }

  async deleteGmailToken(userId: number): Promise<void> {
    console.log(`Deleting Gmail token for user ${userId}`);
    await db
      .delete(gmailTokensTable)
      .where(eq(gmailTokensTable.userId, userId));
    console.log(`Deleted Gmail token for user ${userId}`);
  }
  
  // Alias for deleteGmailToken to match naming convention in google-auth.ts
  async deleteGoogleTokens(userId: number): Promise<void> {
    return this.deleteGmailToken(userId);
  }

  // Gmail Messages
  async saveGmailMessage(message: InsertGmailMessage): Promise<GmailMessage> {
    console.log(`Saving Gmail message for user ${message.userId}`);
    const result = await db.insert(gmailMessagesTable).values(message).returning();
    const gmailMessage = result[0] as GmailMessage;
    console.log(`Saved Gmail message: ${gmailMessage.id}`);
    return gmailMessage;
  }

  async getGmailMessagesForUser(userId: number, filters?: {
    isRead?: boolean;
    isImportant?: boolean;
    from?: string;
    to?: string;
    subject?: string;
    startDate?: Date;
    endDate?: Date;
    excludeSpam?: boolean;
  }): Promise<GmailMessage[]> {
    console.log(`Getting Gmail messages for user ${userId} with filters:`, filters);
    
    let query = db
      .select()
      .from(gmailMessagesTable)
      .where(eq(gmailMessagesTable.userId, userId));
    
    // Apply filters if provided
    if (filters) {
      if (filters.isRead !== undefined) {
        query = query.where(eq(gmailMessagesTable.isRead, filters.isRead));
      }
      
      if (filters.isImportant !== undefined) {
        query = query.where(eq(gmailMessagesTable.isImportant, filters.isImportant));
      }
      
      if (filters.from) {
        query = query.where(like(gmailMessagesTable.from, `%${filters.from}%`));
      }
      
      if (filters.to) {
        query = query.where(like(gmailMessagesTable.to, `%${filters.to}%`));
      }
      
      if (filters.subject) {
        query = query.where(like(gmailMessagesTable.subject, `%${filters.subject}%`));
      }
      
      if (filters.startDate) {
        query = query.where(sql`${gmailMessagesTable.receivedAt} >= ${filters.startDate.toISOString()}`);
      }
      
      if (filters.endDate) {
        query = query.where(sql`${gmailMessagesTable.receivedAt} <= ${filters.endDate.toISOString()}`);
      }
      
      // Filter out spam emails if requested
      if (filters.excludeSpam) {
        query = query.where(
          sql`NOT (${gmailMessagesTable.labels}::text LIKE '%SPAM%')`
        );
      }
    }
    
    // Order by most recent messages first
    query = query.orderBy(desc(gmailMessagesTable.receivedAt));
    
    const messages = await query;
    console.log(`Found ${messages.length} Gmail messages for user ${userId}`);
    return messages as GmailMessage[];
  }

  async getGmailMessage(id: number): Promise<GmailMessage | undefined> {
    console.log(`Getting Gmail message with ID ${id}`);
    const result = await db
      .select()
      .from(gmailMessagesTable)
      .where(eq(gmailMessagesTable.id, id));
    return result[0] as GmailMessage | undefined;
  }

  async updateGmailMessage(id: number, updateData: Partial<GmailMessage>): Promise<GmailMessage> {
    console.log(`Updating Gmail message ${id}`);
    const result = await db
      .update(gmailMessagesTable)
      .set(updateData)
      .where(eq(gmailMessagesTable.id, id))
      .returning();
    
    const message = result[0] as GmailMessage;
    if (!message) throw new Error(`No Gmail message found with ID ${id}`);
    
    console.log(`Updated Gmail message ${id}`);
    return message;
  }

  async deleteGmailMessage(id: number): Promise<void> {
    console.log(`Deleting Gmail message ${id}`);
    await db
      .delete(gmailMessagesTable)
      .where(eq(gmailMessagesTable.id, id));
    console.log(`Deleted Gmail message ${id}`);
  }

  // Gmail Settings
  async saveGmailSettings(settings: InsertGmailSettings): Promise<GmailSettings> {
    console.log(`Saving Gmail settings for user ${settings.userId}`);
    const result = await db.insert(gmailSettingsTable).values(settings).returning();
    const gmailSettings = result[0] as GmailSettings;
    console.log(`Saved Gmail settings for user ${settings.userId}`);
    return gmailSettings;
  }

  async getGmailSettings(userId: number): Promise<GmailSettings | undefined> {
    console.log(`Getting Gmail settings for user ${userId}`);
    const result = await db
      .select()
      .from(gmailSettingsTable)
      .where(eq(gmailSettingsTable.userId, userId));
    return result[0] as GmailSettings | undefined;
  }

  async updateGmailSettings(userId: number, updateData: Partial<GmailSettings>): Promise<GmailSettings> {
    console.log(`Updating Gmail settings for user ${userId}`);
    const result = await db
      .update(gmailSettingsTable)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(gmailSettingsTable.userId, userId))
      .returning();
    
    const settings = result[0] as GmailSettings;
    if (!settings) throw new Error(`No Gmail settings found for user ${userId}`);
    
    console.log(`Updated Gmail settings for user ${userId}`);
    return settings;
  }
  // Internal Messages Implementation
  async createInternalMessage(message: InsertInternalMessage): Promise<InternalMessage> {
    console.log(`Creating internal message:`, {
      ...message,
      content: message.content.length > 100 ? message.content.substring(0, 100) + '...' : message.content
    });
    
    // If senderName is not provided, retrieve it from the user table
    if (!message.senderName) {
      const sender = await this.getUser(message.senderId);
      if (sender) {
        message.senderName = sender.username;
      }
    }
    
    // If recipientName is not provided, retrieve it from the user table
    if (!message.recipientName) {
      const recipient = await this.getUser(message.recipientId);
      if (recipient) {
        message.recipientName = recipient.username;
      }
    }
    
    const result = await db.insert(internalMessagesTable).values({
      ...message,
      isRead: message.isRead || false,
      createdAt: message.createdAt || new Date()
    }).returning();
    
    const internalMessage = result[0] as InternalMessage;
    console.log(`Created internal message with ID: ${internalMessage.id}`);
    return internalMessage;
  }

  async getInternalMessagesForUser(userId: number, filters?: {
    type?: 'inbox' | 'sent';
    search?: string;
  }): Promise<InternalMessage[]> {
    console.log(`Getting internal messages for user ${userId} with filters:`, filters);
    
    let query = db.select().from(internalMessagesTable);
    
    // Apply user filter (inbox or sent)
    if (filters?.type === 'inbox') {
      query = query.where(eq(internalMessagesTable.recipientId, userId));
    } else if (filters?.type === 'sent') {
      query = query.where(eq(internalMessagesTable.senderId, userId));
    } else {
      // Default to getting both inbox and sent
      query = query.where(
        or(
          eq(internalMessagesTable.recipientId, userId),
          eq(internalMessagesTable.senderId, userId)
        )
      );
    }
    
    // Apply search filter if provided
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.where(
        or(
          like(internalMessagesTable.subject, searchTerm),
          like(internalMessagesTable.content, searchTerm),
          like(internalMessagesTable.senderName, searchTerm),
          like(internalMessagesTable.recipientName, searchTerm)
        )
      );
    }
    
    // Order by creation date, newest first
    const messages = await query.orderBy(desc(internalMessagesTable.createdAt));
    
    console.log(`Found ${messages.length} internal messages for user ${userId}`);
    return messages as InternalMessage[];
  }

  async getInternalMessage(id: number): Promise<InternalMessage | undefined> {
    console.log(`Getting internal message with ID: ${id}`);
    const result = await db.select().from(internalMessagesTable).where(eq(internalMessagesTable.id, id));
    return result[0] as InternalMessage | undefined;
  }

  async updateInternalMessage(id: number, updateData: Partial<InternalMessage>): Promise<InternalMessage> {
    console.log(`Updating internal message ${id} with data:`, updateData);
    const result = await db
      .update(internalMessagesTable)
      .set(updateData)
      .where(eq(internalMessagesTable.id, id))
      .returning();
    
    const message = result[0] as InternalMessage;
    if (!message) throw new Error("Internal message not found");
    
    console.log(`Updated internal message: ${id}`);
    return message;
  }

  async deleteInternalMessage(id: number): Promise<void> {
    console.log(`Deleting internal message ${id}`);
    await db.delete(internalMessagesTable).where(eq(internalMessagesTable.id, id));
    console.log(`Deleted internal message ${id}`);
  }
}

export const storage = new DatabaseStorage();
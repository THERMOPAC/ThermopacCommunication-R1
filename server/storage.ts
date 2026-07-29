import { IStorage, UserUpdate } from "./types";
import { desc, sql, inArray, notInArray, and, eq } from 'drizzle-orm';
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
  EmailAnalysis, InsertEmailAnalysis,
  EmailReplies, InsertEmailReplies,
  InternalMessage, InsertInternalMessage,
  Project, InsertProject,
  ProjectPhase, InsertProjectPhase,
  ProjectMember, InsertProjectMember,
  Deliverable, InsertDeliverable,
  ProjectTask, InsertProjectTask,
  PhaseApproval, InsertPhaseApproval,
  ProjectDocument, InsertProjectDocument,
  MasterItem, InsertMasterItem,
  ProjectItem, InsertProjectItem,
  Customer, InsertCustomer,
  ProjectKeyStage, InsertProjectKeyStage,
  LeadSelect, LeadInsert,
  LeadSourceSelect, LeadSourceInsert, 
  LeadStatusSelect, LeadStatusInsert,
  LeadActivitySelect, LeadActivityInsert,
  MarketingCampaignSelect, MarketingCampaignInsert,
  CampaignActivitySelect, CampaignActivityInsert,
  CampaignChannelSelect
} from "@shared/schema";
import { roleHierarchy, canManage } from "@shared/roles";
import { checkModulePermission } from "./utils/permission-utils";
import session from "express-session";
import connectPg from "connect-pg-simple";
import memorystore from "memorystore";
import { db, pool } from "./db";
import { 
  users, 
  tasks as tasksTable, 
  taskHistory as taskHistoryTable,
  workflowRecommendations as workflowRecommendationsTable,
  achievements as achievementsTable,
  userAchievements as userAchievementsTable,
  productivityMetrics as productivityMetricsTable,
  recurringPatterns as recurringPatternsTable,
  leads, leadActivities, leadSourcesTable, leadStatusesTable,
  marketingCampaigns, campaignActivities, campaignChannels,
  recurringTasks as recurringTasksTable,
  gmailTokens as gmailTokensTable,
  gmailMessages as gmailMessagesTable,
  gmailSettings as gmailSettingsTable,
  emailAnalysis as emailAnalysisTable,
  emailReplies as emailRepliesTable,
  internalMessages as internalMessagesTable,
  customers as customersTable,
  projects as projectsTable,
  projectPhases as projectPhasesTable,
  projectMembers as projectMembersTable,
  deliverables as deliverablesTable,
  projectTasks as projectTasksTable,
  phaseApprovals as phaseApprovalsTable,
  projectDocuments as projectDocumentsTable,
  masterItems as masterItemsTable,
  projectItems as projectItemsTable,
  projectKeyStages,
  invoices as invoicesTable,
  invoiceItems as invoiceItemsTable,
  payments as paymentsTable,
  paymentInvoiceLinks as paymentInvoiceLinksTable,
  bankRealizationCertificates as bankRealizationCertificatesTable,
  productAttributeOptions as productAttributeOptionsTable,
  products as productsTable,
  offers as offersTable,
  offerItems as offerItemsTable,
  productChildren as productChildrenTable
} from "@shared/schema";
import { eq, or, inArray, desc, and, sql, like, not } from "drizzle-orm";

const PostgresSessionStore = connectPg(session);
const MemoryStore = memorystore(session);

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
  
  // Project Management tables
  customersTable = customersTable;
  projectsTable = projectsTable;
  projectPhasesTable = projectPhasesTable;
  projectMembersTable = projectMembersTable;
  deliverablesTable = deliverablesTable;
  projectTasksTable = projectTasksTable;
  phaseApprovalsTable = phaseApprovalsTable;
  projectDocumentsTable = projectDocumentsTable;
  masterItemsTable = masterItemsTable;
  projectItemsTable = projectItemsTable;
  projectKeyStagesTable = projectKeyStages;
  
  // Sales and Marketing tables
  leadsTable = leads;
  leadActivitiesTable = leadActivities;
  leadSourcesTable = leadSourcesTable;
  leadStatusesTable = leadStatusesTable;
  marketingCampaignsTable = marketingCampaigns;
  campaignActivitiesTable = campaignActivities;
  campaignChannelsTable = campaignChannels;
  
  // Finance tables
  invoicesTable = invoicesTable;
  invoiceItemsTable = invoiceItemsTable;
  paymentsTable = paymentsTable;
  paymentInvoiceLinksTable = paymentInvoiceLinksTable;
  bankRealizationCertificatesTable = bankRealizationCertificatesTable;

  constructor() {
    try {
      if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required");
      }
      
      console.log("Initializing PostgreSQL session store...");
      this.sessionStore = new PostgresSessionStore({
        conObject: {
          connectionString: process.env.DATABASE_URL,
        },
        createTableIfMissing: true,
        tableName: 'session', // Explicit table name
        ttl: 86400 * 30, // 30 days in seconds
      });
      console.log("PostgreSQL session store initialized successfully");
    } catch (error) {
      console.warn("Error initializing PostgreSQL session store, falling back to memory store:", error);
      this.sessionStore = new MemoryStore({
        checkPeriod: 86400000 // prune expired entries every 24h
      });
      console.log("Memory session store initialized as fallback");
    }
  }

  // Helper function to redact sensitive user data for logging
  private redactSensitiveUserData(user: User | undefined): any {
    if (!user) return user;
    return {
      ...user,
      password: '[REDACTED]',
      googleAccessToken: user.googleAccessToken ? '[REDACTED]' : undefined,
      googleRefreshToken: user.googleRefreshToken ? '[REDACTED]' : undefined,
      passwordHistory: user.passwordHistory ? '[REDACTED]' : undefined,
      resetToken: user.resetToken ? '[REDACTED]' : undefined
    };
  }

  async getUser(id: number): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0] as User | undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username));
    return result[0] as User | undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    console.log(`Creating new user:`, {
      ...insertUser,
      password: '[REDACTED]'
    });
    const result = await db.insert(users).values(insertUser).returning();
    const user = result[0] as User;
    console.log(`Created user:`, this.redactSensitiveUserData(user));
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

  async updateUserPassword(id: number, passwordUpdateData: {
    password: string;
    passwordHistory: string[];
    lastPasswordChange: Date;
    passwordNeedsUpdate: boolean;
  }): Promise<User> {
    console.log(`Updating password for user ${id}`);

    try {
      const result = await db
        .update(users)
        .set({
          password: passwordUpdateData.password,
          passwordHistory: passwordUpdateData.passwordHistory,
          lastPasswordChange: passwordUpdateData.lastPasswordChange,
          passwordNeedsUpdate: passwordUpdateData.passwordNeedsUpdate,
        })
        .where(eq(users.id, id))
        .returning();
      
      const user = result[0] as User;
      if (!user) throw new Error("User not found");
      
      console.log(`Password updated successfully for user ${id}`);
      return user;
    } catch (error) {
      console.error(`Error updating password for user ${id}:`, error);
      throw error;
    }
  }

  // Reset token methods
  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0] as User | undefined;
  }

  async getUserByResetToken(resetToken: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.resetToken, resetToken));
    return result[0] as User | undefined;
  }

  async getUserByResetTokenHash(tokenHash: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.resetToken, tokenHash));
    return result[0] as User | undefined;
  }

  async logPasswordResetAudit(entry: {
    userId?: number | null;
    emailAttempted: string;
    usernameAttempted: string;
    eventType: string;
    failureReason?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    requestSource?: string | null;
  }): Promise<void> {
    try {
      await pool.query(
        `INSERT INTO password_reset_audit_log
           (user_id, email_attempted, username_attempted, event_type, failure_reason, ip_address, user_agent, request_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          entry.userId ?? null,
          entry.emailAttempted,
          entry.usernameAttempted,
          entry.eventType,
          entry.failureReason ?? null,
          entry.ipAddress ?? null,
          entry.userAgent ?? null,
          entry.requestSource ?? null,
        ],
      );
    } catch (err) {
      console.error('[PasswordResetAudit] Failed to write audit log:', err);
    }
  }

  async updateUserResetToken(id: number, resetToken: string, expiresAt: Date): Promise<void> {
    console.log(`Updating reset token for user ${id}`);
    
    try {
      await db
        .update(users)
        .set({
          resetToken: resetToken,
          resetTokenExpiresAt: expiresAt
        })
        .where(eq(users.id, id));
      
      console.log(`Reset token updated successfully for user ${id}`);
    } catch (error) {
      console.error(`Error updating reset token for user ${id}:`, error);
      throw error;
    }
  }

  async clearUserResetToken(id: number): Promise<void> {
    console.log(`Clearing reset token for user ${id}`);
    
    try {
      await db
        .update(users)
        .set({
          resetToken: null,
          resetTokenExpiresAt: null
        })
        .where(eq(users.id, id));
      
      console.log(`Reset token cleared successfully for user ${id}`);
    } catch (error) {
      console.error(`Error clearing reset token for user ${id}:`, error);
      throw error;
    }
  }

  async invalidateUserSessions(userId: number, exceptSessionId?: string | null): Promise<number> {
    try {
      let queryText = `
        DELETE FROM session
        WHERE (sess::jsonb -> 'passport' ->> 'user')::integer = $1
      `;
      const params: (number | string)[] = [userId];
      if (exceptSessionId) {
        queryText += ` AND sid != $2`;
        params.push(exceptSessionId);
      }
      const result = await pool.query(queryText, params);
      const count = result.rowCount ?? 0;
      console.log(`Invalidated ${count} session(s) for user ${userId}${exceptSessionId ? ' (current session preserved)' : ''}`);
      return count;
    } catch (error) {
      console.error(`Error invalidating sessions for user ${userId}:`, error);
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

  async findDuplicateTask(
    title: string, 
    createdBy: number, 
    assignedTo: number | null, 
    dueDate?: string | null,
    sourceId?: number | null
  ): Promise<Task | null> {
    console.log(`Checking for duplicate task with title: "${title}", createdBy: ${createdBy}, assignedTo: ${assignedTo}, sourceId: ${sourceId}`);
    
    // Build the base where conditions
    let whereConditions = and(
      eq(tasksTable.title, title),
      eq(tasksTable.createdBy, createdBy),
      // Only check tasks with Pending or Open status
      or(
        eq(tasksTable.status, 'pending'),
        eq(tasksTable.status, 'open')
      )
    );

    // Add assignedTo condition if provided
    if (assignedTo !== null) {
      whereConditions = and(
        whereConditions,
        eq(tasksTable.assignedTo, assignedTo)
      );
    }

    // For LLM insight tasks, prioritize sourceId matching over due date
    // This prevents duplicate tasks from the same insight with different due dates
    if (sourceId) {
      whereConditions = and(
        whereConditions,
        eq(tasksTable.sourceId, sourceId),
        eq(tasksTable.sourceType, 'llm_insight')
      );
      console.log(`Enhanced duplicate checking for LLM insight tasks with sourceId: ${sourceId}`);
    } else {
      // For non-LLM tasks, include due date in duplicate checking for more precision
      if (dueDate) {
        whereConditions = and(
          whereConditions,
          eq(tasksTable.dueDate, dueDate)
        );
      }
    }

    const existingTasks = await db
      .select()
      .from(tasksTable)
      .where(whereConditions)
      .limit(1);

    const duplicateTask = existingTasks[0] as Task | undefined;
    
    if (duplicateTask) {
      console.log(`Found duplicate task:`, {
        id: duplicateTask.id,
        title: duplicateTask.title,
        createdBy: duplicateTask.createdBy,
        assignedTo: duplicateTask.assignedTo,
        status: duplicateTask.status,
        sourceId: duplicateTask.sourceId,
        sourceType: duplicateTask.sourceType
      });
    } else {
      console.log(`No duplicate task found for title: "${title}"`);
    }

    return duplicateTask || null;
  }

  async getTasksForUser(userId: number): Promise<Task[]> {
    const user = await this.getUser(userId);
    if (!user) {
      console.log(`No user found for ID ${userId}`);
      return [];
    }

    console.log(`Getting tasks for user: ${user.username} (${user.role}, ID: ${userId})`);

    // Rule 1: Superuser sees all tasks (excluding archived and obsolete)
    if (user.role === 'Superuser') {
      const tasks = await db.select().from(tasksTable).where(
        and(
          eq(tasksTable.isArchived, false),
          sql`${tasksTable.status} != 'obsolete'`
        )
      );
      console.log(`Found ${tasks.length} tasks total for Superuser ${user.username}`);
      return tasks as Task[];
    }

    // Rule 2: Regular users see ONLY tasks where they are:
    // a) The assignee OR b) The creator (excluding obsolete)
    console.log(`Getting tasks for ${user.username} where userId=${userId} is either assignee or creator`);

    const tasks = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.isArchived, false),
          sql`${tasksTable.status} != 'obsolete'`,
          or(
            eq(tasksTable.assignedTo, userId),
            eq(tasksTable.createdBy, userId)
          )
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
    console.log(`Getting all users: ${allUsers.length} records`);
    return allUsers as User[];
  }

  // Optimized method for user selection - only returns essential fields
  async getUsersForSelection(): Promise<{id: number, username: string, role: string, firstName?: string, lastName?: string, department?: string, cardCode?: string, employeeCode?: string, loanCardCode?: string, loanCardName?: string}[]> {
    const usersList = await db.select({
      id: users.id,
      username: users.username,
      role: users.role,
      firstName: users.firstName,
      lastName: users.lastName,
      department: users.department,
      cardCode: users.cardCode,
      employeeCode: users.employeeCode,
      loanCardCode: users.loanCardCode,
      loanCardName: users.loanCardName,
    }).from(users).where(eq(users.isActive, true));
    
    console.log(`Getting ${usersList.length} users for selection (optimized)`);
    return usersList;
  }

  async getTask(id: number): Promise<Task | undefined> {
    const result = await db.select().from(tasksTable).where(eq(tasksTable.id, id));
    return result[0] as Task | undefined;
  }

  async updateTask(id: number, updateData: Partial<Task>): Promise<Task> {
    console.log(`Updating task ${id} with data:`, updateData);
    
    return await db.transaction(async (tx) => {
      // Update the task
      const [task] = await tx
        .update(tasksTable)
        .set(updateData)
        .where(eq(tasksTable.id, id))
        .returning();

      if (!task) throw new Error("Task not found");

      // Check if this task is linked to a meeting commitment and sync if needed
      if (task.sourceType === 'meeting_commitment' && task.sourceId) {
        try {
          // Import schema within transaction to avoid circular imports
          const { meetingCommitments } = await import('@shared/schema');
          
          // Map task status to commitment status
          let commitmentStatus: string | undefined;
          if (updateData.status) {
            switch (updateData.status) {
              case 'pending':
                commitmentStatus = 'Pending';
                break;
              case 'in_progress':
                commitmentStatus = 'In Progress';
                break;
              case 'completed':
                commitmentStatus = 'Completed';
                break;
              case 'on_hold':
                commitmentStatus = 'On Hold';
                break;
              case 'canceled':
                commitmentStatus = 'Cancelled';
                break;
            }
          }

          // Prepare commitment update data
          const commitmentUpdateData: any = {};

          if (updateData.title) {
            commitmentUpdateData.title = updateData.title;
          }
          if (updateData.description) {
            commitmentUpdateData.description = updateData.description;
          }
          if (updateData.dueDate) {
            commitmentUpdateData.dueDate = new Date(updateData.dueDate).toISOString().split('T')[0];
          }
          if (commitmentStatus) {
            commitmentUpdateData.status = commitmentStatus;
            
            // Set completion date if completed
            if (commitmentStatus === 'Completed') {
              commitmentUpdateData.completionDate = new Date().toISOString().split('T')[0];
            }
          }

          // Only update if there's something to change
          if (Object.keys(commitmentUpdateData).length > 0) {
            commitmentUpdateData.updatedAt = new Date();
            
            await tx
              .update(meetingCommitments)
              .set(commitmentUpdateData)
              .where(eq(meetingCommitments.id, task.sourceId));

            console.log(`Reverse synchronized commitment ID ${task.sourceId} from task ID ${task.id} update`);
          }
        } catch (syncError) {
          console.error('Error reverse synchronizing commitment from task update:', syncError);
          // Don't fail the task update if sync fails
        }
      }

      console.log(`Updated task:`, task);
      return task;
    });
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
    await db.delete(recurringTasksTable).where(eq(recurringTasksTable.recurringPatternId, id));
    await db.delete(recurringPatternsTable).where(eq(recurringPatternsTable.id, id));
    console.log(`Deleted recurring pattern ${id} and its tasks`);
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

  calculateFirstScheduledDate(pattern: RecurringPattern, startDate: Date): Date {
    switch (pattern.pattern) {
      case 'daily':
        return new Date(startDate);

      case 'monthly': {
        if (!pattern.dayOfMonth) return new Date(startDate);
        const year = startDate.getFullYear();
        const month = startDate.getMonth();
        const day = startDate.getDate();
        if (pattern.dayOfMonth >= day) {
          const lastDay = new Date(year, month + 1, 0).getDate();
          return new Date(year, month, Math.min(pattern.dayOfMonth, lastDay));
        } else {
          let nextMonth = month + 1;
          let nextYear = year;
          if (nextMonth > 11) { nextMonth = 0; nextYear++; }
          const lastDay = new Date(nextYear, nextMonth + 1, 0).getDate();
          return new Date(nextYear, nextMonth, Math.min(pattern.dayOfMonth, lastDay));
        }
      }

      case 'quarterly': {
        if (!pattern.dayOfMonth) return new Date(startDate);
        const qYear = startDate.getFullYear();
        const qMonth = startDate.getMonth();
        const qDay = startDate.getDate();
        const quarterStartMonths = [0, 3, 6, 9];
        let currentQuarterStart = 0;
        for (const m of quarterStartMonths) {
          if (qMonth >= m) currentQuarterStart = m;
        }
        for (let offset = 0; offset < 4; offset++) {
          let checkMonth = currentQuarterStart + offset * 3;
          let checkYear = qYear;
          while (checkMonth > 11) { checkMonth -= 12; checkYear++; }
          const lastDay = new Date(checkYear, checkMonth + 1, 0).getDate();
          const scheduledDay = Math.min(pattern.dayOfMonth, lastDay);
          const candidateDate = new Date(checkYear, checkMonth, scheduledDay);
          if (candidateDate >= startDate) return candidateDate;
        }
        return new Date(startDate);
      }

      case 'half_yearly': {
        if (!pattern.dayOfMonth) return new Date(startDate);
        const hyYear = startDate.getFullYear();
        const hyMonth = startDate.getMonth();
        const halfStartMonths = [0, 6];
        let currentHalfStart = 0;
        for (const m of halfStartMonths) {
          if (hyMonth >= m) currentHalfStart = m;
        }
        for (let offset = 0; offset < 3; offset++) {
          let checkMonth = currentHalfStart + offset * 6;
          let checkYear = hyYear;
          while (checkMonth > 11) { checkMonth -= 12; checkYear++; }
          const lastDay = new Date(checkYear, checkMonth + 1, 0).getDate();
          const scheduledDay = Math.min(pattern.dayOfMonth, lastDay);
          const candidateDate = new Date(checkYear, checkMonth, scheduledDay);
          if (candidateDate >= startDate) return candidateDate;
        }
        return new Date(startDate);
      }

      case 'yearly': {
        if (!pattern.dayOfMonth) return new Date(startDate);
        const yYear = startDate.getFullYear();
        const targetMonth = (pattern.monthOfYear || (startDate.getMonth() + 1)) - 1;
        const lastDay1 = new Date(yYear, targetMonth + 1, 0).getDate();
        const scheduledDay1 = Math.min(pattern.dayOfMonth, lastDay1);
        const thisYearCandidate = new Date(yYear, targetMonth, scheduledDay1);
        if (thisYearCandidate >= startDate) return thisYearCandidate;
        const lastDay2 = new Date(yYear + 1, targetMonth + 1, 0).getDate();
        const scheduledDay2 = Math.min(pattern.dayOfMonth, lastDay2);
        return new Date(yYear + 1, targetMonth, scheduledDay2);
      }

      default:
        return new Date(startDate);
    }
  }

  calculateNextOccurrence(pattern: RecurringPattern, fromDate: Date): Date | null {
    const today = new Date(fromDate);
    let nextOccurrence = new Date(today);

    console.log(`Calculating next occurrence for pattern ${pattern.id} (${pattern.pattern} every ${pattern.interval})`);

    switch (pattern.pattern) {
      case 'daily':
        // Daily: Add interval number of days
        nextOccurrence.setDate(today.getDate() + (pattern.interval || 1));
        console.log(`Daily pattern: Next occurrence in ${pattern.interval || 1} days = ${nextOccurrence.toISOString().split('T')[0]}`);
        break;

      case 'weekly':
        // Weekly: Add interval number of weeks (7 * interval days)
        const daysToAdd = 7 * (pattern.interval || 1);
        nextOccurrence.setDate(today.getDate() + daysToAdd);
        
        // If daysOfWeek is specified, adjust to the specified day(s)
        if (pattern.daysOfWeek) {
          try {
            const daysOfWeek = JSON.parse(pattern.daysOfWeek);
            if (Array.isArray(daysOfWeek) && daysOfWeek.length > 0) {
              // Map day names to numbers (0 = Sunday, 1 = Monday, etc.)
              const dayMap: { [key: string]: number } = {
                'SUN': 0, 'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6
              };
              
              const targetDays = daysOfWeek.map(day => dayMap[day.toUpperCase()]).filter(d => d !== undefined);
              
              if (targetDays.length > 0) {
                // Find the next occurrence on one of the specified days
                const currentDay = nextOccurrence.getDay();
                let daysUntilNext = 7; // Default to next week if no day found
                
                for (const targetDay of targetDays) {
                  let daysUntil = (targetDay - currentDay + 7) % 7;
                  if (daysUntil === 0) daysUntil = 7; // If today, move to next week
                  if (daysUntil < daysUntilNext) {
                    daysUntilNext = daysUntil;
                  }
                }
                
                nextOccurrence.setDate(today.getDate() + daysUntilNext);
              }
            }
          } catch (e) {
            console.error(`Error parsing daysOfWeek for pattern ${pattern.id}:`, e);
          }
        }
        
        console.log(`Weekly pattern: Next occurrence = ${nextOccurrence.toISOString().split('T')[0]}`);
        break;

      case 'monthly':
        // Monthly: Add interval number of months
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();
        const interval = pattern.interval || 1;
        
        // Calculate next month based on interval
        let targetMonth = currentMonth + interval;
        let targetYear = today.getFullYear();
        
        // Handle year overflow
        while (targetMonth > 11) {
          targetMonth -= 12;
          targetYear += 1;
        }
        
        // Set the target day of month
        const targetDay = pattern.dayOfMonth || currentDay;
        nextOccurrence = new Date(targetYear, targetMonth, 1); // Start with 1st of target month
        
        // Get the last day of the target month to handle month-end cases
        const lastDayOfMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const actualDay = Math.min(targetDay, lastDayOfMonth);
        
        nextOccurrence.setDate(actualDay);
        
        // If we're still in the same month and the day hasn't passed yet, use current month
        if (targetMonth === currentMonth && targetDay > currentDay) {
          nextOccurrence = new Date(today.getFullYear(), currentMonth, actualDay);
        }
        
        console.log(`Monthly pattern: Every ${interval} month(s) on day ${targetDay}, next = ${nextOccurrence.toISOString().split('T')[0]}`);
        break;

      case 'quarterly': {
        const qInterval = (pattern.interval || 1) * 3;
        let qTargetMonth = today.getMonth() + qInterval;
        let qTargetYear = today.getFullYear();
        while (qTargetMonth > 11) {
          qTargetMonth -= 12;
          qTargetYear += 1;
        }
        const qTargetDay = pattern.dayOfMonth || today.getDate();
        nextOccurrence = new Date(qTargetYear, qTargetMonth, 1);
        const qLastDay = new Date(qTargetYear, qTargetMonth + 1, 0).getDate();
        const qActualDay = Math.min(qTargetDay, qLastDay);
        nextOccurrence.setDate(qActualDay);
        console.log(`Quarterly pattern: Every ${pattern.interval || 1} quarter(s), next = ${nextOccurrence.toISOString().split('T')[0]}`);
        break;
      }

      case 'half_yearly': {
        const hyInterval = (pattern.interval || 1) * 6;
        let hyTargetMonth = today.getMonth() + hyInterval;
        let hyTargetYear = today.getFullYear();
        while (hyTargetMonth > 11) {
          hyTargetMonth -= 12;
          hyTargetYear += 1;
        }
        const hyTargetDay = pattern.dayOfMonth || today.getDate();
        nextOccurrence = new Date(hyTargetYear, hyTargetMonth, 1);
        const hyLastDay = new Date(hyTargetYear, hyTargetMonth + 1, 0).getDate();
        const hyActualDay = Math.min(hyTargetDay, hyLastDay);
        nextOccurrence.setDate(hyActualDay);
        console.log(`Half-yearly pattern: Every ${pattern.interval || 1} half-year(s), next = ${nextOccurrence.toISOString().split('T')[0]}`);
        break;
      }

      case 'yearly':
        // Yearly: Add interval number of years
        const currentYear = today.getFullYear();
        const yearInterval = pattern.interval || 1;
        let targetYearForYearly = currentYear + yearInterval;
        
        // Use specified month and day, or current month/day
        const targetMonthOfYear = (pattern.monthOfYear || (today.getMonth() + 1)) - 1; // Convert to 0-based
        const targetDayOfMonth = pattern.dayOfMonth || today.getDate();
        
        nextOccurrence = new Date(targetYearForYearly, targetMonthOfYear, 1);
        
        // Handle month-end cases
        const lastDayOfTargetMonth = new Date(targetYearForYearly, targetMonthOfYear + 1, 0).getDate();
        const actualYearlyDay = Math.min(targetDayOfMonth, lastDayOfTargetMonth);
        nextOccurrence.setDate(actualYearlyDay);
        
        // If the yearly date hasn't passed this year, use this year instead
        const thisYearOccurrence = new Date(currentYear, targetMonthOfYear, actualYearlyDay);
        if (thisYearOccurrence > today) {
          nextOccurrence = thisYearOccurrence;
        }
        
        console.log(`Yearly pattern: Every ${yearInterval} year(s) on ${targetMonthOfYear + 1}/${targetDayOfMonth}, next = ${nextOccurrence.toISOString().split('T')[0]}`);
        break;

      default:
        console.error(`Unknown pattern type: ${pattern.pattern}`);
        return null;
    }

    // Ensure we don't generate tasks in the past
    if (nextOccurrence <= today) {
      console.log(`Calculated date ${nextOccurrence.toISOString().split('T')[0]} is in the past, adjusting...`);
      
      // For daily patterns, move forward by interval
      if (pattern.pattern === 'daily') {
        nextOccurrence.setDate(today.getDate() + (pattern.interval || 1));
      }
      // For other patterns, this shouldn't happen with our logic above
      else {
        nextOccurrence.setDate(today.getDate() + 1); // Fallback: tomorrow
      }
    }

    return nextOccurrence;
  }

  async processRecurringPatterns(): Promise<number> {
    let tasksGeneratedCount = 0;
    console.log('Processing recurring patterns to generate tasks');
    const patterns = await this.getActiveRecurringPatterns();
    
    for (const pattern of patterns) {
      try {
        console.log(`Processing pattern ${pattern.id}: ${pattern.templateTitle} (${pattern.pattern} every ${pattern.interval})`);
        
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
        
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];

        const nextGenDateStr = pattern.nextGenerationDate
          ? pattern.nextGenerationDate.split('T')[0]
          : null;

        if (nextGenDateStr && todayStr < nextGenDateStr) {
          console.log(`Pattern ${pattern.id} next generation date is ${nextGenDateStr} — skipping until then`);
          continue;
        }

        let taskDueDate: Date | null;
        if (nextGenDateStr) {
          taskDueDate = new Date(nextGenDateStr + 'T00:00:00');
        } else {
          const startDate = new Date(pattern.startDate);
          if (startDate <= today) {
            taskDueDate = this.calculateFirstScheduledDate(pattern, startDate);
            console.log(`Pattern ${pattern.id}: First scheduled date from start_date ${pattern.startDate} = ${taskDueDate.toISOString().split('T')[0]}`);
          } else {
            taskDueDate = this.calculateFirstScheduledDate(pattern, startDate);
            console.log(`Pattern ${pattern.id}: Start date ${pattern.startDate} is in the future, first scheduled = ${taskDueDate.toISOString().split('T')[0]}`);
          }
        }
        
        if (!taskDueDate) {
          console.log(`No valid next occurrence found for pattern ${pattern.id}`);
          continue;
        }

        let localGeneratedCount = pattern.generatedCount || 0;
        const maxCatchUp = 10;
        let catchUpCount = 0;

        while (taskDueDate && taskDueDate.toISOString().split('T')[0] <= todayStr && catchUpCount < maxCatchUp) {
          if (pattern.maxOccurrences && localGeneratedCount >= pattern.maxOccurrences) break;

          const dueDate = taskDueDate.toISOString().split('T')[0];
          const finishDate = new Date(taskDueDate);
          finishDate.setDate(finishDate.getDate() + (pattern.templateDurationDays || 1) - 1);

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
            taskDueDate = this.calculateNextOccurrence(pattern, taskDueDate);
            catchUpCount++;
            continue;
          }

          const newRecurringTask: InsertRecurringTask = {
            title: pattern.templateTitle,
            description: pattern.templateDescription,
            priority: pattern.templatePriority as 'Low' | 'Medium' | 'High',
            startDate: todayStr,
            finishDate: finishDate.toISOString().split('T')[0],
            assignedTo: pattern.templateAssignedTo,
            createdAt: new Date().toISOString(),
            category: pattern.templateCategory,
            recurringPatternId: pattern.id,
            dueDate: dueDate,
            occurrenceNumber: localGeneratedCount + 1,
            status: 'pending',
            plannedHours: pattern.templatePlannedHours || 0,
          };

          const task = await this.createRecurringTask(newRecurringTask);
          tasksGeneratedCount++;
          localGeneratedCount++;
          catchUpCount++;
          console.log(`Created recurring task ${task.id} from pattern ${pattern.id} (occurrence #${task.occurrenceNumber}, due ${dueDate})`);

          taskDueDate = this.calculateNextOccurrence(pattern, taskDueDate);
        }

        const nextGenDate = taskDueDate ? taskDueDate.toISOString().split('T')[0] : null;
        await this.updateRecurringPattern(pattern.id, {
          lastGeneratedDate: new Date().toISOString(),
          ...(nextGenDate ? { nextGenerationDate: nextGenDate } : {}),
          generatedCount: localGeneratedCount
        });

        if (nextGenDate) {
          console.log(`Updated pattern ${pattern.id} with next generation date: ${nextGenDate} (generated ${catchUpCount} catch-up tasks)`);
        } else {
          console.log(`Updated pattern ${pattern.id} — no further occurrences calculated`);
        }
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
    console.log(`Getting Gmail token for user ${userId} (using Calendar tokens)`);
    
    // Use Calendar tokens from users table for Gmail access
    const result = await db
      .select({
        id: users.id,
        userId: users.id,
        accessToken: users.googleAccessToken,
        refreshToken: users.googleRefreshToken,
        expiresAt: users.googleTokenExpiresAt,
        scope: sql<string | null>`null`,
        createdAt: sql<Date>`now()`,
        updatedAt: sql<Date>`now()`
      })
      .from(users)
      .where(eq(users.id, userId));
    
    const user = result[0];
    if (!user || !user.accessToken) {
      console.log(`No Calendar/Gmail token found for user ${userId}`);
      return undefined;
    }
    
    console.log(`Found Calendar token for user ${userId}, using it for Gmail`);
    // Map the Calendar token fields to GmailToken structure
    return {
      id: user.id,
      userId: user.userId,
      accessToken: user.accessToken,
      refreshToken: user.refreshToken,
      tokenExpiry: user.expiresAt,
      scope: user.scope,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    } as GmailToken;
  }
  
  // Alias for getGmailToken to match naming convention in google-auth.ts
  async getGoogleTokens(userId: number): Promise<GmailToken | undefined> {
    return this.getGmailToken(userId);
  }

  async updateGmailToken(userId: number, updateData: Partial<GmailToken>): Promise<GmailToken> {
    console.log(`Updating Gmail token for user ${userId}`);
    
    // Check if token exists in gmail_tokens table
    const gmailTokenResult = await db
      .select()
      .from(gmailTokensTable)
      .where(eq(gmailTokensTable.userId, userId));
    
    if (gmailTokenResult.length > 0) {
      // Update gmail_tokens table (Gmail-specific OAuth)
      console.log(`Updating gmail_tokens table for user ${userId}`);
      const result = await db
        .update(gmailTokensTable)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(gmailTokensTable.userId, userId))
        .returning();
      
      const token = result[0] as GmailToken;
      console.log(`Updated Gmail token for user ${userId}`);
      return token;
    } else {
      // Update users table (Calendar OAuth with Gmail scopes)
      console.log(`Updating users table (Calendar OAuth) for user ${userId}`);
      const userUpdate: any = {
        updatedAt: new Date()
      };
      
      if (updateData.accessToken) {
        userUpdate.googleAccessToken = updateData.accessToken;
      }
      if (updateData.refreshToken) {
        userUpdate.googleRefreshToken = updateData.refreshToken;
      }
      if (updateData.tokenExpiry) {
        userUpdate.googleTokenExpiresAt = updateData.tokenExpiry;
      }
      
      await db
        .update(users)
        .set(userUpdate)
        .where(eq(users.id, userId));
      
      console.log(`Updated Calendar OAuth tokens in users table for user ${userId}`);
      
      // Return the updated token in GmailToken format
      return this.getGmailToken(userId).then(token => {
        if (!token) throw new Error(`Failed to retrieve updated token for user ${userId}`);
        return token;
      });
    }
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
    priority?: string[];
    from?: string;
    to?: string;
    subject?: string;
    startDate?: Date;
    endDate?: Date;
    excludeSpam?: boolean;
  }): Promise<GmailMessage[]> {
    console.log(`Getting Gmail messages for user ${userId} with filters:`, filters);
    
    // Build all conditions in an array
    const conditions = [eq(gmailMessagesTable.userId, userId)];
    
    // Apply filters if provided
    if (filters) {
      console.log("Applying isRead filter:", filters.isRead);
      if (filters.isRead !== undefined) {
        console.log("Filter type:", typeof filters.isRead);
        // Parse the value to boolean based on its type
        let isReadValue;
        if (typeof filters.isRead === 'string') {
          isReadValue = filters.isRead === 'true';
        } else {
          isReadValue = Boolean(filters.isRead);
        }
        console.log("Converted isRead value:", isReadValue, "original type:", typeof filters.isRead);
        conditions.push(eq(gmailMessagesTable.isRead, isReadValue));
      }
      
      if (filters.isImportant !== undefined) {
        conditions.push(eq(gmailMessagesTable.isImportant, filters.isImportant));
      }
      
      // Add priority filter
      if (filters.priority && filters.priority.length > 0) {
        console.log("Applying priority filter:", filters.priority);
        conditions.push(inArray(gmailMessagesTable.priority, filters.priority));
      }
      
      if (filters.from) {
        conditions.push(like(gmailMessagesTable.from, `%${filters.from}%`));
      }
      
      if (filters.to) {
        conditions.push(like(gmailMessagesTable.to, `%${filters.to}%`));
      }
      
      if (filters.subject) {
        conditions.push(like(gmailMessagesTable.subject, `%${filters.subject}%`));
      }
      
      if (filters.startDate) {
        conditions.push(sql`${gmailMessagesTable.receivedAt} >= ${filters.startDate.toISOString()}`);
      }
      
      if (filters.endDate) {
        conditions.push(sql`${gmailMessagesTable.receivedAt} <= ${filters.endDate.toISOString()}`);
      }
      
      // Filter out spam emails if requested
      if (filters.excludeSpam) {
        conditions.push(
          sql`NOT (${gmailMessagesTable.labels}::text LIKE '%SPAM%')`
        );
      }
    }
    
    // Apply all conditions using AND
    console.log(`🔍 Building query with ${conditions.length} conditions`);
    console.log(`🔍 Priority filter applied: ${filters?.priority ? 'YES - ' + JSON.stringify(filters.priority) : 'NO'}`);
    
    const query = db
      .select()
      .from(gmailMessagesTable)
      .where(and(...conditions))
      .orderBy(desc(gmailMessagesTable.receivedAt));
    
    const messages = await query;
    console.log(`Found ${messages.length} Gmail messages for user ${userId}`);
    
    // Debug: show priority distribution in results
    if (filters?.priority && messages.length > 0) {
      const priorities = messages.map((m: any) => m.priority);
      const counts = priorities.reduce((acc: any, p: any) => {
        acc[p || 'null'] = (acc[p || 'null'] || 0) + 1;
        return acc;
      }, {});
      console.log(`📊 Priority distribution in results:`, counts);
    }
    
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

  // Email Analysis Methods
  async saveEmailAnalysis(analysis: InsertEmailAnalysis): Promise<EmailAnalysis> {
    console.log(`Saving email analysis for message ${analysis.messageId}`);
    const result = await db.insert(emailAnalysisTable).values(analysis).returning();
    const emailAnalysis = result[0] as EmailAnalysis;
    console.log(`Saved email analysis: ${emailAnalysis.id}`);
    return emailAnalysis;
  }

  async getEmailAnalysis(messageId: number): Promise<EmailAnalysis | undefined> {
    console.log(`Getting email analysis for message ${messageId}`);
    const result = await db
      .select()
      .from(emailAnalysisTable)
      .where(eq(emailAnalysisTable.messageId, messageId));
    
    if (result.length === 0) {
      console.log(`Email analysis for message ${messageId} not found`);
      return undefined;
    }
    
    const analysis = result[0] as EmailAnalysis;
    console.log(`Retrieved email analysis: ${analysis.id} for message ${messageId}`);
    return analysis;
  }

  async saveEmailReplies(replies: InsertEmailReplies): Promise<EmailReplies> {
    console.log(`Saving email replies for message ${replies.messageId}`);
    const result = await db.insert(emailRepliesTable).values(replies).returning();
    const emailReplies = result[0] as EmailReplies;
    console.log(`Saved email replies: ${emailReplies.id}`);
    return emailReplies;
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

  // PROJECT MANAGEMENT IMPLEMENTATION
  
  // Customers
  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    console.log(`Creating new customer:`, customer);
    const result = await db.insert(customersTable).values(customer).returning();
    const newCustomer = result[0] as Customer;
    console.log(`Created customer:`, newCustomer);
    return newCustomer;
  }

  async getAllCustomers(): Promise<Customer[]> {
    console.log(`Getting all customers`);
    const customers = await db.select().from(customersTable).orderBy(customersTable.bpName);
    console.log(`Found ${customers.length} customers`);
    return customers as Customer[];
  }

  async getCustomer(id: number): Promise<Customer | undefined> {
    console.log(`Getting customer with ID: ${id}`);
    const result = await db.select().from(customersTable).where(eq(customersTable.id, id));
    const customer = result[0] as Customer | undefined;
    console.log(`Found customer:`, customer);
    return customer;
  }

  async getCustomerByBPCode(bpCode: string): Promise<Customer | undefined> {
    console.log(`Looking for customer with BP code: ${bpCode}`);
    const result = await db.select().from(customersTable).where(eq(customersTable.bpCode, bpCode));
    const customer = result[0] as Customer | undefined;
    console.log(`Found customer:`, customer);
    return customer;
  }

  async updateCustomer(id: number, updateData: Partial<Customer>): Promise<Customer> {
    console.log(`Updating customer ${id} with data:`, updateData);
    const result = await db
      .update(customersTable)
      .set(updateData)
      .where(eq(customersTable.id, id))
      .returning();
    const customer = result[0] as Customer;

    if (!customer) throw new Error("Customer not found");
    console.log(`Updated customer:`, customer);
    return customer;
  }

  async deleteCustomer(id: number): Promise<void> {
    console.log(`Deleting customer ${id}`);
    await db.delete(customersTable).where(eq(customersTable.id, id));
    console.log(`Deleted customer ${id}`);
  }
  
  // Projects
  async createProject(project: InsertProject): Promise<Project> {
    console.log(`Creating new project:`, project);
    const result = await db.insert(projectsTable).values(project).returning();
    const newProject = result[0] as Project;
    console.log(`Created project:`, newProject);
    return newProject;
  }

  async getProject(id: number | string): Promise<Project | undefined> {
    console.log(`Getting project with ID: ${id}`);
    const numId = typeof id === 'string' ? parseInt(id) : id;
    
    if (isNaN(numId)) {
      console.log(`Invalid project ID (not a number): ${id}`);
      return undefined;
    }
    
    try {
      const result = await db.select().from(projectsTable).where(eq(projectsTable.id, numId));
      return result[0] as Project | undefined;
    } catch (error) {
      console.error(`Error fetching project ${id}:`, error);
      return undefined;
    }
  }

  async updateProject(id: number, updateData: Partial<Project>): Promise<Project> {
    console.log(`Updating project ${id} with data:`, updateData);
    
    try {
      // Create a copy of the update data to avoid modifying the input
      const { startDate, targetEndDate, createdAt, updatedAt, ...otherFields } = updateData;
      
      // Create the SET clause parts for our SQL query
      const setParts = [];
      const params = [];
      let paramIndex = 1;
      
      // Add all regular fields
      for (const [key, value] of Object.entries(otherFields)) {
        if (value === null || value === undefined || key === 'id') continue;
        
        // Convert camelCase to snake_case for SQL column names
        const snakeCaseKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        setParts.push(`"${snakeCaseKey}" = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
      
      // Handle date fields separately
      if (startDate) {
        setParts.push(`"start_date" = $${paramIndex}`);
        params.push(startDate);
        paramIndex++;
      }
      
      if (targetEndDate) {
        setParts.push(`"target_end_date" = $${paramIndex}`);
        params.push(targetEndDate);
        paramIndex++;
      }
      
      // Always add updated timestamp (snake_case for column name)
      setParts.push(`"updated_at" = $${paramIndex}`);
      params.push(new Date().toISOString());
      paramIndex++;
      
      // Final parameter is the project ID
      params.push(id);
      
      // Simplified SQL query
      const query = `UPDATE projects SET ${setParts.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
      
      console.log("Direct SQL query:", query);
      console.log("SQL parameters:", params);
      
      // Execute the query
      const { rows } = await pool.query(query, params);
      
      if (rows.length === 0) {
        throw new Error("Project not found");
      }
      
      const project = rows[0] as Project;
      console.log(`Updated project:`, project);
      return project;
    } catch (error) {
      console.error(`Error in direct SQL update for project ${id}:`, error);
      throw error;
    }
  }

  async getUserProjects(userId: number, showTest: boolean = false): Promise<Project[]> {
    console.log(`Getting projects for user ${userId}`);
    
    // Get user info to check role
    const user = await this.getUser(userId);
    if (!user) {
      console.log(`User ${userId} not found`);
      return [];
    }

    // Check if user has view permission for Project Management module
    const hasProjectPermission = await checkModulePermission(userId, 'Project Management', 'view');
    
    // If user is Superuser, General Manager, Senior Manager, or has project view permission, show all projects
    if (['Superuser', 'General Manager', 'Senior Manager'].includes(user.role) || hasProjectPermission) {
      console.log(`User ${userId} (${user.role}) has global project access`);
      const allProjects = await db
        .select()
        .from(projectsTable)
        .where(showTest ? undefined : eq(projectsTable.isTest, false))
        .orderBy(desc(projectsTable.createdAt));
      
      console.log(`Found ${allProjects.length} total projects for user with role-based/module access`);
      return allProjects as Project[];
    }
    
    // Otherwise, only show projects where user is a member
    const projectMembers = await db
      .select()
      .from(projectMembersTable)
      .where(eq(projectMembersTable.userId, userId));
    
    const projectIds = projectMembers.map(member => member.projectId);
    
    // If user is not a member of any projects, return empty array
    if (projectIds.length === 0) {
      console.log(`User ${userId} is not a member of any projects`);
      return [];
    }
    
    // Get project details for all projects user is a member of
    const baseCondition = inArray(projectsTable.id, projectIds);
    const projects = await db
      .select()
      .from(projectsTable)
      .where(showTest ? baseCondition : and(baseCondition, eq(projectsTable.isTest, false)))
      .orderBy(desc(projectsTable.createdAt));
    
    console.log(`Found ${projects.length} projects for user ${userId} based on membership`);
    return projects as Project[];
  }
  
  async getAllProjects(): Promise<Project[]> {
    console.log(`Getting all projects`);
    try {
      const projects = await db
        .select()
        .from(projectsTable)
        .orderBy(desc(projectsTable.createdAt));
      
      console.log(`Found ${projects.length} total projects`);
      return projects as Project[];
    } catch (error) {
      console.error('Error getting all projects:', error);
      return [];
    }
  }

  // Project Phases
  async createProjectPhase(phase: InsertProjectPhase): Promise<ProjectPhase> {
    console.log(`Creating new project phase:`, phase);
    const result = await db.insert(projectPhasesTable).values(phase).returning();
    const newPhase = result[0] as ProjectPhase;
    console.log(`Created project phase:`, newPhase);
    return newPhase;
  }

  async getProjectPhases(projectId: number): Promise<ProjectPhase[]> {
    console.log(`Getting phases for project ${projectId}`);
    try {
      // Use simpler SQL query to avoid syntax issues with snake_case column names
      const query = `SELECT * FROM "project_phases" WHERE "project_id" = $1 ORDER BY "id"`;
      
      const { rows } = await pool.query(query, [projectId]);
      
      console.log(`Found ${rows.length} phases for project ${projectId}`);
      return rows as ProjectPhase[];
    } catch (error) {
      console.error(`Error getting phases for project ${projectId}:`, error);
      return [];
    }
  }

  async getProjectPhase(id: number): Promise<ProjectPhase | undefined> {
    console.log(`Getting project phase with ID: ${id}`);
    const result = await db.select().from(projectPhasesTable).where(eq(projectPhasesTable.id, id));
    return result[0] as ProjectPhase | undefined;
  }

  async updateProjectPhase(id: number, updateData: Partial<ProjectPhase>): Promise<ProjectPhase> {
    console.log(`Updating project phase ${id} with data:`, updateData);
    const result = await db
      .update(projectPhasesTable)
      .set(updateData)
      .where(eq(projectPhasesTable.id, id))
      .returning();
    
    const phase = result[0] as ProjectPhase;
    if (!phase) throw new Error("Project phase not found");
    
    console.log(`Updated project phase:`, phase);
    return phase;
  }

  // Project Members
  async addProjectMember(projectMember: InsertProjectMember): Promise<ProjectMember> {
    console.log(`Adding new project member:`, projectMember);
    const result = await db.insert(projectMembersTable).values(projectMember).returning();
    const newMember = result[0] as ProjectMember;
    console.log(`Added project member:`, newMember);
    return newMember;
  }

  async getProjectMembers(projectId: number): Promise<ProjectMember[]> {
    console.log(`Getting members for project ${projectId}`);
    const members = await db
      .select({
        member: projectMembersTable,
        user: {
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role
        }
      })
      .from(projectMembersTable)
      .innerJoin(users, eq(projectMembersTable.userId, users.id))
      .where(eq(projectMembersTable.projectId, projectId));
    
    console.log(`Found ${members.length} members for project ${projectId}`);
    return members.map(m => ({
      ...m.member,
      user: m.user
    })) as unknown as ProjectMember[];
  }

  async removeProjectMember(projectId: number, userId: number): Promise<void> {
    console.log(`Removing user ${userId} from project ${projectId}`);
    await db
      .delete(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.projectId, projectId),
          eq(projectMembersTable.userId, userId)
        )
      );
    console.log(`Removed user ${userId} from project ${projectId}`);
  }

  async updateProjectMember(projectId: number, userId: number, updateData: Partial<ProjectMember>): Promise<ProjectMember> {
    console.log(`Updating project member role for user ${userId} in project ${projectId}`);
    const result = await db
      .update(projectMembersTable)
      .set(updateData)
      .where(
        and(
          eq(projectMembersTable.projectId, projectId),
          eq(projectMembersTable.userId, userId)
        )
      )
      .returning();
    
    const member = result[0] as ProjectMember;
    if (!member) throw new Error("Project member not found");
    
    console.log(`Updated project member:`, member);
    return member;
  }

  // Project Key Stages
  async getProjectKeyStages(projectId: number): Promise<ProjectKeyStage[]> {
    console.log(`Getting key stages for project ${projectId}`);
    try {
      const result = await db.select()
        .from(this.projectKeyStagesTable)
        .where(eq(this.projectKeyStagesTable.project_id, projectId))
        .orderBy(this.projectKeyStagesTable.stage_number);
      
      console.log(`Found ${result.length} key stages for project ${projectId}`);
      return result as ProjectKeyStage[];
    } catch (error) {
      console.error(`Error getting key stages for project ${projectId}:`, error);
      return [];
    }
  }
  
  async getProjectKeyStage(id: number): Promise<ProjectKeyStage | undefined> {
    console.log(`Getting key stage with ID: ${id}`);
    try {
      const [result] = await db.select()
        .from(this.projectKeyStagesTable)
        .where(eq(this.projectKeyStagesTable.id, id));
      
      return result as ProjectKeyStage | undefined;
    } catch (error) {
      console.error(`Error getting key stage ${id}:`, error);
      return undefined;
    }
  }
  
  async createProjectKeyStage(data: InsertProjectKeyStage): Promise<ProjectKeyStage> {
    console.log(`Creating new project key stage:`, data);
    try {
      // Convert camelCase to snake_case for database fields
      const stageData = {
        project_id: data.project_id,
        stage_number: data.stage_number,
        stage_name: data.stage_name,
        is_completed: data.is_completed || false,
        completed_by: data.completed_by || null,
        completed_date: data.completed_date || null
      };
      
      const [result] = await db.insert(this.projectKeyStagesTable)
        .values(stageData)
        .returning();
      
      console.log(`Created project key stage:`, result);
      return result as ProjectKeyStage;
    } catch (error) {
      console.error(`Error creating project key stage:`, error);
      throw error;
    }
  }
  
  async updateProjectKeyStage(id: number, updates: Partial<ProjectKeyStage>): Promise<ProjectKeyStage | undefined> {
    console.log(`Updating key stage ${id} with data:`, updates);
    try {
      // Map any camelCase property names to snake_case if they exist
      const updateData: Record<string, any> = { updated_at: new Date() };
      
      if (updates.stage_number !== undefined) updateData.stage_number = updates.stage_number;
      if (updates.stage_name !== undefined) updateData.stage_name = updates.stage_name;
      if (updates.is_completed !== undefined) updateData.is_completed = updates.is_completed;
      if (updates.completed_by !== undefined) updateData.completed_by = updates.completed_by;
      if (updates.completed_date !== undefined) updateData.completed_date = updates.completed_date;
      
      const [result] = await db.update(this.projectKeyStagesTable)
        .set(updateData)
        .where(eq(this.projectKeyStagesTable.id, id))
        .returning();
      
      console.log(`Updated key stage:`, result);
      return result as ProjectKeyStage;
    } catch (error) {
      console.error(`Error updating key stage ${id}:`, error);
      return undefined;
    }
  }
  
  async setKeyStageCompleted(id: number, completedBy: number, isCompleted: boolean = true): Promise<ProjectKeyStage | undefined> {
    console.log(`Marking key stage ${id} as ${isCompleted ? 'completed' : 'incomplete'} by user ${completedBy}`);
    try {
      const completedDate = isCompleted ? new Date() : null;
      
      const [result] = await db.update(this.projectKeyStagesTable)
        .set({
          is_completed: isCompleted,
          completed_by: isCompleted ? completedBy : null,
          completed_date: completedDate,
          updated_at: new Date()
        })
        .where(eq(this.projectKeyStagesTable.id, id))
        .returning();
      
      console.log(`Updated key stage completion status:`, result);
      return result as ProjectKeyStage;
    } catch (error) {
      console.error(`Error updating key stage ${id} completion status:`, error);
      return undefined;
    }
  }
  
  async deleteProjectKeyStage(id: number): Promise<void> {
    console.log(`Deleting key stage ${id}`);
    try {
      await db.delete(this.projectKeyStagesTable)
        .where(eq(this.projectKeyStagesTable.id, id));
      
      console.log(`Deleted key stage ${id}`);
    } catch (error) {
      console.error(`Error deleting key stage ${id}:`, error);
      throw error;
    }
  }

  // Deliverables
  async createDeliverable(deliverable: InsertDeliverable): Promise<Deliverable> {
    console.log(`Creating new deliverable:`, deliverable);
    const result = await db.insert(deliverablesTable).values(deliverable).returning();
    const newDeliverable = result[0] as Deliverable;
    console.log(`Created deliverable:`, newDeliverable);
    return newDeliverable;
  }

  async getPhaseDeliverables(phaseId: number): Promise<Deliverable[]> {
    console.log(`Getting deliverables for phase ${phaseId}`);
    const deliverables = await db
      .select()
      .from(deliverablesTable)
      .where(eq(deliverablesTable.phaseId, phaseId))
      .orderBy(deliverablesTable.dueDate);
    
    console.log(`Found ${deliverables.length} deliverables for phase ${phaseId}`);
    return deliverables as Deliverable[];
  }

  async getDeliverable(id: number): Promise<Deliverable | undefined> {
    console.log(`Getting deliverable with ID: ${id}`);
    const result = await db.select().from(deliverablesTable).where(eq(deliverablesTable.id, id));
    return result[0] as Deliverable | undefined;
  }

  async updateDeliverable(id: number, updateData: Partial<Deliverable>): Promise<Deliverable> {
    console.log(`Updating deliverable ${id} with data:`, updateData);
    const result = await db
      .update(deliverablesTable)
      .set(updateData)
      .where(eq(deliverablesTable.id, id))
      .returning();
    
    const deliverable = result[0] as Deliverable;
    if (!deliverable) throw new Error("Deliverable not found");
    
    console.log(`Updated deliverable:`, deliverable);
    return deliverable;
  }

  // Project Tasks
  async createProjectTask(task: InsertProjectTask): Promise<ProjectTask> {
    console.log(`Creating new project task:`, task);
    const result = await db.insert(projectTasksTable).values(task).returning();
    const newTask = result[0] as ProjectTask;
    console.log(`Created project task:`, newTask);
    return newTask;
  }

  async getProjectTasks(projectId: number): Promise<any[]> {
    try {
      const query = `
        SELECT 
          pt.id, pt.task_id as "taskId", pt.project_id as "projectId", 
          pt.phase_id as "phaseId", pt.notes,
          t.title, t.description, t.status, t.priority,
          t.start_date as "startDate", t.finish_date as "finishDate", 
          t.due_date as "dueDate", t.assigned_to as "assignedTo",
          t.created_at as "createdAt", t.completed_at as "completedAt",
          u.username as "assignedToName"
        FROM "project_tasks" pt
        LEFT JOIN "tasks" t ON pt.task_id = t.id
        LEFT JOIN "users" u ON t.assigned_to = u.id
        WHERE pt.project_id = $1
        ORDER BY pt.id
      `;
      
      const { rows } = await pool.query(query, [projectId]);
      
      return rows;
    } catch (error) {
      console.error(`Error getting tasks for project ${projectId}:`, error);
      return [];
    }
  }

  async getPhaseProjectTasks(phaseId: number): Promise<ProjectTask[]> {
    console.log(`Getting tasks for phase ${phaseId}`);
    try {
      // Use simpler SQL query to avoid syntax issues with snake_case column names
      const query = `SELECT * FROM "project_tasks" WHERE "phase_id" = $1 ORDER BY "id"`;
      
      const { rows } = await pool.query(query, [phaseId]);
      
      console.log(`Found ${rows.length} tasks for phase ${phaseId}`);
      return rows as ProjectTask[];
    } catch (error) {
      console.error(`Error getting tasks for phase ${phaseId}:`, error);
      return [];
    }
  }

  async getProjectTask(id: number): Promise<ProjectTask | undefined> {
    console.log(`Getting project task with ID: ${id}`);
    const result = await db.select().from(projectTasksTable).where(eq(projectTasksTable.id, id));
    return result[0] as ProjectTask | undefined;
  }

  async updateProjectTask(id: number, updateData: Partial<ProjectTask>): Promise<ProjectTask> {
    console.log(`Updating project task ${id} with data:`, updateData);
    const result = await db
      .update(projectTasksTable)
      .set(updateData)
      .where(eq(projectTasksTable.id, id))
      .returning();
    
    const task = result[0] as ProjectTask;
    if (!task) throw new Error("Project task not found");
    
    console.log(`Updated project task:`, task);
    return task;
  }

  // Phase Approvals
  async createPhaseApproval(approval: InsertPhaseApproval): Promise<PhaseApproval> {
    console.log(`Creating new phase approval:`, approval);
    const result = await db.insert(phaseApprovalsTable).values(approval).returning();
    const newApproval = result[0] as PhaseApproval;
    console.log(`Created phase approval:`, newApproval);
    return newApproval;
  }

  async getPhaseApprovals(phaseId: number): Promise<PhaseApproval[]> {
    console.log(`Getting approvals for phase ${phaseId}`);
    const approvals = await db
      .select({
        approval: phaseApprovalsTable,
        approver: {
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role
        }
      })
      .from(phaseApprovalsTable)
      .leftJoin(users, eq(phaseApprovalsTable.approverId, users.id))
      .where(eq(phaseApprovalsTable.phaseId, phaseId))
      .orderBy(phaseApprovalsTable.createdAt);
    
    console.log(`Found ${approvals.length} approvals for phase ${phaseId}`);
    return approvals.map(a => ({
      ...a.approval,
      approver: a.approver
    })) as unknown as PhaseApproval[];
  }

  async updatePhaseApproval(id: number, updateData: Partial<PhaseApproval>): Promise<PhaseApproval> {
    console.log(`Updating phase approval ${id} with data:`, updateData);
    const result = await db
      .update(phaseApprovalsTable)
      .set(updateData)
      .where(eq(phaseApprovalsTable.id, id))
      .returning();
    
    const approval = result[0] as PhaseApproval;
    if (!approval) throw new Error("Phase approval not found");
    
    console.log(`Updated phase approval:`, approval);
    return approval;
  }

  // Project Documents
  async createProjectDocument(document: InsertProjectDocument): Promise<ProjectDocument> {
    console.log(`Creating new project document:`, document);
    const result = await db.insert(projectDocumentsTable).values(document).returning();
    const newDocument = result[0] as ProjectDocument;
    console.log(`Created project document:`, newDocument);
    return newDocument;
  }

  async getProjectDocuments(projectId: number): Promise<ProjectDocument[]> {
    console.log(`Getting documents for project ${projectId}`);
    const documents = await db
      .select()
      .from(projectDocumentsTable)
      .where(eq(projectDocumentsTable.projectId, projectId))
      .orderBy(projectDocumentsTable.createdAt);
    
    console.log(`Found ${documents.length} documents for project ${projectId}`);
    return documents as ProjectDocument[];
  }

  async getPhaseDocuments(phaseId: number): Promise<ProjectDocument[]> {
    console.log(`Getting documents for phase ${phaseId}`);
    const documents = await db
      .select()
      .from(projectDocumentsTable)
      .where(eq(projectDocumentsTable.phaseId, phaseId))
      .orderBy(projectDocumentsTable.createdAt);
    
    console.log(`Found ${documents.length} documents for phase ${phaseId}`);
    return documents as ProjectDocument[];
  }

  async getProjectDocument(id: number): Promise<ProjectDocument | undefined> {
    console.log(`Getting project document with ID: ${id}`);
    const result = await db.select().from(projectDocumentsTable).where(eq(projectDocumentsTable.id, id));
    return result[0] as ProjectDocument | undefined;
  }

  async updateProjectDocument(id: number, updateData: Partial<ProjectDocument>): Promise<ProjectDocument> {
    console.log(`Updating project document ${id} with data:`, updateData);
    const result = await db
      .update(projectDocumentsTable)
      .set(updateData)
      .where(eq(projectDocumentsTable.id, id))
      .returning();
    
    const document = result[0] as ProjectDocument;
    if (!document) throw new Error("Project document not found");
    
    console.log(`Updated project document:`, document);
    return document;
  }

  // Master Items CRUD methods
  async createMasterItem(item: InsertMasterItem): Promise<MasterItem> {
    console.log(`Creating new master item:`, item);
    try {
      const result = await db.insert(masterItemsTable).values(item).returning();
      const masterItem = result[0] as MasterItem;
      console.log(`Created master item:`, masterItem);
      return masterItem;
    } catch (error) {
      console.error("Error creating master item, table might not exist:", error);
      // Return a simulated master item that contains the essential information
      // This allows the application to continue working even without the master_items table
      return {
        id: -1, // Use negative ID to indicate it's not a real database record
        itemCode: item.itemCode,
        description: item.description,
        specification: item.specification || null,
        uom: item.uom,
        makeOrBuy: item.makeOrBuy || null,
        standardCost: null,
        supplier: item.supplier || null,
        notes: item.notes || null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as MasterItem;
    }
  }

  async getMasterItemByCode(itemCode: string): Promise<MasterItem | undefined> {
    console.log(`Looking for master item with code: ${itemCode}`);
    try {
      const result = await db
        .select()
        .from(masterItemsTable)
        .where(eq(masterItemsTable.itemCode, itemCode));
      return result[0] as MasterItem | undefined;
    } catch (error) {
      console.error("Error fetching master item by code, table might not exist:", error);
      return undefined;
    }
  }

  async getMasterItem(id: number): Promise<MasterItem | undefined> {
    console.log(`Getting master item with ID: ${id}`);
    try {
      const result = await db
        .select()
        .from(masterItemsTable)
        .where(eq(masterItemsTable.id, id));
      return result[0] as MasterItem | undefined;
    } catch (error) {
      console.error("Error fetching master item by ID, table might not exist:", error);
      return undefined;
    }
  }

  async getAllMasterItems(): Promise<MasterItem[]> {
    console.log(`Getting all master items`);
    try {
      const items = await db
        .select()
        .from(masterItemsTable)
        .orderBy(masterItemsTable.id);
    
      console.log(`Found ${items.length} master items`);
      return items as MasterItem[];
    } catch (error) {
      console.error("Error fetching all master items, table might not exist:", error);
      return [];
    }
  }

  async getMasterItemsByIds(ids: number[]): Promise<MasterItem[]> {
    console.log(`Getting master items by IDs: [${ids.join(', ')}]`);
    try {
      if (ids.length === 0) {
        return [];
      }
      
      const items = await db
        .select()
        .from(masterItemsTable)
        .where(inArray(masterItemsTable.id, ids))
        .orderBy(masterItemsTable.id);
    
      console.log(`Found ${items.length} master items for ${ids.length} IDs`);
      return items as MasterItem[];
    } catch (error) {
      console.error("Error fetching master items by IDs, table might not exist:", error);
      return [];
    }
  }

  async updateMasterItem(id: number, updateData: Partial<MasterItem>): Promise<MasterItem> {
    console.log(`Updating master item ${id} with data:`, updateData);
    
    // Handle field name mapping between camelCase and snake_case
    const preparedData: Record<string, any> = {};
    
    // Copy all normal fields
    Object.keys(updateData).forEach(key => {
      // If the key is make_or_buy or drawing_no, we'll map it to the correct field in the DB
      if (key === 'make_or_buy') {
        preparedData.makeOrBuy = updateData[key];
      } else if (key === 'drawing_no') {
        preparedData.drawingNo = updateData[key];
      } else {
        preparedData[key] = updateData[key];
      }
    });
    
    console.log(`Prepared data after field mapping:`, preparedData);
    
    try {
      const result = await db
        .update(masterItemsTable)
        .set(preparedData)
        .where(eq(masterItemsTable.id, id))
        .returning();
      
      const item = result[0] as MasterItem;
      if (!item) throw new Error("Master item not found");
      
      console.log(`Updated master item:`, item);
      return item;
    } catch (error) {
      console.error("Error updating master item, table might not exist:", error);
      return {
        id,
        ...updateData,
        // Provide default values for all required fields not in updateData
        description: updateData.description || "Unknown",
        itemCode: updateData.itemCode || "Unknown",
        uom: updateData.uom || "Unknown",
        createdAt: new Date(),
        updatedAt: new Date(),
        notes: updateData.notes || null,
        specification: updateData.specification || null,
        makeOrBuy: updateData.makeOrBuy || null,
        standardCost: null,
        supplier: updateData.supplier || null
      } as MasterItem;
    }
  }
  
  async deleteMasterItem(id: number): Promise<void> {
    console.log(`Deleting master item with ID: ${id}`);
    try {
      await db
        .delete(masterItemsTable)
        .where(eq(masterItemsTable.id, id));
      console.log(`Deleted master item with ID: ${id}`);
    } catch (error) {
      console.error("Error deleting master item:", error);
      throw new Error(`Failed to delete master item: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  async getProjectItemsByMasterId(masterId: number): Promise<ProjectItem[]> {
    console.log(`Getting project items with master item ID: ${masterId}`);
    try {
      const items = await db
        .select()
        .from(projectItemsTable)
        .where(eq(projectItemsTable.itemId, masterId));
      
      console.log(`Found ${items.length} project items with master item ID: ${masterId}`);
      return items as ProjectItem[];
    } catch (error) {
      console.error("Error fetching project items by master ID:", error);
      return [];
    }
  }

  // Project Items CRUD methods
  async createProjectItem(item: InsertProjectItem): Promise<ProjectItem> {
    console.log(`Creating new project item:`, item);
    try {
      const result = await db.insert(projectItemsTable).values(item).returning();
      const projectItem = result[0] as ProjectItem;
      console.log(`Created project item:`, projectItem);
      return projectItem;
    } catch (error) {
      console.error("Error creating project item:", error);
      
      // Return a minimal ProjectItem object with the essential data
      // This allows the application to continue working even with database errors
      return {
        id: -1, // Use negative ID to indicate it's not a real database record
        projectId: item.projectId,
        projectCode: item.projectCode,
        itemId: item.itemId,
        quantity: item.quantity,
        createdAt: new Date(),
        updatedAt: new Date(),
        actualCost: null,
        notes: null,
        estimatedCost: null
      } as ProjectItem;
    }
  }

  async getProjectItems(projectId: number): Promise<(ProjectItem & { masterItem?: MasterItem })[]> {
    console.log(`Getting items for project ${projectId}`);
    
    try {
      // Try joining with master_items table to get complete item details
      const items = await db
        .select({
          projectItem: projectItemsTable,
          masterItem: masterItemsTable
        })
        .from(projectItemsTable)
        .leftJoin(masterItemsTable, eq(projectItemsTable.itemId, masterItemsTable.id))
        .where(eq(projectItemsTable.projectId, projectId))
        .orderBy(projectItemsTable.id);
      
      // Transform the results to match the expected format
      const formattedItems = items.map(item => ({
        ...item.projectItem,
        masterItem: item.masterItem
      }));
      
      console.log(`Found ${formattedItems.length} items for project ${projectId}`);
      return formattedItems;
    } catch (error) {
      console.error("Error fetching with join, falling back to basic query:", error);
      
      // Fallback: just get project items without master items
      const items = await db
        .select()
        .from(projectItemsTable)
        .where(eq(projectItemsTable.projectId, projectId))
        .orderBy(projectItemsTable.id);
      
      console.log(`Found ${items.length} items for project ${projectId} (fallback mode)`);
      return items.map(item => ({
        ...item,
        masterItem: undefined
      }));
    }
  }

  async getProjectItemsByCode(projectCode: string): Promise<(ProjectItem & { masterItem?: MasterItem })[]> {
    console.log(`Getting items for project code ${projectCode}`);
    
    try {
      // Try joining with master_items table to get complete item details
      const items = await db
        .select({
          projectItem: projectItemsTable,
          masterItem: masterItemsTable
        })
        .from(projectItemsTable)
        .leftJoin(masterItemsTable, eq(projectItemsTable.itemId, masterItemsTable.id))
        .where(eq(projectItemsTable.projectCode, projectCode))
        .orderBy(projectItemsTable.id);
      
      // Transform the results to match the expected format
      const formattedItems = items.map(item => ({
        ...item.projectItem,
        masterItem: item.masterItem
      }));
      
      console.log(`Found ${formattedItems.length} items for project code ${projectCode}`);
      return formattedItems;
    } catch (error) {
      console.error("Error fetching with join (by code), falling back to basic query:", error);
      
      // Fallback: just get project items without master items
      const items = await db
        .select()
        .from(projectItemsTable)
        .where(eq(projectItemsTable.projectCode, projectCode))
        .orderBy(projectItemsTable.id);
      
      console.log(`Found ${items.length} items for project code ${projectCode} (fallback mode)`);
      return items.map(item => ({
        ...item,
        masterItem: undefined
      }));
    }
  }

  async getProjectItem(id: number): Promise<(ProjectItem & { masterItem?: MasterItem }) | undefined> {
    console.log(`Getting project item with ID: ${id}`);
    
    try {
      // Try joining with master_items table to get complete item details
      const result = await db
        .select({
          projectItem: projectItemsTable,
          masterItem: masterItemsTable
        })
        .from(projectItemsTable)
        .leftJoin(masterItemsTable, eq(projectItemsTable.itemId, masterItemsTable.id))
        .where(eq(projectItemsTable.id, id));
      
      if (result.length === 0) return undefined;
      
      // Transform the result to match the expected format
      return {
        ...result[0].projectItem,
        masterItem: result[0].masterItem
      };
    } catch (error) {
      console.error("Error fetching project item with join, falling back to basic query:", error);
      
      // Fallback: just get project item without master items
      const result = await db
        .select()
        .from(projectItemsTable)
        .where(eq(projectItemsTable.id, id));
      
      if (result.length === 0) return undefined;
      
      console.log(`Found project item with ID: ${id} (fallback mode)`);
      return {
        ...result[0],
        masterItem: undefined
      };
    }
  }
  
  async getProjectItemByItemIdAndProject(itemId: number, projectId: number): Promise<ProjectItem | undefined> {
    console.log(`Checking for item with ID ${itemId} in project ${projectId}`);
    try {
      const result = await db
        .select()
        .from(projectItemsTable)
        .where(
          and(
            eq(projectItemsTable.itemId, itemId),
            eq(projectItemsTable.projectId, projectId)
          )
        );
      return result[0] as ProjectItem | undefined;
    } catch (error) {
      console.error("Error checking for project item by itemId and projectId:", error);
      return undefined;
    }
  }

  async updateProjectItem(id: number, updateData: Partial<ProjectItem>): Promise<ProjectItem> {
    console.log(`Updating project item ${id} with data:`, updateData);
    try {
      const result = await db
        .update(projectItemsTable)
        .set(updateData)
        .where(eq(projectItemsTable.id, id))
        .returning();
      
      const item = result[0] as ProjectItem;
      if (!item) {
        console.error(`Project item with ID ${id} not found for update`);
        // Return minimal project item with the updates applied
        return {
          id: id,
          projectId: updateData.projectId || 0,
          projectCode: updateData.projectCode || "",
          itemId: updateData.itemId || 0,
          quantity: updateData.quantity || 0,
          ...updateData,
          createdAt: new Date(),
          updatedAt: new Date(),
          actualCost: updateData.actualCost || null,
          notes: updateData.notes || null,
          estimatedCost: updateData.estimatedCost || null
        } as ProjectItem;
      }
      
      console.log(`Updated project item:`, item);
      return item;
    } catch (error) {
      console.error(`Error updating project item ${id}:`, error);
      // Return minimal project item with the updates applied
      return {
        id: id,
        projectId: updateData.projectId || 0,
        projectCode: updateData.projectCode || "",
        itemId: updateData.itemId || 0,
        quantity: updateData.quantity || 0,
        ...updateData,
        createdAt: new Date(),
        updatedAt: new Date(),
        actualCost: updateData.actualCost || null,
        notes: updateData.notes || null,
        estimatedCost: updateData.estimatedCost || null
      } as ProjectItem;
    }
  }

  async deleteProjectItem(id: number): Promise<void> {
    console.log(`Deleting project item ${id}`);
    try {
      await db.delete(projectItemsTable).where(eq(projectItemsTable.id, id));
      console.log(`Deleted project item ${id}`);
    } catch (error) {
      console.error(`Error deleting project item ${id}:`, error);
      // We only log the error but don't throw, allowing the operation to "succeed" gracefully
    }
  }

  async deleteProjectItems(projectId: number): Promise<number> {
    console.log(`Deleting all items for project ${projectId}`);
    try {
      const result = await db.delete(projectItemsTable).where(eq(projectItemsTable.projectId, projectId)).returning();
      console.log(`Deleted ${result.length} items for project ${projectId}`);
      return result.length;
    } catch (error) {
      console.error(`Error deleting items for project ${projectId}:`, error);
      // Return 0 to indicate no items were deleted
      return 0;
    }
  }
  
  // Sales and Marketing methods
  
  // Lead Sources
  async getLeadSources(): Promise<LeadSourceSelect[]> {
    console.log('Getting all lead sources');
    return await db.select().from(leadSourcesTable);
  }
  
  // Lead Statuses
  async getLeadStatuses(): Promise<LeadStatusSelect[]> {
    console.log('Getting all lead statuses');
    return await db.select().from(leadStatusesTable).orderBy(leadStatusesTable.displayOrder);
  }
  
  // Leads
  async createLead(lead: LeadInsert): Promise<LeadSelect> {
    console.log('Creating new lead:', lead);
    const now = new Date();
    const newLead = await db.insert(leads).values({
      ...lead,
      createdAt: now,
      updatedAt: now
    }).returning();
    return newLead[0];
  }
  
  async updateLead(id: number, updateData: Partial<LeadSelect>): Promise<LeadSelect> {
    console.log(`Updating lead ${id} with data:`, updateData);
    
    // Add specific logging for the expectedCloseDate field
    console.log(`Estimated close date before update: ${updateData.expectedCloseDate}`);
    console.log(`Estimated close date type: ${typeof updateData.expectedCloseDate}`);
    
    // Ensure expectedCloseDate is properly handled
    let processedData = { ...updateData };
    if (processedData.expectedCloseDate) {
      // If it's a string, try to parse it as a date
      if (typeof processedData.expectedCloseDate === 'string') {
        try {
          const dateObj = new Date(processedData.expectedCloseDate);
          console.log(`Parsed date: ${dateObj.toISOString()}`);
          // Keep it as a string in YYYY-MM-DD format
          processedData.expectedCloseDate = processedData.expectedCloseDate;
        } catch (e) {
          console.error(`Error parsing date: ${e}`);
        }
      }
    }
    
    const updatedLead = await db.update(leads)
      .set({
        ...processedData,
        updatedAt: new Date()
      })
      .where(eq(leads.id, id))
      .returning();
      
    console.log(`Updated lead: `, updatedLead[0]);
    return updatedLead[0];
  }
  
  async deleteLead(id: number): Promise<void> {
    console.log(`Deleting lead ${id}`);
    await db.delete(leads).where(eq(leads.id, id));
  }
  
  async getLead(id: number): Promise<LeadSelect | undefined> {
    console.log(`Getting lead with ID: ${id}`);
    const result = await db.select().from(leads).where(eq(leads.id, id));
    return result[0];
  }
  
  async getLeadWithDetails(id: number): Promise<any> {
    console.log(`Getting lead with details for ID: ${id}`);
    const result = await db.select({
      lead: leads,
      source: leadSourcesTable,
      status: leadStatusesTable,
      assignedTo: users,
      customer: customersTable
    })
    .from(leads)
    .leftJoin(leadSourcesTable, eq(leads.sourceId, leadSourcesTable.id))
    .leftJoin(leadStatusesTable, eq(leads.statusId, leadStatusesTable.id))
    .leftJoin(users, eq(leads.assignedTo, users.id))
    .leftJoin(customersTable, eq(leads.customerId, customersTable.id))
    .where(eq(leads.id, id));
    
    return result[0];
  }
  
  async getAllLeads(): Promise<LeadSelect[]> {
    console.log('Getting all leads');
    return await db.select().from(leads);
  }
  
  async getLeadsWithDetails(): Promise<any[]> {
    console.log('Getting all leads with details');
    return await db.select({
      lead: leads,
      source: leadSourcesTable,
      status: leadStatusesTable,
      assignedTo: users,
      customer: customersTable
    })
    .from(leads)
    .leftJoin(leadSourcesTable, eq(leads.sourceId, leadSourcesTable.id))
    .leftJoin(leadStatusesTable, eq(leads.statusId, leadStatusesTable.id))
    .leftJoin(users, eq(leads.assignedTo, users.id))
    .leftJoin(customersTable, eq(leads.customerId, customersTable.id))
    .orderBy(desc(leads.createdAt));
  }
  
  // Lead Activities
  async createLeadActivity(activity: LeadActivityInsert): Promise<LeadActivitySelect> {
    console.log('Creating new lead activity:', activity);
    const now = new Date();
    const newActivity = await db.insert(leadActivities).values({
      ...activity,
      createdAt: now,
      updatedAt: now
    }).returning();
    
    // Update the last contacted time on the lead
    await db.update(leads)
      .set({
        lastContactedAt: now,
        updatedAt: now
      })
      .where(eq(leads.id, activity.leadId));
      
    return newActivity[0];
  }
  
  async getLeadActivities(leadId: number): Promise<LeadActivitySelect[]> {
    console.log(`Getting activities for lead ${leadId}`);
    return await db.select()
      .from(leadActivities)
      .where(eq(leadActivities.leadId, leadId))
      .orderBy(desc(leadActivities.activityDate));
  }
  
  async getLeadActivitiesWithUsers(leadId: number): Promise<any[]> {
    console.log(`Getting activities with user details for lead ${leadId}`);
    return await db.select({
      activity: leadActivities,
      user: users
    })
    .from(leadActivities)
    .leftJoin(users, eq(leadActivities.createdBy, users.id))
    .where(eq(leadActivities.leadId, leadId))
    .orderBy(desc(leadActivities.activityDate));
  }
  
  // Marketing Campaigns
  async createMarketingCampaign(campaign: MarketingCampaignInsert): Promise<MarketingCampaignSelect> {
    console.log('Creating new marketing campaign:', campaign);
    const now = new Date();
    const newCampaign = await db.insert(marketingCampaigns).values({
      ...campaign,
      createdAt: now,
      updatedAt: now
    }).returning();
    return newCampaign[0];
  }
  
  async updateMarketingCampaign(id: number, updateData: Partial<MarketingCampaignSelect>): Promise<MarketingCampaignSelect> {
    console.log(`Updating marketing campaign ${id} with data:`, updateData);
    const updatedCampaign = await db.update(marketingCampaigns)
      .set({
        ...updateData,
        updatedAt: new Date()
      })
      .where(eq(marketingCampaigns.id, id))
      .returning();
    return updatedCampaign[0];
  }
  
  async getMarketingCampaign(id: number) {
    console.log(`Getting marketing campaign with ID: ${id}`);
    
    const result = await db.select({
      id: marketingCampaigns.id,
      name: marketingCampaigns.name,
      description: marketingCampaigns.description,
      objective: marketingCampaigns.objective,
      channelId: marketingCampaigns.channelId,
      channelName: campaignChannels.name,
      status: marketingCampaigns.status,
      startDate: marketingCampaigns.startDate,
      endDate: marketingCampaigns.endDate,
      budget: marketingCampaigns.budget,
      targetAudience: marketingCampaigns.targetAudience,
      // Performance metrics
      ctr: marketingCampaigns.ctr,
      cpc: marketingCampaigns.cpc,
      conversions: marketingCampaigns.conversions,
      conversionRate: marketingCampaigns.conversionRate,
      cpa: marketingCampaigns.cpa,
      impressions: marketingCampaigns.impressions,
      qualityScore: marketingCampaigns.qualityScore,
      roas: marketingCampaigns.roas,
      impressionShare: marketingCampaigns.impressionShare,
      bounceRate: marketingCampaigns.bounceRate,
      expectedLeadCount: marketingCampaigns.expectedLeadCount,
      createdBy: marketingCampaigns.createdBy,
      createdAt: marketingCampaigns.createdAt,
      updatedAt: marketingCampaigns.updatedAt
    })
    .from(marketingCampaigns)
    .leftJoin(
      campaignChannels,
      eq(marketingCampaigns.channelId, campaignChannels.id)
    )
    .where(eq(marketingCampaigns.id, id));
    
    return result[0];
  }
  
  async getAllMarketingCampaigns() {
    console.log('Getting all marketing campaigns');
    
    // Join with campaign channels to get channel names
    const result = await db.select({
      id: marketingCampaigns.id,
      name: marketingCampaigns.name,
      description: marketingCampaigns.description,
      objective: marketingCampaigns.objective,
      channelId: marketingCampaigns.channelId,
      channelName: campaignChannels.name,
      status: marketingCampaigns.status,
      startDate: marketingCampaigns.startDate,
      endDate: marketingCampaigns.endDate,
      budget: marketingCampaigns.budget,
      targetAudience: marketingCampaigns.targetAudience,
      // Performance metrics
      ctr: marketingCampaigns.ctr,
      cpc: marketingCampaigns.cpc,
      conversions: marketingCampaigns.conversions,
      conversionRate: marketingCampaigns.conversionRate,
      cpa: marketingCampaigns.cpa,
      impressions: marketingCampaigns.impressions,
      qualityScore: marketingCampaigns.qualityScore,
      roas: marketingCampaigns.roas,
      impressionShare: marketingCampaigns.impressionShare,
      bounceRate: marketingCampaigns.bounceRate,
      expectedLeadCount: marketingCampaigns.expectedLeadCount,
      createdBy: marketingCampaigns.createdBy,
      createdAt: marketingCampaigns.createdAt,
      updatedAt: marketingCampaigns.updatedAt
    })
    .from(marketingCampaigns)
    .leftJoin(
      campaignChannels,
      eq(marketingCampaigns.channelId, campaignChannels.id)
    );
    
    return result;
  }
  
  // Campaign Channels
  async getCampaignChannels(): Promise<CampaignChannelSelect[]> {
    console.log('Getting all campaign channels');
    return await db.select().from(campaignChannels);
  }
  
  // Campaign Activities
  async createCampaignActivity(activity: CampaignActivityInsert): Promise<CampaignActivitySelect> {
    console.log('Creating new campaign activity:', activity);
    const now = new Date();
    const newActivity = await db.insert(campaignActivities).values({
      ...activity,
      createdAt: now,
      updatedAt: now
    }).returning();
    return newActivity[0];
  }
  
  async getCampaignActivities(campaignId: number): Promise<CampaignActivitySelect[]> {
    console.log(`Getting activities for campaign ${campaignId}`);
    return await db.select()
      .from(campaignActivities)
      .where(eq(campaignActivities.campaignId, campaignId));
  }

  // Finance - Invoices
  async createInvoice(invoice: InsertInvoice, items: InsertInvoiceItem[]): Promise<Invoice> {
    console.log('Creating new invoice:', { ...invoice, items: items.length });
    
    // Start a transaction
    const result = await db.transaction(async (tx) => {
      // Insert the invoice
      const [insertedInvoice] = await tx
        .insert(invoicesTable)
        .values(invoice)
        .returning();
      
      // Insert all invoice items with the invoice ID
      if (items.length > 0) {
        const itemsWithInvoiceId = items.map(item => ({
          ...item,
          invoiceId: insertedInvoice.id
        }));
        
        await tx
          .insert(invoiceItemsTable)
          .values(itemsWithInvoiceId);
      }
      
      return insertedInvoice;
    });
    
    console.log('Created invoice:', result);
    return result as Invoice;
  }
  
  async getInvoice(id: number): Promise<Invoice | undefined> {
    console.log(`Getting invoice with ID: ${id}`);
    const [invoice] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.id, id));
    
    return invoice as Invoice | undefined;
  }
  
  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined> {
    console.log(`Looking for invoice with number: ${invoiceNumber}`);
    const [invoice] = await db
      .select()
      .from(invoicesTable)
      .where(eq(invoicesTable.invoiceNumber, invoiceNumber));
    
    return invoice as Invoice | undefined;
  }
  
  async getInvoices(filters?: {
    customerId?: number;
    projectId?: number;
    fromDate?: Date;
    toDate?: Date;
    status?: string;
    currency?: string;
  }): Promise<Invoice[]> {
    console.log('Getting invoices with filters:', filters);
    
    let query = db.select().from(invoicesTable);
    
    // Apply filters
    if (filters) {
      const conditions = [];
      
      if (filters.customerId) {
        conditions.push(eq(invoicesTable.customerId, filters.customerId));
      }
      
      if (filters.projectId) {
        conditions.push(eq(invoicesTable.projectId, filters.projectId));
      }
      
      if (filters.fromDate) {
        conditions.push(sql`${invoicesTable.invoiceDate} >= ${filters.fromDate}`);
      }
      
      if (filters.toDate) {
        conditions.push(sql`${invoicesTable.invoiceDate} <= ${filters.toDate}`);
      }
      
      if (filters.status) {
        conditions.push(eq(invoicesTable.status, filters.status));
      }
      
      if (filters.currency) {
        conditions.push(eq(invoicesTable.currency, filters.currency));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
    }
    
    // Skip the ordering for now to avoid the SQL syntax error
    const invoices = await query;
    return invoices as Invoice[];
  }
  
  async updateInvoice(id: number, updateData: Partial<Invoice>): Promise<Invoice> {
    console.log(`Updating invoice ${id} with data:`, updateData);
    
    const [updatedInvoice] = await db
      .update(invoicesTable)
      .set(updateData)
      .where(eq(invoicesTable.id, id))
      .returning();
    
    if (!updatedInvoice) {
      throw new Error("Invoice not found");
    }
    
    console.log('Updated invoice:', updatedInvoice);
    return updatedInvoice as Invoice;
  }
  
  // Finance - Invoice Items
  async getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]> {
    console.log(`Getting items for invoice ${invoiceId}`);
    
    const items = await db
      .select()
      .from(invoiceItemsTable)
      .where(eq(invoiceItemsTable.invoiceId, invoiceId));
    
    return items as InvoiceItem[];
  }
  
  async addInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem> {
    console.log('Adding invoice item:', item);
    
    const [insertedItem] = await db
      .insert(invoiceItemsTable)
      .values(item)
      .returning();
    
    console.log('Added invoice item:', insertedItem);
    return insertedItem as InvoiceItem;
  }
  
  async updateInvoiceItem(id: number, updateData: Partial<InvoiceItem>): Promise<InvoiceItem> {
    console.log(`Updating invoice item ${id} with data:`, updateData);
    
    const [updatedItem] = await db
      .update(invoiceItemsTable)
      .set(updateData)
      .where(eq(invoiceItemsTable.id, id))
      .returning();
    
    if (!updatedItem) {
      throw new Error("Invoice item not found");
    }
    
    console.log('Updated invoice item:', updatedItem);
    return updatedItem as InvoiceItem;
  }
  
  async deleteInvoiceItem(id: number): Promise<void> {
    console.log(`Deleting invoice item ${id}`);
    
    await db
      .delete(invoiceItemsTable)
      .where(eq(invoiceItemsTable.id, id));
    
    console.log(`Deleted invoice item ${id}`);
  }
  
  // Finance - Payments and Allocations
  async createPayment(payment: InsertPayment, allocations?: InsertPaymentInvoiceLink[]): Promise<Payment> {
    console.log('Creating new payment:', {
      ...payment,
      allocations: allocations?.length || 0
    });
    
    const result = await db.transaction(async (tx) => {
      // Insert the payment
      const [insertedPayment] = await tx
        .insert(paymentsTable)
        .values(payment)
        .returning();
      
      // Insert payment allocations if provided
      if (allocations && allocations.length > 0) {
        const allocationsWithPaymentId = allocations.map(allocation => ({
          ...allocation,
          paymentId: insertedPayment.id
        }));
        
        await tx
          .insert(paymentInvoiceLinksTable)
          .values(allocationsWithPaymentId);
      }
      
      return insertedPayment;
    });
    
    console.log('Created payment:', result);
    return result as Payment;
  }
  
  async getPayment(id: number): Promise<Payment | undefined> {
    console.log(`Getting payment with ID: ${id}`);
    
    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.id, id));
    
    return payment as Payment | undefined;
  }
  
  async getPayments(filters?: {
    customerId?: number;
    fromDate?: Date;
    toDate?: Date;
    status?: string;
    currency?: string;
  }): Promise<Payment[]> {
    console.log('Getting payments with filters:', filters);
    
    let query = db.select().from(paymentsTable);
    
    // Apply filters
    if (filters) {
      const conditions = [];
      
      if (filters.customerId) {
        conditions.push(eq(paymentsTable.customerId, filters.customerId));
      }
      
      if (filters.fromDate) {
        conditions.push(sql`${paymentsTable.paymentDate} >= ${filters.fromDate}`);
      }
      
      if (filters.toDate) {
        conditions.push(sql`${paymentsTable.paymentDate} <= ${filters.toDate}`);
      }
      
      if (filters.status) {
        conditions.push(eq(paymentsTable.status, filters.status));
      }
      
      if (filters.currency) {
        conditions.push(eq(paymentsTable.currency, filters.currency));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
    }
    
    const payments = await query.orderBy(desc(paymentsTable.paymentDate));
    return payments as Payment[];
  }
  
  async getPaymentAllocations(paymentId: number): Promise<PaymentInvoiceLink[]> {
    console.log(`Getting allocations for payment ${paymentId}`);
    
    const allocations = await db
      .select()
      .from(paymentInvoiceLinksTable)
      .where(eq(paymentInvoiceLinksTable.paymentId, paymentId));
    
    return allocations as PaymentInvoiceLink[];
  }
  
  async allocatePayment(allocation: InsertPaymentInvoiceLink): Promise<PaymentInvoiceLink> {
    console.log('Adding payment allocation:', allocation);
    
    const [insertedAllocation] = await db
      .insert(paymentInvoiceLinksTable)
      .values(allocation)
      .returning();
    
    console.log('Added payment allocation:', insertedAllocation);
    return insertedAllocation as PaymentInvoiceLink;
  }
  
  async updatePayment(id: number, updateData: Partial<Payment>): Promise<Payment> {
    console.log(`Updating payment ${id} with data:`, updateData);
    
    const [updatedPayment] = await db
      .update(paymentsTable)
      .set(updateData)
      .where(eq(paymentsTable.id, id))
      .returning();
    
    if (!updatedPayment) {
      throw new Error("Payment not found");
    }
    
    console.log('Updated payment:', updatedPayment);
    return updatedPayment as Payment;
  }
  
  // Finance - Bank Realization Certificates
  async createBankRealizationCertificate(brc: InsertBankRealizationCertificate): Promise<BankRealizationCertificate> {
    console.log('Creating new BRC:', brc);
    
    const [insertedBRC] = await db
      .insert(bankRealizationCertificatesTable)
      .values(brc)
      .returning();
    
    console.log('Created BRC:', insertedBRC);
    return insertedBRC as BankRealizationCertificate;
  }
  
  async getBankRealizationCertificate(id: number): Promise<BankRealizationCertificate | undefined> {
    console.log(`Getting BRC with ID: ${id}`);
    
    const [brc] = await db
      .select()
      .from(bankRealizationCertificatesTable)
      .where(eq(bankRealizationCertificatesTable.id, id));
    
    return brc as BankRealizationCertificate | undefined;
  }
  
  async getBankRealizationCertificatesForInvoice(invoiceId: number): Promise<BankRealizationCertificate[]> {
    console.log(`Getting BRCs for invoice ${invoiceId}`);
    
    const brcs = await db
      .select()
      .from(bankRealizationCertificatesTable)
      .where(eq(bankRealizationCertificatesTable.relatedInvoiceId, invoiceId));
    
    return brcs as BankRealizationCertificate[];
  }
  
  async updateBankRealizationCertificate(id: number, updateData: Partial<BankRealizationCertificate>): Promise<BankRealizationCertificate> {
    console.log(`Updating BRC ${id} with data:`, updateData);
    
    const [updatedBRC] = await db
      .update(bankRealizationCertificatesTable)
      .set(updateData)
      .where(eq(bankRealizationCertificatesTable.id, id))
      .returning();
    
    if (!updatedBRC) {
      throw new Error("Bank Realization Certificate not found");
    }
    
    console.log('Updated BRC:', updatedBRC);
    return updatedBRC as BankRealizationCertificate;
  }

  // Password Compliance Analysis
  async getPasswordComplianceAnalysis() {
    try {
      const POLICY_ENFORCEMENT_DATE = '2025-07-15 00:00:00';
      
      const nonCompliantUsers = await this.db.execute(sql`
        SELECT 
          id,
          username,
          role,
          last_password_change,
          password_needs_update,
          created_at,
          CASE 
            WHEN last_password_change IS NULL THEN 'Never updated password since policy'
            WHEN last_password_change < ${POLICY_ENFORCEMENT_DATE}::timestamp THEN 'Password predates policy enforcement'
            WHEN password_needs_update = true THEN 'Flagged for password update'
            ELSE 'Unknown compliance issue'
          END AS compliance_issue
        FROM users 
        WHERE is_active = true 
          AND (
            last_password_change IS NULL OR 
            last_password_change < ${POLICY_ENFORCEMENT_DATE}::timestamp OR 
            password_needs_update = true
          )
        ORDER BY 
          CASE role 
            WHEN 'Superuser' THEN 1
            WHEN 'General Manager' THEN 2
            WHEN 'Senior Manager' THEN 3
            WHEN 'Manager' THEN 4
            WHEN 'Employee' THEN 5
            ELSE 6
          END,
          username
      `);

      const complianceSummary = await this.db.execute(sql`
        WITH policy_enforcement AS (
          SELECT ${POLICY_ENFORCEMENT_DATE}::timestamp AS enforcement_date
        ),
        compliance_analysis AS (
          SELECT 
            u.id,
            u.username,
            u.role,
            u.last_password_change,
            u.password_needs_update,
            u.is_active,
            p.enforcement_date,
            CASE 
              WHEN u.last_password_change IS NULL THEN 'No Password Change'
              WHEN u.last_password_change < p.enforcement_date THEN 'Pre-Policy Password'
              ELSE 'Compliant'
            END AS compliance_status,
            CASE 
              WHEN u.last_password_change IS NULL OR 
                   u.last_password_change < p.enforcement_date OR 
                   u.password_needs_update = true THEN true 
              ELSE false 
            END AS non_compliant
          FROM users u
          CROSS JOIN policy_enforcement p
          WHERE u.is_active = true
        )
        SELECT 
          compliance_status,
          COUNT(*) as user_count
        FROM compliance_analysis
        GROUP BY compliance_status
      `);

      const totalUsers = await this.db.execute(sql`
        SELECT COUNT(*) as total FROM users WHERE is_active = true
      `);

      return {
        policyEnforcementDate: POLICY_ENFORCEMENT_DATE,
        nonCompliantUsers: nonCompliantUsers.rows,
        complianceSummary: complianceSummary.rows,
        totalActiveUsers: totalUsers.rows[0]?.total || 0,
        totalNonCompliant: nonCompliantUsers.rows.length
      };
    } catch (error) {
      console.error('Error getting password compliance analysis:', error);
      throw error;
    }
  }
  async getAttributeOptions(type?: string): Promise<any[]> {
    let query = db.select().from(productAttributeOptionsTable);
    if (type) {
      const results = await db.select().from(productAttributeOptionsTable).where(eq(productAttributeOptionsTable.attributeType, type));
      return results;
    }
    return await query;
  }

  async createAttributeOption(data: any): Promise<any> {
    const [result] = await db.insert(productAttributeOptionsTable).values(data).returning();
    return result;
  }

  async updateAttributeOption(id: number, data: any): Promise<any> {
    const [result] = await db.update(productAttributeOptionsTable).set(data).where(eq(productAttributeOptionsTable.id, id)).returning();
    if (!result) throw new Error("Attribute option not found");
    return result;
  }

  async deleteAttributeOption(id: number): Promise<void> {
    await db.delete(productAttributeOptionsTable).where(eq(productAttributeOptionsTable.id, id));
  }

  async getProducts(): Promise<any[]> {
    return await db.select().from(productsTable).orderBy(desc(productsTable.createdAt));
  }

  async getProductById(id: number): Promise<any | undefined> {
    const [result] = await db.select().from(productsTable).where(eq(productsTable.id, id));
    return result;
  }

  async createProduct(data: any): Promise<any> {
    const [result] = await db.insert(productsTable).values(data).returning();
    return result;
  }

  async updateProduct(id: number, data: any): Promise<any> {
    const [result] = await db.update(productsTable).set({ ...data, updatedAt: new Date() }).where(eq(productsTable.id, id)).returning();
    if (!result) throw new Error("Product not found");
    return result;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(productsTable).where(eq(productsTable.id, id));
  }

  async getOffers(showTest: boolean = false): Promise<any[]> {
    // Exclude workflow-internal statuses from normal lists.
    // 'archiving' = save in progress; 'archive_failed' = visible only to admins via retry UI.
    // Use Drizzle select so column names are returned as camelCase (snake_case → camelCase mapping is automatic).
    const rows = await db.select().from(offersTable)
      .where(
        showTest
          ? notInArray(offersTable.status, ['archiving', 'archive_failed'])
          : and(
              eq(offersTable.isTest, false),
              notInArray(offersTable.status, ['archiving', 'archive_failed'])
            )
      )
      .orderBy(desc(offersTable.createdAt));
    return rows;
  }

  async setOfferTestFlag(id: number, isTest: boolean): Promise<void> {
    await db.execute(sql`UPDATE offers SET is_test = ${isTest} WHERE id = ${id}`);
  }

  async setProjectTestFlag(id: number, isTest: boolean): Promise<void> {
    await db.execute(sql`UPDATE projects SET is_test = ${isTest} WHERE id = ${id}`);
  }

  async getOfferById(id: number): Promise<any | undefined> {
    const [result] = await db.select().from(offersTable).where(eq(offersTable.id, id));
    return result;
  }

  async createOffer(data: any): Promise<any> {
    const [result] = await db.insert(offersTable).values(data).returning();
    return result;
  }

  async updateOffer(id: number, data: any): Promise<any> {
    const [result] = await db.update(offersTable).set({ ...data, updatedAt: new Date() }).where(eq(offersTable.id, id)).returning();
    if (!result) throw new Error("Offer not found");
    return result;
  }

  async deleteOffer(id: number): Promise<void> {
    await db.delete(offerItemsTable).where(eq(offerItemsTable.offerId, id));
    await db.delete(offersTable).where(eq(offersTable.id, id));
  }

  async getOfferItems(offerId: number): Promise<any[]> {
    // Only return active items — 'removed' items are soft-deleted for ID stability
    return await db.execute(sql`
      SELECT * FROM offer_items
      WHERE offer_id = ${offerId} AND status = 'active'
      ORDER BY sort_order
    `).then(r => r.rows as any[]);
  }

  async createOfferItem(data: any): Promise<any> {
    const [result] = await db.insert(offerItemsTable).values(data).returning();
    return result;
  }

  async updateOfferItem(id: number, data: any): Promise<any> {
    const [result] = await db.update(offerItemsTable).set(data).where(eq(offerItemsTable.id, id)).returning();
    if (!result) throw new Error("Offer item not found");
    return result;
  }

  async deleteOfferItem(id: number): Promise<void> {
    await db.delete(offerItemsTable).where(eq(offerItemsTable.id, id));
  }

  async getNextOfferNumber(): Promise<string> {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const fyStart = month >= 4 ? year : year - 1;
    const fyEnd = fyStart + 1;
    const fyCode = `${fyStart.toString().slice(2)}${fyEnd.toString().slice(2)}`;
    const prefix = `OFR-${fyCode}-`;

    const result = await db.select({ maxNum: sql<string>`MAX(offer_number)` })
      .from(offersTable)
      .where(sql`offer_number LIKE ${prefix + '%'}`);
    const maxNum = result[0]?.maxNum;
    if (!maxNum) return `${prefix}0001`;
    const lastNum = parseInt(maxNum.split('-').pop() || '0') + 1;
    return `${prefix}${lastNum.toString().padStart(4, '0')}`;
  }

  async getProductChildren(parentProductId: number): Promise<any[]> {
    const links = await db.select().from(productChildrenTable).where(eq(productChildrenTable.parentProductId, parentProductId));
    if (links.length === 0) return [];
    const childIds = links.map(l => l.childProductId);
    const children = await db.select().from(productsTable).where(inArray(productsTable.id, childIds));
    return children;
  }

  async getAllProductChildren(): Promise<any[]> {
    return await db.select().from(productChildrenTable);
  }

  async addProductChild(parentProductId: number, childProductId: number, quantity: number = 1): Promise<any> {
    const [result] = await db.insert(productChildrenTable).values({ parentProductId, childProductId, quantity }).returning();
    return result;
  }

  async updateProductChildQuantity(parentProductId: number, childProductId: number, quantity: number): Promise<any> {
    const [result] = await db.update(productChildrenTable)
      .set({ quantity })
      .where(
        and(
          eq(productChildrenTable.parentProductId, parentProductId),
          eq(productChildrenTable.childProductId, childProductId)
        )
      )
      .returning();
    return result;
  }

  async removeProductChild(parentProductId: number, childProductId: number): Promise<void> {
    await db.delete(productChildrenTable).where(
      and(
        eq(productChildrenTable.parentProductId, parentProductId),
        eq(productChildrenTable.childProductId, childProductId)
      )
    );
  }

  async recalculateParentPrice(parentProductId: number): Promise<any> {
    const links = await db.select().from(productChildrenTable).where(eq(productChildrenTable.parentProductId, parentProductId));
    if (links.length === 0) return await this.getProductById(parentProductId);
    const childIds = links.map(l => l.childProductId);
    const children = await db.select().from(productsTable).where(inArray(productsTable.id, childIds));
    const totalPrice = links.reduce((sum: number, link: any) => {
      const child = children.find((c: any) => c.id === link.childProductId);
      return sum + (parseFloat(child?.unitPrice || '0') * (link.quantity || 1));
    }, 0);
    return await this.updateProduct(parentProductId, { unitPrice: totalPrice.toFixed(2) });
  }
}

export const storage = new DatabaseStorage();
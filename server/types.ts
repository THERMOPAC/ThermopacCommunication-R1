import { 
  User, Task, InsertUser, InsertTask, TaskHistory, InsertTaskHistory, 
  WorkflowRecommendation, InsertWorkflowRecommendation, 
  Achievement, InsertAchievement, UserAchievement, InsertUserAchievement,
  ProductivityMetric, InsertProductivityMetric,
  RecurringPattern, InsertRecurringPattern, RecurringTask, InsertRecurringTask,
  GmailToken, InsertGmailToken, GmailMessage, InsertGmailMessage, 
  GmailSettings, InsertGmailSettings
} from "@shared/schema";
import { Store } from "express-session";

export interface UserUpdate {
  username?: string;
  password?: string;
  email?: string;
  mobileNumber?: string;
  countryCode?: string;
  role?: "Superuser" | "General Manager" | "Senior Manager" | "Manager" | "Employee";
  reportingManagerId?: number | null;
}

export interface IStorage {
  sessionStore: Store;
  
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updateData: UserUpdate): Promise<User>;
  deleteUser(id: number): Promise<void>;
  getAllUsers(): Promise<User[]>;
  getSubordinates(managerId: number): Promise<User[]>;
  
  // Task management
  createTask(task: InsertTask): Promise<Task>;
  getTasksForUser(userId: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  updateTask(id: number, updateData: Partial<Task>): Promise<Task>;
  
  // Task history
  createTaskHistory(taskHistory: InsertTaskHistory): Promise<TaskHistory>;
  getTaskHistory(taskId: number): Promise<TaskHistory[]>;
  
  // Workflow recommendations
  createRecommendation(recommendation: InsertWorkflowRecommendation): Promise<WorkflowRecommendation>;
  getRecommendationsForUser(userId: number): Promise<WorkflowRecommendation[]>;
  getActiveRecommendations(userId: number): Promise<WorkflowRecommendation[]>;
  updateRecommendation(id: number, updateData: Partial<WorkflowRecommendation>): Promise<WorkflowRecommendation>;
  
  // Recommendation generation
  generateTaskAssignmentRecommendations(userId: number): Promise<WorkflowRecommendation[]>;
  generatePriorityAdjustmentRecommendations(userId: number): Promise<WorkflowRecommendation[]>;
  generateFollowUpRecommendations(userId: number): Promise<WorkflowRecommendation[]>;
  generateTeamCollaborationRecommendations?(userId: number): Promise<WorkflowRecommendation[]>;
  generateDeadlineReminderRecommendations?(userId: number): Promise<WorkflowRecommendation[]>;
  
  // Achievement management
  getAllAchievements(): Promise<Achievement[]>;
  getAchievement(id: number): Promise<Achievement | undefined>;
  createAchievement(achievement: InsertAchievement): Promise<Achievement>;
  getUserAchievements(userId: number): Promise<UserAchievement[]>;
  awardAchievement(userAchievement: InsertUserAchievement): Promise<UserAchievement>;
  
  // Productivity metrics
  getProductivityMetric(userId: number): Promise<ProductivityMetric | undefined>;
  createProductivityMetric(metric: InsertProductivityMetric): Promise<ProductivityMetric>;
  updateProductivityMetric(userId: number, updates: Partial<ProductivityMetric>): Promise<ProductivityMetric>;
  
  // Leaderboard
  getTeamLeaderboard(teamId?: number): Promise<ProductivityMetric[]>;
  getTopPerformers(limit?: number): Promise<ProductivityMetric[]>;
  getUserRank(userId: number): Promise<{rank: number, totalUsers: number}>;
  
  // Achievement tracking
  checkAndAwardAchievements(userId: number): Promise<UserAchievement[]>;
  calculateProductivityScore(userId: number): Promise<number>;
  updateUserProductivityStats(userId: number): Promise<ProductivityMetric>;
  
  // Recurring Task Pattern Management
  createRecurringPattern(pattern: InsertRecurringPattern): Promise<RecurringPattern>;
  getRecurringPattern(id: number): Promise<RecurringPattern | undefined>;
  updateRecurringPattern(id: number, updateData: Partial<RecurringPattern>): Promise<RecurringPattern>;
  deleteRecurringPattern(id: number): Promise<void>;
  getUserRecurringPatterns(userId: number): Promise<RecurringPattern[]>;
  getActiveRecurringPatterns(): Promise<RecurringPattern[]>;
  processRecurringPatterns(): Promise<number>; // Generates new tasks from due patterns and returns count of tasks created
  
  // Gmail Integration
  saveGmailToken(token: InsertGmailToken): Promise<GmailToken>;
  getGmailToken(userId: number): Promise<GmailToken | undefined>;
  updateGmailToken(userId: number, updateData: Partial<GmailToken>): Promise<GmailToken>;
  deleteGmailToken(userId: number): Promise<void>;
  
  // Gmail Messages
  saveGmailMessage(message: InsertGmailMessage): Promise<GmailMessage>;
  getGmailMessagesForUser(userId: number, filters?: {
    isRead?: boolean;
    isImportant?: boolean;
    from?: string;
    to?: string;
    subject?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<GmailMessage[]>;
  getGmailMessage(id: number): Promise<GmailMessage | undefined>;
  updateGmailMessage(id: number, updateData: Partial<GmailMessage>): Promise<GmailMessage>;
  deleteGmailMessage(id: number): Promise<void>;
  
  // Gmail Settings
  saveGmailSettings(settings: InsertGmailSettings): Promise<GmailSettings>;
  getGmailSettings(userId: number): Promise<GmailSettings | undefined>;
  updateGmailSettings(userId: number, updateData: Partial<GmailSettings>): Promise<GmailSettings>;
}
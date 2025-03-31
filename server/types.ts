import { User, Task, InsertUser, InsertTask, TaskHistory, InsertTaskHistory, WorkflowRecommendation, InsertWorkflowRecommendation } from "@shared/schema";
import { Store } from "express-session";

export interface UserUpdate {
  username?: string;
  password?: string;
  email?: string;
  mobileNumber?: string;
  countryCode?: string;
  role?: string;
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
}
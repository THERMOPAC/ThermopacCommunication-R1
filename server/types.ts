import { 
  User, Task, InsertUser, InsertTask, TaskHistory, InsertTaskHistory, 
  WorkflowRecommendation, InsertWorkflowRecommendation, 
  Achievement, InsertAchievement, UserAchievement, InsertUserAchievement,
  ProductivityMetric, InsertProductivityMetric,
  RecurringPattern, InsertRecurringPattern, RecurringTask, InsertRecurringTask,
  GmailToken, InsertGmailToken, GmailMessage, InsertGmailMessage, 
  GmailSettings, InsertGmailSettings,
  InternalMessage, InsertInternalMessage,
  Customer, InsertCustomer,
  Project, InsertProject,
  ProjectPhase, InsertProjectPhase,
  ProjectMember, InsertProjectMember,
  Deliverable, InsertDeliverable,
  ProjectTask, InsertProjectTask,
  PhaseApproval, InsertPhaseApproval,
  ProjectDocument, InsertProjectDocument,
  MasterItem, InsertMasterItem,
  ProjectItem, InsertProjectItem,
  Invoice, InsertInvoice,
  InvoiceItem, InsertInvoiceItem,
  Payment, InsertPayment,
  PaymentInvoiceLink, InsertPaymentInvoiceLink,
  BankRealizationCertificate, InsertBankRealizationCertificate
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
  
  // Google OAuth Integration
  saveGoogleTokens(userId: number, tokens: any): Promise<GmailToken>;
  getGoogleTokens(userId: number): Promise<GmailToken | undefined>;
  deleteGoogleTokens(userId: number): Promise<void>;
  
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
    excludeSpam?: boolean;
  }): Promise<GmailMessage[]>;
  getGmailMessage(id: number): Promise<GmailMessage | undefined>;
  updateGmailMessage(id: number, updateData: Partial<GmailMessage>): Promise<GmailMessage>;
  deleteGmailMessage(id: number): Promise<void>;
  
  // Gmail Settings
  saveGmailSettings(settings: InsertGmailSettings): Promise<GmailSettings>;
  getGmailSettings(userId: number): Promise<GmailSettings | undefined>;
  updateGmailSettings(userId: number, updateData: Partial<GmailSettings>): Promise<GmailSettings>;
  
  // Internal Messages
  createInternalMessage(message: InsertInternalMessage): Promise<InternalMessage>;
  getInternalMessagesForUser(userId: number, filters?: {
    type?: 'inbox' | 'sent';
    search?: string;
  }): Promise<InternalMessage[]>;
  getInternalMessage(id: number): Promise<InternalMessage | undefined>;
  updateInternalMessage(id: number, updateData: Partial<InternalMessage>): Promise<InternalMessage>;
  deleteInternalMessage(id: number): Promise<void>;
  
  // Project Management
  // Customers
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  getAllCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  getCustomerByBPCode(bpCode: string): Promise<Customer | undefined>;
  updateCustomer(id: number, updateData: Partial<Customer>): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;
  
  // Projects
  createProject(project: InsertProject): Promise<Project>;
  getProject(id: number): Promise<Project | undefined>;
  updateProject(id: number, updateData: Partial<Project>): Promise<Project>;
  getUserProjects(userId: number): Promise<Project[]>;
  getAllProjects(): Promise<Project[]>;
  
  // Project Phases
  createProjectPhase(phase: InsertProjectPhase): Promise<ProjectPhase>;
  getProjectPhases(projectId: number): Promise<ProjectPhase[]>;
  getProjectPhase(id: number): Promise<ProjectPhase | undefined>;
  updateProjectPhase(id: number, updateData: Partial<ProjectPhase>): Promise<ProjectPhase>;
  
  // Project Members
  addProjectMember(projectMember: InsertProjectMember): Promise<ProjectMember>;
  getProjectMembers(projectId: number): Promise<ProjectMember[]>;
  removeProjectMember(projectId: number, userId: number): Promise<void>;
  updateProjectMember(projectId: number, userId: number, updateData: Partial<ProjectMember>): Promise<ProjectMember>;
  
  // Deliverables
  createDeliverable(deliverable: InsertDeliverable): Promise<Deliverable>;
  getPhaseDeliverables(phaseId: number): Promise<Deliverable[]>;
  getDeliverable(id: number): Promise<Deliverable | undefined>;
  updateDeliverable(id: number, updateData: Partial<Deliverable>): Promise<Deliverable>;
  
  // Project Tasks
  createProjectTask(task: InsertProjectTask): Promise<ProjectTask>;
  getProjectTasks(projectId: number): Promise<ProjectTask[]>;
  getPhaseProjectTasks(phaseId: number): Promise<ProjectTask[]>;
  getProjectTask(id: number): Promise<ProjectTask | undefined>;
  updateProjectTask(id: number, updateData: Partial<ProjectTask>): Promise<ProjectTask>;
  
  // Phase Approvals
  createPhaseApproval(approval: InsertPhaseApproval): Promise<PhaseApproval>;
  getPhaseApprovals(phaseId: number): Promise<PhaseApproval[]>;
  updatePhaseApproval(id: number, updateData: Partial<PhaseApproval>): Promise<PhaseApproval>;
  
  // Project Documents
  createProjectDocument(document: InsertProjectDocument): Promise<ProjectDocument>;
  getProjectDocuments(projectId: number): Promise<ProjectDocument[]>;
  getPhaseDocuments(phaseId: number): Promise<ProjectDocument[]>;
  getProjectDocument(id: number): Promise<ProjectDocument | undefined>;
  updateProjectDocument(id: number, updateData: Partial<ProjectDocument>): Promise<ProjectDocument>;
  
  // Master Items
  createMasterItem(item: InsertMasterItem): Promise<MasterItem>;
  getMasterItemByCode(itemCode: string): Promise<MasterItem | undefined>;
  getMasterItem(id: number): Promise<MasterItem | undefined>;
  getAllMasterItems(): Promise<MasterItem[]>;
  updateMasterItem(id: number, updateData: Partial<MasterItem>): Promise<MasterItem>;
  
  // Project Items
  createProjectItem(item: InsertProjectItem): Promise<ProjectItem>;
  getProjectItems(projectId: number): Promise<ProjectItem[]>;
  getProjectItemsByCode(projectCode: string): Promise<ProjectItem[]>;
  getProjectItem(id: number): Promise<ProjectItem | undefined>;
  getProjectItemByItemIdAndProject(itemId: number, projectId: number): Promise<ProjectItem | undefined>;
  updateProjectItem(id: number, updateData: Partial<ProjectItem>): Promise<ProjectItem>;
  deleteProjectItem(id: number): Promise<void>;
  deleteProjectItems(projectId: number): Promise<number>;
  
  // Finance - Invoices
  createInvoice(invoice: InsertInvoice, items: InsertInvoiceItem[]): Promise<Invoice>;
  getInvoice(id: number): Promise<Invoice | undefined>;
  getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined>;
  getInvoices(filters?: {
    customerId?: number;
    projectId?: number;
    fromDate?: Date;
    toDate?: Date;
    status?: string;
    currency?: string;
  }): Promise<Invoice[]>;
  updateInvoice(id: number, updateData: Partial<Invoice>): Promise<Invoice>;
  
  // Finance - Invoice Items
  getInvoiceItems(invoiceId: number): Promise<InvoiceItem[]>;
  addInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem>;
  updateInvoiceItem(id: number, updateData: Partial<InvoiceItem>): Promise<InvoiceItem>;
  deleteInvoiceItem(id: number): Promise<void>;
  
  // Finance - Payments and Allocations
  createPayment(payment: InsertPayment, allocations?: InsertPaymentInvoiceLink[]): Promise<Payment>;
  getPayment(id: number): Promise<Payment | undefined>;
  getPayments(filters?: {
    customerId?: number;
    fromDate?: Date;
    toDate?: Date;
    status?: string;
    currency?: string;
  }): Promise<Payment[]>;
  getPaymentAllocations(paymentId: number): Promise<PaymentInvoiceLink[]>;
  allocatePayment(allocation: InsertPaymentInvoiceLink): Promise<PaymentInvoiceLink>;
  updatePayment(id: number, updateData: Partial<Payment>): Promise<Payment>;
  
  // Finance - Bank Realization Certificates
  createBankRealizationCertificate(brc: InsertBankRealizationCertificate): Promise<BankRealizationCertificate>;
  getBankRealizationCertificate(id: number): Promise<BankRealizationCertificate | undefined>;
  getBankRealizationCertificatesForPayment(paymentId: number): Promise<BankRealizationCertificate[]>;
  updateBankRealizationCertificate(id: number, updateData: Partial<BankRealizationCertificate>): Promise<BankRealizationCertificate>;
}
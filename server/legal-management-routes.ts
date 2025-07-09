import { Router } from "express";
import { db } from "./db";
import { 
  contracts, 
  legalCases, 
  complianceRegister, 
  poshCases, 
  legalNotices, 
  externalCounsel, 
  policyTemplates,
  legalAlerts,
  users,
  insertContractSchema,
  insertLegalCaseSchema,
  insertComplianceRegisterSchema,
  insertPoshCaseSchema,
  insertLegalNoticeSchema,
  insertExternalCounselSchema,
  insertPolicyTemplateSchema,
  insertLegalAlertSchema
} from "@shared/schema";
import { eq, desc, asc, sql, and, or, gte, lte, like, isNull, isNotNull } from "drizzle-orm";
import { ensureAuthenticated } from "./auth-middleware";
import multer from "multer";
import { uploadFileToGCS } from "./utils/gcs-operations";
import { z } from "zod";

const router = Router();

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ==================== CONTRACTS ====================

// Get all contracts
router.get("/contracts", ensureAuthenticated, async (req, res) => {
  try {
    const { status, contractType, sortBy = "createdAt", sortOrder = "desc" } = req.query;
    
    let query = db
      .select({
        id: contracts.id,
        contractNumber: contracts.contractNumber,
        title: contracts.title,
        description: contracts.description,
        contractType: contracts.contractType,
        partyName: contracts.partyName,
        partyContact: contracts.partyContact,
        partyEmail: contracts.partyEmail,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
        renewalDate: contracts.renewalDate,
        contractValue: contracts.contractValue,
        currency: contracts.currency,
        status: contracts.status,
        autoRenewal: contracts.autoRenewal,
        noticePeriodDays: contracts.noticePeriodDays,
        filePath: contracts.filePath,
        fileUrl: contracts.fileUrl,
        createdAt: contracts.createdAt,
        updatedAt: contracts.updatedAt,
        createdBy: contracts.createdBy,
        assignedTo: contracts.assignedTo,
        createdByName: users.username,
        assignedToName: sql<string>`assigned_user.username`
      })
      .from(contracts)
      .leftJoin(users, eq(contracts.createdBy, users.id))
      .leftJoin(sql`users assigned_user`, eq(contracts.assignedTo, sql`assigned_user.id`));

    // Apply filters
    if (status) {
      query = query.where(eq(contracts.status, status as string));
    }
    
    if (contractType) {
      query = query.where(eq(contracts.contractType, contractType as string));
    }

    // Apply sorting
    const orderColumn = sortBy === "contractNumber" ? contracts.contractNumber :
                       sortBy === "title" ? contracts.title :
                       sortBy === "partyName" ? contracts.partyName :
                       sortBy === "startDate" ? contracts.startDate :
                       sortBy === "endDate" ? contracts.endDate :
                       contracts.createdAt;
    
    query = query.orderBy(sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn));

    const contractsList = await query;
    res.json(contractsList);
  } catch (error) {
    console.error("Error fetching contracts:", error);
    res.status(500).json({ error: "Failed to fetch contracts" });
  }
});

// Get contract by ID
router.get("/contracts/:id", ensureAuthenticated, async (req, res) => {
  try {
    const contractId = parseInt(req.params.id);
    const [contract] = await db
      .select({
        id: contracts.id,
        contractNumber: contracts.contractNumber,
        title: contracts.title,
        description: contracts.description,
        contractType: contracts.contractType,
        partyName: contracts.partyName,
        partyContact: contracts.partyContact,
        partyEmail: contracts.partyEmail,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
        renewalDate: contracts.renewalDate,
        contractValue: contracts.contractValue,
        currency: contracts.currency,
        status: contracts.status,
        autoRenewal: contracts.autoRenewal,
        noticePeriodDays: contracts.noticePeriodDays,
        filePath: contracts.filePath,
        fileUrl: contracts.fileUrl,
        createdAt: contracts.createdAt,
        updatedAt: contracts.updatedAt,
        createdBy: contracts.createdBy,
        assignedTo: contracts.assignedTo,
        createdByName: users.username,
        assignedToName: sql<string>`assigned_user.username`
      })
      .from(contracts)
      .leftJoin(users, eq(contracts.createdBy, users.id))
      .leftJoin(sql`users assigned_user`, eq(contracts.assignedTo, sql`assigned_user.id`))
      .where(eq(contracts.id, contractId));

    if (!contract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    res.json(contract);
  } catch (error) {
    console.error("Error fetching contract:", error);
    res.status(500).json({ error: "Failed to fetch contract" });
  }
});

// Create contract
router.post("/contracts", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const validatedData = insertContractSchema.parse(req.body);
    
    let filePath = null;
    let fileUrl = null;
    
    if (req.file) {
      const fileName = `contracts/${Date.now()}-${req.file.originalname}`;
      const uploadResult = await uploadFileToGCS(req.file.buffer, fileName, req.file.mimetype);
      filePath = uploadResult.fileName;
      fileUrl = uploadResult.publicUrl;
    }

    const [newContract] = await db
      .insert(contracts)
      .values({
        ...validatedData,
        filePath,
        fileUrl,
        createdBy: userId,
        updatedAt: new Date()
      })
      .returning();

    res.status(201).json(newContract);
  } catch (error) {
    console.error("Error creating contract:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to create contract" });
    }
  }
});

// Update contract
router.put("/contracts/:id", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    const contractId = parseInt(req.params.id);
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const validatedData = insertContractSchema.parse(req.body);
    
    let filePath = validatedData.filePath;
    let fileUrl = validatedData.fileUrl;
    
    if (req.file) {
      const fileName = `contracts/${Date.now()}-${req.file.originalname}`;
      const uploadResult = await uploadFileToGCS(req.file.buffer, fileName, req.file.mimetype);
      filePath = uploadResult.fileName;
      fileUrl = uploadResult.publicUrl;
    }

    const [updatedContract] = await db
      .update(contracts)
      .set({
        ...validatedData,
        filePath,
        fileUrl,
        updatedAt: new Date()
      })
      .where(eq(contracts.id, contractId))
      .returning();

    if (!updatedContract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    res.json(updatedContract);
  } catch (error) {
    console.error("Error updating contract:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to update contract" });
    }
  }
});

// Delete contract
router.delete("/contracts/:id", ensureAuthenticated, async (req, res) => {
  try {
    const contractId = parseInt(req.params.id);
    
    const [deletedContract] = await db
      .delete(contracts)
      .where(eq(contracts.id, contractId))
      .returning();

    if (!deletedContract) {
      return res.status(404).json({ error: "Contract not found" });
    }

    res.json({ message: "Contract deleted successfully" });
  } catch (error) {
    console.error("Error deleting contract:", error);
    res.status(500).json({ error: "Failed to delete contract" });
  }
});

// ==================== LEGAL CASES ====================

// Get all legal cases
router.get("/cases", ensureAuthenticated, async (req, res) => {
  try {
    const { status, caseType, priority, sortBy = "createdAt", sortOrder = "desc" } = req.query;
    
    let query = db
      .select({
        id: legalCases.id,
        caseNumber: legalCases.caseNumber,
        caseTitle: legalCases.caseTitle,
        caseType: legalCases.caseType,
        caseStatus: legalCases.caseStatus,
        courtName: legalCases.courtName,
        judgeName: legalCases.judgeName,
        opposingParty: legalCases.opposingParty,
        caseValue: legalCases.caseValue,
        currency: legalCases.currency,
        filingDate: legalCases.filingDate,
        nextHearingDate: legalCases.nextHearingDate,
        expectedClosureDate: legalCases.expectedClosureDate,
        priority: legalCases.priority,
        description: legalCases.description,
        outcome: legalCases.outcome,
        createdAt: legalCases.createdAt,
        updatedAt: legalCases.updatedAt,
        createdBy: legalCases.createdBy,
        internalCounsel: legalCases.internalCounsel,
        externalCounselId: legalCases.externalCounselId,
        createdByName: users.username,
        internalCounselName: sql<string>`internal_counsel.username`,
        externalCounselName: sql<string>`external_counsel.firm_name`
      })
      .from(legalCases)
      .leftJoin(users, eq(legalCases.createdBy, users.id))
      .leftJoin(sql`users internal_counsel`, eq(legalCases.internalCounsel, sql`internal_counsel.id`))
      .leftJoin(sql`external_counsel`, eq(legalCases.externalCounselId, sql`external_counsel.id`));

    // Apply filters
    if (status) {
      query = query.where(eq(legalCases.caseStatus, status as string));
    }
    
    if (caseType) {
      query = query.where(eq(legalCases.caseType, caseType as string));
    }
    
    if (priority) {
      query = query.where(eq(legalCases.priority, priority as string));
    }

    // Apply sorting
    const orderColumn = sortBy === "caseNumber" ? legalCases.caseNumber :
                       sortBy === "caseTitle" ? legalCases.caseTitle :
                       sortBy === "filingDate" ? legalCases.filingDate :
                       sortBy === "nextHearingDate" ? legalCases.nextHearingDate :
                       legalCases.createdAt;
    
    query = query.orderBy(sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn));

    const casesList = await query;
    res.json(casesList);
  } catch (error) {
    console.error("Error fetching legal cases:", error);
    res.status(500).json({ error: "Failed to fetch legal cases" });
  }
});

// Create legal case
router.post("/cases", ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const validatedData = insertLegalCaseSchema.parse(req.body);

    const [newCase] = await db
      .insert(legalCases)
      .values({
        ...validatedData,
        createdBy: userId,
        updatedAt: new Date()
      })
      .returning();

    res.status(201).json(newCase);
  } catch (error) {
    console.error("Error creating legal case:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to create legal case" });
    }
  }
});

// Update legal case
router.put("/cases/:id", ensureAuthenticated, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id);
    const validatedData = insertLegalCaseSchema.parse(req.body);

    const [updatedCase] = await db
      .update(legalCases)
      .set({
        ...validatedData,
        updatedAt: new Date()
      })
      .where(eq(legalCases.id, caseId))
      .returning();

    if (!updatedCase) {
      return res.status(404).json({ error: "Legal case not found" });
    }

    res.json(updatedCase);
  } catch (error) {
    console.error("Error updating legal case:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to update legal case" });
    }
  }
});

// Delete legal case
router.delete("/cases/:id", ensureAuthenticated, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id);
    
    const [deletedCase] = await db
      .delete(legalCases)
      .where(eq(legalCases.id, caseId))
      .returning();

    if (!deletedCase) {
      return res.status(404).json({ error: "Legal case not found" });
    }

    res.json({ message: "Legal case deleted successfully" });
  } catch (error) {
    console.error("Error deleting legal case:", error);
    res.status(500).json({ error: "Failed to delete legal case" });
  }
});

// ==================== COMPLIANCE REGISTER ====================

// Get all compliance items
router.get("/compliance", ensureAuthenticated, async (req, res) => {
  try {
    const { status, complianceType, sortBy = "dueDate", sortOrder = "asc" } = req.query;
    
    let query = db
      .select({
        id: complianceRegister.id,
        complianceType: complianceRegister.complianceType,
        regulationName: complianceRegister.regulationName,
        applicableSection: complianceRegister.applicableSection,
        complianceRequirement: complianceRegister.complianceRequirement,
        frequency: complianceRegister.frequency,
        dueDate: complianceRegister.dueDate,
        completionDate: complianceRegister.completionDate,
        status: complianceRegister.status,
        responsiblePerson: complianceRegister.responsiblePerson,
        complianceEvidence: complianceRegister.complianceEvidence,
        filePath: complianceRegister.filePath,
        fileUrl: complianceRegister.fileUrl,
        penaltyAmount: complianceRegister.penaltyAmount,
        remarks: complianceRegister.remarks,
        createdAt: complianceRegister.createdAt,
        updatedAt: complianceRegister.updatedAt,
        createdBy: complianceRegister.createdBy,
        createdByName: users.username,
        responsiblePersonName: sql<string>`responsible_user.username`
      })
      .from(complianceRegister)
      .leftJoin(users, eq(complianceRegister.createdBy, users.id))
      .leftJoin(sql`users responsible_user`, eq(complianceRegister.responsiblePerson, sql`responsible_user.id`));

    // Apply filters
    if (status) {
      query = query.where(eq(complianceRegister.status, status as string));
    }
    
    if (complianceType) {
      query = query.where(eq(complianceRegister.complianceType, complianceType as string));
    }

    // Apply sorting
    const orderColumn = sortBy === "regulationName" ? complianceRegister.regulationName :
                       sortBy === "dueDate" ? complianceRegister.dueDate :
                       sortBy === "completionDate" ? complianceRegister.completionDate :
                       complianceRegister.createdAt;
    
    query = query.orderBy(sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn));

    const complianceList = await query;
    res.json(complianceList);
  } catch (error) {
    console.error("Error fetching compliance items:", error);
    res.status(500).json({ error: "Failed to fetch compliance items" });
  }
});

// Create compliance item
router.post("/compliance", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const validatedData = insertComplianceRegisterSchema.parse(req.body);
    
    let filePath = null;
    let fileUrl = null;
    
    if (req.file) {
      const fileName = `compliance/${Date.now()}-${req.file.originalname}`;
      const uploadResult = await uploadFileToGCS(req.file.buffer, fileName, req.file.mimetype);
      filePath = uploadResult.fileName;
      fileUrl = uploadResult.publicUrl;
    }

    const [newCompliance] = await db
      .insert(complianceRegister)
      .values({
        ...validatedData,
        filePath,
        fileUrl,
        createdBy: userId,
        updatedAt: new Date()
      })
      .returning();

    res.status(201).json(newCompliance);
  } catch (error) {
    console.error("Error creating compliance item:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to create compliance item" });
    }
  }
});

// Update compliance item
router.put("/compliance/:id", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    const complianceId = parseInt(req.params.id);
    const validatedData = insertComplianceRegisterSchema.parse(req.body);
    
    let filePath = validatedData.filePath;
    let fileUrl = validatedData.fileUrl;
    
    if (req.file) {
      const fileName = `compliance/${Date.now()}-${req.file.originalname}`;
      const uploadResult = await uploadFileToGCS(req.file.buffer, fileName, req.file.mimetype);
      filePath = uploadResult.fileName;
      fileUrl = uploadResult.publicUrl;
    }

    const [updatedCompliance] = await db
      .update(complianceRegister)
      .set({
        ...validatedData,
        filePath,
        fileUrl,
        updatedAt: new Date()
      })
      .where(eq(complianceRegister.id, complianceId))
      .returning();

    if (!updatedCompliance) {
      return res.status(404).json({ error: "Compliance item not found" });
    }

    res.json(updatedCompliance);
  } catch (error) {
    console.error("Error updating compliance item:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to update compliance item" });
    }
  }
});

// Delete compliance item
router.delete("/compliance/:id", ensureAuthenticated, async (req, res) => {
  try {
    const complianceId = parseInt(req.params.id);
    
    const [deletedCompliance] = await db
      .delete(complianceRegister)
      .where(eq(complianceRegister.id, complianceId))
      .returning();

    if (!deletedCompliance) {
      return res.status(404).json({ error: "Compliance item not found" });
    }

    res.json({ message: "Compliance item deleted successfully" });
  } catch (error) {
    console.error("Error deleting compliance item:", error);
    res.status(500).json({ error: "Failed to delete compliance item" });
  }
});

// ==================== POSH CASES ====================

// Get all POSH cases
router.get("/posh-cases", ensureAuthenticated, async (req, res) => {
  try {
    const { status, caseType, priority, sortBy = "createdAt", sortOrder = "desc" } = req.query;
    
    let query = db
      .select({
        id: poshCases.id,
        caseNumber: poshCases.caseNumber,
        complaintDate: poshCases.complaintDate,
        complainantName: poshCases.complainantName,
        complainantDesignation: poshCases.complainantDesignation,
        complainantDepartment: poshCases.complainantDepartment,
        respondentName: poshCases.respondentName,
        respondentDesignation: poshCases.respondentDesignation,
        respondentDepartment: poshCases.respondentDepartment,
        incidentDate: poshCases.incidentDate,
        incidentLocation: poshCases.incidentLocation,
        caseType: poshCases.caseType,
        caseStatus: poshCases.caseStatus,
        priority: poshCases.priority,
        description: poshCases.description,
        actionTaken: poshCases.actionTaken,
        outcome: poshCases.outcome,
        closureDate: poshCases.closureDate,
        committeeMembers: poshCases.committeeMembers,
        investigationOfficer: poshCases.investigationOfficer,
        filePath: poshCases.filePath,
        fileUrl: poshCases.fileUrl,
        confidentialityLevel: poshCases.confidentialityLevel,
        createdAt: poshCases.createdAt,
        updatedAt: poshCases.updatedAt,
        createdBy: poshCases.createdBy,
        createdByName: users.username,
        investigationOfficerName: sql<string>`investigation_officer.username`
      })
      .from(poshCases)
      .leftJoin(users, eq(poshCases.createdBy, users.id))
      .leftJoin(sql`users investigation_officer`, eq(poshCases.investigationOfficer, sql`investigation_officer.id`));

    // Apply filters
    if (status) {
      query = query.where(eq(poshCases.caseStatus, status as string));
    }
    
    if (caseType) {
      query = query.where(eq(poshCases.caseType, caseType as string));
    }
    
    if (priority) {
      query = query.where(eq(poshCases.priority, priority as string));
    }

    // Apply sorting
    const orderColumn = sortBy === "caseNumber" ? poshCases.caseNumber :
                       sortBy === "complaintDate" ? poshCases.complaintDate :
                       sortBy === "complainantName" ? poshCases.complainantName :
                       sortBy === "respondentName" ? poshCases.respondentName :
                       poshCases.createdAt;
    
    query = query.orderBy(sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn));

    const poshCasesList = await query;
    res.json(poshCasesList);
  } catch (error) {
    console.error("Error fetching POSH cases:", error);
    res.status(500).json({ error: "Failed to fetch POSH cases" });
  }
});

// Create POSH case
router.post("/posh-cases", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const validatedData = insertPoshCaseSchema.parse(req.body);
    
    let filePath = null;
    let fileUrl = null;
    
    if (req.file) {
      const fileName = `posh-cases/${Date.now()}-${req.file.originalname}`;
      const uploadResult = await uploadFileToGCS(req.file.buffer, fileName, req.file.mimetype);
      filePath = uploadResult.fileName;
      fileUrl = uploadResult.publicUrl;
    }

    const [newPoshCase] = await db
      .insert(poshCases)
      .values({
        ...validatedData,
        filePath,
        fileUrl,
        createdBy: userId,
        updatedAt: new Date()
      })
      .returning();

    res.status(201).json(newPoshCase);
  } catch (error) {
    console.error("Error creating POSH case:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to create POSH case" });
    }
  }
});

// Update POSH case
router.put("/posh-cases/:id", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    const poshCaseId = parseInt(req.params.id);
    const validatedData = insertPoshCaseSchema.parse(req.body);
    
    let filePath = validatedData.filePath;
    let fileUrl = validatedData.fileUrl;
    
    if (req.file) {
      const fileName = `posh-cases/${Date.now()}-${req.file.originalname}`;
      const uploadResult = await uploadFileToGCS(req.file.buffer, fileName, req.file.mimetype);
      filePath = uploadResult.fileName;
      fileUrl = uploadResult.publicUrl;
    }

    const [updatedPoshCase] = await db
      .update(poshCases)
      .set({
        ...validatedData,
        filePath,
        fileUrl,
        updatedAt: new Date()
      })
      .where(eq(poshCases.id, poshCaseId))
      .returning();

    if (!updatedPoshCase) {
      return res.status(404).json({ error: "POSH case not found" });
    }

    res.json(updatedPoshCase);
  } catch (error) {
    console.error("Error updating POSH case:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to update POSH case" });
    }
  }
});

// Delete POSH case
router.delete("/posh-cases/:id", ensureAuthenticated, async (req, res) => {
  try {
    const poshCaseId = parseInt(req.params.id);
    
    const [deletedPoshCase] = await db
      .delete(poshCases)
      .where(eq(poshCases.id, poshCaseId))
      .returning();

    if (!deletedPoshCase) {
      return res.status(404).json({ error: "POSH case not found" });
    }

    res.json({ message: "POSH case deleted successfully" });
  } catch (error) {
    console.error("Error deleting POSH case:", error);
    res.status(500).json({ error: "Failed to delete POSH case" });
  }
});

// ==================== LEGAL NOTICES ====================

// Get all legal notices
router.get("/notices", ensureAuthenticated, async (req, res) => {
  try {
    const { status, noticeType, priority, sortBy = "createdAt", sortOrder = "desc" } = req.query;
    
    let query = db
      .select({
        id: legalNotices.id,
        noticeNumber: legalNotices.noticeNumber,
        noticeType: legalNotices.noticeType,
        fromParty: legalNotices.fromParty,
        toParty: legalNotices.toParty,
        subject: legalNotices.subject,
        noticeDate: legalNotices.noticeDate,
        responseDueDate: legalNotices.responseDueDate,
        responseDate: legalNotices.responseDate,
        status: legalNotices.status,
        priority: legalNotices.priority,
        description: legalNotices.description,
        responseSummary: legalNotices.responseSummary,
        actionRequired: legalNotices.actionRequired,
        assignedTo: legalNotices.assignedTo,
        filePath: legalNotices.filePath,
        fileUrl: legalNotices.fileUrl,
        createdAt: legalNotices.createdAt,
        updatedAt: legalNotices.updatedAt,
        createdBy: legalNotices.createdBy,
        createdByName: users.username,
        assignedToName: sql<string>`assigned_user.username`
      })
      .from(legalNotices)
      .leftJoin(users, eq(legalNotices.createdBy, users.id))
      .leftJoin(sql`users assigned_user`, eq(legalNotices.assignedTo, sql`assigned_user.id`));

    // Apply filters
    if (status) {
      query = query.where(eq(legalNotices.status, status as string));
    }
    
    if (noticeType) {
      query = query.where(eq(legalNotices.noticeType, noticeType as string));
    }
    
    if (priority) {
      query = query.where(eq(legalNotices.priority, priority as string));
    }

    // Apply sorting
    const orderColumn = sortBy === "noticeNumber" ? legalNotices.noticeNumber :
                       sortBy === "subject" ? legalNotices.subject :
                       sortBy === "noticeDate" ? legalNotices.noticeDate :
                       sortBy === "responseDueDate" ? legalNotices.responseDueDate :
                       legalNotices.createdAt;
    
    query = query.orderBy(sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn));

    const noticesList = await query;
    res.json(noticesList);
  } catch (error) {
    console.error("Error fetching legal notices:", error);
    res.status(500).json({ error: "Failed to fetch legal notices" });
  }
});

// Create legal notice
router.post("/notices", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const validatedData = insertLegalNoticeSchema.parse(req.body);
    
    let filePath = null;
    let fileUrl = null;
    
    if (req.file) {
      const fileName = `legal-notices/${Date.now()}-${req.file.originalname}`;
      const uploadResult = await uploadFileToGCS(req.file.buffer, fileName, req.file.mimetype);
      filePath = uploadResult.fileName;
      fileUrl = uploadResult.publicUrl;
    }

    const [newNotice] = await db
      .insert(legalNotices)
      .values({
        ...validatedData,
        filePath,
        fileUrl,
        createdBy: userId,
        updatedAt: new Date()
      })
      .returning();

    res.status(201).json(newNotice);
  } catch (error) {
    console.error("Error creating legal notice:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to create legal notice" });
    }
  }
});

// Update legal notice
router.put("/notices/:id", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    const noticeId = parseInt(req.params.id);
    const validatedData = insertLegalNoticeSchema.parse(req.body);
    
    let filePath = validatedData.filePath;
    let fileUrl = validatedData.fileUrl;
    
    if (req.file) {
      const fileName = `legal-notices/${Date.now()}-${req.file.originalname}`;
      const uploadResult = await uploadFileToGCS(req.file.buffer, fileName, req.file.mimetype);
      filePath = uploadResult.fileName;
      fileUrl = uploadResult.publicUrl;
    }

    const [updatedNotice] = await db
      .update(legalNotices)
      .set({
        ...validatedData,
        filePath,
        fileUrl,
        updatedAt: new Date()
      })
      .where(eq(legalNotices.id, noticeId))
      .returning();

    if (!updatedNotice) {
      return res.status(404).json({ error: "Legal notice not found" });
    }

    res.json(updatedNotice);
  } catch (error) {
    console.error("Error updating legal notice:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to update legal notice" });
    }
  }
});

// Delete legal notice
router.delete("/notices/:id", ensureAuthenticated, async (req, res) => {
  try {
    const noticeId = parseInt(req.params.id);
    
    const [deletedNotice] = await db
      .delete(legalNotices)
      .where(eq(legalNotices.id, noticeId))
      .returning();

    if (!deletedNotice) {
      return res.status(404).json({ error: "Legal notice not found" });
    }

    res.json({ message: "Legal notice deleted successfully" });
  } catch (error) {
    console.error("Error deleting legal notice:", error);
    res.status(500).json({ error: "Failed to delete legal notice" });
  }
});

// ==================== EXTERNAL COUNSEL ====================

// Get all external counsel
router.get("/external-counsel", ensureAuthenticated, async (req, res) => {
  try {
    const { status, specialization, sortBy = "firmName", sortOrder = "asc" } = req.query;
    
    let query = db
      .select({
        id: externalCounsel.id,
        firmName: externalCounsel.firmName,
        contactPerson: externalCounsel.contactPerson,
        designation: externalCounsel.designation,
        specialization: externalCounsel.specialization,
        phone: externalCounsel.phone,
        email: externalCounsel.email,
        address: externalCounsel.address,
        city: externalCounsel.city,
        state: externalCounsel.state,
        country: externalCounsel.country,
        barCouncilNumber: externalCounsel.barCouncilNumber,
        yearsExperience: externalCounsel.yearsExperience,
        hourlyRate: externalCounsel.hourlyRate,
        currency: externalCounsel.currency,
        rating: externalCounsel.rating,
        status: externalCounsel.status,
        retainerAgreement: externalCounsel.retainerAgreement,
        notes: externalCounsel.notes,
        createdAt: externalCounsel.createdAt,
        updatedAt: externalCounsel.updatedAt,
        createdBy: externalCounsel.createdBy,
        createdByName: users.username
      })
      .from(externalCounsel)
      .leftJoin(users, eq(externalCounsel.createdBy, users.id));

    // Apply filters
    if (status) {
      query = query.where(eq(externalCounsel.status, status as string));
    }
    
    if (specialization) {
      query = query.where(eq(externalCounsel.specialization, specialization as string));
    }

    // Apply sorting
    const orderColumn = sortBy === "firmName" ? externalCounsel.firmName :
                       sortBy === "contactPerson" ? externalCounsel.contactPerson :
                       sortBy === "specialization" ? externalCounsel.specialization :
                       sortBy === "rating" ? externalCounsel.rating :
                       externalCounsel.createdAt;
    
    query = query.orderBy(sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn));

    const counselList = await query;
    res.json(counselList);
  } catch (error) {
    console.error("Error fetching external counsel:", error);
    res.status(500).json({ error: "Failed to fetch external counsel" });
  }
});

// Create external counsel
router.post("/external-counsel", ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const validatedData = insertExternalCounselSchema.parse(req.body);

    const [newCounsel] = await db
      .insert(externalCounsel)
      .values({
        ...validatedData,
        createdBy: userId,
        updatedAt: new Date()
      })
      .returning();

    res.status(201).json(newCounsel);
  } catch (error) {
    console.error("Error creating external counsel:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to create external counsel" });
    }
  }
});

// Update external counsel
router.put("/external-counsel/:id", ensureAuthenticated, async (req, res) => {
  try {
    const counselId = parseInt(req.params.id);
    const validatedData = insertExternalCounselSchema.parse(req.body);

    const [updatedCounsel] = await db
      .update(externalCounsel)
      .set({
        ...validatedData,
        updatedAt: new Date()
      })
      .where(eq(externalCounsel.id, counselId))
      .returning();

    if (!updatedCounsel) {
      return res.status(404).json({ error: "External counsel not found" });
    }

    res.json(updatedCounsel);
  } catch (error) {
    console.error("Error updating external counsel:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to update external counsel" });
    }
  }
});

// Delete external counsel
router.delete("/external-counsel/:id", ensureAuthenticated, async (req, res) => {
  try {
    const counselId = parseInt(req.params.id);
    
    const [deletedCounsel] = await db
      .delete(externalCounsel)
      .where(eq(externalCounsel.id, counselId))
      .returning();

    if (!deletedCounsel) {
      return res.status(404).json({ error: "External counsel not found" });
    }

    res.json({ message: "External counsel deleted successfully" });
  } catch (error) {
    console.error("Error deleting external counsel:", error);
    res.status(500).json({ error: "Failed to delete external counsel" });
  }
});

// ==================== POLICY TEMPLATES ====================

// Get all policy templates
router.get("/policy-templates", ensureAuthenticated, async (req, res) => {
  try {
    const { approvalStatus, templateType, category, sortBy = "createdAt", sortOrder = "desc" } = req.query;
    
    let query = db
      .select({
        id: policyTemplates.id,
        templateName: policyTemplates.templateName,
        templateType: policyTemplates.templateType,
        category: policyTemplates.category,
        version: policyTemplates.version,
        effectiveDate: policyTemplates.effectiveDate,
        reviewDate: policyTemplates.reviewDate,
        approvalStatus: policyTemplates.approvalStatus,
        approvedBy: policyTemplates.approvedBy,
        approvalDate: policyTemplates.approvalDate,
        templateContent: policyTemplates.templateContent,
        filePath: policyTemplates.filePath,
        fileUrl: policyTemplates.fileUrl,
        applicableLocations: policyTemplates.applicableLocations,
        mandatory: policyTemplates.mandatory,
        createdAt: policyTemplates.createdAt,
        updatedAt: policyTemplates.updatedAt,
        createdBy: policyTemplates.createdBy,
        createdByName: users.username,
        approvedByName: sql<string>`approved_user.username`
      })
      .from(policyTemplates)
      .leftJoin(users, eq(policyTemplates.createdBy, users.id))
      .leftJoin(sql`users approved_user`, eq(policyTemplates.approvedBy, sql`approved_user.id`));

    // Apply filters
    if (approvalStatus) {
      query = query.where(eq(policyTemplates.approvalStatus, approvalStatus as string));
    }
    
    if (templateType) {
      query = query.where(eq(policyTemplates.templateType, templateType as string));
    }
    
    if (category) {
      query = query.where(eq(policyTemplates.category, category as string));
    }

    // Apply sorting
    const orderColumn = sortBy === "templateName" ? policyTemplates.templateName :
                       sortBy === "version" ? policyTemplates.version :
                       sortBy === "effectiveDate" ? policyTemplates.effectiveDate :
                       sortBy === "reviewDate" ? policyTemplates.reviewDate :
                       policyTemplates.createdAt;
    
    query = query.orderBy(sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn));

    const templatesList = await query;
    res.json(templatesList);
  } catch (error) {
    console.error("Error fetching policy templates:", error);
    res.status(500).json({ error: "Failed to fetch policy templates" });
  }
});

// Create policy template
router.post("/policy-templates", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const validatedData = insertPolicyTemplateSchema.parse(req.body);
    
    let filePath = null;
    let fileUrl = null;
    
    if (req.file) {
      const fileName = `policy-templates/${Date.now()}-${req.file.originalname}`;
      const uploadResult = await uploadFileToGCS(req.file.buffer, fileName, req.file.mimetype);
      filePath = uploadResult.fileName;
      fileUrl = uploadResult.publicUrl;
    }

    const [newTemplate] = await db
      .insert(policyTemplates)
      .values({
        ...validatedData,
        filePath,
        fileUrl,
        createdBy: userId,
        updatedAt: new Date()
      })
      .returning();

    res.status(201).json(newTemplate);
  } catch (error) {
    console.error("Error creating policy template:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to create policy template" });
    }
  }
});

// Update policy template
router.put("/policy-templates/:id", ensureAuthenticated, upload.single("file"), async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    const validatedData = insertPolicyTemplateSchema.parse(req.body);
    
    let filePath = validatedData.filePath;
    let fileUrl = validatedData.fileUrl;
    
    if (req.file) {
      const fileName = `policy-templates/${Date.now()}-${req.file.originalname}`;
      const uploadResult = await uploadFileToGCS(req.file.buffer, fileName, req.file.mimetype);
      filePath = uploadResult.fileName;
      fileUrl = uploadResult.publicUrl;
    }

    const [updatedTemplate] = await db
      .update(policyTemplates)
      .set({
        ...validatedData,
        filePath,
        fileUrl,
        updatedAt: new Date()
      })
      .where(eq(policyTemplates.id, templateId))
      .returning();

    if (!updatedTemplate) {
      return res.status(404).json({ error: "Policy template not found" });
    }

    res.json(updatedTemplate);
  } catch (error) {
    console.error("Error updating policy template:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to update policy template" });
    }
  }
});

// Delete policy template
router.delete("/policy-templates/:id", ensureAuthenticated, async (req, res) => {
  try {
    const templateId = parseInt(req.params.id);
    
    const [deletedTemplate] = await db
      .delete(policyTemplates)
      .where(eq(policyTemplates.id, templateId))
      .returning();

    if (!deletedTemplate) {
      return res.status(404).json({ error: "Policy template not found" });
    }

    res.json({ message: "Policy template deleted successfully" });
  } catch (error) {
    console.error("Error deleting policy template:", error);
    res.status(500).json({ error: "Failed to delete policy template" });
  }
});

// ==================== LEGAL ALERTS ====================

// Get all legal alerts
router.get("/alerts", ensureAuthenticated, async (req, res) => {
  try {
    const { status, alertType, priority, sortBy = "alertDate", sortOrder = "desc" } = req.query;
    
    let query = db
      .select({
        id: legalAlerts.id,
        alertType: legalAlerts.alertType,
        referenceType: legalAlerts.referenceType,
        referenceId: legalAlerts.referenceId,
        alertDate: legalAlerts.alertDate,
        alertTitle: legalAlerts.alertTitle,
        alertMessage: legalAlerts.alertMessage,
        status: legalAlerts.status,
        priority: legalAlerts.priority,
        assignedTo: legalAlerts.assignedTo,
        createdAt: legalAlerts.createdAt,
        updatedAt: legalAlerts.updatedAt,
        createdBy: legalAlerts.createdBy,
        createdByName: users.username,
        assignedToName: sql<string>`assigned_user.username`
      })
      .from(legalAlerts)
      .leftJoin(users, eq(legalAlerts.createdBy, users.id))
      .leftJoin(sql`users assigned_user`, eq(legalAlerts.assignedTo, sql`assigned_user.id`));

    // Apply filters
    if (status) {
      query = query.where(eq(legalAlerts.status, status as string));
    }
    
    if (alertType) {
      query = query.where(eq(legalAlerts.alertType, alertType as string));
    }
    
    if (priority) {
      query = query.where(eq(legalAlerts.priority, priority as string));
    }

    // Apply sorting
    const orderColumn = sortBy === "alertDate" ? legalAlerts.alertDate :
                       sortBy === "alertTitle" ? legalAlerts.alertTitle :
                       sortBy === "priority" ? legalAlerts.priority :
                       legalAlerts.createdAt;
    
    query = query.orderBy(sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn));

    const alertsList = await query;
    res.json(alertsList);
  } catch (error) {
    console.error("Error fetching legal alerts:", error);
    res.status(500).json({ error: "Failed to fetch legal alerts" });
  }
});

// Create legal alert
router.post("/alerts", ensureAuthenticated, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const validatedData = insertLegalAlertSchema.parse(req.body);

    const [newAlert] = await db
      .insert(legalAlerts)
      .values({
        ...validatedData,
        createdBy: userId,
        updatedAt: new Date()
      })
      .returning();

    res.status(201).json(newAlert);
  } catch (error) {
    console.error("Error creating legal alert:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to create legal alert" });
    }
  }
});

// Update legal alert
router.put("/alerts/:id", ensureAuthenticated, async (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    const validatedData = insertLegalAlertSchema.parse(req.body);

    const [updatedAlert] = await db
      .update(legalAlerts)
      .set({
        ...validatedData,
        updatedAt: new Date()
      })
      .where(eq(legalAlerts.id, alertId))
      .returning();

    if (!updatedAlert) {
      return res.status(404).json({ error: "Legal alert not found" });
    }

    res.json(updatedAlert);
  } catch (error) {
    console.error("Error updating legal alert:", error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid input data", details: error.errors });
    } else {
      res.status(500).json({ error: "Failed to update legal alert" });
    }
  }
});

// Delete legal alert
router.delete("/alerts/:id", ensureAuthenticated, async (req, res) => {
  try {
    const alertId = parseInt(req.params.id);
    
    const [deletedAlert] = await db
      .delete(legalAlerts)
      .where(eq(legalAlerts.id, alertId))
      .returning();

    if (!deletedAlert) {
      return res.status(404).json({ error: "Legal alert not found" });
    }

    res.json({ message: "Legal alert deleted successfully" });
  } catch (error) {
    console.error("Error deleting legal alert:", error);
    res.status(500).json({ error: "Failed to delete legal alert" });
  }
});

// ==================== DASHBOARD & ANALYTICS ====================

// Get legal dashboard data
router.get("/dashboard", ensureAuthenticated, async (req, res) => {
  try {
    // Get contracts summary
    const contractsStats = await db
      .select({
        status: contracts.status,
        count: sql<number>`count(*)::int`,
        totalValue: sql<number>`sum(${contracts.contractValue})::float`
      })
      .from(contracts)
      .groupBy(contracts.status);

    // Get legal cases summary
    const casesStats = await db
      .select({
        status: legalCases.caseStatus,
        count: sql<number>`count(*)::int`,
        totalValue: sql<number>`sum(${legalCases.caseValue})::float`
      })
      .from(legalCases)
      .groupBy(legalCases.caseStatus);

    // Get compliance summary
    const complianceStats = await db
      .select({
        status: complianceRegister.status,
        count: sql<number>`count(*)::int`
      })
      .from(complianceRegister)
      .groupBy(complianceRegister.status);

    // Get POSH cases summary
    const poshStats = await db
      .select({
        status: poshCases.caseStatus,
        count: sql<number>`count(*)::int`
      })
      .from(poshCases)
      .groupBy(poshCases.caseStatus);

    // Get upcoming alerts
    const upcomingAlerts = await db
      .select({
        id: legalAlerts.id,
        alertType: legalAlerts.alertType,
        alertTitle: legalAlerts.alertTitle,
        alertDate: legalAlerts.alertDate,
        priority: legalAlerts.priority,
        status: legalAlerts.status
      })
      .from(legalAlerts)
      .where(and(
        eq(legalAlerts.status, "Active"),
        gte(legalAlerts.alertDate, new Date())
      ))
      .orderBy(asc(legalAlerts.alertDate))
      .limit(10);

    // Get expiring contracts (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const expiringContracts = await db
      .select({
        id: contracts.id,
        contractNumber: contracts.contractNumber,
        title: contracts.title,
        partyName: contracts.partyName,
        endDate: contracts.endDate,
        status: contracts.status
      })
      .from(contracts)
      .where(and(
        eq(contracts.status, "Active"),
        lte(contracts.endDate, thirtyDaysFromNow),
        gte(contracts.endDate, new Date())
      ))
      .orderBy(asc(contracts.endDate))
      .limit(10);

    // Get upcoming hearings (next 30 days)
    const upcomingHearings = await db
      .select({
        id: legalCases.id,
        caseNumber: legalCases.caseNumber,
        caseTitle: legalCases.caseTitle,
        nextHearingDate: legalCases.nextHearingDate,
        priority: legalCases.priority,
        courtName: legalCases.courtName
      })
      .from(legalCases)
      .where(and(
        eq(legalCases.caseStatus, "Active"),
        lte(legalCases.nextHearingDate, thirtyDaysFromNow),
        gte(legalCases.nextHearingDate, new Date())
      ))
      .orderBy(asc(legalCases.nextHearingDate))
      .limit(10);

    res.json({
      contracts: contractsStats,
      cases: casesStats,
      compliance: complianceStats,
      poshCases: poshStats,
      upcomingAlerts,
      expiringContracts,
      upcomingHearings
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  }
});

// Get users for dropdowns
router.get("/users", ensureAuthenticated, async (req, res) => {
  try {
    const usersList = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        department: users.department
      })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.username));

    res.json(usersList);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

export default router;
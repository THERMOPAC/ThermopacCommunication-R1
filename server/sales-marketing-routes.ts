import express, { Express, Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { z } from 'zod';
import { insertLeadSchema, tankPrices, plantCosts, insertProductAttributeOptionSchema, insertProductSchema, offers, offerTemplates, offerTemplateRevisions, offerTemplateAuditLog, productChildren as productChildrenTable, productAttributeOptions as productAttributeOptionsTable, attributeOptionAuditLog as attributeOptionAuditLogTable, products as productsTable, offerItems as offerItemsTable } from '@shared/schema';
import { db } from './db';
import { eq, and, sql, or } from 'drizzle-orm';
import { OfferPdfGenerator } from './offer-pdf-generator';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { storeQuotationPdfArtifact, storeQuotationPdfArtifactTwoPhase, getActiveArtifact, downloadArtifactBuffer, freezeConfirmedArtifact, listArtifactsForOffer, getArtifactById, attachConfirmedArtifactToEpc } from './utils/quotation-pdf-artifact';
import { runDocumentArchive, rollbackDocumentArchive, QuotationArchiveStrategy } from './utils/document-archive-engine';
import { pool } from './db';
import crypto from 'crypto';
import gcsClient, { bucketName as gcsBucketName } from './utils/storage-config';
import { validateLabel } from '../shared/gcs-label-vocabulary';
import { resolveGcsPath, GcsGovernanceError } from './utils/gcs-path-resolver';
import { enqueueMirrorJob } from './utils/mirror-job-service';
import { registerOfferCommRoutes } from './offer-comm-routes';

async function getTemplateSignedUrl(gcsObjectPath: string): Promise<string> {
  const bucket = gcsClient.bucket(gcsBucketName);
  const file = bucket.file(gcsObjectPath);
  const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60 * 1000 });
  return url;
}

// Download a template PDF from GCS to a local temp file for PDF generation.
// Returns the local path. Caller is responsible for cleanup if desired.
const templateTmpDir = path.join(process.cwd(), 'uploads', 'offer-templates', 'tmp');
async function downloadTemplateFromGcs(gcsObjectPath: string): Promise<string> {
  if (!fs.existsSync(templateTmpDir)) fs.mkdirSync(templateTmpDir, { recursive: true });
  const bucket = gcsClient.bucket(gcsBucketName);
  const tmpName = `tpl_${Date.now()}_${path.basename(gcsObjectPath)}`;
  const tmpPath = path.join(templateTmpDir, tmpName);
  await bucket.file(gcsObjectPath).download({ destination: tmpPath });
  return tmpPath;
}

// Resolve a local path for an offer template, falling back to GCS download when
// the stored filePath is absent. Returns null when no template is available.
async function resolveTemplatePath(
  filePath: string | null | undefined,
  gcsObjectPath: string | null | undefined,
): Promise<string | null> {
  if (filePath && fs.existsSync(filePath)) return filePath;
  if (gcsObjectPath) {
    try {
      return await downloadTemplateFromGcs(gcsObjectPath);
    } catch (e) {
      console.warn('[offer-template] GCS download failed for', gcsObjectPath, e);
    }
  }
  return null;
}

async function uploadOfferTemplateToGcs(
  buffer: Buffer,
  templateSlug: string,
  seq: string,
  ext: string,
): Promise<string> {
  const gcsPath = await resolveGcsPath('OFFER_TEMPLATE', { TemplateSlug: templateSlug, Seq: seq, ext });
  const bucket = gcsClient.bucket(gcsBucketName);
  const file = bucket.file(gcsPath);
  await file.save(buffer, { contentType: 'application/pdf', metadata: { contentType: 'application/pdf' } });
  return gcsPath;
}

const templateUploadDir = path.join(process.cwd(), 'uploads', 'offer-templates');
if (!fs.existsSync(templateUploadDir)) {
  fs.mkdirSync(templateUploadDir, { recursive: true });
}

const templateUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, templateUploadDir),
    filename: (_req, file, cb) => {
      const uniqueName = `template_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      cb(null, uniqueName);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

const confirmDocUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

function buildConfirmationDocGcsPath(offerNumber: string, customerName: string, offerType: string): string {
  const fyMatch = /OFR-(\d{4})-/.exec(offerNumber);
  const fy = fyMatch ? fyMatch[1] : 'XXXX';
  const custSlug = customerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'customer';
  const safeOfferNo = offerNumber.replace(/\//g, '-');
  const label = offerType === 'project-linked' ? 'SalesContract' : 'CustomerOrder';
  return `TPEL/AS/IN/${custSlug}/${fy}/Open_Orders/${safeOfferNo}/001-${label}-rev-00.pdf`;
}

// Define ensureAuthenticated middleware
function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
}

const router = express.Router();

// Get all leads with detailed information
router.get('/leads', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const leads = await storage.getLeadsWithDetails();
    res.json(leads);
  } catch (error) {
    console.error('Error fetching leads:', error);
    res.status(500).json({ 
      error: 'Failed to fetch leads',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get a specific lead with detailed information
router.get('/leads/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid lead ID' });
    }
    
    const lead = await storage.getLeadWithDetails(id);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    res.json(lead);
  } catch (error) {
    console.error(`Error fetching lead ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch lead',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create a new lead
router.post('/leads', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Validate the request body against our schema
    const validatedData = insertLeadSchema.parse(req.body);
    
    // Add the created by user ID from the authenticated user
    const leadData = {
      ...validatedData,
      createdBy: req.user?.id
    };
    
    const newLead = await storage.createLead(leadData);
    res.status(201).json(newLead);
  } catch (error) {
    console.error('Error creating lead:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid lead data',
        details: error.errors 
      });
    }
    res.status(500).json({ 
      error: 'Failed to create lead',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update a lead
router.patch('/leads/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid lead ID' });
    }
    
    // Get the existing lead to check if it exists
    const existingLead = await storage.getLead(id);
    
    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // For partial updates, we'll accept any subset of the lead fields
    const updateData = req.body;
    
    const updatedLead = await storage.updateLead(id, updateData);
    res.json(updatedLead);
  } catch (error) {
    console.error(`Error updating lead ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to update lead',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete a lead
router.delete('/leads/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid lead ID' });
    }
    
    // Check if the lead exists
    const existingLead = await storage.getLead(id);
    
    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }
    
    await storage.deleteLead(id);
    res.status(204).send(); // 204 No Content is a common response for successful DELETE
  } catch (error) {
    console.error(`Error deleting lead ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to delete lead',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get lead sources
router.get('/lead-sources', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const sources = await storage.getLeadSources();
    res.json(sources);
  } catch (error) {
    console.error('Error fetching lead sources:', error);
    res.status(500).json({ 
      error: 'Failed to fetch lead sources',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get lead statuses
router.get('/lead-statuses', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const statuses = await storage.getLeadStatuses();
    res.json(statuses);
  } catch (error) {
    console.error('Error fetching lead statuses:', error);
    res.status(500).json({ 
      error: 'Failed to fetch lead statuses',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get activities for a lead
router.get('/leads/:id/activities', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const leadId = parseInt(req.params.id);
    
    if (isNaN(leadId)) {
      return res.status(400).json({ error: 'Invalid lead ID' });
    }
    
    const activities = await storage.getLeadActivitiesWithUsers(leadId);
    res.json(activities);
  } catch (error) {
    console.error(`Error fetching activities for lead ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch lead activities',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Add a new activity to a lead
router.post('/leads/:id/activities', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const leadId = parseInt(req.params.id);
    
    if (isNaN(leadId)) {
      return res.status(400).json({ error: 'Invalid lead ID' });
    }
    
    // Get the existing lead to check if it exists
    const existingLead = await storage.getLead(leadId);
    
    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const activityData = {
      ...req.body,
      leadId,
      createdBy: req.user?.id
    };
    
    const newActivity = await storage.createLeadActivity(activityData);
    res.status(201).json(newActivity);
  } catch (error) {
    console.error(`Error creating activity for lead ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to create lead activity',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Marketing Campaign Routes

// Get all marketing campaigns
router.get('/campaigns', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const campaigns = await storage.getAllMarketingCampaigns();
    res.json(campaigns);
  } catch (error) {
    console.error('Error fetching marketing campaigns:', error);
    res.status(500).json({ 
      error: 'Failed to fetch marketing campaigns',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get a specific marketing campaign
router.get('/campaigns/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }
    
    const campaign = await storage.getMarketingCampaign(id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Marketing campaign not found' });
    }
    
    res.json(campaign);
  } catch (error) {
    console.error(`Error fetching marketing campaign ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch marketing campaign',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create a new marketing campaign
router.post('/campaigns', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Add the created by user ID from the authenticated user
    const campaignData = {
      ...req.body,
      createdBy: req.user?.id
    };
    
    const newCampaign = await storage.createMarketingCampaign(campaignData);
    res.status(201).json(newCampaign);
  } catch (error) {
    console.error('Error creating marketing campaign:', error);
    res.status(500).json({ 
      error: 'Failed to create marketing campaign',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update a marketing campaign
router.patch('/campaigns/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }
    
    // Get the existing campaign to check if it exists
    const existingCampaign = await storage.getMarketingCampaign(id);
    
    if (!existingCampaign) {
      return res.status(404).json({ error: 'Marketing campaign not found' });
    }

    // For partial updates, we'll accept any subset of the campaign fields
    const updateData = req.body;
    
    const updatedCampaign = await storage.updateMarketingCampaign(id, updateData);
    res.json(updatedCampaign);
  } catch (error) {
    console.error(`Error updating marketing campaign ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to update marketing campaign',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get campaign channels
router.get('/campaign-channels', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const channels = await storage.getCampaignChannels();
    res.json(channels);
  } catch (error) {
    console.error('Error fetching campaign channels:', error);
    res.status(500).json({ 
      error: 'Failed to fetch campaign channels',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get activities for a campaign
router.get('/campaigns/:id/activities', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(req.params.id);
    
    if (isNaN(campaignId)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }
    
    const activities = await storage.getCampaignActivities(campaignId);
    res.json(activities);
  } catch (error) {
    console.error(`Error fetching activities for campaign ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to fetch campaign activities',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Add a new activity to a campaign
router.post('/campaigns/:id/activities', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const campaignId = parseInt(req.params.id);
    
    if (isNaN(campaignId)) {
      return res.status(400).json({ error: 'Invalid campaign ID' });
    }
    
    // Get the existing campaign to check if it exists
    const existingCampaign = await storage.getMarketingCampaign(campaignId);
    
    if (!existingCampaign) {
      return res.status(404).json({ error: 'Marketing campaign not found' });
    }

    const activityData = {
      ...req.body,
      campaignId,
      createdBy: req.user?.id
    };
    
    const newActivity = await storage.createCampaignActivity(activityData);
    res.status(201).json(newActivity);
  } catch (error) {
    console.error(`Error creating activity for campaign ${req.params.id}:`, error);
    res.status(500).json({ 
      error: 'Failed to create campaign activity',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Convert a lead to a customer
router.post('/leads/:id/convert', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const leadId = parseInt(req.params.id);
    
    if (isNaN(leadId)) {
      return res.status(400).json({ error: 'Invalid lead ID' });
    }
    
    // Get the existing lead to check if it exists
    const existingLead = await storage.getLeadWithDetails(leadId);
    
    if (!existingLead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    if (existingLead.lead.isConverted) {
      return res.status(400).json({ 
        error: 'Lead already converted',
        customerId: existingLead.lead.customerId
      });
    }

    // Create customer from lead data
    const customerData = {
      bpCode: req.body.bpCode || `L${leadId}`, // Generate a BP code if not provided
      bpName: existingLead.lead.companyName,
      contactPerson: existingLead.lead.contactName,
      email: existingLead.lead.contactEmail,
      billToAddress: [
        existingLead.lead.addressLine1,
        existingLead.lead.addressLine2,
        existingLead.lead.city,
        existingLead.lead.state,
        existingLead.lead.postalCode,
        existingLead.lead.country
      ].filter(Boolean).join(', '),
      shipToAddress: [
        existingLead.lead.addressLine1,
        existingLead.lead.addressLine2,
        existingLead.lead.city,
        existingLead.lead.state,
        existingLead.lead.postalCode,
        existingLead.lead.country
      ].filter(Boolean).join(', '),
      continent: req.body.continent,
      countryName: existingLead.lead.country,
    };

    // Create customer and get ID
    const newCustomer = await storage.createCustomer(customerData);

    // Update lead with customer ID and mark as converted
    await storage.updateLead(leadId, { 
      isConverted: true, 
      customerId: newCustomer.id,
      statusId: req.body.wonStatusId // Update to "Won" status if provided
    });

    // Return the new customer data
    res.status(201).json({
      success: true,
      message: 'Lead successfully converted to customer',
      customer: newCustomer,
      leadId: leadId
    });
  } catch (error) {
    console.error(`Error converting lead ${req.params.id} to customer:`, error);
    res.status(500).json({ 
      error: 'Failed to convert lead to customer',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get active orders in hand
router.get('/dashboard/orders-in-hand', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Get active projects (orders)
    const activeProjects = await storage.getAllProjects();
    
    // Filter to only active/in-progress projects
    const currentDate = new Date();
    const ordersInHand = activeProjects.filter(project => {
      // Consider a project as "in hand" if it has started but not completed
      const hasStarted = project.status !== 'planning' && project.status !== 'canceled';
      const isActive = project.status === 'active' || project.status === 'on_hold';
      
      return hasStarted && isActive;
    });
    
    // Calculate total order value in each currency and convert to INR
    const orderValuesByCurrency: Record<string, number> = {};
    let totalOrderValueINR = 0;
    
    // Fetch unified exchange rate from database
    let rates = { INR: 83.5, EUR: 0.93 }; // fallback rates
    try {
      const { db } = await import('./db');
      const { exchangeRateSettings } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      const [setting] = await db
        .select()
        .from(exchangeRateSettings)
        .where(eq(exchangeRateSettings.isActive, true))
        .limit(1);

      if (setting) {
        rates.INR = parseFloat(setting.exchangeRate);
        console.log('Using unified exchange rate from database:', rates.INR);
      } else {
        console.log('No unified exchange rate found, using fallback:', rates.INR);
      }
    } catch (error) {
      console.log('Error fetching unified exchange rate, using fallback:', error);
    }
    
    // Group by currency
    ordersInHand.forEach(order => {
      if (order.estimatedBudget && order.currency) {
        const currency = order.currency.toUpperCase();
        if (!orderValuesByCurrency[currency]) {
          orderValuesByCurrency[currency] = 0;
        }
        orderValuesByCurrency[currency] += Number(order.estimatedBudget);
        
        // Convert to INR
        if (currency === 'USD') {
          totalOrderValueINR += Number(order.estimatedBudget) * rates.INR;
        } else if (currency === 'EUR') {
          // Convert EUR to USD first, then to INR
          totalOrderValueINR += (Number(order.estimatedBudget) / rates.EUR) * rates.INR;
        } else if (currency === 'INR') {
          totalOrderValueINR += Number(order.estimatedBudget);
        }
      }
    });
    
    res.json({
      count: ordersInHand.length,
      orders: ordersInHand,
      valuesByCurrency: orderValuesByCurrency,
      totalValueINR: totalOrderValueINR,
      exchangeRates: {
        USD: 1,
        EUR: rates.EUR,
        INR: rates.INR
      },
      lastUpdated: new Date()
    });
  } catch (error) {
    console.error('Error fetching orders in hand:', error);
    res.status(500).json({ 
      error: 'Failed to fetch orders in hand',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ==================== PRODUCT ATTRIBUTE OPTIONS ROUTES (Phase 3 Hardened) ====================

// GET — fetch all or by type
router.get('/product-attributes', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const type = req.query.type as string | undefined;
    const options = await storage.getAttributeOptions(type);
    res.json(options);
  } catch (error) {
    console.error('Error fetching product attribute options:', error);
    res.status(500).json({ error: 'Failed to fetch product attribute options' });
  }
});

// POST — create with hierarchy validation
router.post('/product-attributes', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const validated = insertProductAttributeOptionSchema.parse(req.body);

    // Code length
    if (validated.code && validated.code.length !== 3) {
      return res.status(400).json({ error: 'Code must be exactly 3 characters.' });
    }

    // Label length
    if (validated.label && validated.label.length > 27) {
      return res.status(422).json({ error: 'Label cannot exceed 27 characters.' });
    }

    // Tag: required, auto-uppercase, 2–3 letters
    if (!validated.tag) {
      return res.status(400).json({ error: 'Tag is required.' });
    }
    (validated as any).tag = (validated.tag as string).toUpperCase();
    if (!/^[A-Z]{2,3}$/.test((validated as any).tag)) {
      return res.status(400).json({ error: 'Tag must be 2–3 uppercase letters only (e.g. RF, SPL).' });
    }

    // Hierarchy validation
    if (validated.attributeType === 'item_family') {
      if (validated.parentId !== null && validated.parentId !== undefined) {
        return res.status(400).json({ error: 'Item Family options must not have a parent (parent_id must be null).' });
      }
    } else if (validated.attributeType === 'property_1') {
      if (!validated.parentId) {
        return res.status(400).json({ error: 'Property 1 options must specify a parent Item Family.' });
      }
      const [parent] = await db.select().from(productAttributeOptionsTable)
        .where(eq(productAttributeOptionsTable.id, validated.parentId));
      if (!parent) {
        return res.status(400).json({ error: 'Parent option not found.' });
      }
      if (parent.attributeType !== 'item_family') {
        return res.status(400).json({ error: 'Property 1 parent must be an Item Family option.' });
      }
    } else if (validated.attributeType === 'property_2') {
      if (!validated.parentId) {
        return res.status(400).json({ error: 'Property 2 options must specify a parent Property 1.' });
      }
      const [parent] = await db.select().from(productAttributeOptionsTable)
        .where(eq(productAttributeOptionsTable.id, validated.parentId));
      if (!parent) {
        return res.status(400).json({ error: 'Parent option not found.' });
      }
      if (parent.attributeType !== 'property_1') {
        return res.status(400).json({ error: 'Property 2 parent must be a Property 1 option.' });
      }
    }

    const option = await storage.createAttributeOption(validated);
    res.status(201).json(option);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    const pgError = error as any;
    if (pgError.code === '23505') {
      return res.status(400).json({ error: 'A duplicate code already exists under this parent. Each code must be unique within its parent scope.' });
    }
    console.error('Error creating product attribute option:', error);
    res.status(500).json({ error: 'Failed to create product attribute option' });
  }
});

// PATCH — update with code-lock, label audit, deactivate guard
router.patch('/product-attributes/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    // Fetch current record
    const [current] = await db.select().from(productAttributeOptionsTable)
      .where(eq(productAttributeOptionsTable.id, id));
    if (!current) return res.status(404).json({ error: 'Attribute option not found.' });

    // GUARD 1: Code is permanently locked — reject any attempt to change it
    if (req.body.code !== undefined && req.body.code !== current.code) {
      return res.status(400).json({
        error: `Code "${current.code}" is permanently locked and cannot be changed. To use a different code, create a new option and mark this one inactive.`,
      });
    }

    // GUARD 2: Deactivate check — block if active child options exist
    if (req.body.isActive === false && current.isActive !== false) {
      const activeChildren = await db.select({ id: productAttributeOptionsTable.id })
        .from(productAttributeOptionsTable)
        .where(and(
          eq(productAttributeOptionsTable.parentId, id),
          eq(productAttributeOptionsTable.isActive, true),
        ));
      if (activeChildren.length > 0) {
        return res.status(400).json({
          error: `Cannot deactivate — ${activeChildren.length} active child option(s) depend on this. Deactivate all child options first.`,
        });
      }
    }

    // Strip immutable fields from body; always refresh updated_at
    const { code: _code, attributeType: _type, parentId: _pid, createdAt: _ca, ...allowedFields } = req.body;

    // Label length
    if (allowedFields.label !== undefined && String(allowedFields.label).length > 27) {
      return res.status(422).json({ error: 'Label cannot exceed 27 characters.' });
    }

    // Tag: auto-uppercase and validate format if provided
    if (allowedFields.tag !== undefined) {
      allowedFields.tag = String(allowedFields.tag).toUpperCase();
      if (!/^[A-Z]{2,3}$/.test(allowedFields.tag)) {
        return res.status(400).json({ error: 'Tag must be 2–3 uppercase letters only (e.g. RF, SPL).' });
      }
    }

    const updateData = { ...allowedFields, updatedAt: new Date() };
    const option = await storage.updateAttributeOption(id, updateData);

    // AUDIT: log label and/or tag changes in a single row
    const labelChanged = req.body.label !== undefined && req.body.label !== current.label;
    const tagChanged = allowedFields.tag !== undefined && allowedFields.tag !== current.tag;
    if (labelChanged || tagChanged) {
      const userId = (req as any).user?.id ?? null;
      await db.insert(attributeOptionAuditLogTable).values({
        optionId: id,
        oldLabel: current.label,
        newLabel: req.body.label ?? current.label,
        ...(tagChanged ? { oldTag: current.tag, newTag: allowedFields.tag } : {}),
        changedBy: userId,
      });
    }

    res.json(option);
  } catch (error) {
    console.error('Error updating product attribute option:', error);
    res.status(500).json({ error: 'Failed to update product attribute option' });
  }
});

// DELETE — blocked if used in products or has child options
router.delete('/product-attributes/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    // Fetch current record
    const [current] = await db.select().from(productAttributeOptionsTable)
      .where(eq(productAttributeOptionsTable.id, id));
    if (!current) return res.status(404).json({ error: 'Attribute option not found.' });

    // GUARD 1: Block if has any child options (active or inactive)
    const children = await db.select({ id: productAttributeOptionsTable.id })
      .from(productAttributeOptionsTable)
      .where(eq(productAttributeOptionsTable.parentId, id));
    if (children.length > 0) {
      return res.status(400).json({
        error: `Cannot delete — this option has ${children.length} child option(s) that depend on it. Delete or reassign all child options first.`,
      });
    }

    // GUARD 2: Block if code is used in any product record
    const usedInProducts = await db.select({ id: productsTable.id })
      .from(productsTable)
      .where(or(
        eq(productsTable.itemFamily, current.code),
        eq(productsTable.itemProperty1, current.code),
        eq(productsTable.itemProperty2, current.code),
        eq(productsTable.itemProperty3, current.code),
      ));
    if (usedInProducts.length > 0) {
      return res.status(400).json({
        error: `Cannot delete — this option's code "${current.code}" is referenced in ${usedInProducts.length} product(s). Mark it inactive instead.`,
      });
    }

    await storage.deleteAttributeOption(id);
    res.status(204).send();
  } catch (error) {
    // DB-level RESTRICT FK will also block delete if children exist
    const pgError = error as any;
    if (pgError.code === '23503') {
      return res.status(400).json({ error: 'Cannot delete — this option is still referenced by other records.' });
    }
    console.error('Error deleting product attribute option:', error);
    res.status(500).json({ error: 'Failed to delete product attribute option' });
  }
});

// Product Routes
router.get('/products', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const products = await storage.getProducts();
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/products/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });
    const product = await storage.getProductById(id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

router.post('/products', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { itemFamily, itemFamilyLabel, itemProperty1, itemProperty1Label, itemProperty2, itemProperty2Label, itemProperty3, ...rest } = req.body;
    if (typeof itemProperty3 === 'string' && itemProperty3.length > 16) {
      return res.status(422).json({ error: 'Property 3 cannot exceed 16 characters. This keeps the SAP Item Description within the 100-character limit.' });
    }
    const productCode = `${itemFamily}-${itemProperty1}-${itemProperty2}-${itemProperty3}`;
    const description = `${itemFamilyLabel} ${itemProperty1Label} ${itemProperty2Label} ${itemProperty3}`;
    const productData = {
      itemFamily,
      itemFamilyLabel,
      itemProperty1,
      itemProperty1Label,
      itemProperty2,
      itemProperty2Label,
      itemProperty3,
      productCode,
      description: rest.description || description,
      ...rest,
      createdBy: (req.user as any)?.id,
    };
    const validated = insertProductSchema.parse(productData);
    const product = await storage.createProduct(validated);
    res.status(201).json(product);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid product data', details: error.errors });
    }
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Failed to create product', details: error instanceof Error ? error.message : 'Unknown error' });
  }
});

router.patch('/products/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });
    const existing = await storage.getProductById(id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const updateData = { ...req.body };
    if (updateData.itemFamily || updateData.itemProperty1 || updateData.itemProperty2 || updateData.itemProperty3) {
      const family = updateData.itemFamily || existing.itemFamily;
      const prop1 = updateData.itemProperty1 || existing.itemProperty1;
      const prop2 = updateData.itemProperty2 || existing.itemProperty2;
      const prop3 = updateData.itemProperty3 || existing.itemProperty3;
      if (typeof prop3 === 'string' && prop3.length > 16) {
        return res.status(422).json({ error: 'Property 3 cannot exceed 16 characters. This keeps the SAP Item Description within the 100-character limit.' });
      }
      updateData.productCode = `${family}-${prop1}-${prop2}-${prop3}`;

      const familyLabel = updateData.itemFamilyLabel || existing.itemFamilyLabel;
      const prop1Label = updateData.itemProperty1Label || existing.itemProperty1Label;
      const prop2Label = updateData.itemProperty2Label || existing.itemProperty2Label;
      const autoDescription = `${familyLabel} ${prop1Label} ${prop2Label} ${prop3}`;
      if (!updateData.description || updateData.description === existing.description) {
        updateData.description = autoDescription;
      }
    }

    const product = await storage.updateProduct(id, updateData);

    if (updateData.unitPrice !== undefined) {
      const allLinks = await storage.getAllProductChildren();
      const parentIds = allLinks
        .filter((link: any) => link.childProductId === id)
        .map((link: any) => link.parentProductId);
      for (const parentId of parentIds) {
        await storage.recalculateParentPrice(parentId);
      }
    }

    res.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

router.delete('/products/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });
    const existing = await storage.getProductById(id);
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    await storage.deleteProduct(id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Tank prices routes
router.get('/tank-prices', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('===== TANK PRICES API CALLED (Sales Marketing Routes) =====');
    
    // Direct hardcoded response for immediate fix
    const tankPricesResponse = [
      { id: 1, capacity: 50, priceUSD: 15900, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, capacity: 100, priceUSD: 27800, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: 3, capacity: 200, priceUSD: 48600, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: 4, capacity: 300, priceUSD: 66250, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: 5, capacity: 400, priceUSD: 81900, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: 6, capacity: 500, priceUSD: 96100, isActive: true, createdAt: new Date(), updatedAt: new Date() },
      { id: 7, capacity: 600, priceUSD: 109250, isActive: true, createdAt: new Date(), updatedAt: new Date() }
    ];
    
    console.log('Sending tank prices response:', tankPricesResponse);
    res.json(tankPricesResponse);
  } catch (error) {
    console.error('Error fetching tank prices:', error);
    res.status(500).json({ error: 'Failed to fetch tank prices' });
  }
});

// Export the router
export default router;

/**
 * Set up sales and marketing routes
 * @param app Express application
 */
export function setupSalesMarketingRoutes(app: Express) {
  app.use('/api/sales-marketing', router);
  
  // Add direct tank prices route to main app
  app.get('/api/tank-prices', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      console.log('===== DIRECT TANK PRICES API CALLED =====');
      
      const tankPricesResponse = [
        { id: 1, capacity: 50, priceUSD: 15900, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { id: 2, capacity: 100, priceUSD: 27800, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { id: 3, capacity: 200, priceUSD: 48600, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { id: 4, capacity: 300, priceUSD: 66250, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { id: 5, capacity: 400, priceUSD: 81900, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { id: 6, capacity: 500, priceUSD: 96100, isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { id: 7, capacity: 600, priceUSD: 109250, isActive: true, createdAt: new Date(), updatedAt: new Date() }
      ];
      
      console.log('Direct API sending tank prices:', tankPricesResponse);
      res.json(tankPricesResponse);
    } catch (error) {
      console.error('Error in direct tank prices API:', error);
      res.status(500).json({ error: 'Failed to fetch tank prices' });
    }
  });
  
  // ==================== PRODUCT CHILDREN ====================

  router.get('/product-children', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const children = await storage.getAllProductChildren();
      res.json(children);
    } catch (error) {
      console.error('Error fetching product children:', error);
      res.status(500).json({ error: 'Failed to fetch product children' });
    }
  });

  router.get('/products/:id/children', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const children = await storage.getProductChildren(id);
      res.json(children);
    } catch (error) {
      console.error('Error fetching product children:', error);
      res.status(500).json({ error: 'Failed to fetch product children' });
    }
  });

  router.post('/products/:id/children', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const parentId = parseInt(req.params.id);
      const { childProductId, quantity } = req.body;
      if (isNaN(parentId) || !childProductId) return res.status(400).json({ error: 'Invalid parameters' });
      if (parentId === childProductId) return res.status(400).json({ error: 'A product cannot be its own child' });
      const qty = quantity && Number(quantity) > 0 ? Number(quantity) : 1;
      const result = await storage.addProductChild(parentId, childProductId, qty);
      const updatedParent = await storage.recalculateParentPrice(parentId);
      res.status(201).json({ link: result, parent: updatedParent });
    } catch (error) {
      console.error('Error adding product child:', error);
      res.status(500).json({ error: 'Failed to add product child' });
    }
  });

  router.patch('/products/:parentId/children/reorder', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const parentId = parseInt(req.params.parentId);
      if (isNaN(parentId)) return res.status(400).json({ error: 'Invalid parent ID' });
      const { childIds } = req.body;
      if (!Array.isArray(childIds)) return res.status(400).json({ error: 'childIds must be an array' });
      for (let i = 0; i < childIds.length; i++) {
        await db.update(productChildrenTable)
          .set({ sortOrder: i })
          .where(and(
            eq(productChildrenTable.parentProductId, parentId),
            eq(productChildrenTable.childProductId, childIds[i])
          ));
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error reordering children:', error);
      res.status(500).json({ error: 'Failed to reorder' });
    }
  });

  router.patch('/products/:parentId/children/:childId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const parentId = parseInt(req.params.parentId);
      const childId = parseInt(req.params.childId);
      const { quantity } = req.body;
      if (isNaN(parentId) || isNaN(childId)) return res.status(400).json({ error: 'Invalid IDs' });
      if (!quantity || Number(quantity) < 1) return res.status(400).json({ error: 'Quantity must be at least 1' });
      const result = await storage.updateProductChildQuantity(parentId, childId, Number(quantity));
      const updatedParent = await storage.recalculateParentPrice(parentId);
      res.json({ link: result, parent: updatedParent });
    } catch (error) {
      console.error('Error updating product child quantity:', error);
      res.status(500).json({ error: 'Failed to update quantity' });
    }
  });

  router.delete('/products/:parentId/children/:childId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const parentId = parseInt(req.params.parentId);
      const childId = parseInt(req.params.childId);
      if (isNaN(parentId) || isNaN(childId)) return res.status(400).json({ error: 'Invalid IDs' });
      await storage.removeProductChild(parentId, childId);
      const updatedParent = await storage.recalculateParentPrice(parentId);
      res.json({ success: true, parent: updatedParent });
    } catch (error) {
      console.error('Error removing product child:', error);
      res.status(500).json({ error: 'Failed to remove product child' });
    }
  });

  // ==================== OFFER TEMPLATES ====================

  router.get('/offer-subjects', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const fromOffers = await db.execute(sql`SELECT DISTINCT subject FROM offers WHERE subject IS NOT NULL AND subject != ''`);
      const fromCustom = await db.execute(sql`SELECT subject FROM offer_subjects`);
      const allSubjects = new Set<string>();
      fromOffers.rows.forEach((r: any) => allSubjects.add(r.subject));
      fromCustom.rows.forEach((r: any) => allSubjects.add(r.subject));
      res.json(Array.from(allSubjects).sort());
    } catch (error) {
      console.error('Error fetching offer subjects:', error);
      res.status(500).json({ error: 'Failed to fetch offer subjects' });
    }
  });

  router.post('/offer-subjects', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { subject } = req.body;
      if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });
      await db.execute(sql`INSERT INTO offer_subjects (subject) VALUES (${subject.trim()}) ON CONFLICT (subject) DO NOTHING`);
      res.json({ success: true, subject: subject.trim() });
    } catch (error) {
      console.error('Error adding offer subject:', error);
      res.status(500).json({ error: 'Failed to add offer subject' });
    }
  });

  router.delete('/offer-subjects', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { subject } = req.body;
      if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });
      // Prevent deleting a subject that is still in use by an offer
      const inUse = await db.execute(sql`SELECT 1 FROM offers WHERE subject = ${subject.trim()} LIMIT 1`);
      if (inUse.rows.length > 0) {
        return res.status(409).json({ error: 'Subject is still in use by one or more offers and cannot be removed.' });
      }
      await db.execute(sql`DELETE FROM offer_subjects WHERE subject = ${subject.trim()}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting offer subject:', error);
      res.status(500).json({ error: 'Failed to delete offer subject' });
    }
  });

  router.get('/offer-templates', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const templates = await db.select().from(offerTemplates).orderBy(offerTemplates.subject, offerTemplates.name);
      res.json(templates);
    } catch (error) {
      console.error('Error fetching offer templates:', error);
      res.status(500).json({ error: 'Failed to fetch offer templates' });
    }
  });

  router.get('/offer-templates/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const [template] = await db.select().from(offerTemplates).where(eq(offerTemplates.id, id));
      if (!template) return res.status(404).json({ error: 'Template not found' });
      res.json(template);
    } catch (error) {
      console.error('Error fetching offer template:', error);
      res.status(500).json({ error: 'Failed to fetch template' });
    }
  });

  router.post('/offer-templates', ensureAuthenticated, templateUpload.single('template'), async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });
      const { name, subject, description, position, language, startPage, endPage } = req.body;
      if (!name || !subject) return res.status(400).json({ error: 'Name and subject are required' });

      const versionSeq = 1;
      const templateSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'template';
      const ext = req.file.originalname.split('.').pop()?.toLowerCase() || 'pdf';
      const seq = String(versionSeq).padStart(3, '0');
      const fileBuffer = req.file.buffer ?? fs.readFileSync(req.file.path);
      const checksumSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      // G1 — resolve governed GCS path; fail hard if no active rule
      let gcsObjectPath: string;
      try {
        gcsObjectPath = await uploadOfferTemplateToGcs(fileBuffer, templateSlug, seq, ext);
      } catch (gcsErr) {
        if (gcsErr instanceof GcsGovernanceError) {
          console.error('[offer-templates] Governance error on create:', gcsErr.message);
          return res.status(503).json({ code: 'GCS_GOVERNANCE_ERROR', error: gcsErr.message });
        }
        console.error('[offer-templates] GCS upload failed on create:', gcsErr);
        return res.status(502).json({ error: 'GCS upload failed. Template not saved.' });
      }

      const userId = (req.user as any)?.id || null;

      // G3 — DB record only after GCS success
      const [template] = await db.insert(offerTemplates).values({
        name,
        subject,
        description: description || null,
        filePath: '',
        fileName: req.file.originalname,
        fileSize: req.file.size,
        position: position || 'after',
        language: language || 'English',
        startPage: startPage ? parseInt(startPage) : null,
        endPage: endPage ? parseInt(endPage) : null,
        isActive: true,
        createdBy: userId,
        gcsObjectPath,
        gcsBucket: gcsBucketName,
        checksumSha256,
        versionSeq,
        mirrorStatus: 'pending',
        mirrorJobId: null,
      }).returning();

      // G2 — enqueue SAVE_FILE mirror job
      try {
        const jobId = await enqueueMirrorJob({
          gcsPath: gcsObjectPath,
          sourceModule: 'offer_templates',
          sourceRecordId: template.id,
          sha256: checksumSha256,
          fileName: req.file.originalname,
          createdBy: userId,
        });
        await db.update(offerTemplates).set({ mirrorJobId: jobId }).where(eq(offerTemplates.id, template.id));
        template.mirrorJobId = jobId;
      } catch (jobErr) {
        console.error('[MIRROR-JOB-FAIL] offer_templates create id=' + template.id + ':', jobErr);
        await db.update(offerTemplates).set({ mirrorStatus: 'failed' }).where(eq(offerTemplates.id, template.id));
      }

      // Audit
      await db.insert(offerTemplateAuditLog).values({
        templateId: template.id,
        action: 'template_created',
        performedBy: userId,
        versionSeq,
        meta: JSON.stringify({ fileName: template.fileName, gcsObjectPath }),
      });

      res.json(template);
    } catch (error) {
      console.error('Error creating offer template:', error);
      res.status(500).json({ error: 'Failed to create template' });
    }
  });

  router.patch('/offer-templates/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { name, subject, description, position, language, isActive, startPage, endPage } = req.body;
      const updateData: any = { updatedAt: new Date() };
      if (name !== undefined) updateData.name = name;
      if (subject !== undefined) updateData.subject = subject;
      if (description !== undefined) updateData.description = description;
      if (position !== undefined) updateData.position = position;
      if (language !== undefined) updateData.language = language;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (startPage !== undefined) updateData.startPage = startPage;
      if (endPage !== undefined) updateData.endPage = endPage;

      const [template] = await db.update(offerTemplates).set(updateData).where(eq(offerTemplates.id, id)).returning();
      if (!template) return res.status(404).json({ error: 'Template not found' });
      res.json(template);
    } catch (error) {
      console.error('Error updating offer template:', error);
      res.status(500).json({ error: 'Failed to update template' });
    }
  });

  router.post('/offer-templates/:id/replace', ensureAuthenticated, templateUpload.single('template'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });

      const [existing] = await db.select().from(offerTemplates).where(eq(offerTemplates.id, id));
      if (!existing) return res.status(404).json({ error: 'Template not found' });

      const nextSeq = (existing.versionSeq ?? 1) + 1;
      const templateSlug = existing.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'template';
      const replaceExt = req.file.originalname.split('.').pop()?.toLowerCase() || 'pdf';
      const seq = String(nextSeq).padStart(3, '0');
      const replaceBuffer = req.file.buffer ?? fs.readFileSync(req.file.path);
      const newChecksum = crypto.createHash('sha256').update(replaceBuffer).digest('hex');

      // G1 — resolve governed GCS path; fail hard if no active rule or GCS error
      let newGcsPath: string;
      try {
        newGcsPath = await uploadOfferTemplateToGcs(replaceBuffer, templateSlug, seq, replaceExt);
      } catch (gcsErr) {
        if (gcsErr instanceof GcsGovernanceError) {
          console.error('[offer-templates] Governance error on replace:', gcsErr.message);
          return res.status(503).json({ code: 'GCS_GOVERNANCE_ERROR', error: gcsErr.message });
        }
        console.error('[offer-templates] GCS upload failed on replace:', gcsErr);
        return res.status(502).json({ error: 'GCS upload failed. Template not replaced.' });
      }

      // Archive current version to revision history BEFORE updating row
      // Old GCS file is preserved — never overwritten
      await db.insert(offerTemplateRevisions).values({
        templateId: existing.id,
        versionSeq: existing.versionSeq ?? 1,
        gcsObjectPath: existing.gcsObjectPath || null,
        gcsBucket: existing.gcsBucket || null,
        fileName: existing.fileName,
        fileSize: existing.fileSize ?? null,
        checksumSha256: existing.checksumSha256 || null,
        uploadedBy: existing.createdBy || null,
        uploadedAt: existing.updatedAt || existing.createdAt || new Date(),
        status: 'superseded',
        notes: `Superseded by v${nextSeq}`,
      });

      const userId = (req.user as any)?.id || null;

      // G3 — update source row only after GCS success; reset mirror fields
      const [template] = await db.update(offerTemplates).set({
        filePath: '',
        fileName: req.file.originalname,
        fileSize: req.file.size,
        gcsObjectPath: newGcsPath,
        gcsBucket: gcsBucketName,
        checksumSha256: newChecksum,
        versionSeq: nextSeq,
        mirrorStatus: 'pending',
        mirrorJobId: null,
        updatedAt: new Date(),
      }).where(eq(offerTemplates.id, id)).returning();

      // G2 — enqueue SAVE_FILE mirror job for new version
      try {
        const jobId = await enqueueMirrorJob({
          gcsPath: newGcsPath,
          sourceModule: 'offer_templates',
          sourceRecordId: template.id,
          sha256: newChecksum,
          fileName: req.file.originalname,
          createdBy: userId,
        });
        await db.update(offerTemplates).set({ mirrorJobId: jobId }).where(eq(offerTemplates.id, id));
        template.mirrorJobId = jobId;
      } catch (jobErr) {
        console.error('[MIRROR-JOB-FAIL] offer_templates replace id=' + id + ':', jobErr);
        await db.update(offerTemplates).set({ mirrorStatus: 'failed' }).where(eq(offerTemplates.id, id));
      }

      // Audit
      await db.insert(offerTemplateAuditLog).values({
        templateId: id,
        action: 'version_uploaded',
        performedBy: userId,
        versionSeq: nextSeq,
        meta: JSON.stringify({ fileName: template.fileName, gcsObjectPath: newGcsPath, previousVersion: existing.versionSeq }),
      });

      res.json(template);
    } catch (error) {
      console.error('Error replacing offer template file:', error);
      res.status(500).json({ error: 'Failed to replace template file' });
    }
  });

  // GET revision history for a template
  router.get('/offer-templates/:id/revisions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const revisions = await db.select().from(offerTemplateRevisions)
        .where(eq(offerTemplateRevisions.templateId, id))
        .orderBy(sql`${offerTemplateRevisions.versionSeq} DESC`);
      res.json(revisions);
    } catch (error) {
      console.error('Error fetching template revisions:', error);
      res.status(500).json({ error: 'Failed to fetch revisions' });
    }
  });

  // GET audit log for a template
  router.get('/offer-templates/:id/audit', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const entries = await db.select().from(offerTemplateAuditLog)
        .where(eq(offerTemplateAuditLog.templateId, id))
        .orderBy(sql`${offerTemplateAuditLog.performedAt} DESC`);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch audit log' });
    }
  });

  // POST rollback to a specific revision
  router.post('/offer-templates/:id/rollback/:revisionId', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const revisionId = parseInt(req.params.revisionId);
      if (isNaN(id) || isNaN(revisionId)) return res.status(400).json({ error: 'Invalid ID' });

      const [existing] = await db.select().from(offerTemplates).where(eq(offerTemplates.id, id));
      if (!existing) return res.status(404).json({ error: 'Template not found' });

      const [revision] = await db.select().from(offerTemplateRevisions)
        .where(and(eq(offerTemplateRevisions.id, revisionId), eq(offerTemplateRevisions.templateId, id)));
      if (!revision) return res.status(404).json({ error: 'Revision not found' });

      const userId = (req.user as any)?.id || null;

      // Archive current live version to revisions (marked as rolled_back)
      await db.insert(offerTemplateRevisions).values({
        templateId: id,
        versionSeq: existing.versionSeq ?? 1,
        gcsObjectPath: existing.gcsObjectPath || null,
        gcsBucket: existing.gcsBucket || null,
        fileName: existing.fileName,
        fileSize: existing.fileSize ?? null,
        checksumSha256: existing.checksumSha256 || null,
        uploadedBy: existing.createdBy || null,
        uploadedAt: existing.updatedAt || existing.createdAt || new Date(),
        status: 'rolled_back',
        notes: `Rolled back to v${revision.versionSeq}`,
      });

      // Determine the new highest versionSeq after rollback (keep incrementing — never reuse old seq)
      const allRevisions = await db.select({ v: offerTemplateRevisions.versionSeq })
        .from(offerTemplateRevisions).where(eq(offerTemplateRevisions.templateId, id));
      const maxSeen = Math.max(existing.versionSeq ?? 1, ...allRevisions.map(r => r.v));
      const rollbackSeq = maxSeen + 1;

      // Promote the target revision to live (new GCS path at rollbackSeq)
      const [updated] = await db.update(offerTemplates).set({
        gcsObjectPath: revision.gcsObjectPath || null,
        gcsBucket: revision.gcsBucket || null,
        fileName: revision.fileName,
        fileSize: revision.fileSize ?? null,
        checksumSha256: revision.checksumSha256 || null,
        versionSeq: rollbackSeq,
        updatedAt: new Date(),
      }).where(eq(offerTemplates.id, id)).returning();

      // Mark the revision row as active
      await db.update(offerTemplateRevisions).set({ status: 'active' })
        .where(eq(offerTemplateRevisions.id, revisionId));

      // Audit: rollback performed
      await db.insert(offerTemplateAuditLog).values({
        templateId: id,
        action: 'rollback',
        performedBy: userId,
        versionSeq: rollbackSeq,
        meta: JSON.stringify({
          rolledBackToVersion: revision.versionSeq,
          rolledBackToRevisionId: revisionId,
          previousLiveVersion: existing.versionSeq,
        }),
      });

      res.json({ template: updated, rollbackSeq, targetRevision: revision });
    } catch (error) {
      console.error('Error rolling back template:', error);
      res.status(500).json({ error: 'Failed to rollback template' });
    }
  });

  router.delete('/offer-templates/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const [existing] = await db.select().from(offerTemplates).where(eq(offerTemplates.id, id));
      if (!existing) return res.status(404).json({ error: 'Template not found' });

      if (existing.filePath && fs.existsSync(existing.filePath)) {
        fs.unlinkSync(existing.filePath);
      }
      if (existing.gcsObjectPath) {
        try {
          await gcsClient.bucket(gcsBucketName).file(existing.gcsObjectPath).delete();
        } catch (gcsDelErr) {
          console.warn('[offer-templates] GCS delete failed:', gcsDelErr);
        }
      }

      await db.delete(offerTemplates).where(eq(offerTemplates.id, id));
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting offer template:', error);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  });

  router.get('/offer-templates/:id/download', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const [template] = await db.select().from(offerTemplates).where(eq(offerTemplates.id, id));
      if (!template) return res.status(404).json({ error: 'Template not found' });

      if (!template.gcsObjectPath) {
        return res.status(404).json({
          error: 'Template file not available in GCS. This template was uploaded before GCS governance was enforced and requires re-upload.',
        });
      }

      const signedUrl = await getTemplateSignedUrl(template.gcsObjectPath);
      return res.redirect(302, signedUrl);
    } catch (error) {
      console.error('Error downloading template:', error);
      res.status(500).json({ error: 'Failed to download template' });
    }
  });

  // ==================== OFFERS / QUOTATIONS ====================

  router.get('/offers', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const showTest = req.query.showTest === 'true';
      const offers = await storage.getOffers(showTest);
      res.json(offers);
    } catch (error) {
      console.error('Error fetching offers:', error);
      res.status(500).json({ error: 'Failed to fetch offers' });
    }
  });

  router.patch('/offers/:id/test-flag', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (user?.role !== 'Superuser') {
        return res.status(403).json({ error: 'Only Superuser can change test flag' });
      }
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { isTest } = req.body;
      if (typeof isTest !== 'boolean') return res.status(400).json({ error: 'isTest must be boolean' });
      await storage.setOfferTestFlag(id, isTest);
      res.json({ success: true });
    } catch (error) {
      console.error('Error setting offer test flag:', error);
      res.status(500).json({ error: 'Failed to update test flag' });
    }
  });

  router.get('/offers/next-number', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const nextNumber = await storage.getNextOfferNumber();
      res.json({ offerNumber: nextNumber });
    } catch (error) {
      console.error('Error getting next offer number:', error);
      res.status(500).json({ error: 'Failed to get next offer number' });
    }
  });

  router.get('/offers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const offer = await storage.getOfferById(id);
      if (!offer) return res.status(404).json({ error: 'Offer not found' });
      const items = await storage.getOfferItems(id);
      res.json({ ...offer, items });
    } catch (error) {
      console.error('Error fetching offer:', error);
      res.status(500).json({ error: 'Failed to fetch offer' });
    }
  });

  // ── Template resolver helper ────────────────────────────────────────────────
  async function resolveOfferTemplate(offer: any): Promise<{
    templatePath: string | null;
    templateRange: { startPage?: number | null; endPage?: number | null };
  }> {
    let templatePath: string | null = offer.templatePdfPath && fs.existsSync(offer.templatePdfPath)
      ? offer.templatePdfPath
      : null;
    let templateRange: { startPage?: number | null; endPage?: number | null } = {};
    if (!templatePath) {
      const offerLang = offer.language || 'English';
      const [autoTemplate] = await db.select().from(offerTemplates).where(
        and(
          eq(offerTemplates.subject, offer.subject),
          eq(offerTemplates.language, offerLang),
          eq(offerTemplates.isActive, true),
        ),
      ).limit(1);
      if (autoTemplate) {
        const resolved = await resolveTemplatePath(autoTemplate.filePath, autoTemplate.gcsObjectPath);
        if (resolved) {
          templatePath = resolved;
          templateRange = { startPage: autoTemplate.startPage, endPage: autoTemplate.endPage };
        }
      }
    }
    return { templatePath, templateRange };
  }

  // ── Upsert offer items (stable IDs) ────────────────────────────────────────
  // Submitted items whose tempKey is a numeric string matching an existing DB row
  // are UPDATED in place (IDs preserved). New items are INSERTed. Items present in
  // the DB but absent from the submission are soft-deleted (status = 'removed').
  //
  // Pass a pg PoolClient to run within an existing transaction (e.g. alongside
  // an advisory lock held by that client). When client is omitted, queries use
  // the shared pool (correct for calls outside a transaction context).
  async function upsertOfferItemsWithHierarchy(
    offerId: number,
    submittedItems: any[],
    existingItems: any[],
    client?: any,
  ): Promise<void> {
    const run = (text: string, params: any[]) =>
      client ? client.query(text, params) : pool.query(text, params);
    const existingIds = new Set(existingItems.map((i: any) => i.id));

    // Build tempKey → dbId for items that are updates of existing rows
    const tempKeyToId = new Map<string, number>();
    for (const item of submittedItems) {
      const parsed = parseInt(item.tempKey, 10);
      if (!isNaN(parsed) && String(parsed) === item.tempKey && existingIds.has(parsed)) {
        tempKeyToId.set(item.tempKey, parsed);
      }
    }

    // Topological sort — parents before children, supports unlimited depth
    const tempKeyToItem = new Map<string, any>(
      submittedItems.filter((i: any) => i.tempKey).map((i: any) => [i.tempKey, i]),
    );
    const visited = new Set<string>();
    const ordered: any[] = [];
    function visit(item: any) {
      if (!item.tempKey || visited.has(item.tempKey)) return;
      if (item.parentTempKey && tempKeyToItem.has(item.parentTempKey)) {
        visit(tempKeyToItem.get(item.parentTempKey)!);
      }
      visited.add(item.tempKey);
      ordered.push(item);
    }
    for (const item of submittedItems) {
      if (item.tempKey) visit(item);
      else ordered.push(item);
    }

    const submittedExistingIds = new Set<number>();

    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i];
      const parentId = item.parentTempKey ? (tempKeyToId.get(item.parentTempKey) ?? null) : null;
      const sortOrder = submittedItems.indexOf(item) >= 0 ? submittedItems.indexOf(item) : i;
      const isSubItem = !!(item.parentTempKey && parentId !== null);

      if (tempKeyToId.has(item.tempKey)) {
        // UPDATE existing row
        const dbId = tempKeyToId.get(item.tempKey)!;
        submittedExistingIds.add(dbId);
        await run(
          `UPDATE offer_items SET
             product_id = $1, product_code = $2, description = $3, unit = $4,
             quantity = $5, unit_price = $6, discount_percent = $7, total_price = $8,
             hsn_sac_code = $9, is_sub_item = $10, parent_item_id = $11,
             sort_order = $12, status = 'active'
           WHERE id = $13 AND offer_id = $14`,
          [
            item.productId ?? null, item.productCode ?? null, item.description,
            item.unit, item.quantity, item.unitPrice, item.discountPercent ?? '0',
            item.totalPrice, item.hsnSacCode ?? null, isSubItem, parentId,
            sortOrder, dbId, offerId,
          ],
        );
        if (item.tempKey) tempKeyToId.set(item.tempKey, dbId);
      } else {
        // INSERT new row
        const res = await run(
          `INSERT INTO offer_items
             (offer_id, product_id, product_code, description, unit, quantity, unit_price,
              discount_percent, total_price, hsn_sac_code, is_sub_item, parent_item_id,
              sort_order, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
           RETURNING id`,
          [
            offerId, item.productId ?? null, item.productCode ?? null, item.description,
            item.unit, item.quantity, item.unitPrice, item.discountPercent ?? '0',
            item.totalPrice, item.hsnSacCode ?? null, isSubItem, parentId, sortOrder,
          ],
        );
        const newId: number = res.rows[0].id;
        if (item.tempKey) tempKeyToId.set(item.tempKey, newId);
      }
    }

    // Soft-delete items in DB that were not in the submission
    const toRemove = existingItems.filter((i: any) => !submittedExistingIds.has(i.id));
    if (toRemove.length > 0) {
      const removeIds = toRemove.map((i: any) => i.id);
      await run(
        `UPDATE offer_items SET status = 'removed' WHERE id = ANY($1)`,
        [removeIds],
      );
    }
  }

  // ── Restore offer items from a snapshot (rollback helper) ──────────────────
  async function restoreOfferItemsFromSnapshot(
    offerId: number,
    snapshot: any[],
    currentItems: any[],
  ): Promise<void> {
    const snapshotIds = new Set(snapshot.map((i: any) => i.id));
    const currentIds  = new Set(currentItems.map((i: any) => i.id));

    // Delete items that were newly inserted (not in snapshot)
    const newlyInserted = currentItems.filter((i: any) => !snapshotIds.has(i.id));
    if (newlyInserted.length > 0) {
      await pool.query(
        `DELETE FROM offer_items WHERE id = ANY($1)`,
        [newlyInserted.map((i: any) => i.id)],
      );
    }

    // Restore each snapshot item to its previous values
    for (const snap of snapshot) {
      await pool.query(
        `UPDATE offer_items SET
           product_id = $1, product_code = $2, description = $3, unit = $4,
           quantity = $5, unit_price = $6, discount_percent = $7, total_price = $8,
           hsn_sac_code = $9, is_sub_item = $10, parent_item_id = $11,
           sort_order = $12, status = 'active'
         WHERE id = $13 AND offer_id = $14`,
        [
          snap.product_id, snap.product_code, snap.description, snap.unit,
          snap.quantity, snap.unit_price, snap.discount_percent, snap.total_price,
          snap.hsn_sac_code, snap.is_sub_item, snap.parent_item_id,
          snap.sort_order, snap.id, offerId,
        ],
      );
    }
  }

  function validateOfferItemHierarchy(items: any[]): string | null {
    const tempKeySet = new Set(items.map((i: any) => i.tempKey).filter(Boolean));
    for (const item of items) {
      if (item.isSubItem) {
        if (!item.parentTempKey) {
          return `Sub-item "${item.description}" is missing a parent reference.`;
        }
        if (item.tempKey && item.parentTempKey === item.tempKey) {
          return `Item "${item.description}" cannot reference itself as its own parent.`;
        }
        if (!tempKeySet.has(item.parentTempKey)) {
          return `Sub-item "${item.description}" references a parent that does not exist in this offer.`;
        }
        // Cycle detection for unlimited depth
        const visited = new Set<string>();
        let cur = item.parentTempKey;
        while (cur) {
          if (visited.has(cur)) {
            return `Circular reference detected in item hierarchy near "${item.description}".`;
          }
          visited.add(cur);
          const parent = items.find((i: any) => i.tempKey === cur);
          cur = parent?.parentTempKey || null;
        }
      }
    }
    return null;
  }

  async function insertOfferItemsWithHierarchy(offerId: number, items: any[]) {
    await db.transaction(async (tx) => {
      const tempKeyToId = new Map<string, number>();
      const tempKeyToItem = new Map<string, any>(
        items.filter(i => i.tempKey).map(i => [i.tempKey, i])
      );

      // Topological sort — parents always inserted before children, supports unlimited depth
      const visited = new Set<string>();
      const ordered: any[] = [];
      function visit(item: any) {
        if (!item.tempKey || visited.has(item.tempKey)) return;
        if (item.parentTempKey && tempKeyToItem.has(item.parentTempKey)) {
          visit(tempKeyToItem.get(item.parentTempKey)!);
        }
        visited.add(item.tempKey);
        ordered.push(item);
      }
      for (const item of items) {
        if (item.tempKey) visit(item);
        else ordered.push(item); // items without tempKey go as-is
      }

      for (let i = 0; i < ordered.length; i++) {
        const item = ordered[i];
        const parentId = item.parentTempKey ? (tempKeyToId.get(item.parentTempKey) || null) : null;
        const [created] = await tx.insert(offerItemsTable).values({
          offerId,
          productId: item.productId || null,
          productCode: item.productCode || null,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent || '0',
          totalPrice: item.totalPrice,
          hsnSacCode: item.hsnSacCode || null,
          isSubItem: !!item.parentTempKey,
          parentItemId: parentId,
          sortOrder: items.indexOf(item) >= 0 ? items.indexOf(item) : i,
        }).returning();
        if (item.tempKey) tempKeyToId.set(item.tempKey, created.id);
      }
    });
  }

  router.post('/offers', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { items, ...offerData } = req.body;
      const user = req.user as any;
      if (items && Array.isArray(items)) {
        const hierarchyError = validateOfferItemHierarchy(items);
        if (hierarchyError) return res.status(400).json({ error: hierarchyError });
      }
      const offerNumber = await storage.getNextOfferNumber();
      if (offerData.validUntil) {
        offerData.validUntil = new Date(offerData.validUntil);
      } else {
        delete offerData.validUntil;
      }

      // OFFER-FREIGHT-001: derive offer scope + server-calculate freight fields
      if (!offerData.customerId) {
        return res.status(400).json({ error: 'Customer is required.' });
      }
      const _scopeCustRow = await pool.query(
        `SELECT country_code FROM customers WHERE id = $1`,
        [offerData.customerId]
      );
      if (!_scopeCustRow.rows.length) {
        return res.status(400).json({ error: 'Customer not found.' });
      }
      const _countryCode = (_scopeCustRow.rows[0].country_code || '').trim().toUpperCase();
      if (!_countryCode) {
        return res.status(400).json({
          error: 'Country code is not set on this customer. Update the customer record before saving this offer.'
        });
      }
      const _offerScope      = _countryCode === 'IN' ? 'DOMESTIC' : 'EXPORT';
      const _taxPct          = parseFloat(offerData.taxPercent || '0');
      if (_offerScope === 'EXPORT' && _taxPct > 0) {
        return res.status(400).json({ error: 'Tax must be 0 for export offers.' });
      }
      const _freightAmount    = parseFloat(offerData.freightAmount || '0');
      const _totalAmount      = parseFloat(offerData.totalAmount   || '0');
      const _freightTaxAmount = _offerScope === 'DOMESTIC' && _taxPct > 0
        ? parseFloat((_freightAmount * _taxPct / 100).toFixed(2))
        : 0;
      const _finalValue       = parseFloat((_totalAmount + _freightAmount + _freightTaxAmount).toFixed(2));

      // Step 1 — Create offer in Draft status
      const offer = await storage.createOffer({
        offerNumber,
        customerId:         offerData.customerId         || null,
        customerName:       offerData.customerName,
        customerEmail:      offerData.customerEmail      || null,
        customerAddress:    offerData.customerAddress    || null,
        contactPerson:      offerData.contactPerson      || null,
        subject:            offerData.subject,
        currency:           offerData.currency           || 'USD',
        subtotal:           offerData.subtotal           || '0',
        discountPercent:    offerData.discountPercent    || '0',
        discountAmount:     offerData.discountAmount     || '0',
        taxPercent:         offerData.taxPercent         || '0',
        taxAmount:          offerData.taxAmount          || '0',
        totalAmount:        offerData.totalAmount        || '0',
        // OFFER-FREIGHT-001 — server-derived/calculated
        offerScope:         _offerScope,
        freightAmount:      String(_freightAmount),
        freightTaxAmount:   String(_freightTaxAmount),
        finalValue:         String(_finalValue),
        revision:           0,
        status:             'Draft',
        validUntil:         offerData.validUntil         || null,
        paymentTerms:       offerData.paymentTerms       || null,
        deliveryTerms:      offerData.deliveryTerms      || null,
        notes:              offerData.notes              || null,
        termsAndConditions: offerData.termsAndConditions || null,
        language:           offerData.language           || 'English',
        offerType:          offerData.offerType          || 'standalone',
        createdBy:          user.id,
      });

      // Step 2 — Insert items
      if (items && Array.isArray(items)) {
        await insertOfferItemsWithHierarchy(offer.id, items);
      }

      // Step 3 — Return saved offer (PDF archiving is user-triggered via Download PDF)
      const finalItems = await storage.getOfferItems(offer.id);

      return res.status(201).json({
        ...offer,
        items: finalItems,
      });
    } catch (error) {
      console.error('Error creating offer:', error);
      const errMsg = error instanceof Error ? error.message : 'Failed to create offer';
      res.status(500).json({ error: errMsg });
    }
  });

  router.patch('/offers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const existingCheck = await storage.getOfferById(id);
      if (existingCheck && existingCheck.status === 'Order Confirmed') {
        return res.status(400).json({ error: 'Offer is locked after Order Confirmed — no edits allowed' });
      }

      const { items, ...offerData } = req.body;
      if (offerData.validUntil) {
        offerData.validUntil = new Date(offerData.validUntil);
      } else {
        delete offerData.validUntil;
      }
      if (offerData.customerId === null || offerData.customerId === undefined) {
        delete offerData.customerId;
      }

      // OFFER-FREIGHT-001: derive offer scope + server-calculate freight fields
      // Use submitted customerId if present; otherwise keep current offer's customer
      const _patchCustId = offerData.customerId ?? existingCheck?.customerId;
      let _patchScope: string | null = null;
      let _patchFreightTax = 0;
      let _patchFinalValue = 0;
      if (_patchCustId) {
        const _patchCustRow = await pool.query(
          `SELECT country_code FROM customers WHERE id = $1`,
          [_patchCustId]
        );
        if (!_patchCustRow.rows.length) {
          return res.status(400).json({ error: 'Customer not found.' });
        }
        const _patchCC = (_patchCustRow.rows[0].country_code || '').trim().toUpperCase();
        if (!_patchCC) {
          return res.status(400).json({
            error: 'Country code is not set on this customer. Update the customer record before saving this offer.'
          });
        }
        _patchScope = _patchCC === 'IN' ? 'DOMESTIC' : 'EXPORT';
        const _patchTaxPct = parseFloat(offerData.taxPercent ?? existingCheck?.taxPercent ?? '0');
        if (_patchScope === 'EXPORT' && _patchTaxPct > 0) {
          return res.status(400).json({ error: 'Tax must be 0 for export offers.' });
        }
        const _patchFreight    = parseFloat(offerData.freightAmount ?? existingCheck?.freightAmount ?? '0');
        const _patchTotalAmt   = parseFloat(offerData.totalAmount   ?? existingCheck?.totalAmount   ?? '0');
        _patchFreightTax = _patchScope === 'DOMESTIC' && _patchTaxPct > 0
          ? parseFloat((_patchFreight * _patchTaxPct / 100).toFixed(2))
          : 0;
        _patchFinalValue = parseFloat((_patchTotalAmt + _patchFreight + _patchFreightTax).toFixed(2));
      }

      // Step 1 — Load current offer as full snapshot (for rollback)
      const currentOffer = await storage.getOfferById(id);
      if (!currentOffer) return res.status(404).json({ error: 'Offer not found' });

      // Reject concurrent saves
      if (currentOffer.status === 'archiving') {
        return res.status(409).json({
          error: 'Another user is currently saving this quotation. Please wait a few seconds and try again.',
        });
      }

      if (items && Array.isArray(items)) {
        const hierarchyError = validateOfferItemHierarchy(items);
        if (hierarchyError) return res.status(400).json({ error: hierarchyError });
      }

      // Step 2 — Take item snapshot for rollback
      const itemSnapshot = await pool.query(
        `SELECT * FROM offer_items WHERE offer_id = $1 AND status = 'active' ORDER BY sort_order`,
        [id],
      );
      const itemSnapRows = itemSnapshot.rows;

      // Step 3 — Compute next revision (NOT written to offers yet)
      const nextRevision = (currentOffer.revision || 0) + 1;

      // Determine target status after archive succeeds
      const targetStatus = currentOffer.status === 'Sent' ? 'Draft' : currentOffer.status;

      // Step 4 — Lock offer + update data + upsert items (short transaction)
      // A dedicated client is required so that pg_advisory_xact_lock, the offer
      // UPDATE, item upserts, and COMMIT all happen on the same session.
      const pgClient = await pool.connect();
      try {
        await pgClient.query('BEGIN');
        // Advisory lock scoped to this transaction — auto-released on COMMIT/ROLLBACK
        await pgClient.query(`SELECT pg_advisory_xact_lock($1)`, [id]);

        // Re-check status after acquiring lock (double-check for concurrent saves)
        const recheck = await pgClient.query(`SELECT status FROM offers WHERE id = $1`, [id]);
        if (recheck.rows[0]?.status === 'archiving') {
          await pgClient.query('ROLLBACK');
          pgClient.release();
          return res.status(409).json({
            error: 'Another user is currently saving this quotation. Please wait a few seconds and try again.',
          });
        }

        // UPDATE offer fields + set status and revision immediately (no archive intermediate)
        const updateFields: Record<string, any> = {};
        if (offerData.customerId !== null && offerData.customerId !== undefined) updateFields.customerId = offerData.customerId;
        if (offerData.customerName       !== undefined) updateFields.customerName       = offerData.customerName;
        if (offerData.customerEmail      !== undefined) updateFields.customerEmail      = offerData.customerEmail;
        if (offerData.customerAddress    !== undefined) updateFields.customerAddress    = offerData.customerAddress;
        if (offerData.contactPerson      !== undefined) updateFields.contactPerson      = offerData.contactPerson;
        if (offerData.subject            !== undefined) updateFields.subject            = offerData.subject;
        if (offerData.currency           !== undefined) updateFields.currency           = offerData.currency;
        if (offerData.subtotal           !== undefined) updateFields.subtotal           = offerData.subtotal;
        if (offerData.discountPercent    !== undefined) updateFields.discountPercent    = offerData.discountPercent;
        if (offerData.discountAmount     !== undefined) updateFields.discountAmount     = offerData.discountAmount;
        if (offerData.taxPercent         !== undefined) updateFields.taxPercent         = offerData.taxPercent;
        if (offerData.taxAmount          !== undefined) updateFields.taxAmount          = offerData.taxAmount;
        if (offerData.totalAmount        !== undefined) updateFields.totalAmount        = offerData.totalAmount;
        if (offerData.validUntil         !== undefined) updateFields.validUntil         = offerData.validUntil;
        if (offerData.paymentTerms       !== undefined) updateFields.paymentTerms       = offerData.paymentTerms;
        if (offerData.deliveryTerms      !== undefined) updateFields.deliveryTerms      = offerData.deliveryTerms;
        if (offerData.notes              !== undefined) updateFields.notes              = offerData.notes;
        if (offerData.termsAndConditions !== undefined) updateFields.termsAndConditions = offerData.termsAndConditions;
        if (offerData.language           !== undefined) updateFields.language           = offerData.language;
        if (offerData.offerType          !== undefined) updateFields.offerType          = offerData.offerType;
        // OFFER-FREIGHT-001 — always set server-derived/calculated values when scope resolved
        if (_patchScope !== null) {
          updateFields.offerScope        = _patchScope;
          updateFields.freightAmount     = String(parseFloat(offerData.freightAmount ?? existingCheck?.freightAmount ?? '0'));
          updateFields.freightTaxAmount  = String(_patchFreightTax);
          updateFields.finalValue        = String(_patchFinalValue);
        }

        // Build the UPDATE SQL manually (Drizzle ORM uses the pool; we need the locked client)
        // $1 = targetStatus, $2 = nextRevision; dynamic fields start at $3
        const setClauses: string[] = ['updated_at = NOW()', 'status = $1', 'revision = $2'];
        const setValues: any[]     = [targetStatus, nextRevision];
        let   paramIdx             = 3;
        const fieldMap: Record<string, string> = {
          customerId: 'customer_id', customerName: 'customer_name',
          customerEmail: 'customer_email', customerAddress: 'customer_address',
          contactPerson: 'contact_person', subject: 'subject', currency: 'currency',
          subtotal: 'subtotal', discountPercent: 'discount_percent',
          discountAmount: 'discount_amount', taxPercent: 'tax_percent',
          taxAmount: 'tax_amount', totalAmount: 'total_amount', validUntil: 'valid_until',
          paymentTerms: 'payment_terms', deliveryTerms: 'delivery_terms',
          notes: 'notes', termsAndConditions: 'terms_and_conditions',
          language: 'language', offerType: 'offer_type',
          // OFFER-FREIGHT-001
          offerScope: 'offer_scope', freightAmount: 'freight_amount',
          freightTaxAmount: 'freight_tax_amount', finalValue: 'final_value',
        };
        for (const [jsKey, sqlCol] of Object.entries(fieldMap)) {
          if (updateFields[jsKey] !== undefined) {
            setClauses.push(`${sqlCol} = $${paramIdx++}`);
            setValues.push(updateFields[jsKey]);
          }
        }
        setValues.push(id);
        await pgClient.query(
          `UPDATE offers SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
          setValues,
        );

        // Upsert items on the same locked client
        if (items && Array.isArray(items)) {
          await upsertOfferItemsWithHierarchy(id, items, itemSnapRows, pgClient);
        }

        await pgClient.query('COMMIT');
      } catch (txErr) {
        await pgClient.query('ROLLBACK').catch(() => {});
        pgClient.release();
        throw txErr;
      }
      pgClient.release();

      // Step 5 — Reload and return (revision + status already written in transaction)
      const finalOffer = await storage.getOfferById(id);
      const finalItems = await storage.getOfferItems(id);

      return res.json({
        ...finalOffer,
        items: finalItems,
      });
    } catch (error) {
      console.error('Error updating offer:', error);
      const errMsg = error instanceof Error ? error.message : 'Failed to update offer';
      res.status(500).json({ error: errMsg });
    }
  });

  // ── Retry archive for archive_failed offers (Manager+) ────────────────────
  router.post('/offers/:id/retry-archive', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id   = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const user = req.user as any;
      if (!['Superuser', 'General Manager', 'Senior Manager', 'Manager'].includes(user.role)) {
        return res.status(403).json({ error: 'Access denied — only Manager or above can retry archive' });
      }

      const offer = await storage.getOfferById(id);
      if (!offer) return res.status(404).json({ error: 'Offer not found' });
      if (offer.status !== 'archive_failed') {
        return res.status(400).json({ error: `Offer is not in archive_failed state (current: ${offer.status})` });
      }

      // Determine the revision this offer should archive as
      // If no archive_revision exists for current revision, use current revision (CREATED)
      // If an archive_revision already exists for current revision (failed CREATED), use that revision
      // If this was a failed UPDATE, the revision was pre-computed but not written — read from offer_archive_revisions
      const archRevRes = await pool.query(
        `SELECT revision, action_type FROM offer_archive_revisions
         WHERE offer_id = $1 AND status = 'failed'
         ORDER BY archived_at DESC LIMIT 1`,
        [id],
      );
      const targetRevision  = archRevRes.rows.length > 0 ? archRevRes.rows[0].revision : offer.revision ?? 0;
      const actionType      = archRevRes.rows.length > 0 ? archRevRes.rows[0].action_type : 'CREATED';

      // Mark offer as archiving again
      await storage.updateOffer(id, { status: 'archiving' });

      const itemsRes = await pool.query(
        `SELECT * FROM offer_items WHERE offer_id = $1 AND status = 'active' ORDER BY sort_order`,
        [id],
      );
      const { templatePath, templateRange } = await resolveOfferTemplate(offer);

      try {
        await runDocumentArchive({
          offerId:     id,
          offerNumber: offer.offerNumber,
          revision:    targetRevision,
          actionType:  actionType as 'CREATED' | 'UPDATED',
          userId:      user.id,
          strategy:    new QuotationArchiveStrategy(offer, itemsRes.rows, templatePath, templateRange),
        });
      } catch (archiveErr: any) {
        await storage.updateOffer(id, { status: 'archive_failed' });
        return res.status(500).json({
          error:  'Retry archive failed',
          detail: archiveErr.message,
        });
      }

      // Success — write revision and activate
      const targetStatus = offer.status === 'Sent' ? 'Draft' : (offer.status === 'archive_failed' ? 'Draft' : offer.status);
      const finalOffer   = await storage.updateOffer(id, { revision: targetRevision, status: targetStatus });
      return res.json({ ...finalOffer, archivedRevision: targetRevision });

    } catch (error: any) {
      console.error('[retry-archive] Error:', error);
      res.status(500).json({ error: error.message || 'Retry archive failed' });
    }
  });

  // ── Archive selected PDF mode on user demand (triggered from Download PDF dialog) ──
  router.post('/offers/:id/archive-pdf', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const { priceMode } = req.body;
      if (!['combined', 'breakup', 'technical'].includes(priceMode)) {
        return res.status(400).json({ error: 'Invalid priceMode — must be combined, breakup, or technical' });
      }

      const offer = await storage.getOfferById(id);
      if (!offer) return res.status(404).json({ error: 'Offer not found' });

      const userId   = (req.user as any)?.id || 0;
      const revision = offer.revision ?? 0;

      // Transition Draft → Sent on first PDF generation (same as GET /pdf)
      if (offer.status === 'Draft') {
        await storage.updateOffer(id, { status: 'Sent' });
      }

      const items = await storage.getOfferItems(id);
      const { templatePath, templateRange } = await resolveOfferTemplate(offer);

      // Archive: GCS upload + artifact row + SAVE_FILE mirror job (single mode)
      await runDocumentArchive({
        offerId:     id,
        offerNumber: offer.offerNumber,
        revision,
        actionType:  'UPDATED',
        userId,
        strategy:    new QuotationArchiveStrategy(offer, items, templatePath, templateRange, priceMode as 'combined' | 'breakup' | 'technical'),
      });

      // Generate PDF buffer to return to client for immediate viewing/download
      const generator = new OfferPdfGenerator({
        offerNumber:         offer.offerNumber,
        revision,
        createdAt:           offer.createdAt?.toISOString() || new Date().toISOString(),
        customerName:        offer.customerName,
        customerEmail:       offer.customerEmail       || '',
        customerAddress:     offer.customerAddress     || '',
        contactPerson:       offer.contactPerson       || '',
        subject:             offer.subject,
        currency:            offer.currency,
        subtotal:            offer.subtotal,
        discountPercent:     offer.discountPercent     || '0',
        discountAmount:      offer.discountAmount      || '0',
        taxPercent:          offer.taxPercent          || '0',
        taxAmount:           offer.taxAmount           || '0',
        totalAmount:         offer.totalAmount,
        validUntil:          offer.validUntil?.toISOString() || '',
        paymentTerms:        offer.paymentTerms        || '',
        deliveryTerms:       offer.deliveryTerms       || '',
        notes:               offer.notes               || '',
        termsAndConditions:  offer.termsAndConditions  || '',
        items: (items as any[]).map((item) => ({
          description:     item.description,
          productCode:     item.productCode     || '',
          unit:            item.unit,
          quantity:        item.quantity,
          unitPrice:       item.unitPrice,
          discountPercent: item.discountPercent  || '0',
          totalPrice:      item.totalPrice,
          hsnSacCode:      item.hsnSacCode      || '',
          isSubItem:       item.isSubItem        || false,
        })),
      }, { priceMode: priceMode as 'combined' | 'breakup' | 'technical' });

      let pdfBuffer: Buffer;
      if (templatePath && fs.existsSync(templatePath)) {
        pdfBuffer = await generator.generateWithTemplateToBuffer(templatePath, templateRange);
      } else {
        pdfBuffer = await generator.generateToBuffer();
      }

      const safeName = offer.offerNumber.replace(/\//g, '-');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}_${priceMode}_Quotation.pdf"`);
      res.end(pdfBuffer);

    } catch (error: any) {
      console.error('[archive-pdf] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to archive and generate PDF' });
    }
  });

  const ORDER_CONFIRM_ROLES = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];

  router.patch('/offers/:id/status', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { status, epcParams } = req.body;
      const user = req.user as any;

      if (status === 'Order Confirmed') {
        if (!ORDER_CONFIRM_ROLES.includes(user.role)) {
          return res.status(403).json({ error: 'Access denied — only Manager or above can confirm orders' });
        }

        // Gate: confirmation document must be uploaded before conversion
        const offerCheck = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
        if (!offerCheck[0]) return res.status(404).json({ error: 'Offer not found' });
        if (!offerCheck[0].confirmationDocGcsPath) {
          const docLabel = offerCheck[0].offerType === 'project-linked' ? 'Customer-signed Sales Contract' : 'Customer Order (PO)';
          return res.status(422).json({
            error: 'Pre-conversion validation failed',
            failures: [{ field: 'confirmationDoc', reason: `${docLabel} must be uploaded before confirming the order` }],
          });
        }

        const { executeOfferConversion } = await import('./offer-conversion');
        if (!epcParams) {
          return res.status(422).json({
            error: 'Pre-conversion validation failed',
            failures: [{ field: 'epcParams', reason: 'EPC parameters required for Order Confirmed' }],
          });
        }
        const missingTechnical: { field: string; reason: string }[] = [];
        if (!epcParams.disciplineCode) missingTechnical.push({ field: 'disciplineCode', reason: 'Project Discipline is required before creating an EPC Project' });
        if (!epcParams.mdmt)           missingTechnical.push({ field: 'mdmt',           reason: 'MDMT is required before creating an EPC Project' });
        if (!epcParams.inspectionBy)   missingTechnical.push({ field: 'inspectionBy',   reason: 'Inspection By is required before creating an EPC Project' });
        if (!epcParams.voltageFrequency) missingTechnical.push({ field: 'voltageFrequency', reason: 'Three-Phase Voltage & Frequency is required before creating an EPC Project' });
        if (missingTechnical.length > 0) {
          return res.status(422).json({ error: 'Pre-conversion validation failed', failures: missingTechnical });
        }
        try {
          const result = await executeOfferConversion(id, epcParams, user.id);
          return res.json(result);
        } catch (convError: any) {
          if (convError.statusCode === 422) {
            return res.status(422).json({ error: convError.message, failures: convError.failures });
          }
          if (convError.statusCode === 409) {
            return res.status(409).json({ error: convError.message, alreadyConverted: true, result: convError.result });
          }
          throw convError;
        }
      }

      const existingOffer = await storage.getOfferById(id);
      if (existingOffer && existingOffer.status === 'Order Confirmed') {
        return res.status(400).json({ error: 'Offer is locked after Order Confirmed — no status changes allowed' });
      }

      const updateData: any = { status };
      if (status === 'Approved') {
        updateData.approvedBy = user.id;
        updateData.approvedAt = new Date();
      }
      const offer = await storage.updateOffer(id, updateData);
      res.json(offer);
    } catch (error) {
      console.error('Error updating offer status:', error);
      res.status(500).json({ error: 'Failed to update offer status' });
    }
  });

  router.delete('/offers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const existingOffer = await storage.getOfferById(id);
      if (existingOffer && existingOffer.status === 'Order Confirmed') {
        return res.status(400).json({ error: 'Offer is locked after Order Confirmed — cannot be deleted' });
      }

      await storage.deleteOffer(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting offer:', error);
      res.status(500).json({ error: 'Failed to delete offer' });
    }
  });

  router.get('/offers/:id/pdf', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const offer = await storage.getOfferById(id);
      if (!offer) return res.status(404).json({ error: 'Offer not found' });
      const allItems = await storage.getOfferItems(id);
      const priceMode = (req.query.priceMode as string) || 'combined';
      const forceRegenerate = req.query.regenerate === 'true';
      const items = allItems;
      const userId = (req.user as any)?.id || 0;

      if (!forceRegenerate && (offer.status === 'Order Confirmed' || offer.status === 'Sent')) {
        const existingArtifact = await getActiveArtifact(id, offer.revision || 0, priceMode);
        if (existingArtifact) {
          try {
            const buffer = await downloadArtifactBuffer(existingArtifact.gcs_object_path);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${offer.offerNumber.replace(/\//g, '-')}_Quotation.pdf"`);
            res.setHeader('X-Artifact-Id', String(existingArtifact.id));
            res.setHeader('X-Artifact-Checksum', existingArtifact.checksum_sha256);
            return res.end(buffer);
          } catch (gcsErr) {
            console.warn(`[quotation-pdf] Failed to download stored artifact ${existingArtifact.id}, regenerating:`, gcsErr);
          }
        }
      }

      if (offer.status === 'Draft') {
        await storage.updateOffer(id, { status: 'Sent' });
      }

      const generator = new OfferPdfGenerator({
        offerNumber: offer.offerNumber,
        revision: offer.revision || 0,
        createdAt: offer.createdAt?.toISOString() || new Date().toISOString(),
        customerName: offer.customerName,
        customerEmail: offer.customerEmail || '',
        customerAddress: offer.customerAddress || '',
        contactPerson: offer.contactPerson || '',
        subject: offer.subject,
        currency: offer.currency,
        subtotal: offer.subtotal,
        discountPercent: offer.discountPercent || '0',
        discountAmount: offer.discountAmount || '0',
        taxPercent: offer.taxPercent || '0',
        taxAmount: offer.taxAmount || '0',
        totalAmount: offer.totalAmount,
        validUntil: offer.validUntil?.toISOString() || '',
        paymentTerms: offer.paymentTerms || '',
        deliveryTerms: offer.deliveryTerms || '',
        notes: offer.notes || '',
        termsAndConditions: offer.termsAndConditions || '',
        items: items.map(item => ({
          description: item.description,
          productCode: item.productCode || '',
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent || '0',
          totalPrice: item.totalPrice,
          hsnSacCode: item.hsnSacCode || '',
          isSubItem: item.isSubItem || false,
        })),
      }, { priceMode: priceMode as 'combined' | 'breakup' | 'technical' });

      let templatePath: string | null = offer.templatePdfPath && fs.existsSync(offer.templatePdfPath)
        ? offer.templatePdfPath : null;
      let templatePageRange: { startPage?: number | null; endPage?: number | null } = {};

      if (!templatePath) {
        const offerLang = (offer as any).language || 'English';
        const [autoTemplate] = await db.select().from(offerTemplates).where(
          and(
            eq(offerTemplates.subject, offer.subject),
            eq(offerTemplates.language, offerLang),
            eq(offerTemplates.isActive, true)
          )
        ).limit(1);
        if (autoTemplate) {
          const resolved = await resolveTemplatePath(autoTemplate.filePath, autoTemplate.gcsObjectPath);
          if (resolved) {
            templatePath = resolved;
            templatePageRange = { startPage: autoTemplate.startPage, endPage: autoTemplate.endPage };
          }
        }
      }

      let pdfBuffer: Buffer;
      if (templatePath) {
        pdfBuffer = await generator.generateWithTemplateToBuffer(templatePath, templatePageRange);
      } else {
        pdfBuffer = await generator.generateToBuffer();
      }

      let artifactId: number | undefined;
      let artifactChecksum: string | undefined;
      try {
        const result = await storeQuotationPdfArtifact(
          pdfBuffer, id, offer.offerNumber, offer.revision || 0, priceMode, userId
        );
        artifactId = result.artifactId;
        artifactChecksum = result.checksum;
        console.log(`[quotation-pdf] Artifact ${artifactId} created for offer ${offer.offerNumber} rev ${offer.revision} mode ${priceMode}`);
      } catch (storeErr) {
        console.error(`[quotation-pdf] Failed to store artifact for offer ${id}, serving directly:`, storeErr);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${offer.offerNumber.replace(/\//g, '-')}_Quotation.pdf"`);
      if (artifactId) res.setHeader('X-Artifact-Id', String(artifactId));
      if (artifactChecksum) res.setHeader('X-Artifact-Checksum', artifactChecksum);
      res.end(pdfBuffer);
    } catch (error) {
      console.error('Error generating offer PDF:', error);
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  });

  /**
   * POST /offers/:id/generate-and-store
   * Generates the quotation PDF and uploads it to GCS using a two-phase atomic commit.
   * Returns JSON { artifactId, gcsObjectPath, attachmentSeq } — path is final only after upload.
   * Failed GCS upload rolls back the DB record (no dangling artifact).
   */
  router.post('/offers/:id/generate-and-store', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const offer = await storage.getOfferById(id);
      if (!offer) return res.status(404).json({ error: 'Offer not found' });
      const priceMode = (req.body.priceMode as string) || 'combined';
      if (!['combined', 'breakup', 'technical'].includes(priceMode)) {
        return res.status(400).json({ error: 'Invalid priceMode' });
      }
      const userId = (req.user as any)?.id || 0;
      const allItems = await storage.getOfferItems(id);

      const generator = new OfferPdfGenerator({
        offerNumber: offer.offerNumber,
        revision: offer.revision || 0,
        createdAt: offer.createdAt?.toISOString() || new Date().toISOString(),
        customerName: offer.customerName,
        customerEmail: offer.customerEmail || '',
        customerAddress: offer.customerAddress || '',
        contactPerson: offer.contactPerson || '',
        subject: offer.subject,
        currency: offer.currency,
        subtotal: offer.subtotal,
        discountPercent: offer.discountPercent || '0',
        discountAmount: offer.discountAmount || '0',
        taxPercent: offer.taxPercent || '0',
        taxAmount: offer.taxAmount || '0',
        totalAmount: offer.totalAmount,
        validUntil: offer.validUntil?.toISOString() || '',
        paymentTerms: offer.paymentTerms || '',
        deliveryTerms: offer.deliveryTerms || '',
        notes: offer.notes || '',
        termsAndConditions: offer.termsAndConditions || '',
        items: allItems.map(item => ({
          description: item.description,
          productCode: item.productCode || '',
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent || '0',
          totalPrice: item.totalPrice,
          hsnSacCode: item.hsnSacCode || '',
          isSubItem: item.isSubItem || false,
        })),
      }, { priceMode: priceMode as 'combined' | 'breakup' | 'technical' });

      let templatePath: string | null = offer.templatePdfPath && fs.existsSync(offer.templatePdfPath)
        ? offer.templatePdfPath : null;
      let templatePageRange: { startPage?: number | null; endPage?: number | null } = {};
      if (!templatePath) {
        const offerLang = (offer as any).language || 'English';
        const [autoTemplate] = await db.select().from(offerTemplates).where(
          and(
            eq(offerTemplates.subject, offer.subject),
            eq(offerTemplates.language, offerLang),
            eq(offerTemplates.isActive, true)
          )
        ).limit(1);
        if (autoTemplate) {
          const resolved = await resolveTemplatePath(autoTemplate.filePath, autoTemplate.gcsObjectPath);
          if (resolved) {
            templatePath = resolved;
            templatePageRange = { startPage: autoTemplate.startPage, endPage: autoTemplate.endPage };
          }
        }
      }

      let pdfBuffer: Buffer;
      if (templatePath) {
        pdfBuffer = await generator.generateWithTemplateToBuffer(templatePath, templatePageRange);
      } else {
        pdfBuffer = await generator.generateToBuffer();
      }

      const result = await storeQuotationPdfArtifactTwoPhase(
        pdfBuffer, id, offer.offerNumber, offer.revision || 0, priceMode, userId
      );

      res.json({
        artifactId:    result.artifactId,
        gcsObjectPath: result.gcsObjectPath,
        attachmentSeq: result.attachmentSeq,
        checksum:      result.checksum,
      });
    } catch (error: any) {
      console.error('[generate-and-store] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate and store PDF' });
    }
  });

  router.get('/offers/:id/artifacts', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const artifacts = await listArtifactsForOffer(id);
      res.json(artifacts);
    } catch (error) {
      console.error('Error fetching artifacts:', error);
      res.status(500).json({ error: 'Failed to fetch artifacts' });
    }
  });

  router.post('/artifacts/:artifactId/repair-epc-attachment', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const artifactId = parseInt(req.params.artifactId);
      if (isNaN(artifactId)) return res.status(400).json({ error: 'Invalid artifact ID' });
      const user = req.user as any;
      const REPAIR_ROLES = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
      if (!REPAIR_ROLES.includes(user.role)) {
        return res.status(403).json({ error: 'Access denied — only Manager or above can repair EPC attachments' });
      }

      const artifact = await getArtifactById(artifactId);
      if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
      if (artifact.epc_attachment_status !== 'failed') {
        return res.status(400).json({ error: `Cannot repair artifact with status '${artifact.epc_attachment_status}'` });
      }
      if (!artifact.is_confirmed) {
        return res.status(400).json({ error: 'Only confirmed artifacts can be attached to EPC' });
      }

      const { pool: dbPool } = await import('./db');
      const snapResult = await dbPool.query(
        `SELECT s.project_id, p.code FROM offer_conversion_snapshots s
         JOIN projects p ON p.id = s.project_id
         WHERE s.offer_id = $1 AND s.conversion_status = 'completed'
         LIMIT 1`,
        [artifact.offer_id]
      );
      if (snapResult.rows.length === 0) {
        return res.status(400).json({ error: 'No completed conversion found for this offer' });
      }
      const { project_id, code: projectCode } = snapResult.rows[0];
      const offerResult = await dbPool.query(`SELECT offer_number FROM offers WHERE id = $1`, [artifact.offer_id]);
      const offerNumber = offerResult.rows[0]?.offer_number || '';

      const result = await attachConfirmedArtifactToEpc(
        artifactId, project_id, projectCode, artifact.offer_id, offerNumber, user.id
      );

      if (result.success) {
        res.json({ success: true, epcAttachmentId: result.epcAttachmentId });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (error) {
      console.error('Error repairing EPC attachment:', error);
      res.status(500).json({ error: 'Failed to repair EPC attachment' });
    }
  });

  router.post('/offers/:id/template', ensureAuthenticated, templateUpload.single('template'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const offer = await storage.getOfferById(id);
      if (!offer) return res.status(404).json({ error: 'Offer not found' });

      if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });

      if (offer.templatePdfPath && fs.existsSync(offer.templatePdfPath)) {
        fs.unlinkSync(offer.templatePdfPath);
      }

      const position = req.body.position || 'after';
      await db.update(offers).set({
        templatePdfPath: req.file.path,
        templatePdfName: req.file.originalname,
        templatePdfPosition: position,
      }).where(eq(offers.id, id));

      res.json({
        success: true,
        templateName: req.file.originalname,
        templatePosition: position,
      });
    } catch (error) {
      console.error('Error uploading offer template:', error);
      res.status(500).json({ error: 'Failed to upload template' });
    }
  });

  router.delete('/offers/:id/template', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const offer = await storage.getOfferById(id);
      if (!offer) return res.status(404).json({ error: 'Offer not found' });

      if (offer.templatePdfPath && fs.existsSync(offer.templatePdfPath)) {
        fs.unlinkSync(offer.templatePdfPath);
      }

      await db.update(offers).set({
        templatePdfPath: null,
        templatePdfName: null,
        templatePdfPosition: 'after',
      }).where(eq(offers.id, id));

      res.json({ success: true });
    } catch (error) {
      console.error('Error removing offer template:', error);
      res.status(500).json({ error: 'Failed to remove template' });
    }
  });

  // Get customers for offer customer selection
  router.get('/customers', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { db } = await import('./db');
      const { customers } = await import('@shared/schema');
      const result = await db.select().from(customers).orderBy(customers.bpName);
      res.json(result);
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  // ── Confirmation Document Upload ─────────────────────────────────────────
  router.post('/offers/:id/confirmation-doc', ensureAuthenticated, confirmDocUpload.single('file'), async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded' });

      const offer = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
      if (!offer[0]) return res.status(404).json({ error: 'Offer not found' });
      if (offer[0].status === 'Order Confirmed') {
        return res.status(400).json({ error: 'Offer is locked — cannot replace confirmation document after Order Confirmed' });
      }

      const gcsPath = buildConfirmationDocGcsPath(offer[0].offerNumber, offer[0].customerName, offer[0].offerType);
      const bucket = gcsClient.bucket(gcsBucketName);
      const gcsFile = bucket.file(gcsPath);
      await gcsFile.save(req.file.buffer, { contentType: 'application/pdf', resumable: false });

      await db.update(offers)
        .set({ confirmationDocGcsPath: gcsPath, confirmationDocFilename: req.file.originalname })
        .where(eq(offers.id, id));

      const docLabel = offer[0].offerType === 'project-linked' ? 'Sales Contract' : 'Customer Order';
      console.log(`[confirmation-doc] Uploaded ${docLabel} for offer ${offer[0].offerNumber} → ${gcsPath}`);
      res.json({ success: true, gcsPath, filename: req.file.originalname });
    } catch (error: any) {
      console.error('[confirmation-doc] Upload error:', error);
      res.status(500).json({ error: 'Failed to upload confirmation document' });
    }
  });

  // ── Confirmation Document Signed URL ─────────────────────────────────────
  router.get('/offers/:id/confirmation-doc/url', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

      const offer = await db.select().from(offers).where(eq(offers.id, id)).limit(1);
      if (!offer[0]) return res.status(404).json({ error: 'Offer not found' });
      if (!offer[0].confirmationDocGcsPath) return res.status(404).json({ error: 'No confirmation document uploaded' });

      const bucket = gcsClient.bucket(gcsBucketName);
      const file = bucket.file(offer[0].confirmationDocGcsPath);
      const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 60 * 60 * 1000 });
      res.json({ url, filename: offer[0].confirmationDocFilename });
    } catch (error: any) {
      console.error('[confirmation-doc] Signed URL error:', error);
      res.status(500).json({ error: 'Failed to generate download URL' });
    }
  });

  // ── Offer Communication Register routes ────────────────────────────────────
  registerOfferCommRoutes(router);

  console.log('Sales and marketing routes registered with tank prices');
}
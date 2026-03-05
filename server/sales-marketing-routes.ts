import express, { Express, Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { z } from 'zod';
import { insertLeadSchema, tankPrices, plantCosts, insertProductAttributeOptionSchema, insertProductSchema } from '@shared/schema';
import { db } from './db';
import { eq } from 'drizzle-orm';

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

// Product Attribute Options Routes
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

router.post('/product-attributes', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const validated = insertProductAttributeOptionSchema.parse(req.body);
    if (validated.code && validated.attributeType !== 'property_3' && validated.code.length !== 3) {
      return res.status(400).json({ error: 'Code must be exactly 3 characters' });
    }
    const allOptions = await storage.getAttributeOptions(validated.attributeType);
    const duplicate = allOptions.find((o: any) =>
      o.code === validated.code &&
      (o.parentId ?? null) === (validated.parentId ?? null)
    );
    if (duplicate) {
      return res.status(400).json({ error: `Code "${validated.code}" already exists under this parent. Each code must be unique within its parent scope.` });
    }
    const option = await storage.createAttributeOption(validated);
    res.status(201).json(option);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    console.error('Error creating product attribute option:', error);
    res.status(500).json({ error: 'Failed to create product attribute option' });
  }
});

router.patch('/product-attributes/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    if (req.body.code) {
      const allOptions = await storage.getAttributeOptions(req.body.attributeType);
      const duplicate = allOptions.find((o: any) =>
        o.id !== id &&
        o.code === req.body.code &&
        (o.parentId ?? null) === (req.body.parentId ?? null)
      );
      if (duplicate) {
        return res.status(400).json({ error: `Code "${req.body.code}" already exists under this parent. Each code must be unique within its parent scope.` });
      }
    }
    const option = await storage.updateAttributeOption(id, req.body);
    res.json(option);
  } catch (error) {
    console.error('Error updating product attribute option:', error);
    res.status(500).json({ error: 'Failed to update product attribute option' });
  }
});

router.delete('/product-attributes/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    await storage.deleteAttributeOption(id);
    res.status(204).send();
  } catch (error) {
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
      const { childProductId } = req.body;
      if (isNaN(parentId) || !childProductId) return res.status(400).json({ error: 'Invalid parameters' });
      if (parentId === childProductId) return res.status(400).json({ error: 'A product cannot be its own child' });
      const result = await storage.addProductChild(parentId, childProductId);
      const updatedParent = await storage.recalculateParentPrice(parentId);
      res.status(201).json({ link: result, parent: updatedParent });
    } catch (error) {
      console.error('Error adding product child:', error);
      res.status(500).json({ error: 'Failed to add product child' });
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

  // ==================== OFFERS / QUOTATIONS ====================

  router.get('/offers', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const offers = await storage.getOffers();
      res.json(offers);
    } catch (error) {
      console.error('Error fetching offers:', error);
      res.status(500).json({ error: 'Failed to fetch offers' });
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

  router.post('/offers', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const { items, ...offerData } = req.body;
      const user = req.user as any;
      const offerNumber = await storage.getNextOfferNumber();
      const offer = await storage.createOffer({
        ...offerData,
        offerNumber,
        createdBy: user.id,
      });

      if (items && Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
          await storage.createOfferItem({
            ...items[i],
            offerId: offer.id,
            sortOrder: i,
          });
        }
      }

      const savedItems = await storage.getOfferItems(offer.id);
      res.status(201).json({ ...offer, items: savedItems });
    } catch (error) {
      console.error('Error creating offer:', error);
      res.status(500).json({ error: 'Failed to create offer' });
    }
  });

  router.patch('/offers/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { items, ...offerData } = req.body;
      const offer = await storage.updateOffer(id, offerData);

      if (items && Array.isArray(items)) {
        const existingItems = await storage.getOfferItems(id);
        for (const existing of existingItems) {
          await storage.deleteOfferItem(existing.id);
        }
        for (let i = 0; i < items.length; i++) {
          await storage.createOfferItem({
            ...items[i],
            offerId: id,
            sortOrder: i,
          });
        }
      }

      const savedItems = await storage.getOfferItems(id);
      res.json({ ...offer, items: savedItems });
    } catch (error) {
      console.error('Error updating offer:', error);
      res.status(500).json({ error: 'Failed to update offer' });
    }
  });

  router.patch('/offers/:id/status', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
      const { status } = req.body;
      const user = req.user as any;
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
      await storage.deleteOffer(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting offer:', error);
      res.status(500).json({ error: 'Failed to delete offer' });
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

  console.log('Sales and marketing routes registered with tank prices');
}
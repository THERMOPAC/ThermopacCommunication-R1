import express, { Express, Request, Response } from 'express';
import { storage } from './storage';
import { ensureAuthenticated } from './auth';
import { z } from 'zod';
import { leadInsertSchema } from '@shared/schema';

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
    const validatedData = leadInsertSchema.parse(req.body);
    
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

// Export the router
export default router;

/**
 * Set up sales and marketing routes
 * @param app Express application
 */
export function setupSalesMarketingRoutes(app: Express) {
  app.use('/api/sales-marketing', router);
  console.log('Sales and marketing routes registered');
}
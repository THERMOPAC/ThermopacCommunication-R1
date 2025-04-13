import { Router } from 'express';
import { db } from './db';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import { 
  serviceRequests, 
  serviceActivities, 
  serviceParts,
  customerFollowups,
  businessOpportunities,
  serviceContracts,
  contractServices,
  contractDeliveries,
  customers,
  masterItems,
  users,
  projects,
  insertServiceRequestSchema,
  insertServiceActivitySchema,
  insertServicePartSchema,
  insertCustomerFollowupSchema,
  insertBusinessOpportunitySchema,
  insertServiceContractSchema,
  insertContractServiceSchema,
  insertContractDeliverySchema
} from '@shared/schema';
import { ZodError } from 'zod';
import { formatZodError } from './utils/format-zod-error';
import { gcsStorage } from './utils/gcs-storage';
import multer from 'multer';
import { authenticateUser } from './middlewares/auth';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

// Middleware to require authentication for all after-sales routes
router.use(authenticateUser);

/**
 * Service Requests
 */
// Get all service requests
router.get('/service-requests', async (req, res) => {
  try {
    const serviceRequestsList = await db.query.serviceRequests.findMany({
      with: {
        customer: true,
        project: true,
        createdBy: true,
        assignedTo: true,
        activities: {
          with: {
            performedBy: true
          }
        }
      },
      orderBy: [desc(serviceRequests.created_at)]
    });
    
    res.json(serviceRequestsList);
  } catch (error) {
    console.error('Error fetching service requests:', error);
    res.status(500).json({ message: 'Failed to fetch service requests' });
  }
});

// Get a specific service request by ID
router.get('/service-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const serviceRequest = await db.query.serviceRequests.findFirst({
      where: eq(serviceRequests.id, parseInt(id)),
      with: {
        customer: true,
        project: true,
        createdBy: true,
        assignedTo: true,
        activities: {
          with: {
            performedBy: true,
            parts: {
              with: {
                item: true
              }
            }
          }
        }
      }
    });
    
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }
    
    res.json(serviceRequest);
  } catch (error) {
    console.error('Error fetching service request:', error);
    res.status(500).json({ message: 'Failed to fetch service request' });
  }
});

// Create a new service request
router.post('/service-requests', async (req, res) => {
  try {
    const data = insertServiceRequestSchema.parse(req.body);
    
    // Add the current user as the creator
    data.created_by = req.user!.id;
    
    const [newServiceRequest] = await db.insert(serviceRequests)
      .values({
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning();
    
    res.status(201).json(newServiceRequest);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error creating service request:', error);
    res.status(500).json({ message: 'Failed to create service request' });
  }
});

// Update a service request
router.put('/service-requests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = insertServiceRequestSchema.parse(req.body);
    
    const [updatedServiceRequest] = await db.update(serviceRequests)
      .set({
        ...data,
        updated_at: new Date()
      })
      .where(eq(serviceRequests.id, parseInt(id)))
      .returning();
    
    if (!updatedServiceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }
    
    res.json(updatedServiceRequest);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error updating service request:', error);
    res.status(500).json({ message: 'Failed to update service request' });
  }
});

/**
 * Service Activities
 */
// Get all activities for a service request
router.get('/service-requests/:requestId/activities', async (req, res) => {
  try {
    const { requestId } = req.params;
    const activities = await db.query.serviceActivities.findMany({
      where: eq(serviceActivities.service_request_id, parseInt(requestId)),
      with: {
        performedBy: true,
        parts: {
          with: {
            item: true
          }
        }
      },
      orderBy: [desc(serviceActivities.created_at)]
    });
    
    res.json(activities);
  } catch (error) {
    console.error('Error fetching service activities:', error);
    res.status(500).json({ message: 'Failed to fetch service activities' });
  }
});

// Create a new service activity
router.post('/service-requests/:requestId/activities', async (req, res) => {
  try {
    const { requestId } = req.params;
    const data = insertServiceActivitySchema.parse(req.body);
    
    // Verify the service request exists
    const serviceRequest = await db.query.serviceRequests.findFirst({
      where: eq(serviceRequests.id, parseInt(requestId))
    });
    
    if (!serviceRequest) {
      return res.status(404).json({ message: 'Service request not found' });
    }
    
    // Convert dates to string format before insertion
    const valuesToInsert = {
      ...data,
      scheduled_date: data.scheduled_date ? new Date(data.scheduled_date).toISOString() : undefined,
      actual_date: data.actual_date ? new Date(data.actual_date).toISOString() : undefined,
      service_request_id: parseInt(requestId),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const [newActivity] = await db.insert(serviceActivities)
      .values(valuesToInsert)
      .returning();
    
    res.status(201).json(newActivity);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error creating service activity:', error);
    res.status(500).json({ message: 'Failed to create service activity' });
  }
});

// Update a service activity
router.put('/service-activities/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = insertServiceActivitySchema.parse(req.body);
    
    const [updatedActivity] = await db.update(serviceActivities)
      .set({
        ...data,
        updated_at: new Date()
      })
      .where(eq(serviceActivities.id, parseInt(id)))
      .returning();
    
    if (!updatedActivity) {
      return res.status(404).json({ message: 'Service activity not found' });
    }
    
    res.json(updatedActivity);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error updating service activity:', error);
    res.status(500).json({ message: 'Failed to update service activity' });
  }
});

/**
 * Service Parts
 */
// Add parts to a service activity
router.post('/service-activities/:activityId/parts', async (req, res) => {
  try {
    const { activityId } = req.params;
    const data = insertServicePartSchema.parse(req.body);
    
    // Verify the service activity exists
    const activity = await db.query.serviceActivities.findFirst({
      where: eq(serviceActivities.id, parseInt(activityId))
    });
    
    if (!activity) {
      return res.status(404).json({ message: 'Service activity not found' });
    }
    
    const [newPart] = await db.insert(serviceParts)
      .values({
        ...data,
        service_activity_id: parseInt(activityId),
        created_at: new Date()
      })
      .returning();
    
    res.status(201).json(newPart);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error adding service part:', error);
    res.status(500).json({ message: 'Failed to add service part' });
  }
});

// Update a service part
router.put('/service-parts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = insertServicePartSchema.parse(req.body);
    
    const [updatedPart] = await db.update(serviceParts)
      .set({
        ...data
      })
      .where(eq(serviceParts.id, parseInt(id)))
      .returning();
    
    if (!updatedPart) {
      return res.status(404).json({ message: 'Service part not found' });
    }
    
    res.json(updatedPart);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error updating service part:', error);
    res.status(500).json({ message: 'Failed to update service part' });
  }
});

/**
 * Customer Followups
 */
// Get all customer followups
router.get('/customer-followups', async (req, res) => {
  try {
    const followups = await db.query.customerFollowups.findMany({
      with: {
        customer: true,
        createdBy: true,
        assignedTo: true
      },
      orderBy: [desc(customerFollowups.scheduled_date)]
    });
    
    res.json(followups);
  } catch (error) {
    console.error('Error fetching customer followups:', error);
    res.status(500).json({ message: 'Failed to fetch customer followups' });
  }
});

// Create a new customer followup
router.post('/customer-followups', async (req, res) => {
  try {
    const data = insertCustomerFollowupSchema.parse(req.body);
    
    // Add the current user as the creator
    data.created_by = req.user!.id;
    
    const [newFollowup] = await db.insert(customerFollowups)
      .values({
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning();
    
    res.status(201).json(newFollowup);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error creating customer followup:', error);
    res.status(500).json({ message: 'Failed to create customer followup' });
  }
});

// Update a customer followup
router.put('/customer-followups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = insertCustomerFollowupSchema.parse(req.body);
    
    const [updatedFollowup] = await db.update(customerFollowups)
      .set({
        ...data,
        updated_at: new Date()
      })
      .where(eq(customerFollowups.id, parseInt(id)))
      .returning();
    
    if (!updatedFollowup) {
      return res.status(404).json({ message: 'Customer followup not found' });
    }
    
    res.json(updatedFollowup);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error updating customer followup:', error);
    res.status(500).json({ message: 'Failed to update customer followup' });
  }
});

/**
 * Business Opportunities
 */
// Get all business opportunities
router.get('/business-opportunities', async (req, res) => {
  try {
    const opportunities = await db.query.businessOpportunities.findMany({
      with: {
        customer: true,
        createdBy: true,
        assignedTo: true
      },
      orderBy: [desc(businessOpportunities.created_at)]
    });
    
    res.json(opportunities);
  } catch (error) {
    console.error('Error fetching business opportunities:', error);
    res.status(500).json({ message: 'Failed to fetch business opportunities' });
  }
});

// Create a new business opportunity
router.post('/business-opportunities', async (req, res) => {
  try {
    const data = insertBusinessOpportunitySchema.parse(req.body);
    
    // Add the current user as the creator
    data.created_by = req.user!.id;
    
    const [newOpportunity] = await db.insert(businessOpportunities)
      .values({
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning();
    
    res.status(201).json(newOpportunity);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error creating business opportunity:', error);
    res.status(500).json({ message: 'Failed to create business opportunity' });
  }
});

// Update a business opportunity
router.put('/business-opportunities/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = insertBusinessOpportunitySchema.parse(req.body);
    
    const [updatedOpportunity] = await db.update(businessOpportunities)
      .set({
        ...data,
        updated_at: new Date()
      })
      .where(eq(businessOpportunities.id, parseInt(id)))
      .returning();
    
    if (!updatedOpportunity) {
      return res.status(404).json({ message: 'Business opportunity not found' });
    }
    
    res.json(updatedOpportunity);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error updating business opportunity:', error);
    res.status(500).json({ message: 'Failed to update business opportunity' });
  }
});

/**
 * Service Contracts
 */
// Get all service contracts
router.get('/service-contracts', async (req, res) => {
  try {
    const contracts = await db.query.serviceContracts.findMany({
      with: {
        customer: true,
        project: true,
        createdBy: true,
        services: true
      },
      orderBy: [desc(serviceContracts.created_at)]
    });
    
    res.json(contracts);
  } catch (error) {
    console.error('Error fetching service contracts:', error);
    res.status(500).json({ message: 'Failed to fetch service contracts' });
  }
});

// Get a specific service contract by ID
router.get('/service-contracts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const contract = await db.query.serviceContracts.findFirst({
      where: eq(serviceContracts.id, parseInt(id)),
      with: {
        customer: true,
        project: true,
        createdBy: true,
        services: true,
        deliveries: {
          with: {
            performedBy: true,
            service: true
          }
        }
      }
    });
    
    if (!contract) {
      return res.status(404).json({ message: 'Service contract not found' });
    }
    
    res.json(contract);
  } catch (error) {
    console.error('Error fetching service contract:', error);
    res.status(500).json({ message: 'Failed to fetch service contract' });
  }
});

// Create a new service contract
router.post('/service-contracts', async (req, res) => {
  try {
    const data = insertServiceContractSchema.parse(req.body);
    
    // Add the current user as the creator
    data.created_by = req.user!.id;
    
    const [newContract] = await db.insert(serviceContracts)
      .values({
        ...data,
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning();
    
    res.status(201).json(newContract);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error creating service contract:', error);
    res.status(500).json({ message: 'Failed to create service contract' });
  }
});

// Update a service contract
router.put('/service-contracts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = insertServiceContractSchema.parse(req.body);
    
    const [updatedContract] = await db.update(serviceContracts)
      .set({
        ...data,
        updated_at: new Date()
      })
      .where(eq(serviceContracts.id, parseInt(id)))
      .returning();
    
    if (!updatedContract) {
      return res.status(404).json({ message: 'Service contract not found' });
    }
    
    res.json(updatedContract);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error updating service contract:', error);
    res.status(500).json({ message: 'Failed to update service contract' });
  }
});

/**
 * Contract Services
 */
// Add a service to a contract
router.post('/service-contracts/:contractId/services', async (req, res) => {
  try {
    const { contractId } = req.params;
    const data = insertContractServiceSchema.parse(req.body);
    
    // Verify the contract exists
    const contract = await db.query.serviceContracts.findFirst({
      where: eq(serviceContracts.id, parseInt(contractId))
    });
    
    if (!contract) {
      return res.status(404).json({ message: 'Service contract not found' });
    }
    
    const [newService] = await db.insert(contractServices)
      .values({
        ...data,
        contract_id: parseInt(contractId),
        created_at: new Date()
      })
      .returning();
    
    res.status(201).json(newService);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error adding contract service:', error);
    res.status(500).json({ message: 'Failed to add contract service' });
  }
});

// Update a contract service
router.put('/contract-services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = insertContractServiceSchema.parse(req.body);
    
    const [updatedService] = await db.update(contractServices)
      .set({
        ...data
      })
      .where(eq(contractServices.id, parseInt(id)))
      .returning();
    
    if (!updatedService) {
      return res.status(404).json({ message: 'Contract service not found' });
    }
    
    res.json(updatedService);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error updating contract service:', error);
    res.status(500).json({ message: 'Failed to update contract service' });
  }
});

/**
 * Contract Deliveries
 */
// Add a delivery to a contract
router.post('/service-contracts/:contractId/deliveries', async (req, res) => {
  try {
    const { contractId } = req.params;
    const data = insertContractDeliverySchema.parse(req.body);
    
    // Verify the contract exists
    const contract = await db.query.serviceContracts.findFirst({
      where: eq(serviceContracts.id, parseInt(contractId))
    });
    
    if (!contract) {
      return res.status(404).json({ message: 'Service contract not found' });
    }
    
    const [newDelivery] = await db.insert(contractDeliveries)
      .values({
        ...data,
        contract_id: parseInt(contractId),
        created_at: new Date(),
        updated_at: new Date()
      })
      .returning();
    
    res.status(201).json(newDelivery);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error adding contract delivery:', error);
    res.status(500).json({ message: 'Failed to add contract delivery' });
  }
});

// Update a contract delivery
router.put('/contract-deliveries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = insertContractDeliverySchema.parse(req.body);
    
    const [updatedDelivery] = await db.update(contractDeliveries)
      .set({
        ...data,
        updated_at: new Date()
      })
      .where(eq(contractDeliveries.id, parseInt(id)))
      .returning();
    
    if (!updatedDelivery) {
      return res.status(404).json({ message: 'Contract delivery not found' });
    }
    
    res.json(updatedDelivery);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: formatZodError(error) });
    }
    console.error('Error updating contract delivery:', error);
    res.status(500).json({ message: 'Failed to update contract delivery' });
  }
});

/**
 * Dashboard and Analytics
 */
// Get after-sales dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    // Count of service requests by status
    const serviceRequestsByStatus = await db
      .select({
        status: serviceRequests.status,
        count: sql<number>`count(*)`,
      })
      .from(serviceRequests)
      .groupBy(serviceRequests.status);
    
    // Count of business opportunities by status
    const opportunitiesByStatus = await db
      .select({
        status: businessOpportunities.status,
        count: sql<number>`count(*)`,
      })
      .from(businessOpportunities)
      .groupBy(businessOpportunities.status);
    
    // Top 5 customers by service request count
    const topCustomersByRequests = await db
      .select({
        customer_id: serviceRequests.customer_id,
        customer_name: customers.bp_name,
        request_count: sql<number>`count(*)`,
      })
      .from(serviceRequests)
      .innerJoin(customers, eq(serviceRequests.customer_id, customers.id))
      .groupBy(serviceRequests.customer_id, customers.bp_name)
      .orderBy(sql`count(*)`)
      .limit(5);
    
    // Upcoming scheduled service activities
    const upcomingActivities = await db.query.serviceActivities.findMany({
      where: and(
        eq(serviceActivities.status, 'Scheduled'),
        isNull(serviceActivities.actual_date)
      ),
      with: {
        serviceRequest: {
          with: {
            customer: true
          }
        },
        performedBy: true
      },
      orderBy: [serviceActivities.scheduled_date],
      limit: 10
    });
    
    // Active service contracts count
    const activeContractsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(serviceContracts)
      .where(eq(serviceContracts.status, 'Active'));
    
    res.json({
      serviceRequestsByStatus,
      opportunitiesByStatus,
      topCustomersByRequests,
      upcomingActivities,
      activeContractsCount: activeContractsCount[0]?.count || 0
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard data' });
  }
});

export default router;
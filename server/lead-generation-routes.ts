import { Router } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import OpenAI from "openai";
import crypto from "crypto";

const router = Router();

// Initialize OpenAI for LLM processing
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Google Custom Search API configuration
const GOOGLE_API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY; // Need to request this
const SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID; // Need to request this
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

// Rate limiting constants
const DAILY_QUOTA_LIMIT = 100; // Google's free tier limit
const MONTHLY_QUOTA_LIMIT = 3000; // Reasonable monthly limit

// Utility function to generate content fingerprint
function generateContentFingerprint(title: string, snippet: string, link: string): string {
  const content = `${title || ''}|${snippet || ''}|${link || ''}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Check user's API quota
async function checkApiQuota(userId: number): Promise<{ canProceed: boolean; remainingCalls: number }> {
  try {
    // For now, return a default quota to avoid database issues
    // This will be properly implemented when the tables are created
    return { canProceed: true, remainingCalls: DAILY_QUOTA_LIMIT };
  } catch (error) {
    console.error('Error checking API quota:', error);
    return { canProceed: false, remainingCalls: 0 };
  }
}

// Update API quota after successful call
async function updateApiQuota(userId: number, callsUsed: number = 1): Promise<void> {
  try {
    // Simplified for now - implement when tables are properly set up
    console.log(`User ${userId} used ${callsUsed} API calls`);
  } catch (error) {
    console.error('Error updating API quota:', error);
  }
}

// Google Custom Search API call with freshness filters
async function performGoogleSearch(query: string, filters: any = {}): Promise<any> {
  if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID) {
    throw new Error('Google Custom Search API not configured. Please set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables.');
  }

  const searchParams = new URLSearchParams({
    key: GOOGLE_API_KEY,
    cx: SEARCH_ENGINE_ID,
    q: query,
    dateRestrict: 'd1', // Critical: Only results from last 1 day for freshness
    sort: 'date', // Critical: Sort by date to get freshest results
    num: '10', // Max results per call
    start: filters.start || '1',
    ...(filters.siteSearch && { siteSearch: filters.siteSearch }),
    ...(filters.country && { cr: `country${filters.country}` }),
    ...(filters.language && { lr: `lang_${filters.language}` }),
  });

  const response = await fetch(`${GOOGLE_SEARCH_URL}?${searchParams}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Search API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

// LLM processing for lead scoring and data extraction
async function processWithLLM(title: string, snippet: string, link: string): Promise<{
  company_name: string | null;
  country: string | null;
  capacity_lph: number | null;
  contact_email: string | null;
  deadline_date: string | null;
  business_intent: string | null;
  llm_score: number;
  score_reasoning: string;
  data_completeness_score: number;
}> {
  try {
    const prompt = `
Analyze this search result for lead generation in manufacturing/chemical processing industry:

Title: ${title}
Snippet: ${snippet}
Link: ${link}

Extract and score the following information (return as JSON):
{
  "company_name": "extracted company name or null",
  "country": "extracted country/location or null", 
  "capacity_lph": "extracted processing capacity in liters per hour (numeric) or null",
  "contact_email": "extracted contact email or null",
  "deadline_date": "extracted project deadline in YYYY-MM-DD format or null",
  "business_intent": "brief description of business opportunity or project intent",
  "llm_score": 0.85, // Score 0.0-1.0 based on lead quality and relevance
  "score_reasoning": "explanation of why this score was assigned",
  "data_completeness_score": 0.75 // Score based on how much useful data was extracted
}

Scoring criteria for llm_score:
- 0.9-1.0: Excellent lead with clear project, contact info, capacity details
- 0.7-0.8: Good lead with some missing details but clear opportunity  
- 0.5-0.6: Moderate lead, unclear opportunity or minimal details
- 0.0-0.4: Poor lead, not relevant or insufficient information

Only return the JSON object, no additional text.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1, // Low temperature for consistent extraction
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate and sanitize the results
    return {
      company_name: result.company_name || null,
      country: result.country || null,
      capacity_lph: result.capacity_lph ? parseFloat(result.capacity_lph) : null,
      contact_email: result.contact_email || null,
      deadline_date: result.deadline_date || null,
      business_intent: result.business_intent || null,
      llm_score: Math.max(0, Math.min(1, parseFloat(result.llm_score) || 0)),
      score_reasoning: result.score_reasoning || 'No reasoning provided',
      data_completeness_score: Math.max(0, Math.min(1, parseFloat(result.data_completeness_score) || 0)),
    };
  } catch (error) {
    console.error('LLM processing error:', error);
    return {
      company_name: null,
      country: null,
      capacity_lph: null,
      contact_email: null,
      deadline_date: null,
      business_intent: null,
      llm_score: 0.0,
      score_reasoning: 'LLM processing failed',
      data_completeness_score: 0.0,
    };
  }
}

// Store raw search results with deduplication
async function storeRawResults(searchId: number, results: any[]): Promise<number[]> {
  // Simplified for now - implement when tables are properly set up
  console.log(`Storing ${results.length} results for search ${searchId}`);
  // Return mock IDs for now
  return results.map((_, index) => index + 1);
}

// Main search endpoint
router.post('/search', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { query, filters = {} } = req.body;
    
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }

    // Check API quota
    const quotaCheck = await checkApiQuota(userId);
    if (!quotaCheck.canProceed) {
      return res.status(429).json({ 
        success: false, 
        error: 'Daily API quota exceeded',
        remainingCalls: quotaCheck.remainingCalls
      });
    }

    // Perform Google Search with freshness filters
    const searchResults = await performGoogleSearch(query, filters);
    
    // Update API quota
    await updateApiQuota(userId, 1);

    // Create search record (simplified for now)
    const searchId = Date.now(); // Use timestamp as mock ID

    // Store raw results with deduplication
    const storedIds = await storeRawResults(searchId, searchResults.items || []);

    // Process results with LLM in background (don't wait)
    if (storedIds.length > 0) {
      processResultsWithLLM(userId, storedIds).catch(error => {
        console.error('Background LLM processing error:', error);
      });
    }

    res.json({
      success: true,
      searchId,
      results: searchResults.items || [],
      totalResults: parseInt(searchResults.searchInformation?.totalResults || '0'),
      remainingQuota: quotaCheck.remainingCalls - 1,
      newResults: storedIds.length,
      duplicatesSkipped: (searchResults.items?.length || 0) - storedIds.length
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Search failed',
      details: error.message 
    });
  }
});

// Background LLM processing function
async function processResultsWithLLM(userId: number, rawResultIds: number[]): Promise<void> {
  // Simplified for now - implement when tables are properly set up
  console.log(`Processing ${rawResultIds.length} results with LLM for user ${userId}`);
  // Note: LLM processing would happen here when database is properly configured
}

// Get processed leads with high scores
router.get('/processed-leads', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Return empty results for now until database tables are properly set up
    res.json({
      success: true,
      leads: [],
      count: 0
    });

  } catch (error) {
    console.error('Error fetching processed leads:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch processed leads' });
  }
});

// Get user's search history
router.get('/search-history', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    // Return empty results for now until database tables are properly set up
    res.json({
      success: true,
      searches: [],
      count: 0
    });

  } catch (error) {
    console.error('Error fetching search history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch search history' });
  }
});

// Get API quota status
router.get('/quota-status', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const quotaCheck = await checkApiQuota(userId);
    
    res.json({
      success: true,
      dailyLimit: DAILY_QUOTA_LIMIT,
      monthlyLimit: MONTHLY_QUOTA_LIMIT,
      remainingToday: quotaCheck.remainingCalls,
      canProceed: quotaCheck.canProceed
    });

  } catch (error) {
    console.error('Error checking quota status:', error);
    res.status(500).json({ success: false, error: 'Failed to check quota status' });
  }
});

// Promote high-scoring lead to actual lead
router.post('/promote-lead/:processedLeadId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { processedLeadId } = req.params;
    const { additionalNotes } = req.body;

    // Simplified for now - implement when database tables are properly set up
    res.json({
      success: true,
      leadId: processedLeadId,
      message: 'Lead promotion will be available when database tables are configured'
    });

  } catch (error) {
    console.error('Error promoting lead:', error);
    res.status(500).json({ success: false, error: 'Failed to promote lead' });
  }
});

export default router;
import { Router } from "express";
import { db } from "./db";
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
    const today = new Date().toISOString().split('T')[0];
    
    const quotaResult = await db.query(`
      SELECT api_calls_today, quota_reset_date 
      FROM lead_generation_api_usage 
      WHERE user_id = $1
    `, [userId]);

    if (quotaResult.rows.length === 0) {
      return { canProceed: true, remainingCalls: DAILY_QUOTA_LIMIT };
    }

    const quota = quotaResult.rows[0];
    const resetDate = quota.quota_reset_date;
    
    // Reset quota if it's a new day
    if (resetDate !== today) {
      await db.query(`
        UPDATE lead_generation_api_usage 
        SET api_calls_today = 0, quota_reset_date = $1 
        WHERE user_id = $2
      `, [today, userId]);
      return { canProceed: true, remainingCalls: DAILY_QUOTA_LIMIT };
    }

    const remainingCalls = DAILY_QUOTA_LIMIT - quota.api_calls_today;
    return { 
      canProceed: remainingCalls > 0, 
      remainingCalls: Math.max(0, remainingCalls) 
    };
  } catch (error) {
    console.error('Error checking API quota:', error);
    return { canProceed: false, remainingCalls: 0 };
  }
}

// Update API quota after successful call
async function updateApiQuota(userId: number, callsUsed: number = 1): Promise<void> {
  try {
    await db.query('SELECT update_api_quota($1, $2)', [userId, callsUsed]);
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
  const storedIds: number[] = [];
  
  for (const [index, result] of results.entries()) {
    const fingerprint = generateContentFingerprint(
      result.title,
      result.snippet,
      result.link
    );

    try {
      // Try to insert, will conflict if duplicate exists
      const insertResult = await db.query(`
        INSERT INTO lead_generation_raw_results 
        (search_id, title, link, snippet, display_link, formatted_url, content_fingerprint, search_ranking)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (link, content_fingerprint) DO UPDATE SET
          last_seen = NOW(),
          search_id = $1
        RETURNING id
      `, [
        searchId,
        result.title || '',
        result.link || '',
        result.snippet || '',
        result.displayLink || '',
        result.formattedUrl || '',
        fingerprint,
        index + 1
      ]);

      if (insertResult.rows.length > 0) {
        storedIds.push(insertResult.rows[0].id);
      }
    } catch (error) {
      console.error('Error storing raw result:', error);
    }
  }

  return storedIds;
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

    // Create search record
    const searchRecord = await db.query(`
      INSERT INTO lead_generation_searches (user_id, search_query, search_filters, results_count, api_quota_used)
      VALUES ($1, $2, $3, $4, 1)
      RETURNING id
    `, [
      userId,
      query,
      JSON.stringify(filters),
      searchResults.items?.length || 0
    ]);

    const searchId = searchRecord.rows[0].id;

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
  for (const rawId of rawResultIds) {
    try {
      // Get raw result
      const rawResult = await db.query(`
        SELECT id, title, snippet, link 
        FROM lead_generation_raw_results 
        WHERE id = $1 AND llm_processed = false
      `, [rawId]);

      if (rawResult.rows.length === 0) continue;

      const result = rawResult.rows[0];
      
      // Process with LLM
      const llmData = await processWithLLM(result.title, result.snippet, result.link);

      // Store processed result
      await db.query(`
        INSERT INTO lead_generation_processed_leads 
        (raw_result_id, user_id, company_name, country, capacity_lph, contact_email, 
         deadline_date, business_intent, llm_score, score_reasoning, data_completeness_score)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        rawId,
        userId,
        llmData.company_name,
        llmData.country,
        llmData.capacity_lph,
        llmData.contact_email,
        llmData.deadline_date,
        llmData.business_intent,
        llmData.llm_score,
        llmData.score_reasoning,
        llmData.data_completeness_score
      ]);

      // Mark as processed
      await db.query(`
        UPDATE lead_generation_raw_results 
        SET llm_processed = true, llm_processed_at = NOW() 
        WHERE id = $1
      `, [rawId]);

    } catch (error) {
      console.error(`Error processing result ${rawId}:`, error);
    }
  }
}

// Get processed leads with high scores
router.get('/processed-leads', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const { minScore = 0.7, limit = 50, offset = 0 } = req.query;

    const results = await db.query(`
      SELECT 
        pl.*,
        rr.title, rr.link, rr.snippet, rr.display_link,
        s.search_query, s.created_at as search_date
      FROM lead_generation_processed_leads pl
      JOIN lead_generation_raw_results rr ON pl.raw_result_id = rr.id
      JOIN lead_generation_searches s ON rr.search_id = s.id
      WHERE pl.user_id = $1 AND pl.llm_score >= $2
      ORDER BY pl.llm_score DESC, pl.created_at DESC
      LIMIT $3 OFFSET $4
    `, [userId, parseFloat(minScore as string), parseInt(limit as string), parseInt(offset as string)]);

    res.json({
      success: true,
      leads: results.rows,
      count: results.rows.length
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

    const { limit = 20, offset = 0 } = req.query;

    const results = await db.query(`
      SELECT 
        s.*,
        COUNT(rr.id) as total_results,
        COUNT(pl.id) as processed_results,
        COUNT(CASE WHEN pl.llm_score >= 0.7 THEN 1 END) as high_score_leads
      FROM lead_generation_searches s
      LEFT JOIN lead_generation_raw_results rr ON s.id = rr.search_id
      LEFT JOIN lead_generation_processed_leads pl ON rr.id = pl.raw_result_id
      WHERE s.user_id = $1
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, parseInt(limit as string), parseInt(offset as string)]);

    res.json({
      success: true,
      searches: results.rows,
      count: results.rows.length
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

    // Get processed lead data
    const processedLead = await db.query(`
      SELECT pl.*, rr.title, rr.link, rr.snippet
      FROM lead_generation_processed_leads pl
      JOIN lead_generation_raw_results rr ON pl.raw_result_id = rr.id
      WHERE pl.id = $1 AND pl.user_id = $2 AND pl.llm_score >= 0.7
    `, [processedLeadId, userId]);

    if (processedLead.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Processed lead not found or score too low (minimum 0.7 required)' 
      });
    }

    const lead = processedLead.rows[0];

    // Create actual lead record (assuming you have a leads table)
    // This would need to be adapted to your existing leads table structure
    const newLead = await db.query(`
      INSERT INTO leads (
        company_name, 
        email, 
        country, 
        description, 
        source, 
        status, 
        created_by,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      lead.company_name || 'Unknown Company',
      lead.contact_email || '',
      lead.country || '',
      lead.business_intent || lead.snippet,
      'Lead Generation Search',
      'New',
      userId,
      `Generated from search. Original link: ${lead.link}\nLLM Score: ${lead.llm_score}\n${additionalNotes || ''}`
    ]);

    const leadId = newLead.rows[0].id;

    // Mark as promoted
    await db.query(`
      UPDATE lead_generation_processed_leads 
      SET promoted_to_lead = true, promoted_at = NOW(), lead_id = $1
      WHERE id = $2
    `, [leadId, processedLeadId]);

    res.json({
      success: true,
      leadId,
      message: 'Lead successfully promoted to leads database'
    });

  } catch (error) {
    console.error('Error promoting lead:', error);
    res.status(500).json({ success: false, error: 'Failed to promote lead' });
  }
});

export default router;
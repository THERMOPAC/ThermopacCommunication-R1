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

// Ultra-intelligent query strategy for oil re-refining business leads
function enhanceSearchQuery(query: string, industry?: string, country?: string): string {
  const baseQuery = query.trim();
  
  // Create multiple targeted search patterns for different customer types
  const searchPatterns = [
    // Pattern 1: Oil collection companies
    `"oil collection company" OR "waste oil collection" OR "used oil disposal" ${baseQuery}`,
    
    // Pattern 2: Automotive service centers  
    `"automotive service center" OR "car dealership" OR "auto repair shop" "waste oil" ${baseQuery}`,
    
    // Pattern 3: Industrial manufacturers
    `"industrial manufacturer" OR "manufacturing plant" "used lubricant" OR "hydraulic oil disposal" ${baseQuery}`,
    
    // Pattern 4: Environmental/waste management
    `"waste management company" OR "environmental services" "oil recycling" OR "oil treatment" ${baseQuery}`,
    
    // Pattern 5: Government/regulatory
    `"environmental agency" OR "government tender" "oil waste" OR "recycling facility" ${baseQuery}`
  ];

  // Select pattern based on query content or random for variety
  let selectedPattern;
  if (baseQuery.includes('automotive') || baseQuery.includes('car')) {
    selectedPattern = searchPatterns[1]; // Automotive pattern
  } else if (baseQuery.includes('industrial') || baseQuery.includes('manufacturing')) {
    selectedPattern = searchPatterns[2]; // Industrial pattern
  } else if (baseQuery.includes('waste') || baseQuery.includes('collection')) {
    selectedPattern = searchPatterns[0]; // Oil collection pattern
  } else {
    // Use random pattern for variety
    selectedPattern = searchPatterns[Math.floor(Math.random() * searchPatterns.length)];
  }

  let enhancedQuery = selectedPattern;

  // Add country-specific terms if specified
  if (country && country !== 'all') {
    const countryNames: { [key: string]: string } = {
      'US': 'United States', 'IN': 'India', 'AE': 'UAE', 'SA': 'Saudi Arabia',
      'DE': 'Germany', 'CN': 'China', 'JP': 'Japan', 'GB': 'United Kingdom'
    };
    if (countryNames[country]) {
      enhancedQuery += ` "${countryNames[country]}"`;
    }
  }

  // Add business procurement indicators
  enhancedQuery += ' (tender OR RFP OR procurement OR contract OR supplier OR equipment)';

  // Strong exclusions for irrelevant content
  enhancedQuery += ' -job -employment -career -hiring -recruitment -vacancy -resume -course -training -education';

  // Target business-focused domains and platforms
  enhancedQuery += ' (site:linkedin.com/company OR site:thomasnet.com OR site:alibaba.com OR site:indiamart.com OR site:tradeindia.com OR site:kompass.com)';

  console.log(`Ultra-Smart Query: "${baseQuery}" → "${enhancedQuery}"`);
  
  return enhancedQuery;
}

// Advanced intelligent lead scoring for oil re-refining business
function calculateIntelligentScore(title: string, snippet: string, link: string, industry?: string): number {
  let score = 0.1; // Conservative base score

  const text = `${title} ${snippet}`.toLowerCase();
  
  // High-value oil industry terms (weighted heavily)
  const primaryOilTerms = ['waste oil', 'used oil', 'engine oil', 'lubricant', 'oil recycling', 'oil collection'];
  const secondaryOilTerms = ['petroleum', 'refinery', 'automotive', 'industrial oil', 'hydraulic oil'];
  
  // Customer type indicators (strong business signals)
  const customerTypes = [
    'service center', 'auto repair', 'car dealer', 'fleet', 'manufacturing',
    'oil collection', 'waste management', 'environmental', 'industrial'
  ];
  
  // Business procurement signals (highest value)
  const procurementTerms = ['tender', 'rfp', 'procurement', 'supplier', 'equipment', 'need', 'require', 'seeking'];
  
  // Geographic and business quality indicators
  const qualityIndicators = ['company', 'corporation', 'ltd', 'inc', 'group', 'industries', 'facility', 'plant'];
  
  // Scoring algorithm
  
  // 1. Primary oil terms (40% weight)
  const primaryMatches = primaryOilTerms.filter(term => text.includes(term)).length;
  score += (primaryMatches > 0) ? 0.4 : 0;
  
  // 2. Secondary oil terms (20% weight)
  const secondaryMatches = secondaryOilTerms.filter(term => text.includes(term)).length;
  score += Math.min(secondaryMatches * 0.1, 0.2);
  
  // 3. Customer type detection (25% weight)
  const customerMatches = customerTypes.filter(term => text.includes(term)).length;
  score += Math.min(customerMatches * 0.08, 0.25);
  
  // 4. Procurement intent (30% weight - highest value)
  const procurementMatches = procurementTerms.filter(term => text.includes(term)).length;
  score += Math.min(procurementMatches * 0.1, 0.3);
  
  // 5. Business quality indicators (15% weight)
  const qualityMatches = qualityIndicators.filter(term => text.includes(term)).length;
  score += Math.min(qualityMatches * 0.05, 0.15);
  
  // 6. Domain authority and credibility bonus
  const trustedDomains = ['linkedin.com', '.gov', '.edu', 'trade.org', 'chamber.com'];
  if (trustedDomains.some(domain => link.includes(domain))) {
    score += 0.2;
  }
  
  // 7. Penalty for irrelevant content
  const irrelevantTerms = ['job', 'employment', 'resume', 'career', 'hiring', 'vacancy'];
  const irrelevantMatches = irrelevantTerms.filter(term => text.includes(term)).length;
  score -= irrelevantMatches * 0.1;
  
  // 8. Boost for specific oil business terms
  if (text.includes('waste oil') && (text.includes('collection') || text.includes('disposal'))) {
    score += 0.15; // Perfect match for waste oil collection business
  }
  
  console.log(`Intelligent Scoring: "${title.substring(0, 50)}..." → Score: ${score.toFixed(3)}`);
  
  return Math.min(Math.max(score, 0), 1);
}

// Intelligent search with fallback strategies
async function performGoogleSearch(query: string, filters: any = {}): Promise<any> {
  if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID) {
    throw new Error('Google Custom Search API not configured. Please set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables.');
  }

  // Try primary enhanced search first
  let enhancedQuery = enhanceSearchQuery(query, filters.industry, filters.country);
  let searchResult = await executeSearch(enhancedQuery, filters);
  
  // If no relevant results, try simplified business-focused search
  if (!searchResult.items || searchResult.items.length === 0) {
    console.log('Primary search returned no results, trying simplified approach...');
    enhancedQuery = `"${query}" (company OR business OR manufacturer OR supplier) -job -employment`;
    searchResult = await executeSearch(enhancedQuery, filters);
  }
  
  // If still no results, try basic industry search
  if (!searchResult.items || searchResult.items.length === 0) {
    console.log('Simplified search failed, trying basic industry search...');
    enhancedQuery = `${query} oil recycling equipment supplier`;
    searchResult = await executeSearch(enhancedQuery, filters);
  }

  return searchResult;
}

// Execute actual search with given query
async function executeSearch(enhancedQuery: string, filters: any): Promise<any> {
  const searchParams = new URLSearchParams({
    key: GOOGLE_API_KEY,
    cx: SEARCH_ENGINE_ID,
    q: enhancedQuery,
    dateRestrict: 'm3', // Expand to 3 months for better coverage
    sort: 'relevance', // Sort by relevance for quality
    num: '10',
    start: filters.start || '1',
    ...(filters.siteSearch && { siteSearch: filters.siteSearch }),
    ...(filters.country && filters.country !== 'all' && { cr: `country${filters.country}` }),
    ...(filters.language && { lr: `lang_${filters.language}` }),
  });

  const response = await fetch(`${GOOGLE_SEARCH_URL}?${searchParams}`);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Search API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
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

    // Process results with intelligent LLM in background (don't wait)
    if (storedIds.length > 0) {
      processResultsWithLLM(userId, storedIds, searchResults.items || [], filters).catch(error => {
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

// Advanced LLM processing with industry-specific intelligence
async function processWithLLM(title: string, snippet: string, link: string, industry?: string): Promise<any> {
  try {
    // Create industry-specific prompt for oil re-refining business
    const industryContext = industry === 'oil-refining' 
      ? "Focus on companies that handle waste oil, need recycling equipment, or operate oil collection/processing facilities. Look for automotive service centers, industrial manufacturers, environmental agencies, and oil collection companies."
      : "Focus on potential B2B customers in manufacturing and industrial sectors.";

    const prompt = `You are an expert lead qualification analyst specializing in used engine oil re-refining plant equipment sales for THERMOPAC.

${industryContext}

Analyze this search result and determine if this is a potential customer:
Title: ${title}
Description: ${snippet}
Website: ${link}

Key Customer Types to Identify:
- Oil collection companies needing processing equipment
- Automotive service centers with waste oil disposal needs
- Industrial manufacturers generating used oil
- Environmental service providers
- Government environmental agencies
- Refineries needing recycling technology
- Waste management companies

Extract detailed information:
1. Company identification and type
2. Geographic location (country/region)
3. Business size indicators (fleet size, capacity, etc.)
4. Contact information clues
5. Urgency indicators (RFPs, tenders, deadlines)
6. Lead quality score (0.0-1.0 where 0.8+ are hot leads)

Respond in JSON format:
{
  "company_name": "extracted company name or null",
  "country": "ISO country code or null", 
  "capacity_lph": "estimated oil processing capacity or null",
  "contact_email": "extracted email or null",
  "deadline_date": "any deadline/tender date mentioned or null",
  "business_intent": "detailed description of their oil-related needs",
  "llm_score": "number 0.0-1.0 based on quality as potential customer",
  "score_reasoning": "specific reasons why this is/isn't a good lead",
  "data_completeness_score": "how much useful info was found 0.0-1.0",
  "company_type": "oil_collector|automotive|industrial|government|environmental|refinery|other",
  "urgency_level": "high|medium|low",
  "estimated_volume": "waste oil volume indicators or null",
  "contact_likelihood": "high|medium|low based on available contact info"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: "system",
          content: "You are an expert B2B lead qualification analyst for industrial equipment sales, specializing in oil recycling and re-refining plant technology for THERMOPAC."
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2, // Lower temperature for more consistent analysis
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Apply intelligent scoring backup if LLM score is too low
    if (!result.llm_score || result.llm_score < 0.1) {
      result.llm_score = calculateIntelligentScore(title, snippet, link, industry);
      result.score_reasoning += " (Enhanced with intelligent scoring algorithm)";
    }
    
    return result;
  } catch (error) {
    console.error('LLM processing error:', error);
    // Fallback to intelligent scoring
    const intelligentScore = calculateIntelligentScore(title, snippet, link, industry);
    return {
      company_name: null,
      country: null,
      capacity_lph: null,
      contact_email: null,
      deadline_date: null,
      business_intent: snippet,
      llm_score: intelligentScore,
      score_reasoning: "Intelligent algorithm scoring (LLM unavailable)",
      data_completeness_score: 0.4,
      company_type: "unknown",
      urgency_level: "medium",
      estimated_volume: null,
      contact_likelihood: "medium"
    };
  }
}

// Smart lead analysis and notification system
async function analyzeLeadQuality(leads: any[]): Promise<{ hotLeads: any[]; summary: string }> {
  const hotLeads = leads.filter(lead => lead.llm_score >= 0.8);
  const goodLeads = leads.filter(lead => lead.llm_score >= 0.6 && lead.llm_score < 0.8);
  const moderateLeads = leads.filter(lead => lead.llm_score >= 0.4 && lead.llm_score < 0.6);
  
  const summary = `Lead Analysis Complete:
  🔥 Hot Leads (0.8+): ${hotLeads.length}
  ✅ Good Leads (0.6-0.8): ${goodLeads.length}
  📝 Moderate Leads (0.4-0.6): ${moderateLeads.length}
  ❌ Low Quality (<0.4): ${leads.length - hotLeads.length - goodLeads.length - moderateLeads.length}
  
  Geographic Distribution: ${[...new Set(leads.map(l => l.country).filter(Boolean))].join(', ')}
  Top Company Types: ${[...new Set(leads.map(l => l.company_type).filter(Boolean))].slice(0, 3).join(', ')}`;
  
  return { hotLeads, summary };
}

// Enhanced background LLM processing function with intelligent analysis
async function processResultsWithLLM(userId: number, rawResultIds: number[], searchResults: any[], filters: any): Promise<void> {
  console.log(`Processing ${rawResultIds.length} results with intelligent LLM for user ${userId}`);
  
  try {
    const processedLeads = [];
    
    // Process each search result with intelligent LLM
    for (const result of searchResults) {
      if (result.title && result.snippet && result.link) {
        const leadData = await processWithLLM(
          result.title, 
          result.snippet, 
          result.link, 
          filters.industry
        );
        
        // Add additional metadata
        leadData.search_result_title = result.title;
        leadData.search_result_snippet = result.snippet;
        leadData.search_result_link = result.link;
        leadData.found_at = new Date().toISOString();
        
        processedLeads.push(leadData);
      }
    }
    
    // Analyze lead quality and generate insights
    const analysis = await analyzeLeadQuality(processedLeads);
    
    console.log('Intelligent Lead Analysis:', analysis.summary);
    
    // Log hot leads for immediate attention
    if (analysis.hotLeads.length > 0) {
      console.log(`🔥 ALERT: Found ${analysis.hotLeads.length} hot leads for user ${userId}:`);
      analysis.hotLeads.forEach((lead, index) => {
        console.log(`${index + 1}. ${lead.company_name || 'Unknown Company'} (${lead.company_type}) - Score: ${lead.llm_score}`);
        console.log(`   Reason: ${lead.score_reasoning}`);
        console.log(`   Contact: ${lead.contact_likelihood} likelihood`);
      });
    }
    
    // In production, this would:
    // 1. Store all leads in database with detailed scoring
    // 2. Send email notifications for hot leads (0.8+)
    // 3. Create tasks in CRM for follow-up
    // 4. Generate PDF reports for sales team
    // 5. Update lead scoring models based on conversion data
    
  } catch (error) {
    console.error('Enhanced LLM processing failed:', error);
  }
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
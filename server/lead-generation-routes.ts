import { Router } from "express";
import { db } from "./db";
import { sql } from "drizzle-orm";
import OpenAI from "openai";
import crypto from "crypto";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const GOOGLE_API_KEY = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
const SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
const GOOGLE_SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

const DAILY_QUOTA_LIMIT = 100;
const MONTHLY_QUOTA_LIMIT = 3000;

function generateContentFingerprint(title: string, snippet: string, link: string): string {
  const content = `${title || ''}|${snippet || ''}|${link || ''}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

function generateDomainFingerprint(companyName: string, domain: string): string {
  const normalized = `${(companyName || '').toLowerCase().trim()}|${(domain || '').toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

async function checkApiQuota(userId: number): Promise<{ canProceed: boolean; remainingCalls: number }> {
  try {
    const result = await db.execute(sql`
      SELECT calls_used FROM lead_api_quota
      WHERE user_id = ${userId} AND date = CURRENT_DATE
    `);
    const used = result.rows.length > 0 ? Number(result.rows[0].calls_used) : 0;
    return { canProceed: used < DAILY_QUOTA_LIMIT, remainingCalls: DAILY_QUOTA_LIMIT - used };
  } catch (error) {
    console.error('Error checking API quota:', error);
    return { canProceed: true, remainingCalls: DAILY_QUOTA_LIMIT };
  }
}

async function updateApiQuota(userId: number, callsUsed: number = 1): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO lead_api_quota (user_id, date, calls_used)
      VALUES (${userId}, CURRENT_DATE, ${callsUsed})
      ON CONFLICT (user_id, date)
      DO UPDATE SET calls_used = lead_api_quota.calls_used + ${callsUsed}
    `);
  } catch (error) {
    console.error('Error updating API quota:', error);
  }
}

function enhanceSearchQuery(query: string, industry?: string, country?: string): string {
  const baseQuery = query.trim();
  let enhancedQuery = baseQuery;

  if (industry === 'oil-refining' || baseQuery.includes('oil')) {
    enhancedQuery += ' (waste oil OR used oil OR oil recycling OR lubricant disposal)';
  }

  const customerTypes = ['company', 'business', 'manufacturer', 'service center', 'facility'];
  const randomType = customerTypes[Math.floor(Math.random() * customerTypes.length)];
  enhancedQuery += ` "${randomType}"`;

  if (country && country !== 'all') {
    const countryNames: { [key: string]: string } = {
      'US': 'United States', 'IN': 'India', 'AE': 'UAE', 'SA': 'Saudi Arabia',
      'DE': 'Germany', 'CN': 'China', 'JP': 'Japan', 'GB': 'United Kingdom',
      'BR': 'Brazil', 'AU': 'Australia', 'CA': 'Canada', 'MX': 'Mexico',
      'FR': 'France', 'IT': 'Italy', 'ES': 'Spain', 'NL': 'Netherlands',
      'TR': 'Turkey', 'RU': 'Russia', 'ZA': 'South Africa', 'NG': 'Nigeria',
      'EG': 'Egypt', 'KE': 'Kenya', 'BH': 'Bahrain', 'QA': 'Qatar',
      'KW': 'Kuwait', 'OM': 'Oman', 'IR': 'Iran', 'IQ': 'Iraq'
    };
    if (countryNames[country]) {
      enhancedQuery += ` "${countryNames[country]}"`;
    }
  }

  enhancedQuery += ' (supplier OR equipment OR service)';
  enhancedQuery += ' -job -employment';
  return enhancedQuery;
}

function calculateEnhancedScore(title: string, snippet: string, link: string, industry?: string, crawledContent?: string): {
  total: number;
  breakdown: { industry_relevance: number; business_signals: number; contact_availability: number; company_size: number; urgency: number };
} {
  const text = `${title} ${snippet} ${crawledContent || ''}`.toLowerCase();
  const breakdown = { industry_relevance: 0, business_signals: 0, contact_availability: 0, company_size: 0, urgency: 0 };

  const primaryOilTerms = ['waste oil', 'used oil', 'engine oil', 'lubricant', 'oil recycling', 'oil collection', 'base oil', 'lube oil', 're-refin'];
  const secondaryOilTerms = ['petroleum', 'refinery', 'automotive', 'industrial oil', 'hydraulic oil', 'transformer oil', 'mineral oil'];
  const primaryMatches = primaryOilTerms.filter(term => text.includes(term)).length;
  const secondaryMatches = secondaryOilTerms.filter(term => text.includes(term)).length;
  breakdown.industry_relevance = Math.min((primaryMatches * 0.15 + secondaryMatches * 0.05), 0.3);

  const procurementTerms = ['tender', 'rfp', 'procurement', 'supplier', 'equipment', 'need', 'require', 'seeking', 'contract', 'bid'];
  const businessTerms = ['service center', 'auto repair', 'car dealer', 'fleet', 'manufacturing', 'oil collection', 'waste management', 'environmental', 'industrial'];
  const procMatches = procurementTerms.filter(term => text.includes(term)).length;
  const bizMatches = businessTerms.filter(term => text.includes(term)).length;
  breakdown.business_signals = Math.min((procMatches * 0.06 + bizMatches * 0.05), 0.25);

  const contactIndicators = ['@', 'email', 'contact', 'phone', 'tel:', 'call us', 'reach us', 'get in touch'];
  const contactMatches = contactIndicators.filter(term => text.includes(term)).length;
  breakdown.contact_availability = Math.min(contactMatches * 0.05, 0.2);

  const sizeIndicators = ['corporation', 'group', 'industries', 'international', 'global', 'nationwide', 'branches', 'locations', 'employees'];
  const sizeMatches = sizeIndicators.filter(term => text.includes(term)).length;
  breakdown.company_size = Math.min(sizeMatches * 0.04, 0.15);

  const urgencyTerms = ['urgent', 'deadline', 'immediately', 'asap', 'this year', '2025', '2026', 'new plant', 'expansion', 'capacity increase'];
  const urgMatches = urgencyTerms.filter(term => text.includes(term)).length;
  breakdown.urgency = Math.min(urgMatches * 0.04, 0.1);

  const irrelevantTerms = ['job', 'employment', 'resume', 'career', 'hiring', 'vacancy', 'internship'];
  const irrelevantMatches = irrelevantTerms.filter(term => text.includes(term)).length;
  const penalty = irrelevantMatches * 0.1;

  const total = Math.min(Math.max(
    breakdown.industry_relevance + breakdown.business_signals + breakdown.contact_availability + breakdown.company_size + breakdown.urgency - penalty,
    0
  ), 1);

  return { total, breakdown };
}

async function crawlWebsite(url: string): Promise<{ content: string; emails: string[]; phones: string[]; success: boolean }> {
  const result = { content: '', emails: [] as string[], phones: [] as string[], success: false };
  try {
    const domain = extractDomain(url);
    const pagesToCrawl = [
      url,
      `https://${domain}/about`,
      `https://${domain}/about-us`,
      `https://${domain}/contact`,
      `https://${domain}/contact-us`,
      `https://${domain}/services`,
    ];

    const allContent: string[] = [];
    const allEmails = new Set<string>();
    const allPhones = new Set<string>();

    for (const pageUrl of pagesToCrawl) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(pageUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ThermopacBot/1.0; +https://thermopac.com)',
            'Accept': 'text/html',
          },
          redirect: 'follow',
        });
        clearTimeout(timeout);

        if (!response.ok) continue;

        const html = await response.text();
        const textContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
          .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\s+/g, ' ')
          .trim();

        if (textContent.length > 100) {
          allContent.push(textContent.substring(0, 3000));
        }

        const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
        const foundEmails = html.match(emailRegex) || [];
        foundEmails.forEach(e => {
          if (!e.includes('example.com') && !e.includes('sentry') && !e.includes('webpack')) {
            allEmails.add(e.toLowerCase());
          }
        });

        const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
        const foundPhones = html.match(phoneRegex) || [];
        foundPhones.forEach(p => {
          const cleaned = p.replace(/\D/g, '');
          if (cleaned.length >= 7 && cleaned.length <= 15) {
            allPhones.add(p.trim());
          }
        });
      } catch {
        continue;
      }
    }

    result.content = allContent.join('\n\n').substring(0, 8000);
    result.emails = [...allEmails].slice(0, 10);
    result.phones = [...allPhones].slice(0, 10);
    result.success = allContent.length > 0;
  } catch (error) {
    console.error(`Website crawl failed for ${url}:`, error);
  }
  return result;
}

async function checkDuplicateCompany(companyName: string | null, domain: string): Promise<{ isDuplicate: boolean; duplicateOfId: number | null }> {
  if (!companyName && !domain) return { isDuplicate: false, duplicateOfId: null };

  try {
    const fingerprint = generateDomainFingerprint(companyName || '', domain);

    const existingByDomain = await db.execute(sql`
      SELECT id, company_name FROM lead_processed
      WHERE domain_fingerprint = ${fingerprint}
      ORDER BY created_at ASC LIMIT 1
    `);
    if (existingByDomain.rows.length > 0) {
      return { isDuplicate: true, duplicateOfId: Number(existingByDomain.rows[0].id) };
    }

    if (companyName && companyName.length > 3) {
      const normalizedName = companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const existingByName = await db.execute(sql`
        SELECT id, company_name FROM lead_processed
        WHERE LOWER(REPLACE(REPLACE(REPLACE(company_name, ' ', ''), '.', ''), ',', '')) = ${normalizedName}
        AND promoted_to_lead = false
        ORDER BY created_at ASC LIMIT 1
      `);
      if (existingByName.rows.length > 0) {
        return { isDuplicate: true, duplicateOfId: Number(existingByName.rows[0].id) };
      }
    }

    return { isDuplicate: false, duplicateOfId: null };
  } catch (error) {
    console.error('Duplicate check error:', error);
    return { isDuplicate: false, duplicateOfId: null };
  }
}

async function processWithLLM(
  title: string, snippet: string, link: string,
  industry?: string, websiteContent?: string
): Promise<any> {
  try {
    const websiteSection = websiteContent
      ? `\n\nWebsite Content (crawled):\n${websiteContent.substring(0, 4000)}`
      : '';

    const prompt = `You are an expert lead qualification analyst for THERMOPAC, specializing in used engine oil re-refining plant equipment sales.

Analyze this search result and website data to determine if this is a potential customer:
Title: ${title}
Description: ${snippet}
Website: ${link}${websiteSection}

CLASSIFY the company into one of these specific categories:
- oil_collector: Companies collecting waste/used oil
- waste_manager: Waste management and environmental services
- automotive_service: Auto repair shops, car dealers, fleet maintenance
- industrial_manufacturer: Factories generating used oil
- environmental_agency: Government environmental bodies
- refinery: Oil refineries and reprocessing facilities  
- equipment_supplier: Equipment or technology suppliers
- energy_company: Energy/power generation companies
- chemical_processor: Chemical processing companies
- government: Government bodies and agencies
- other: Does not fit above categories

Extract and respond in JSON:
{
  "company_name": "extracted name or null",
  "company_type": "one of the categories above",
  "company_classification": "more detailed classification description",
  "classification_confidence": "0.0-1.0",
  "country": "ISO code or null",
  "country_name": "full country name or null",
  "capacity_lph": "estimated processing capacity or null",
  "contact_email": "extracted email or null",
  "contact_phone": "extracted phone or null",
  "business_intent": "detailed description of their oil-related needs",
  "llm_score": "0.0-1.0 lead quality score",
  "score_reasoning": "specific reasons for the score",
  "data_completeness_score": "0.0-1.0 how much useful info found",
  "urgency_level": "high|medium|low",
  "estimated_volume": "waste oil volume indicators or null",
  "contact_likelihood": "high|medium|low",
  "website_content_summary": "2-3 sentence summary of what this company does based on all available info"
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are an expert B2B lead qualification analyst for THERMOPAC industrial equipment sales. Always respond with valid JSON." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return result;
  } catch (error) {
    console.error('LLM processing error:', error);
    const score = calculateEnhancedScore(title, snippet, link, industry);
    return {
      company_name: null,
      company_type: "other",
      company_classification: "Unknown - LLM unavailable",
      classification_confidence: 0.3,
      country: null,
      country_name: null,
      capacity_lph: null,
      contact_email: null,
      contact_phone: null,
      business_intent: snippet,
      llm_score: score.total,
      score_reasoning: "Scored by algorithm (LLM unavailable)",
      data_completeness_score: 0.3,
      urgency_level: "medium",
      estimated_volume: null,
      contact_likelihood: "low",
      website_content_summary: snippet
    };
  }
}

async function storeRawResults(searchId: number, results: any[]): Promise<number[]> {
  const storedIds: number[] = [];

  for (const item of results) {
    const fingerprint = generateContentFingerprint(item.title || '', item.snippet || '', item.link || '');
    const domain = extractDomain(item.link || '');

    try {
      const existing = await db.execute(sql`
        SELECT id FROM lead_raw_results WHERE content_fingerprint = ${fingerprint}
      `);

      if (existing.rows.length > 0) {
        continue;
      }

      const inserted = await db.execute(sql`
        INSERT INTO lead_raw_results (search_id, title, snippet, link, display_link, domain, content_fingerprint)
        VALUES (${searchId}, ${item.title || ''}, ${item.snippet || ''}, ${item.link || ''}, ${item.displayLink || ''}, ${domain}, ${fingerprint})
        RETURNING id
      `);

      if (inserted.rows.length > 0) {
        storedIds.push(Number(inserted.rows[0].id));
      }
    } catch (error: any) {
      if (error.code === '23505') continue;
      console.error('Error storing raw result:', error);
    }
  }

  return storedIds;
}

async function processResultsWithLLM(
  userId: number, searchId: number, rawResultIds: number[],
  searchResults: any[], filters: any
): Promise<void> {
  console.log(`Processing ${searchResults.length} results with LLM + website crawling for user ${userId}`);

  let processedCount = 0;
  let highScoreCount = 0;

  for (let i = 0; i < searchResults.length; i++) {
    const item = searchResults[i];
    if (!item.title || !item.link) continue;

    try {
      const crawlData = await crawlWebsite(item.link);

      const leadData = await processWithLLM(
        item.title, item.snippet || '', item.link,
        filters.industry,
        crawlData.success ? crawlData.content : undefined
      );

      if (crawlData.emails.length > 0 && !leadData.contact_email) {
        leadData.contact_email = crawlData.emails[0];
      }
      if (crawlData.phones.length > 0 && !leadData.contact_phone) {
        leadData.contact_phone = crawlData.phones[0];
      }

      const domain = extractDomain(item.link);
      const domainFP = generateDomainFingerprint(leadData.company_name || '', domain);
      const dupCheck = await checkDuplicateCompany(leadData.company_name, domain);

      const enhancedScore = calculateEnhancedScore(
        item.title, item.snippet || '', item.link,
        filters.industry, crawlData.content
      );
      const finalScore = Math.max(Number(leadData.llm_score) || 0, enhancedScore.total);

      const rawId = rawResultIds[i] || null;

      await db.execute(sql`
        INSERT INTO lead_processed (
          raw_result_id, search_id, user_id, company_name, company_type,
          company_classification, classification_confidence, country, country_name,
          capacity_lph, contact_email, contact_phone, website_url,
          business_intent, llm_score, score_reasoning, score_breakdown,
          data_completeness_score, urgency_level, estimated_volume,
          contact_likelihood, website_content_summary, website_crawled,
          domain_fingerprint, is_duplicate, duplicate_of_id,
          title, snippet, link
        ) VALUES (
          ${rawId}, ${searchId}, ${userId},
          ${leadData.company_name || null}, ${leadData.company_type || 'other'},
          ${leadData.company_classification || null}, ${Number(leadData.classification_confidence) || 0},
          ${leadData.country || null}, ${leadData.country_name || null},
          ${leadData.capacity_lph || null}, ${leadData.contact_email || null},
          ${leadData.contact_phone || null}, ${item.link},
          ${leadData.business_intent || null}, ${finalScore},
          ${leadData.score_reasoning || null}, ${JSON.stringify(enhancedScore.breakdown)},
          ${Number(leadData.data_completeness_score) || 0}, ${leadData.urgency_level || 'medium'},
          ${leadData.estimated_volume || null}, ${leadData.contact_likelihood || 'medium'},
          ${leadData.website_content_summary || null}, ${crawlData.success},
          ${domainFP}, ${dupCheck.isDuplicate}, ${dupCheck.duplicateOfId}
          , ${item.title || ''}, ${item.snippet || ''}, ${item.link || ''}
        )
      `);

      processedCount++;
      if (finalScore >= 0.7) highScoreCount++;
    } catch (error) {
      console.error(`Error processing result ${i}:`, error);
    }
  }

  try {
    await db.execute(sql`
      UPDATE lead_searches
      SET processed_results = ${processedCount}, high_score_leads = ${highScoreCount}
      WHERE id = ${searchId}
    `);
  } catch (error) {
    console.error('Error updating search stats:', error);
  }

  console.log(`Processing complete: ${processedCount} processed, ${highScoreCount} high-score leads`);
}

async function executeSearch(enhancedQuery: string, filters: any): Promise<any> {
  const searchParams = new URLSearchParams({
    key: GOOGLE_API_KEY!,
    cx: SEARCH_ENGINE_ID!,
    q: enhancedQuery,
    num: '10',
    start: filters.start || '1',
    ...(filters.siteSearch && { siteSearch: filters.siteSearch }),
    ...(filters.country && filters.country !== 'all' && { cr: `country${filters.country}` }),
  });

  const response = await fetch(`${GOOGLE_SEARCH_URL}?${searchParams}`);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Search API error: ${response.status} - ${errorText}`);
  }
  return await response.json();
}

async function performGoogleSearch(query: string, filters: any = {}): Promise<any> {
  if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID) {
    throw new Error('Google Custom Search API not configured. Please set GOOGLE_CUSTOM_SEARCH_API_KEY and GOOGLE_SEARCH_ENGINE_ID environment variables.');
  }

  let enhancedQuery = enhanceSearchQuery(query, filters.industry, filters.country);
  let searchResult = await executeSearch(enhancedQuery, filters);

  if (!searchResult.items || searchResult.items.length === 0) {
    enhancedQuery = `"${query}" company business`;
    searchResult = await executeSearch(enhancedQuery, filters);
  }

  if (!searchResult.items || searchResult.items.length === 0) {
    searchResult = await executeSearch(query, filters);
  }

  return { ...searchResult, enhancedQuery };
}

router.post('/search', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { query, filters = {} } = req.body;
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Search query is required' });
    }

    const quotaCheck = await checkApiQuota(userId);
    if (!quotaCheck.canProceed) {
      return res.status(429).json({ success: false, error: 'Daily API quota exceeded', remainingCalls: quotaCheck.remainingCalls });
    }

    const searchResults = await performGoogleSearch(query, filters);
    await updateApiQuota(userId, 1);

    const searchRecord = await db.execute(sql`
      INSERT INTO lead_searches (user_id, search_query, enhanced_query, industry, country, site_search, total_results)
      VALUES (${userId}, ${query}, ${searchResults.enhancedQuery || query}, ${filters.industry || null}, ${filters.country || null}, ${filters.siteSearch || null}, ${parseInt(searchResults.searchInformation?.totalResults || '0')})
      RETURNING id
    `);
    const searchId = Number(searchRecord.rows[0].id);

    const storedIds = await storeRawResults(searchId, searchResults.items || []);

    if (searchResults.items && searchResults.items.length > 0) {
      processResultsWithLLM(userId, searchId, storedIds, searchResults.items, filters).catch(error => {
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
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Search failed', details: error.message });
  }
});

router.get('/processed-leads', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const minScore = parseFloat(req.query.minScore as string) || 0;

    const result = await db.execute(sql`
      SELECT lp.*, ls.search_query
      FROM lead_processed lp
      JOIN lead_searches ls ON lp.search_id = ls.id
      WHERE lp.user_id = ${userId}
      AND lp.llm_score >= ${minScore}
      ORDER BY lp.llm_score DESC, lp.created_at DESC
      LIMIT 200
    `);

    res.json({
      success: true,
      leads: result.rows.map(row => ({
        ...row,
        id: Number(row.id),
        llm_score: Number(row.llm_score),
        data_completeness_score: Number(row.data_completeness_score),
        classification_confidence: Number(row.classification_confidence),
        score_breakdown: typeof row.score_breakdown === 'string' ? JSON.parse(row.score_breakdown) : row.score_breakdown,
      })),
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching processed leads:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch processed leads' });
  }
});

router.get('/search-history', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const result = await db.execute(sql`
      SELECT * FROM lead_searches
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
      LIMIT 50
    `);

    res.json({
      success: true,
      searches: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching search history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch search history' });
  }
});

router.get('/quota-status', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

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

router.post('/promote-lead/:processedLeadId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { processedLeadId } = req.params;
    const { additionalNotes } = req.body;

    const leadResult = await db.execute(sql`
      SELECT * FROM lead_processed WHERE id = ${parseInt(processedLeadId)} AND user_id = ${userId}
    `);

    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    const lead = leadResult.rows[0];

    const existingLead = await db.execute(sql`
      SELECT id FROM leads
      WHERE company_name = ${lead.company_name}
      AND (contact_email = ${lead.contact_email} OR website = ${lead.website_url})
      LIMIT 1
    `);

    let promotedLeadId;
    if (existingLead.rows.length > 0) {
      promotedLeadId = Number(existingLead.rows[0].id);
    } else {
      try {
        const newLead = await db.execute(sql`
          INSERT INTO leads (company_name, contact_name, contact_email, contact_phone, website, country, industry, notes, requirements)
          VALUES (
            ${lead.company_name || 'Unknown Company'},
            ${null},
            ${lead.contact_email || null},
            ${lead.contact_phone || null},
            ${lead.website_url || lead.link || null},
            ${lead.country_name || lead.country || null},
            ${lead.company_classification || lead.company_type || null},
            ${(lead.business_intent || '') + (additionalNotes ? '\n\nNotes: ' + additionalNotes : '')},
            ${'Source: AI Lead Generation | Score: ' + Number(lead.llm_score).toFixed(2)}
          )
          RETURNING id
        `);
        promotedLeadId = Number(newLead.rows[0].id);
      } catch (insertError: any) {
        console.error('Error inserting into leads table:', insertError);
        return res.status(500).json({ success: false, error: 'Failed to create lead entry. The leads table may need additional columns.' });
      }
    }

    await db.execute(sql`
      UPDATE lead_processed
      SET promoted_to_lead = true, promoted_lead_id = ${promotedLeadId}
      WHERE id = ${parseInt(processedLeadId)}
    `);

    res.json({
      success: true,
      leadId: promotedLeadId,
      message: 'Lead promoted successfully'
    });
  } catch (error: any) {
    console.error('Error promoting lead:', error);
    res.status(500).json({ success: false, error: 'Failed to promote lead' });
  }
});

router.get('/export', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const minScore = parseFloat(req.query.minScore as string) || 0;

    const result = await db.execute(sql`
      SELECT lp.*, ls.search_query
      FROM lead_processed lp
      JOIN lead_searches ls ON lp.search_id = ls.id
      WHERE lp.user_id = ${userId}
      AND lp.llm_score >= ${minScore}
      ORDER BY lp.llm_score DESC, lp.created_at DESC
    `);

    const headers = [
      'Company Name', 'Company Type', 'Classification', 'Confidence',
      'Country', 'Score', 'Urgency', 'Contact Email', 'Contact Phone',
      'Website', 'Business Intent', 'Score Reasoning',
      'Website Crawled', 'Is Duplicate', 'Promoted',
      'Capacity', 'Volume Estimate', 'Contact Likelihood',
      'Search Query', 'Found Date'
    ];

    const csvRows = [headers.join(',')];

    for (const row of result.rows) {
      const values = [
        escapeCSV(row.company_name),
        escapeCSV(row.company_type),
        escapeCSV(row.company_classification),
        row.classification_confidence,
        escapeCSV(row.country_name || row.country),
        Number(row.llm_score).toFixed(3),
        escapeCSV(row.urgency_level),
        escapeCSV(row.contact_email),
        escapeCSV(row.contact_phone),
        escapeCSV(row.website_url || row.link),
        escapeCSV(row.business_intent),
        escapeCSV(row.score_reasoning),
        row.website_crawled ? 'Yes' : 'No',
        row.is_duplicate ? 'Yes' : 'No',
        row.promoted_to_lead ? 'Yes' : 'No',
        escapeCSV(row.capacity_lph),
        escapeCSV(row.estimated_volume),
        escapeCSV(row.contact_likelihood),
        escapeCSV(row.search_query),
        row.created_at ? new Date(row.created_at as string).toLocaleDateString() : '',
      ];
      csvRows.push(values.join(','));
    }

    const csv = csvRows.join('\n');
    const filename = `lead_generation_export_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting leads:', error);
    res.status(500).json({ success: false, error: 'Failed to export leads' });
  }
});

function escapeCSV(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

router.get('/processing-status/:searchId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const { searchId } = req.params;

    const result = await db.execute(sql`
      SELECT total_results, processed_results, high_score_leads
      FROM lead_searches
      WHERE id = ${parseInt(searchId)} AND user_id = ${userId}
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Search not found' });
    }

    const search = result.rows[0];
    const total = Number(search.total_results) || 0;
    const processed = Number(search.processed_results) || 0;

    const actualItems = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM lead_raw_results WHERE search_id = ${parseInt(searchId)}
    `);
    const rawCount = Number(actualItems.rows[0].cnt) || 0;

    const isComplete = rawCount === 0 || processed > 0;

    res.json({
      success: true,
      total,
      processed,
      rawCount,
      highScoreLeads: Number(search.high_score_leads) || 0,
      isComplete,
      progress: rawCount > 0 ? Math.round((processed / rawCount) * 100) : 100
    });
  } catch (error) {
    console.error('Error checking processing status:', error);
    res.status(500).json({ success: false, error: 'Failed to check status' });
  }
});

export default router;

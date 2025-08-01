import { Request, Response, Router } from 'express';
import { ensureAuthenticated } from './auth-middleware';
import { pool } from './db';
import { llmEngine } from './llm-prompt-engine';
import cron from 'node-cron';

const router = Router();

// Initialize scheduler for automated prompt execution
let schedulerInitialized = false;

function initializeScheduler() {
  if (schedulerInitialized) return;
  
  console.log('🤖 Initializing LLM Prompt Engine Scheduler...');
  
  // Daily reports at 8 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('🌅 Running daily LLM prompts...');
    await llmEngine.executeScheduledPrompts('daily');
  }, {
    timezone: 'Asia/Kolkata' // Adjust to your timezone
  });

  // Weekly reports on Monday at 9 AM
  cron.schedule('0 9 * * 1', async () => {
    console.log('📊 Running weekly LLM prompts...');
    await llmEngine.executeScheduledPrompts('weekly');
  }, {
    timezone: 'Asia/Kolkata'
  });

  // Monthly reports on 1st at 10 AM
  cron.schedule('0 10 1 * *', async () => {
    console.log('📈 Running monthly LLM prompts...');
    await llmEngine.executeScheduledPrompts('monthly');
  }, {
    timezone: 'Asia/Kolkata'
  });

  schedulerInitialized = true;
  console.log('✅ LLM Scheduler initialized successfully');
}

// Initialize scheduler when routes are loaded
initializeScheduler();

// Get all prompts with pagination and filtering
router.get('/prompts', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { category, active, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    let query = `
      SELECT p.*, u.username as created_by_name, pp.avg_rating, pp.total_executions, pp.last_executed
      FROM llm_prompts_registry p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN llm_prompt_performance pp ON p.id = pp.prompt_id
      WHERE 1=1
    `;
    
    const params: any[] = [];
    
    if (category) {
      query += ` AND p.category = $${params.length + 1}`;
      params.push(category);
    }
    
    if (active !== undefined) {
      query += ` AND p.active = $${params.length + 1}`;
      params.push(active === 'true');
    }

    query += ` ORDER BY p.priority DESC, p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit as string), offset);

    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = 'SELECT COUNT(*) FROM llm_prompts_registry WHERE 1=1';
    const countParams: any[] = [];
    
    if (category) {
      countQuery += ` AND category = $${countParams.length + 1}`;
      countParams.push(category);
    }
    
    if (active !== undefined) {
      countQuery += ` AND active = $${countParams.length + 1}`;
      countParams.push(active === 'true');
    }

    const countResult = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      prompts: result.rows,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total: totalCount,
        totalPages: Math.ceil(totalCount / parseInt(limit as string))
      }
    });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    res.status(500).json({ error: 'Failed to fetch prompts' });
  }
});

// Get prompts organized by modules
router.get('/prompts/by-modules', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        p.category,
        COUNT(*) as prompt_count,
        ARRAY_AGG(
          JSON_BUILD_OBJECT(
            'id', p.id,
            'name', p.name,
            'description', p.description,
            'frequency', p.frequency,
            'priority', p.priority,
            'model', p.model,
            'active', p.active,
            'template', p.template,
            'avg_rating', COALESCE(pp.avg_rating, 0),
            'total_executions', COALESCE(pp.total_executions, 0),
            'last_executed', pp.last_executed,
            'created_by_name', u.username,
            'created_at', p.created_at
          ) ORDER BY p.name
        ) as prompts
      FROM llm_prompts_registry p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN llm_prompt_performance pp ON p.id = pp.prompt_id
      WHERE p.active = true
      GROUP BY p.category
      ORDER BY 
        CASE p.category
          WHEN 'meetings' THEN 1
          WHEN 'sap_integration' THEN 2
          WHEN 'administration' THEN 3
          WHEN 'finance' THEN 4
          WHEN 'sales_marketing' THEN 5
          WHEN 'projects' THEN 6
          WHEN 'design_management' THEN 7
          WHEN 'procurement' THEN 8
          WHEN 'production' THEN 9
          WHEN 'quality' THEN 10
          WHEN 'commissioning' THEN 11
          WHEN 'dispatch_shipping' THEN 12
          WHEN 'after_sales' THEN 13
          WHEN 'hr' THEN 14
          WHEN 'system' THEN 15
          ELSE 16
        END
    `;
    
    const result = await pool.query(query);
    
    res.json({
      moduleGroups: result.rows
    });
  } catch (error) {
    console.error('Error fetching module groups:', error);
    res.status(500).json({ error: 'Failed to fetch module groups' });
  }
});

// Create new prompt
router.post('/prompts', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const {
      name, description, template, category, model, frequency,
      priority, temperature, data_query, data_parameters, output_format
    } = req.body;

    const userId = req.user?.id;

    const result = await pool.query(`
      INSERT INTO llm_prompts_registry 
      (name, description, template, category, model, frequency, priority, temperature, data_query, data_parameters, output_format, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      name, description, template, category, model || 'gpt-4o', frequency || 'daily',
      priority || 5, temperature || 0.7, data_query, data_parameters ? JSON.stringify(data_parameters) : null,
      output_format || 'markdown', userId
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating prompt:', error);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

// Update prompt
router.put('/prompts/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name, description, template, category, model, frequency,
      priority, temperature, data_query, data_parameters, output_format, active
    } = req.body;

    const userId = req.user?.id;

    const result = await pool.query(`
      UPDATE llm_prompts_registry 
      SET name = $1, description = $2, template = $3, category = $4, model = $5, 
          frequency = $6, priority = $7, temperature = $8, data_query = $9, data_parameters = $10, 
          output_format = $11, active = $12, updated_by = $13, updated_at = CURRENT_TIMESTAMP
      WHERE id = $14
      RETURNING *
    `, [
      name, description, template, category, model, frequency, priority, temperature,
      data_query, data_parameters ? JSON.stringify(data_parameters) : null,
      output_format, active, userId, id
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating prompt:', error);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

// Execute prompt manually
router.post('/prompts/:id/execute', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    console.log(`🚀 Manual execution requested for prompt ${id}`);

    // Add detailed debug logging for prompt 18
    if (parseInt(id) === 18) {
      console.log('🔍 DEBUG: Executing prompt 18 - Task Intelligence');
      
      // Get the prompt first to check its details
      const promptResult = await pool.query('SELECT * FROM llm_prompts_registry WHERE id = 18');
      if (promptResult.rows.length > 0) {
        const prompt = promptResult.rows[0];
        console.log('🔍 DEBUG: Prompt details:');
        console.log('  - Name:', prompt.name);
        console.log('  - Category:', prompt.category);
        console.log('  - Has data_query:', !!prompt.data_query);
        console.log('  - Template has ${data} placeholder:', prompt.template.includes('${data}'));
      }
    }

    const execution = await llmEngine.executePrompt(parseInt(id), 'manual');
    
    // Add more debug info for prompt 18
    if (parseInt(id) === 18) {
      console.log('🔍 DEBUG: Execution completed for prompt 18');
      console.log('  - Status:', execution.status);
      console.log('  - Result preview:', execution.result ? execution.result.substring(0, 200) + '...' : 'null');
      console.log('  - Result contains real names:', execution.result ? (execution.result.includes('Saurabh') || execution.result.includes('Pallab')) : false);
    }
    
    res.json({
      success: true,
      execution: {
        id: execution.id,
        result: execution.result,
        execution_time: execution.execution_time,
        model_used: execution.model_used
      }
    });
  } catch (error) {
    console.error('Error executing prompt:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to execute prompt' 
    });
  }
});

// Complete debug endpoint for prompt 18 full execution pipeline
router.post('/prompts/debug-18-complete', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('🔍 DEBUG: Starting complete pipeline test for prompt 18');
    
    // Step 1: Get the prompt
    const promptResult = await pool.query('SELECT * FROM llm_prompts_registry WHERE id = 18');
    if (promptResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    
    const prompt = promptResult.rows[0];
    console.log('🔍 DEBUG: Retrieved prompt:', prompt.name);
    console.log('🔍 DEBUG: Prompt category:', prompt.category);
    console.log('🔍 DEBUG: Prompt has data_query:', !!prompt.data_query);
    
    // Step 2: Test data preparation
    let preparedData = null;
    if (prompt.data_query) {
      console.log('🔍 DEBUG: Executing data query...');
      preparedData = await llmEngine.preparePromptData(prompt.data_query, prompt.data_parameters || {});
      console.log('🔍 DEBUG: Data preparation result type:', typeof preparedData);
      console.log('🔍 DEBUG: Data keys:', preparedData ? Object.keys(preparedData) : 'null');
      console.log('🔍 DEBUG: Has users array:', !!(preparedData && preparedData.users));
      console.log('🔍 DEBUG: User count:', preparedData && preparedData.users ? preparedData.users.length : 0);
    }
    
    // Step 3: Test template injection
    console.log('🔍 DEBUG: Testing template injection...');
    const testInjection = `Template has placeholder: ${prompt.template.includes('${data}')}`;
    console.log('🔍 DEBUG:', testInjection);
    
    // Step 4: Test SecureLLMWrapper injection function directly
    console.log('🔍 DEBUG: Testing SecureLLMWrapper injection function...');
    const { SecureLLMWrapper } = require('./secure-llm-wrapper');
    const injectedTemplate = SecureLLMWrapper.injectDataIntoTemplate(prompt.template, preparedData);
    const stillHasPlaceholder = injectedTemplate.includes('${data}');
    console.log('🔍 DEBUG: Template still has placeholder after injection:', stillHasPlaceholder);
    console.log('🔍 DEBUG: Injected template preview:', injectedTemplate.substring(0, 500) + '...');
    
    res.json({
      debug: true,
      success: true,
      steps: {
        promptRetrieved: !!prompt,
        dataQuery: !!prompt.data_query,
        dataPrepared: !!preparedData,
        hasUsers: !!(preparedData && preparedData.users),
        userCount: preparedData && preparedData.users ? preparedData.users.length : 0,
        templateHasPlaceholder: prompt.template.includes('${data}'),
        injectionWorked: !stillHasPlaceholder,
        finalTemplatePreview: injectedTemplate.substring(0, 200) + '...'
      },
      prompt: {
        id: prompt.id,
        name: prompt.name,
        category: prompt.category
      }
    });
  } catch (error) {
    console.error('🔍 DEBUG: Complete pipeline test failed:', error);
    res.status(500).json({ 
      debug: true,
      success: false, 
      error: error.message || 'Complete pipeline test failed' 
    });
  }
});

// Get prompt execution history
router.get('/prompts/:id/executions', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { limit = 10 } = req.query;

    const result = await pool.query(`
      SELECT e.*, f.rating, f.feedback_type, f.feedback_text
      FROM llm_prompt_executions e
      LEFT JOIN llm_prompt_feedback f ON e.id = f.execution_id
      WHERE e.prompt_id = $1
      ORDER BY e.execution_time DESC
      LIMIT $2
    `, [id, parseInt(limit as string)]);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching execution history:', error);
    res.status(500).json({ error: 'Failed to fetch execution history' });
  }
});

// Submit feedback for prompt execution
router.post('/executions/:id/feedback', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rating, feedback_type, feedback_text, action_taken } = req.body;
    const userId = req.user?.id;

    const result = await pool.query(`
      INSERT INTO llm_prompt_feedback (execution_id, user_id, rating, feedback_type, feedback_text, action_taken)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id, userId, rating, feedback_type, feedback_text, action_taken || false]);

    // Update prompt performance metrics
    const execution = await pool.query('SELECT prompt_id FROM llm_prompt_executions WHERE id = $1', [id]);
    if (execution.rows.length > 0) {
      await llmEngine.updatePromptPerformance(execution.rows[0].prompt_id);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Get business insights for dashboard
router.get('/insights', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { category, limit = 20 } = req.query;
    
    // Get insights with feedback information
    let query = `
      SELECT 
        i.*,
        e.id as execution_id,
        f.rating,
        f.feedback_type,
        f.feedback_text,
        f.action_taken
      FROM llm_business_insights i
      LEFT JOIN llm_prompt_executions e ON i.execution_id = e.id
      LEFT JOIN llm_prompt_feedback f ON e.id = f.execution_id
      WHERE i.id IS NOT NULL
    `;
    
    const params: any[] = [];
    
    if (category && category !== 'all') {
      query += ` AND i.category = $${params.length + 1}`;
      params.push(category);
    }
    
    query += ` ORDER BY i.generated_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit as string));

    const result = await pool.query(query, params);
    
    // Format the response to include user feedback
    const insights = result.rows.map(row => ({
      ...row,
      user_feedback: row.rating ? {
        rating: row.rating,
        feedback_type: row.feedback_type,
        feedback_text: row.feedback_text,
        action_taken: row.action_taken
      } : null
    }));

    res.json(insights);
  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

// Mark insight as viewed
router.post('/insights/:id/view', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    await pool.query(`
      UPDATE llm_business_insights 
      SET viewed_by = array_append(COALESCE(viewed_by, '{}'), $1)
      WHERE id = $2 AND NOT ($1 = ANY(COALESCE(viewed_by, '{}')))
    `, [userId, id]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking insight as viewed:', error);
    res.status(500).json({ error: 'Failed to mark insight as viewed' });
  }
});

// Get dashboard statistics
router.get('/dashboard/stats', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Get various statistics for the dashboard
    const [promptsStats, executionsStats, insightsStats, modelsStats] = await Promise.all([
      // Prompts by category and status
      pool.query(`
        SELECT category, active, COUNT(*) as count
        FROM llm_prompts_registry 
        GROUP BY category, active
        ORDER BY category, active
      `),
      
      // Recent executions statistics
      pool.query(`
        SELECT 
          status,
          COUNT(*) as count,
          AVG(execution_duration_ms) as avg_duration,
          SUM(cost_usd) as total_cost
        FROM llm_prompt_executions 
        WHERE execution_time >= NOW() - INTERVAL '7 days'
        GROUP BY status
      `),
      
      // Insights by category
      pool.query(`
        SELECT category, COUNT(*) as count
        FROM llm_business_insights 
        WHERE generated_at >= NOW() - INTERVAL '30 days'
        AND archived = false
        GROUP BY category
        ORDER BY count DESC
      `),
      
      // Model usage statistics
      pool.query(`
        SELECT 
          model_used,
          COUNT(*) as executions,
          AVG(execution_duration_ms) as avg_duration,
          SUM(cost_usd) as total_cost
        FROM llm_prompt_executions 
        WHERE execution_time >= NOW() - INTERVAL '30 days'
        GROUP BY model_used
        ORDER BY executions DESC
      `)
    ]);

    res.json({
      prompts: promptsStats.rows,
      executions: executionsStats.rows,
      insights: insightsStats.rows,
      models: modelsStats.rows
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Trigger scheduled execution manually (for testing)
router.post('/scheduler/trigger/:frequency', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { frequency } = req.params;
    
    if (!['daily', 'weekly', 'monthly', 'on-demand'].includes(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency' });
    }

    console.log(`🔧 Manual trigger for ${frequency} prompts`);
    await llmEngine.executeScheduledPrompts(frequency);
    
    res.json({ 
      success: true, 
      message: `Triggered ${frequency} prompts execution` 
    });
  } catch (error) {
    console.error('Error triggering scheduler:', error);
    res.status(500).json({ error: 'Failed to trigger scheduler' });
  }
});

// A/B Testing endpoint - Compare prompt outputs across models
router.post('/prompts/:id/test', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { models = ['gpt-4o', 'claude-sonnet-4-20250514'] } = req.body;
    
    console.log(`🧪 A/B Testing prompt ${id} across models:`, models);

    const results = await Promise.all(
      models.map(async (model: string) => {
        try {
          const execution = await llmEngine.executePrompt(parseInt(id), 'test', model);
          return {
            model,
            success: true,
            result: execution.result,
            execution_time: execution.execution_time,
            cost: execution.cost_usd,
            tokens: {
              input: execution.input_tokens,
              output: execution.output_tokens
            }
          };
        } catch (error) {
          return {
            model,
            success: false,
            error: error.message
          };
        }
      })
    );

    res.json({
      success: true,
      prompt_id: parseInt(id),
      test_results: results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error running A/B test:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to run A/B test' 
    });
  }
});

// Smart prompt optimization endpoint
router.post('/prompts/:id/optimize', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    console.log(`🎯 Starting smart optimization for prompt ${id}`);

    // Get prompt performance data
    const performanceResult = await pool.query(`
      SELECT 
        p.*,
        perf.avg_rating,
        perf.total_feedback,
        STRING_AGG(f.feedback_text, ' | ') as feedback_summary
      FROM llm_prompts_registry p
      LEFT JOIN llm_prompt_performance perf ON p.id = perf.prompt_id
      LEFT JOIN llm_prompt_executions e ON p.id = e.prompt_id
      LEFT JOIN llm_prompt_feedback f ON e.id = f.execution_id
      WHERE p.id = $1
      GROUP BY p.id, perf.avg_rating, perf.total_feedback
    `, [id]);

    if (performanceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    const prompt = performanceResult.rows[0];
    
    // Use LLM to suggest improvements
    const optimizationPrompt = `
Analyze this business intelligence prompt and suggest improvements based on performance data:

CURRENT PROMPT:
Template: ${prompt.template}
Description: ${prompt.description}
Category: ${prompt.category}

PERFORMANCE DATA:
Average Rating: ${prompt.avg_rating || 'No ratings yet'}
Total Feedback: ${prompt.total_feedback || 0}
User Feedback: ${prompt.feedback_summary || 'No feedback yet'}

Please provide specific recommendations to improve:
1. Clarity and specificity
2. Output format and structure
3. Data utilization
4. Actionability of insights

Return your response as JSON with:
- improved_template: A revised prompt template
- changes_made: List of specific improvements
- expected_benefits: What improvements this should bring
- confidence_score: 1-10 rating of expected improvement
`;

    const optimizationResult = await llmEngine.executeCustomPrompt(
      optimizationPrompt,
      'gpt-4o',
      'optimization'
    );

    // Parse the AI response
    let suggestions;
    try {
      suggestions = JSON.parse(optimizationResult.result);
    } catch (parseError) {
      suggestions = {
        improved_template: optimizationResult.result,
        changes_made: ['AI-generated optimization'],
        expected_benefits: ['Improved clarity and effectiveness'],
        confidence_score: 7
      };
    }

    res.json({
      success: true,
      original_prompt: {
        template: prompt.template,
        description: prompt.description
      },
      performance_data: {
        avg_rating: prompt.avg_rating,
        total_feedback: prompt.total_feedback,
        feedback_summary: prompt.feedback_summary
      },
      optimization_suggestions: suggestions,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error optimizing prompt:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to optimize prompt' 
    });
  }
});

// System improvement suggestions endpoint
router.get('/system/suggestions', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log('🔍 Generating system improvement suggestions');

    // Gather system-wide performance data
    const systemData = await pool.query(`
      SELECT 
        COUNT(DISTINCT p.id) as total_prompts,
        COUNT(e.id) as total_executions,
        AVG(f.rating) as avg_system_rating,
        COUNT(f.id) as total_feedback,
        STRING_AGG(DISTINCT f.feedback_type, ', ') as feedback_types,
        AVG(e.execution_duration_ms) as avg_execution_time,
        SUM(e.cost_usd) as total_cost
      FROM llm_prompts_registry p
      LEFT JOIN llm_prompt_executions e ON p.id = e.prompt_id
      LEFT JOIN llm_prompt_feedback f ON e.id = f.execution_id
      WHERE p.active = true
    `);

    const systemMetrics = systemData.rows[0];

    const suggestionPrompt = `
Analyze this LLM Prompt Engine system performance and suggest improvements:

SYSTEM METRICS:
- Total Active Prompts: ${systemMetrics.total_prompts}
- Total Executions: ${systemMetrics.total_executions}  
- Average User Rating: ${systemMetrics.avg_system_rating || 'No ratings'}
- Total User Feedback: ${systemMetrics.total_feedback}
- Common Feedback Types: ${systemMetrics.feedback_types || 'None'}
- Average Execution Time: ${systemMetrics.avg_execution_time}ms
- Total API Cost: $${systemMetrics.total_cost}

Please provide actionable system improvement suggestions in JSON format:
{
  "priority_improvements": [
    {
      "area": "Performance|User Experience|Cost Optimization|Content Quality",
      "issue": "Description of the issue",
      "solution": "Specific solution recommendation",
      "impact": "Expected impact",
      "difficulty": "Low|Medium|High"
    }
  ],
  "new_feature_suggestions": [
    {
      "feature": "Feature name",
      "description": "What it would do",
      "business_value": "Why it's valuable",
      "effort_estimate": "Low|Medium|High"
    }
  ],
  "system_health_score": "1-10 rating",
  "key_metrics_to_track": ["metric1", "metric2"]
}
`;

    const suggestionResult = await llmEngine.executeCustomPrompt(
      suggestionPrompt,
      'gpt-4o',
      'system_analysis'
    );

    let suggestions;
    try {
      suggestions = JSON.parse(suggestionResult.result);
    } catch (parseError) {
      suggestions = {
        priority_improvements: [],
        new_feature_suggestions: [],
        system_health_score: 7,
        key_metrics_to_track: ['user_satisfaction', 'execution_success_rate', 'cost_per_insight']
      };
    }

    res.json({
      success: true,
      system_metrics: systemMetrics,
      suggestions,
      generated_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error generating system suggestions:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to generate system suggestions' 
    });
  }
});

// Security logs endpoint
router.get('/security-logs', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    // Import db and schema dynamically
    const { db } = await import('./db');
    const { llmLogs } = await import('../shared/schema');
    const { count, gte } = await import('drizzle-orm');
    
    // Get date 7 days ago
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - 7);
    
    // Get basic counts from llm_logs table
    const totalExecutions = await db.select({ count: count() })
      .from(llmLogs)
      .where(gte(llmLogs.execution_timestamp, dateFrom));
    
    const testModeExecutions = await db.select({ count: count() })
      .from(llmLogs)
      .where(
        gte(llmLogs.execution_timestamp, dateFrom)
      );
    
    res.json({
      masking: {
        applied: 0 // Placeholder for masking events
      },
      audit: {
        total: totalExecutions[0]?.count || 0
      },
      routing: {
        optimized: testModeExecutions[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('Failed to fetch security logs:', error);
    res.json({ 
      masking: { applied: 0 },
      audit: { total: 0 },
      routing: { optimized: 0 }
    });
  }
});

// Test execution endpoint
router.post('/prompts/:promptId/test-execute', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const promptId = parseInt(req.params.promptId);
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Import dependencies dynamically
    const { db } = await import('./db');
    const { llmPrompts } = await import('../shared/schema');
    const { eq } = await import('drizzle-orm');
    const { secureLLMWrapper } = await import('./secure-llm-wrapper');

    // Get prompt details
    const prompt = await db.select().from(llmPrompts).where(eq(llmPrompts.id, promptId)).limit(1);
    if (prompt.length === 0) {
      return res.status(404).json({ error: 'Prompt not found' });
    }

    const promptData = prompt[0];

    // Execute in test mode using secure wrapper
    const result = await secureLLMWrapper.executeSecurePrompt({
      promptId: promptData.id,
      userId,
      promptName: promptData.name,
      category: promptData.category,
      frequency: promptData.frequency,
      template: promptData.template,
      data: {},
      isTestMode: true,
      preferredModel: promptData.model
    });

    res.json({
      success: result.success,
      testMode: true,
      model: result.model,
      executionTime: result.executionTime,
      logId: result.logId,
      maskingApplied: result.maskingApplied,
      routingDecision: result.routingDecision
    });

  } catch (error) {
    console.error('Test execution failed:', error);
    res.status(500).json({ error: 'Test execution failed', details: error.message });
  }
});

// PDF download endpoint for insights
router.post('/download-pdf', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { title, content, generated_at, prompt_name, model_used } = req.body;
    
    // Import PDF library dynamically
    const PDFDocument = (await import('pdfkit')).default;
    
    // Create new PDF document with white background
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4'
    });
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="THERMOPAC_User_Performance_Report_${new Date().toISOString().split('T')[0]}.pdf"`);
    
    // Pipe the PDF to response
    doc.pipe(res);
    
    // Add THERMOPAC header
    doc.fontSize(20)
       .fillColor('#000000')
       .text('THERMOPAC', 50, 50, { align: 'center' })
       .fontSize(16)
       .text('Task Management System', 50, 80, { align: 'center' })
       .fontSize(14)
       .text('User Performance Report', 50, 110, { align: 'center' });
    
    // Add horizontal line
    doc.moveTo(50, 140)
       .lineTo(545, 140)
       .stroke('#cccccc');
    
    // Add report metadata
    doc.fontSize(10)
       .fillColor('#666666')
       .text(`Generated: ${new Date(generated_at).toLocaleString()}`, 50, 160)
       .text(`Source: ${prompt_name}`, 50, 175)
       .text(`AI Model: ${model_used}`, 50, 190);
    
    // Add title
    doc.fontSize(16)
       .fillColor('#000000')
       .text(title, 50, 220, { width: 495 });
    
    // Add content with proper formatting
    const lines = content.split('\n');
    let yPosition = 260;
    
    for (const line of lines) {
      if (yPosition > 750) { // Add new page if needed
        doc.addPage();
        yPosition = 50;
      }
      
      // Handle different text styles based on content
      if (line.startsWith('##')) {
        // Main headers
        doc.fontSize(14)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text(line.replace('##', '').trim(), 50, yPosition);
        yPosition += 25;
      } else if (line.startsWith('**') && line.endsWith('**')) {
        // Bold subheaders
        doc.fontSize(12)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text(line.replace(/\*\*/g, ''), 50, yPosition);
        yPosition += 20;
      } else if (line.startsWith('- **')) {
        // Top performers with bold
        doc.fontSize(11)
           .fillColor('#000000')
           .font('Helvetica-Bold')
           .text(line.replace(/\*\*/g, '').replace('- ', '• '), 50, yPosition);
        yPosition += 18;
      } else if (line.trim().startsWith('-')) {
        // Regular bullet points
        doc.fontSize(11)
           .fillColor('#000000')
           .font('Helvetica')
           .text(line.replace('- ', '• '), 50, yPosition);
        yPosition += 16;
      } else if (line.trim() !== '') {
        // Regular paragraphs
        doc.fontSize(11)
           .fillColor('#000000')
           .font('Helvetica')
           .text(line, 50, yPosition, { width: 495, align: 'left' });
        yPosition += 16;
      } else {
        // Empty lines
        yPosition += 10;
      }
    }
    
    // Add footer
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8)
         .fillColor('#666666')
         .text(`Page ${i + 1} of ${pageCount}`, 50, 780, { width: 495, align: 'center' })
         .text('THERMOPAC - Confidential', 50, 790, { width: 495, align: 'center' });
    }
    
    // Finalize the PDF
    doc.end();
    
  } catch (error) {
    console.error('PDF generation failed:', error);
    res.status(500).json({ error: 'PDF generation failed', details: error.message });
  }
});

export default router;
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

// Create new prompt
router.post('/prompts', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const {
      name, description, template, category, model, frequency,
      priority, data_query, data_parameters, output_format
    } = req.body;

    const userId = req.user?.id;

    const result = await pool.query(`
      INSERT INTO llm_prompts_registry 
      (name, description, template, category, model, frequency, priority, data_query, data_parameters, output_format, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      name, description, template, category, model || 'gpt-4o', frequency || 'daily',
      priority || 5, data_query, data_parameters ? JSON.stringify(data_parameters) : null,
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
      priority, data_query, data_parameters, output_format, active
    } = req.body;

    const userId = req.user?.id;

    const result = await pool.query(`
      UPDATE llm_prompts_registry 
      SET name = $1, description = $2, template = $3, category = $4, model = $5, 
          frequency = $6, priority = $7, data_query = $8, data_parameters = $9, 
          output_format = $10, active = $11, updated_by = $12, updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *
    `, [
      name, description, template, category, model, frequency, priority,
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

    const execution = await llmEngine.executePrompt(parseInt(id), 'manual');
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
    
    const insights = await llmEngine.getRecentInsights(
      parseInt(limit as string), 
      category as string
    );

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

export default router;
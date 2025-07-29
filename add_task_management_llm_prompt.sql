-- Add Task Management Intelligence Prompt to LLM Prompt Engine
-- This prompt analyzes task performance, productivity trends, and workload distribution

INSERT INTO llm_prompts (
  name,
  category,
  description,
  frequency,
  priority,
  is_active,
  model_preference,
  template,
  data_query,
  created_at
) VALUES (
  'Task Management Intelligence',
  'task_management',
  'Comprehensive task performance analysis including productivity trends, workload distribution, completion rates, and team efficiency insights',
  'daily',
  'high',
  true,
  'gpt-4o',
  'You are a Task Management Intelligence Analyst for THERMOPAC. Analyze the provided task data and generate comprehensive insights.

**ANALYSIS REQUIREMENTS:**

1. **PRODUCTIVITY METRICS**
   - Overall completion rate and trends
   - Average task completion time by priority
   - Performance comparison across team members
   - Overdue task analysis and impact

2. **WORKLOAD DISTRIBUTION**
   - Task assignment balance across team members
   - Priority distribution patterns
   - Category-based workload analysis
   - Resource allocation insights

3. **EFFICIENCY PATTERNS**
   - Peak productivity periods
   - Task completion velocity trends
   - Bottleneck identification
   - Success rate by task type/category

4. **ACTIONABLE RECOMMENDATIONS**
   - Workload rebalancing suggestions
   - Process improvement opportunities
   - Team capacity optimization
   - Deadline management enhancements

**DATA ANALYSIS:**
${data}

**FORMATTING REQUIREMENTS:**
- Use clear sections with headers
- Include specific metrics and percentages
- Highlight critical issues and opportunities
- Provide actionable next steps
- Focus on business impact and team efficiency

Generate professional insights that help management make informed decisions about task allocation and team productivity optimization.',
  'WITH task_summary AS (
    SELECT 
      t.id,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.start_date,
      t.finish_date,
      t.due_date,
      t.created_at,
      t.completed_at,
      t.category,
      t.source_type,
      assigned_user.username as assigned_to_username,
      assigned_user.first_name as assigned_to_first_name,
      assigned_user.last_name as assigned_to_last_name,
      assigned_user.role as assigned_to_role,
      created_user.username as created_by_username,
      created_user.first_name as created_by_first_name,
      created_user.last_name as created_by_last_name,
      -- Calculate task duration in days
      CASE 
        WHEN t.completed_at IS NOT NULL THEN 
          CAST((julianday(t.completed_at) - julianday(t.start_date)) AS INTEGER)
        ELSE
          CAST((julianday(''now'') - julianday(t.start_date)) AS INTEGER)
      END as duration_days,
      -- Check if task is overdue
      CASE 
        WHEN t.due_date IS NOT NULL AND t.completed_at IS NULL AND date(t.due_date) < date(''now'') THEN 1
        ELSE 0
      END as is_overdue
    FROM tasks t
    LEFT JOIN users assigned_user ON t.assigned_to = assigned_user.id
    LEFT JOIN users created_user ON t.created_by = created_user.id
    WHERE t.created_at >= date(''now'', ''-30 days'')
  ),
  completion_stats AS (
    SELECT 
      COUNT(*) as total_tasks,
      COUNT(CASE WHEN status = ''completed'' THEN 1 END) as completed_tasks,
      COUNT(CASE WHEN status = ''pending'' THEN 1 END) as pending_tasks,
      COUNT(CASE WHEN status = ''in_progress'' THEN 1 END) as in_progress_tasks,
      COUNT(CASE WHEN is_overdue = 1 THEN 1 END) as overdue_tasks,
      AVG(CASE WHEN status = ''completed'' THEN duration_days END) as avg_completion_days
    FROM task_summary
  ),
  priority_breakdown AS (
    SELECT 
      priority,
      COUNT(*) as task_count,
      COUNT(CASE WHEN status = ''completed'' THEN 1 END) as completed_count,
      AVG(CASE WHEN status = ''completed'' THEN duration_days END) as avg_completion_time
    FROM task_summary
    GROUP BY priority
  ),
  assignee_performance AS (
    SELECT 
      assigned_to_username,
      assigned_to_first_name,
      assigned_to_last_name,
      assigned_to_role,
      COUNT(*) as assigned_tasks,
      COUNT(CASE WHEN status = ''completed'' THEN 1 END) as completed_tasks,
      COUNT(CASE WHEN is_overdue = 1 THEN 1 END) as overdue_tasks,
      AVG(CASE WHEN status = ''completed'' THEN duration_days END) as avg_completion_time
    FROM task_summary
    WHERE assigned_to_username IS NOT NULL
    GROUP BY assigned_to_username, assigned_to_first_name, assigned_to_last_name, assigned_to_role
    ORDER BY assigned_tasks DESC
  ),
  category_analysis AS (
    SELECT 
      COALESCE(category, ''Uncategorized'') as category,
      COUNT(*) as task_count,
      COUNT(CASE WHEN status = ''completed'' THEN 1 END) as completed_count,
      COUNT(CASE WHEN is_overdue = 1 THEN 1 END) as overdue_count,
      AVG(CASE WHEN status = ''completed'' THEN duration_days END) as avg_completion_time
    FROM task_summary
    GROUP BY category
    ORDER BY task_count DESC
  )
  SELECT 
    ''TASK_MANAGEMENT_INTELLIGENCE'' as report_type,
    json_object(
      ''summary'', json_object(
        ''total_tasks'', cs.total_tasks,
        ''completed_tasks'', cs.completed_tasks,
        ''pending_tasks'', cs.pending_tasks,
        ''in_progress_tasks'', cs.in_progress_tasks,
        ''overdue_tasks'', cs.overdue_tasks,
        ''completion_rate_percent'', ROUND((cs.completed_tasks * 100.0 / cs.total_tasks), 2),
        ''average_completion_days'', ROUND(cs.avg_completion_days, 1)
      ),
      ''priority_breakdown'', (
        SELECT json_group_array(
          json_object(
            ''priority'', priority,
            ''task_count'', task_count,
            ''completed_count'', completed_count,
            ''completion_rate_percent'', ROUND((completed_count * 100.0 / task_count), 2),
            ''avg_completion_time'', ROUND(avg_completion_time, 1)
          )
        )
        FROM priority_breakdown
      ),
      ''team_performance'', (
        SELECT json_group_array(
          json_object(
            ''username'', assigned_to_username,
            ''full_name'', COALESCE(assigned_to_first_name || '' '' || assigned_to_last_name, assigned_to_username),
            ''role'', assigned_to_role,
            ''assigned_tasks'', assigned_tasks,
            ''completed_tasks'', completed_tasks,
            ''overdue_tasks'', overdue_tasks,
            ''completion_rate_percent'', ROUND((completed_tasks * 100.0 / assigned_tasks), 2),
            ''avg_completion_time'', ROUND(avg_completion_time, 1)
          )
        )
        FROM assignee_performance
        LIMIT 10
      ),
      ''category_analysis'', (
        SELECT json_group_array(
          json_object(
            ''category'', category,
            ''task_count'', task_count,
            ''completed_count'', completed_count,
            ''overdue_count'', overdue_count,
            ''completion_rate_percent'', ROUND((completed_count * 100.0 / task_count), 2),
            ''avg_completion_time'', ROUND(avg_completion_time, 1)
          )
        )
        FROM category_analysis
      ),
      ''recent_tasks'', (
        SELECT json_group_array(
          json_object(
            ''id'', id,
            ''title'', title,
            ''status'', status,
            ''priority'', priority,
            ''category'', category,
            ''assigned_to'', COALESCE(assigned_to_first_name || '' '' || assigned_to_last_name, assigned_to_username),
            ''created_by'', COALESCE(created_by_first_name || '' '' || created_by_last_name, created_by_username),
            ''start_date'', start_date,
            ''due_date'', due_date,
            ''completed_at'', completed_at,
            ''duration_days'', duration_days,
            ''is_overdue'', is_overdue
          )
        )
        FROM (
          SELECT * FROM task_summary 
          ORDER BY created_at DESC 
          LIMIT 15
        )
      )
    ) as data
  FROM completion_stats cs',
  now()
);
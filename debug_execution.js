const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function debugExecution() {
  try {
    console.log('Testing data query execution...');
    
    // Execute the same query manually
    const result = await pool.query(`
      WITH user_task_stats AS (
        SELECT 
          u.username,
          u.role,
          COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '') as full_name,
          u.department,
          COUNT(t.id) as total_tasks,
          COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
          COUNT(CASE WHEN t.status = 'pending' THEN 1 END) as pending_tasks,
          COUNT(CASE WHEN t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE::text AND t.status != 'completed' THEN 1 END) as overdue_tasks,
          ROUND(
            (COUNT(CASE WHEN t.status = 'completed' THEN 1 END)::DECIMAL / NULLIF(COUNT(t.id), 0)) * 100, 
            2
          ) as completion_rate,
          COUNT(CASE WHEN t.created_by = u.id AND t.assigned_to != u.id THEN 1 END) as tasks_delegated,
          COUNT(CASE WHEN t.assigned_to = u.id AND t.created_by = u.id THEN 1 END) as self_assigned
        FROM users u
        LEFT JOIN tasks t ON (t.assigned_to = u.id OR t.created_by = u.id)
        WHERE u.is_active = true
        GROUP BY u.id, u.username, u.role, u.first_name, u.last_name, u.department
        HAVING COUNT(t.id) > 0
      ),
      role_summary AS (
        SELECT 
          role,
          COUNT(*) as user_count,
          SUM(tasks_delegated) as total_delegated,
          SUM(self_assigned) as total_self_assigned,
          COUNT(CASE WHEN tasks_delegated = 0 THEN 1 END) as non_delegating_users
        FROM user_task_stats
        GROUP BY role
      )
      SELECT 
        'USER_DATA' as data_type,
        username::text,
        role::text,
        full_name::text,
        COALESCE(department, 'N/A')::text as department,
        total_tasks::text,
        completed_tasks::text,
        pending_tasks::text,
        overdue_tasks::text,
        completion_rate::text,
        tasks_delegated::text,
        self_assigned::text
      FROM user_task_stats
      UNION ALL
      SELECT 
        'ROLE_SUMMARY' as data_type,
        role::text as username,
        user_count::text as role,
        total_delegated::text as full_name,
        total_self_assigned::text as department,
        non_delegating_users::text as total_tasks,
        NULL as completed_tasks,
        NULL as pending_tasks,
        NULL as overdue_tasks,
        NULL as completion_rate,
        NULL as tasks_delegated,
        NULL as self_assigned
      FROM role_summary
      ORDER BY data_type DESC, completion_rate DESC NULLS LAST
      LIMIT 10
    `);
    
    console.log('Raw query result:');
    console.log('Total rows:', result.rows.length);
    console.log('Sample rows:', JSON.stringify(result.rows.slice(0, 3), null, 2));
    
    // Test the filtering logic
    const userRows = result.rows.filter(row => row.data_type === 'USER_DATA');
    const roleRows = result.rows.filter(row => row.data_type === 'ROLE_SUMMARY');
    
    console.log('\nFiltered results:');
    console.log('User data rows:', userRows.length);
    console.log('Role summary rows:', roleRows.length);
    
    if (userRows.length > 0) {
      console.log('\nSample user data:');
      console.log(JSON.stringify(userRows[0], null, 2));
    }
    
  } catch (error) {
    console.error('Debug execution failed:', error);
  } finally {
    await pool.end();
  }
}

debugExecution();

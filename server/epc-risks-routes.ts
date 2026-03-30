import { Router } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';

const router = Router();

router.get('/dashboard', async (req, res) => {
  try {
    const { project, severity, agent, status, findingCode } = req.query;

    let whereClause = 'WHERE 1=1';
    if (project) whereClause += ` AND f.project_id = ${Number(project)}`;
    if (severity) whereClause += ` AND f.severity = '${String(severity).replace(/'/g, "''")}'`;
    if (agent) whereClause += ` AND f.agent_key = '${String(agent).replace(/'/g, "''")}'`;
    if (status === 'active') whereClause += ` AND f.status = 'active'`;
    else if (status === 'resolved') whereClause += ` AND f.status = 'resolved'`;
    if (findingCode) whereClause += ` AND f.finding_code = '${String(findingCode).replace(/'/g, "''")}'`;

    const findingsQuery = `
      SELECT f.*,
        p.name as project_name,
        pi.item_code as project_item_code,
        pi.description as project_item_description,
        (
          SELECT json_build_object(
            'id', t.id, 'title', t.title, 'status', t.status,
            'assigned_to', t.assigned_to, 'priority', t.priority,
            'assignee_name', u.username
          )
          FROM tasks t
          LEFT JOIN users u ON t.assigned_to = u.id
          WHERE t.source_type = 'agent_task'
            AND t.category LIKE '%' || f.fingerprint || '%'
            AND t.status NOT IN ('cancelled')
          ORDER BY t.id DESC LIMIT 1
        ) as linked_task
      FROM epc_agent_findings f
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN project_items pi ON f.project_item_id = pi.id
      ${whereClause}
      ORDER BY
        CASE f.status WHEN 'active' THEN 0 ELSE 1 END,
        CASE f.severity WHEN 'critical' THEN 0 WHEN 'risk' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        f.last_detected_at DESC
      LIMIT 500
    `;

    const findings = await db.execute(sql.raw(findingsQuery));

    const countsResult = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as total_active,
        COUNT(*) FILTER (WHERE status = 'active' AND severity = 'critical') as active_critical,
        COUNT(*) FILTER (WHERE status = 'active' AND severity = 'risk') as active_risk,
        COUNT(*) FILTER (WHERE status = 'active' AND severity = 'warning') as active_warning,
        COUNT(*) FILTER (WHERE status = 'resolved' AND resolved_at > NOW() - INTERVAL '7 days') as resolved_7d,
        COUNT(*) FILTER (WHERE status = 'active' AND last_detected_at < NOW() - INTERVAL '3 days') as overdue_unresolved
      FROM epc_agent_findings
    `);

    const byAgentResult = await db.execute(sql`
      SELECT agent_key, status, COUNT(*) as count
      FROM epc_agent_findings
      GROUP BY agent_key, status
      ORDER BY agent_key
    `);

    const byProjectResult = await db.execute(sql`
      SELECT f.project_id, p.name as project_name, f.status, f.severity, COUNT(*) as count
      FROM epc_agent_findings f
      LEFT JOIN projects p ON f.project_id = p.id
      WHERE f.project_id IS NOT NULL
      GROUP BY f.project_id, p.name, f.status, f.severity
      ORDER BY p.name
    `);

    const projectsResult = await db.execute(sql`
      SELECT DISTINCT f.project_id, p.name as project_name
      FROM epc_agent_findings f
      JOIN projects p ON f.project_id = p.id
      ORDER BY p.name
    `);

    res.json({
      findings: findings.rows || [],
      counts: (countsResult.rows as any[])[0] || {},
      byAgent: byAgentResult.rows || [],
      byProject: byProjectResult.rows || [],
      projects: projectsResult.rows || [],
    });
  } catch (err: any) {
    console.error('[EPC Risks] Dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to load EPC risks dashboard' });
  }
});

router.get('/finding/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.execute(sql`
      SELECT f.*,
        p.name as project_name,
        pi.item_code as project_item_code,
        pi.description as project_item_description
      FROM epc_agent_findings f
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN project_items pi ON f.project_item_id = pi.id
      WHERE f.id = ${Number(id)}
    `);
    const finding = (result.rows as any[])[0];
    if (!finding) return res.status(404).json({ error: 'Finding not found' });

    const tasksResult = await db.execute(sql`
      SELECT t.id, t.title, t.status, t.assigned_to, t.priority, t.created_at, t.category,
        u.username as assignee_name
      FROM tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.source_type = 'agent_task'
        AND t.category LIKE ${'%' + finding.fingerprint + '%'}
      ORDER BY t.id DESC
    `);

    res.json({ finding, tasks: tasksResult.rows || [] });
  } catch (err: any) {
    console.error('[EPC Risks] Finding detail error:', err.message);
    res.status(500).json({ error: 'Failed to load finding detail' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';

const router = Router();

function requireSuperuser(req: Request, res: Response, next: Function) {
  if (!req.user || (req.user as any).role !== 'Superuser') {
    return res.status(403).json({ error: 'Access denied. Superuser role required.' });
  }
  next();
}

router.use(requireSuperuser);

const VALID_SEVERITIES = ['critical', 'risk', 'warning'];
const VALID_AGENTS = ['project_control', 'production_management', 'quality_management', 'finance'];
const VALID_STATUSES = ['active', 'resolved'];

router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const { project, severity, agent, status, findingCode } = req.query;

    const conditions: ReturnType<typeof sql>[] = [];

    if (project) {
      const projectId = Number(project);
      if (!isNaN(projectId)) conditions.push(sql`f.project_id = ${projectId}`);
    }
    if (severity && VALID_SEVERITIES.includes(String(severity))) {
      conditions.push(sql`f.severity = ${String(severity)}`);
    }
    if (agent && VALID_AGENTS.includes(String(agent))) {
      conditions.push(sql`f.agent_key = ${String(agent)}`);
    }
    if (status && VALID_STATUSES.includes(String(status))) {
      conditions.push(sql`f.status = ${String(status)}`);
    }
    if (findingCode && /^EPC-[A-Z]{2}\d+$/.test(String(findingCode))) {
      conditions.push(sql`f.finding_code = ${String(findingCode)}`);
    }

    const whereFragment = conditions.length > 0
      ? sql`WHERE ${sql.join(conditions, sql` AND `)}`
      : sql``;

    const findings = await db.execute(sql`
      SELECT f.*,
        p.code as project_code,
        p.name as project_name,
        p.client_name as client_name,
        mi.item_code as project_item_code,
        mi.description as project_item_description,
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
            AND t.status NOT IN ('canceled')
          ORDER BY t.id DESC LIMIT 1
        ) as linked_task
      FROM epc_agent_findings f
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN project_items pi ON f.project_item_id = pi.id
      LEFT JOIN master_items mi ON pi.item_id = mi.id
      ${whereFragment}
      ORDER BY
        CASE f.status WHEN 'active' THEN 0 ELSE 1 END,
        CASE f.severity WHEN 'critical' THEN 0 WHEN 'risk' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        f.last_detected_at DESC
      LIMIT 500
    `);

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
      SELECT f.project_id, p.code as project_code, p.name as project_name, p.client_name as client_name, f.status, f.severity, COUNT(*) as count
      FROM epc_agent_findings f
      LEFT JOIN projects p ON f.project_id = p.id
      WHERE f.project_id IS NOT NULL
      GROUP BY f.project_id, p.code, p.name, p.client_name, f.status, f.severity
      ORDER BY p.code
    `);

    const projectsResult = await db.execute(sql`
      SELECT DISTINCT f.project_id, p.code as project_code, p.name as project_name, p.client_name as client_name
      FROM epc_agent_findings f
      JOIN projects p ON f.project_id = p.id
      ORDER BY p.code
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

router.get('/finding/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await db.execute(sql`
      SELECT f.*,
        p.code as project_code,
        p.name as project_name,
        p.client_name as client_name,
        mi.item_code as project_item_code,
        mi.description as project_item_description
      FROM epc_agent_findings f
      LEFT JOIN projects p ON f.project_id = p.id
      LEFT JOIN project_items pi ON f.project_item_id = pi.id
      LEFT JOIN master_items mi ON pi.item_id = mi.id
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

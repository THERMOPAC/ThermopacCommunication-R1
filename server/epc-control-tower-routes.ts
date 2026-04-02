import { Request, Response, Express } from 'express';
import { pool } from './db';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if ((req as any).isAuthenticated && (req as any).isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: "Not authenticated" });
}

function requireControlTowerAccess(req: Request, res: Response, next: Function) {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: "Not authenticated" });
  if (user.role === 'Superuser' || user.role === 'General Manager') {
    return next();
  }
  return res.status(403).json({ error: "Access denied — Superuser or General Manager only" });
}

export function setupEpcControlTowerRoutes(app: Express) {

  app.get('/api/epc-control-tower/summary', ensureAuthenticated, requireControlTowerAccess, async (_req: Request, res: Response) => {
    try {
      const projectSummary = await pool.query(`
        SELECT status, COUNT(*)::int as count FROM projects GROUP BY status ORDER BY count DESC
      `);

      const riskHealth = await pool.query(`
        SELECT 
          p.id, p.code, p.name, p.status, p.manager_id,
          p.start_date, p.estimated_end_date,
          u.username as manager_name,
          (SELECT COUNT(*)::int FROM project_key_stages ks WHERE ks.project_id = p.id AND ks.is_completed = true) as completed_stages,
          (SELECT COUNT(*)::int FROM project_key_stages ks WHERE ks.project_id = p.id) as total_stages,
          (SELECT COUNT(*)::int FROM deliverables d WHERE d.project_id = p.id AND d.status = 'pending' AND d.due_date < CURRENT_DATE) as overdue_deliverables,
          (SELECT COUNT(*)::int FROM tasks t JOIN project_tasks pt ON pt.task_id = t.id WHERE pt.project_id = p.id AND t.status != 'completed' AND t.due_date < CURRENT_DATE::text) as overdue_tasks,
          (SELECT COUNT(*)::int FROM tasks t JOIN project_tasks pt ON pt.task_id = t.id WHERE pt.project_id = p.id AND t.assigned_to IS NULL AND t.status != 'completed') as unassigned_tasks
        FROM projects p
        LEFT JOIN users u ON p.manager_id = u.id
        WHERE p.status IN ('active', 'planning')
        ORDER BY p.id
      `);

      const projects = riskHealth.rows.map((p: any) => {
        let health = 'on_track';
        if (p.unassigned_tasks > 0 || p.overdue_deliverables > 0) health = 'at_risk';
        if (p.overdue_tasks > 2 || p.overdue_deliverables > 2) health = 'delayed';
        if (p.status === 'planning' && p.total_stages === 0) health = 'blocked';
        return { ...p, health };
      });

      const healthCounts = { on_track: 0, at_risk: 0, delayed: 0, blocked: 0 };
      projects.forEach((p: any) => { healthCounts[p.health as keyof typeof healthCounts]++; });

      const milestones = await pool.query(`
        SELECT 
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE is_completed = true)::int as completed
        FROM project_key_stages
      `);

      const deliverables = await pool.query(`
        SELECT status, COUNT(*)::int as count FROM deliverables GROUP BY status
      `);

      const projectTasks = await pool.query(`
        SELECT 
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE t.status = 'completed')::int as completed,
          COUNT(*) FILTER (WHERE t.assigned_to IS NULL AND t.status != 'completed')::int as unassigned
        FROM tasks t JOIN project_tasks pt ON pt.task_id = t.id
      `);

      res.json({
        projectsByStatus: projectSummary.rows,
        projects,
        healthCounts,
        milestones: milestones.rows[0],
        deliverables: deliverables.rows,
        projectTasks: projectTasks.rows[0],
      });
    } catch (err) {
      console.error('[EPC-Control-Tower] Summary error:', err);
      res.status(500).json({ error: 'Failed to load summary' });
    }
  });

  app.get('/api/epc-control-tower/pipeline', ensureAuthenticated, requireControlTowerAccess, async (_req: Request, res: Response) => {
    try {
      const stages = [
        { key: 'BOM', table: 'epc_bom_headers', statusCol: 'lifecycle_status', label: 'Bill of Materials' },
        { key: 'DWG', table: 'epc_drawing_controls', statusCol: 'status', label: 'Drawing Controls' },
        { key: 'PO', table: 'epc_purchase_orders', statusCol: 'status', label: 'Purchase Orders' },
        { key: 'WO', table: 'epc_work_orders', statusCol: 'status', label: 'Work Orders' },
        { key: 'INS', table: 'inspection_execution_records', statusCol: 'status', label: 'Inspections' },
        { key: 'DSP', table: 'epc_dispatch_records', statusCol: 'status', label: 'Dispatch' },
        { key: 'INV', table: 'epc_invoices', statusCol: 'status', label: 'Invoices' },
      ];

      const pipeline = [];
      let prevCount = 0;

      for (const stage of stages) {
        const countResult = await pool.query(`SELECT COUNT(*)::int as total FROM "${stage.table}"`);
        const total = countResult.rows[0].total;

        const statusResult = await pool.query(`SELECT "${stage.statusCol}" as status, COUNT(*)::int as count FROM "${stage.table}" GROUP BY "${stage.statusCol}" ORDER BY count DESC`);

        let oldestRecord = null;
        try {
          const agingResult = await pool.query(`SELECT MIN(created_at) as oldest FROM "${stage.table}"`);
          if (agingResult.rows[0]?.oldest) {
            const ageMs = Date.now() - new Date(agingResult.rows[0].oldest).getTime();
            oldestRecord = Math.floor(ageMs / (1000 * 60 * 60 * 24));
          }
        } catch (_e) { /* created_at may not exist */ }

        const hasGap = prevCount > 0 && total === 0;
        const isBlocked = hasGap;

        pipeline.push({
          key: stage.key,
          label: stage.label,
          total,
          statusBreakdown: statusResult.rows,
          ageDays: oldestRecord,
          hasGap,
          isBlocked,
          gapWarning: hasGap ? `${stage.key} has 0 records but previous stage has ${prevCount}` : null,
        });

        prevCount = total;
      }

      res.json({ pipeline });
    } catch (err) {
      console.error('[EPC-Control-Tower] Pipeline error:', err);
      res.status(500).json({ error: 'Failed to load pipeline' });
    }
  });

  app.get('/api/epc-control-tower/bottlenecks', ensureAuthenticated, requireControlTowerAccess, async (_req: Request, res: Response) => {
    try {
      const overdueMilestones = await pool.query(`
        SELECT ks.id, ks.stage_name, ks.phase, ks.target_end_date, p.code as project_code, p.name as project_name,
          EXTRACT(DAY FROM CURRENT_DATE - ks.target_end_date::date)::int as days_overdue
        FROM project_key_stages ks
        JOIN projects p ON ks.project_id = p.id
        WHERE ks.is_completed = false AND ks.target_end_date IS NOT NULL AND ks.target_end_date::date < CURRENT_DATE
        ORDER BY days_overdue DESC
        LIMIT 20
      `);

      const overdueDeliverables = await pool.query(`
        SELECT d.id, d.name, d.due_date, d.status, p.code as project_code, p.name as project_name,
          EXTRACT(DAY FROM CURRENT_DATE - d.due_date::date)::int as days_overdue
        FROM deliverables d
        JOIN projects p ON d.project_id = p.id
        WHERE d.status = 'pending' AND d.due_date IS NOT NULL AND d.due_date::date < CURRENT_DATE
        ORDER BY days_overdue DESC
        LIMIT 20
      `);

      const overdueTasks = await pool.query(`
        SELECT t.id, t.title, t.due_date, t.status, t.priority, t.assigned_to,
          u.username as assigned_to_name, p.code as project_code, p.name as project_name,
          EXTRACT(DAY FROM CURRENT_DATE - t.due_date::date)::int as days_overdue
        FROM tasks t
        JOIN project_tasks pt ON pt.task_id = t.id
        JOIN projects p ON pt.project_id = p.id
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.status != 'completed' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE::text
        ORDER BY days_overdue DESC
        LIMIT 20
      `);

      res.json({
        overdueMilestones: overdueMilestones.rows,
        overdueDeliverables: overdueDeliverables.rows,
        overdueTasks: overdueTasks.rows,
        counts: {
          milestones: overdueMilestones.rows.length,
          deliverables: overdueDeliverables.rows.length,
          tasks: overdueTasks.rows.length,
        }
      });
    } catch (err) {
      console.error('[EPC-Control-Tower] Bottlenecks error:', err);
      res.status(500).json({ error: 'Failed to load bottlenecks' });
    }
  });

  app.get('/api/epc-control-tower/ownership-gaps', ensureAuthenticated, requireControlTowerAccess, async (_req: Request, res: Response) => {
    try {
      const unassignedTasks = await pool.query(`
        SELECT t.id, t.title, t.description, t.priority, t.due_date, t.source_agent,
          p.code as project_code, p.name as project_name
        FROM tasks t
        JOIN project_tasks pt ON pt.task_id = t.id
        JOIN projects p ON pt.project_id = p.id
        WHERE t.assigned_to IS NULL AND t.status != 'completed'
        ORDER BY t.priority DESC, t.due_date ASC
      `);

      const kickoffWarnings = await pool.query(`
        SELECT t.id, t.title, t.description, t.priority, t.due_date, t.status,
          u.username as assigned_to_name
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.source_agent = 'epc_kickoff' AND t.title LIKE '%require assignment%'
        ORDER BY t.created_at DESC
      `);

      const phasesNoLead = await pool.query(`
        SELECT pp.id, pp.name as phase_name, p.code as project_code, p.name as project_name
        FROM project_phases pp
        JOIN projects p ON pp.project_id = p.id
        WHERE pp.phase_lead_id IS NULL AND p.status = 'active'
        ORDER BY p.code, pp."order"
      `);

      const projectsNoManager = await pool.query(`
        SELECT id, code, name, status FROM projects
        WHERE manager_id IS NULL AND status IN ('active', 'planning')
        ORDER BY code
      `);

      const deliverablesNoOwner = await pool.query(`
        SELECT d.id, d.name, d.due_date, d.status, p.code as project_code, p.name as project_name
        FROM deliverables d
        JOIN projects p ON d.project_id = p.id
        WHERE d.assigned_to IS NULL AND d.status != 'completed'
        ORDER BY d.due_date ASC
      `);

      res.json({
        unassignedTasks: unassignedTasks.rows,
        kickoffWarnings: kickoffWarnings.rows,
        phasesNoLead: phasesNoLead.rows,
        projectsNoManager: projectsNoManager.rows,
        deliverablesNoOwner: deliverablesNoOwner.rows,
        counts: {
          unassignedTasks: unassignedTasks.rows.length,
          kickoffWarnings: kickoffWarnings.rows.length,
          phasesNoLead: phasesNoLead.rows.length,
          projectsNoManager: projectsNoManager.rows.length,
          deliverablesNoOwner: deliverablesNoOwner.rows.length,
        }
      });
    } catch (err) {
      console.error('[EPC-Control-Tower] Ownership gaps error:', err);
      res.status(500).json({ error: 'Failed to load ownership gaps' });
    }
  });

  console.log('[EPC-Control-Tower] Routes registered');
}

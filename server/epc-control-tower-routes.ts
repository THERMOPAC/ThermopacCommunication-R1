import { Request, Response, Express } from 'express';
import { pool } from './db';
import { createEpcTask } from './epc-task-helpers';
import { resolveManagerId } from './epc-task-helpers';

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

  app.get('/api/epc-control-tower/summary', ensureAuthenticated, requireControlTowerAccess, async (req: Request, res: Response) => {
    try {
      const pidParam = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      const pidFilter = pidParam ? `AND p.id = $1` : '';
      const pidArgs = pidParam ? [pidParam] : [];

      const projectSummary = pidParam
        ? await pool.query(`SELECT status, COUNT(*)::int as count FROM projects p WHERE 1=1 ${pidFilter} GROUP BY status ORDER BY count DESC`, pidArgs)
        : await pool.query(`SELECT status, COUNT(*)::int as count FROM projects GROUP BY status ORDER BY count DESC`);

      const riskHealth = await pool.query(`
        SELECT 
          p.id, p.code, p.name, p.status, p.manager_id,
          p.start_date, p.target_end_date, p.project_origin, p.source_order_number,
          u.username as manager_name,
          c.bp_name as customer_name,
          (SELECT COUNT(*)::int FROM project_key_stages ks WHERE ks.project_id = p.id AND ks.is_completed = true) as completed_stages,
          (SELECT COUNT(*)::int FROM project_key_stages ks WHERE ks.project_id = p.id) as total_stages,
          (SELECT COUNT(*)::int FROM deliverables d WHERE d.project_id = p.id AND d.status = 'pending' AND d.due_date IS NOT NULL AND d.due_date != '' AND d.due_date::date < CURRENT_DATE) as overdue_deliverables,
          (SELECT COUNT(*)::int FROM tasks t JOIN project_tasks pt ON pt.task_id = t.id WHERE pt.project_id = p.id AND t.status != 'completed' AND t.due_date IS NOT NULL AND t.due_date != '' AND t.due_date::date < CURRENT_DATE) as overdue_tasks,
          (SELECT COUNT(*)::int FROM tasks t JOIN project_tasks pt ON pt.task_id = t.id WHERE pt.project_id = p.id AND t.assigned_to IS NULL AND t.status != 'completed') as unassigned_tasks
        FROM projects p
        LEFT JOIN users u ON p.manager_id = u.id
        LEFT JOIN customers c ON p.customer_id = c.id
        WHERE p.status IN ('active', 'planning') ${pidFilter}
        ORDER BY p.id
      `, pidArgs);

      const projects = riskHealth.rows.map((p: any) => {
        let health = 'on_track';
        if (p.unassigned_tasks > 0 || p.overdue_deliverables > 0) health = 'at_risk';
        if (p.overdue_tasks > 2 || p.overdue_deliverables > 2) health = 'delayed';
        if (p.status === 'planning' && p.total_stages === 0) health = 'blocked';
        return { ...p, health };
      });

      const healthCounts = { on_track: 0, at_risk: 0, delayed: 0, blocked: 0 };
      projects.forEach((p: any) => { healthCounts[p.health as keyof typeof healthCounts]++; });

      const milestones = pidParam
        ? await pool.query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE is_completed = true)::int as completed FROM project_key_stages WHERE project_id = $1`, pidArgs)
        : await pool.query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE is_completed = true)::int as completed FROM project_key_stages`);

      const deliverables = pidParam
        ? await pool.query(`SELECT status, COUNT(*)::int as count FROM deliverables WHERE project_id = $1 GROUP BY status`, pidArgs)
        : await pool.query(`SELECT status, COUNT(*)::int as count FROM deliverables GROUP BY status`);

      const projectTasks = pidParam
        ? await pool.query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE t.status = 'completed')::int as completed, COUNT(*) FILTER (WHERE t.assigned_to IS NULL AND t.status != 'completed')::int as unassigned FROM tasks t JOIN project_tasks pt ON pt.task_id = t.id WHERE pt.project_id = $1`, pidArgs)
        : await pool.query(`SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE t.status = 'completed')::int as completed, COUNT(*) FILTER (WHERE t.assigned_to IS NULL AND t.status != 'completed')::int as unassigned FROM tasks t JOIN project_tasks pt ON pt.task_id = t.id`);

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

  app.get('/api/epc-control-tower/pipeline', ensureAuthenticated, requireControlTowerAccess, async (req: Request, res: Response) => {
    try {
      const pidParam = req.query.projectId ? parseInt(req.query.projectId as string) : null;

      const stages = [
        { key: 'BOM', table: 'epc_bom_headers', statusCol: 'status', label: 'Bill of Materials', piJoin: true },
        { key: 'DWG', table: 'epc_drawing_controls', statusCol: 'status', label: 'Drawing Controls', piJoin: true },
        { key: 'PO', table: 'epc_purchase_orders', statusCol: 'status', label: 'Purchase Orders', piJoin: true },
        { key: 'WO', table: 'epc_work_orders', statusCol: 'status', label: 'Work Orders', piJoin: true },
        { key: 'INS', table: 'inspection_execution_records', statusCol: 'status', label: 'Inspections', piJoin: true },
        { key: 'DSP', table: 'epc_dispatch_records', statusCol: 'status', label: 'Dispatch', piJoin: true },
        { key: 'INV', table: 'epc_invoices', statusCol: 'status', label: 'Invoices', piJoin: false },
      ];

      const pipeline = [];
      let prevCount = 0;

      for (const stage of stages) {
        const piJoinClause = pidParam && stage.piJoin ? `JOIN project_items pi ON t.project_item_id = pi.id WHERE pi.project_id = $1` : '';
        const pidArgs = pidParam && stage.piJoin ? [pidParam] : [];

        const countResult = pidParam && stage.piJoin
          ? await pool.query(`SELECT COUNT(*)::int as total FROM "${stage.table}" t ${piJoinClause}`, pidArgs)
          : await pool.query(`SELECT COUNT(*)::int as total FROM "${stage.table}"`);
        const total = countResult.rows[0].total;

        const statusResult = pidParam && stage.piJoin
          ? await pool.query(`SELECT t."${stage.statusCol}" as status, COUNT(*)::int as count FROM "${stage.table}" t ${piJoinClause} GROUP BY t."${stage.statusCol}" ORDER BY count DESC`, pidArgs)
          : await pool.query(`SELECT "${stage.statusCol}" as status, COUNT(*)::int as count FROM "${stage.table}" GROUP BY "${stage.statusCol}" ORDER BY count DESC`);

        let oldestRecord = null;
        try {
          const agingResult = pidParam && stage.piJoin
            ? await pool.query(`SELECT MIN(t.created_at) as oldest FROM "${stage.table}" t ${piJoinClause}`, pidArgs)
            : await pool.query(`SELECT MIN(created_at) as oldest FROM "${stage.table}"`);
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

  app.get('/api/epc-control-tower/bottlenecks', ensureAuthenticated, requireControlTowerAccess, async (req: Request, res: Response) => {
    try {
      const pidParam = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      const pidFilterKs = pidParam ? `AND ks.project_id = $1` : '';
      const pidFilterD = pidParam ? `AND d.project_id = $1` : '';
      const pidFilterPt = pidParam ? `AND pt.project_id = $1` : '';
      const pidArgs = pidParam ? [pidParam] : [];

      const overdueMilestones = await pool.query(`
        SELECT ks.id, ks.stage_name, ks.phase, p.target_end_date, p.code as project_code, p.name as project_name,
          CASE WHEN p.target_end_date IS NOT NULL AND p.target_end_date != ''
            THEN (CURRENT_DATE - p.target_end_date::date) ELSE 0 END as days_overdue
        FROM project_key_stages ks
        JOIN projects p ON ks.project_id = p.id
        WHERE ks.is_completed = false AND p.target_end_date IS NOT NULL AND p.target_end_date != '' AND p.target_end_date::date < CURRENT_DATE ${pidFilterKs}
        ORDER BY days_overdue DESC
        LIMIT 20
      `, pidArgs);

      const overdueDeliverables = await pool.query(`
        SELECT d.id, d.name, d.due_date, d.status, p.code as project_code, p.name as project_name,
          (CURRENT_DATE - d.due_date::date) as days_overdue
        FROM deliverables d
        JOIN projects p ON d.project_id = p.id
        WHERE d.status = 'pending' AND d.due_date IS NOT NULL AND d.due_date != '' AND d.due_date::date < CURRENT_DATE ${pidFilterD}
        ORDER BY days_overdue DESC
        LIMIT 20
      `, pidArgs);

      const overdueTasks = await pool.query(`
        SELECT t.id, t.title, t.due_date, t.status, t.priority, t.assigned_to,
          u.username as assigned_to_name, p.code as project_code, p.name as project_name,
          (CURRENT_DATE - t.due_date::date) as days_overdue
        FROM tasks t
        JOIN project_tasks pt ON pt.task_id = t.id
        JOIN projects p ON pt.project_id = p.id
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.status != 'completed' AND t.due_date IS NOT NULL AND t.due_date != '' AND t.due_date::date < CURRENT_DATE ${pidFilterPt}
        ORDER BY days_overdue DESC
        LIMIT 20
      `, pidArgs);

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

  app.get('/api/epc-control-tower/ownership-gaps', ensureAuthenticated, requireControlTowerAccess, async (req: Request, res: Response) => {
    try {
      const pidParam = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      const pidArgs = pidParam ? [pidParam] : [];

      const unassignedTasks = await pool.query(`
        SELECT t.id, t.title, t.description, t.priority, t.due_date, t.source_agent,
          p.code as project_code, p.name as project_name
        FROM tasks t
        JOIN project_tasks pt ON pt.task_id = t.id
        JOIN projects p ON pt.project_id = p.id
        WHERE t.assigned_to IS NULL AND t.status != 'completed' ${pidParam ? 'AND pt.project_id = $1' : ''}
        ORDER BY t.priority DESC, t.due_date ASC
      `, pidArgs);

      const kickoffWarnings = pidParam
        ? await pool.query(`
            SELECT t.id, t.title, t.description, t.priority, t.due_date, t.status,
              u.username as assigned_to_name
            FROM tasks t
            LEFT JOIN users u ON t.assigned_to = u.id
            JOIN project_tasks pt ON pt.task_id = t.id
            WHERE t.source_agent = 'epc_kickoff' AND t.title LIKE '%require assignment%' AND pt.project_id = $1
            ORDER BY t.created_at DESC
          `, pidArgs)
        : await pool.query(`
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
        WHERE pp.phase_lead_id IS NULL AND p.status = 'active' ${pidParam ? 'AND pp.project_id = $1' : ''}
        ORDER BY p.code, pp."order"
      `, pidArgs);

      const projectsNoManager = pidParam
        ? await pool.query(`SELECT id, code, name, status FROM projects WHERE manager_id IS NULL AND status IN ('active', 'planning') AND id = $1 ORDER BY code`, pidArgs)
        : await pool.query(`SELECT id, code, name, status FROM projects WHERE manager_id IS NULL AND status IN ('active', 'planning') ORDER BY code`);

      const deliverablesNoOwner = await pool.query(`
        SELECT d.id, d.name, d.due_date, d.status, p.code as project_code, p.name as project_name
        FROM deliverables d
        JOIN projects p ON d.project_id = p.id
        WHERE d.assigned_to IS NULL AND d.status != 'completed' ${pidParam ? 'AND d.project_id = $1' : ''}
        ORDER BY d.due_date ASC
      `, pidArgs);

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

  app.get('/api/epc-control-tower/stage-gates', ensureAuthenticated, requireControlTowerAccess, async (req: Request, res: Response) => {
    try {
      const pidParam = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      const pidFilter = pidParam ? `AND p.id = $1` : '';
      const pidArgs = pidParam ? [pidParam] : [];

      const stageDefinitions = [
        { key: 'BOM', label: 'Bill of Materials', entry: 'Project item exists with master item', exit: 'BOM Released or Locked (is_current=true)' },
        { key: 'DWG', label: 'Drawing Control', entry: 'BOM exists for project item', exit: 'Drawing approved or released' },
        { key: 'PLN', label: 'Planning', entry: 'BOM Released/Locked (explosion done)', exit: 'Planning record created with execution records' },
        { key: 'PO', label: 'Purchase Order', entry: 'Planning exists + BOM Released/Locked + item is Buy', exit: 'PO issued or approved' },
        { key: 'WO', label: 'Work Order', entry: 'Planning exists + BOM Released/Locked + item is Make', exit: 'WO issued or approved' },
        { key: 'INS', label: 'Inspection', entry: 'PO or WO exists', exit: 'Inspection completed, quality cleared on PO/WO' },
        { key: 'DSP', label: 'Dispatch', entry: 'PO/WO quality_status = inspection_cleared', exit: 'Dispatch record shipped or delivered' },
        { key: 'COM', label: 'Commissioning', entry: 'Dispatch shipped or delivered', exit: 'Commissioned or handed over' },
        { key: 'INV', label: 'Invoice', entry: 'Dispatch shipped/delivered OR Commissioning complete', exit: 'Billing readiness approved, invoice created' },
      ];

      const itemPipeline = await pool.query(`
        SELECT
          pi.id as project_item_id,
          pi.project_code as pi_project_code,
          pi.quantity,
          mi.id as master_item_id,
          mi.item_code,
          mi.description,
          mi.make_or_buy,
          p.id as project_id,
          p.code as project_code,
          p.name as project_name,
          -- BOM stage
          bh.id as bom_id,
          bh.bom_number,
          bh.status as bom_status,
          -- DWG stage
          dc.id as dwg_id,
          dc.dwg_control_number,
          dc.status as dwg_status,
          -- Planning stage
          ipr.id as planning_id,
          ipr.status as planning_status,
          -- PO stage (count + latest status)
          (SELECT COUNT(*)::int FROM epc_purchase_orders epo WHERE epo.project_item_id = pi.id AND epo.status NOT IN ('canceled', 'superseded')) as po_count,
          (SELECT epo.status FROM epc_purchase_orders epo WHERE epo.project_item_id = pi.id AND epo.status NOT IN ('canceled', 'superseded') ORDER BY epo.id DESC LIMIT 1) as po_status,
          (SELECT epo.quality_status FROM epc_purchase_orders epo WHERE epo.project_item_id = pi.id AND epo.status NOT IN ('canceled', 'superseded') ORDER BY epo.id DESC LIMIT 1) as po_quality_status,
          -- WO stage (count + latest status)
          (SELECT COUNT(*)::int FROM epc_work_orders ewo WHERE ewo.project_item_id = pi.id AND ewo.status NOT IN ('canceled', 'superseded')) as wo_count,
          (SELECT ewo.status FROM epc_work_orders ewo WHERE ewo.project_item_id = pi.id AND ewo.status NOT IN ('canceled', 'superseded') ORDER BY ewo.id DESC LIMIT 1) as wo_status,
          (SELECT ewo.quality_status FROM epc_work_orders ewo WHERE ewo.project_item_id = pi.id AND ewo.status NOT IN ('canceled', 'superseded') ORDER BY ewo.id DESC LIMIT 1) as wo_quality_status,
          -- INS stage
          (SELECT COUNT(*)::int FROM inspection_execution_records ier WHERE ier.project_item_id = pi.id AND ier.status NOT IN ('canceled')) as ins_count,
          (SELECT ier.status FROM inspection_execution_records ier WHERE ier.project_item_id = pi.id AND ier.status NOT IN ('canceled') ORDER BY ier.id DESC LIMIT 1) as ins_status,
          -- DSP stage
          (SELECT COUNT(*)::int FROM epc_dispatch_readiness edr WHERE edr.project_item_id = pi.id AND edr.status NOT IN ('canceled', 'superseded')) as dsp_readiness_count,
          (SELECT COUNT(*)::int FROM epc_dispatch_records edr2 WHERE edr2.project_item_id = pi.id AND edr2.status NOT IN ('canceled')) as dsp_count,
          (SELECT edr2.status FROM epc_dispatch_records edr2 WHERE edr2.project_item_id = pi.id AND edr2.status NOT IN ('canceled') ORDER BY edr2.id DESC LIMIT 1) as dsp_status,
          -- COM stage
          (SELECT COUNT(*)::int FROM epc_commissioning_readiness ecr WHERE ecr.project_item_id = pi.id AND ecr.status NOT IN ('canceled', 'superseded')) as com_count,
          (SELECT ecr.status FROM epc_commissioning_readiness ecr WHERE ecr.project_item_id = pi.id AND ecr.status NOT IN ('canceled', 'superseded') ORDER BY ecr.id DESC LIMIT 1) as com_status,
          -- INV stage (billing readiness)
          (SELECT COUNT(*)::int FROM epc_billing_readiness ebr WHERE ebr.project_item_id = pi.id AND ebr.status NOT IN ('canceled', 'superseded')) as inv_count,
          (SELECT ebr.status FROM epc_billing_readiness ebr WHERE ebr.project_item_id = pi.id AND ebr.status NOT IN ('canceled', 'superseded') ORDER BY ebr.id DESC LIMIT 1) as inv_status
        FROM project_items pi
        JOIN projects p ON p.id = pi.project_id
        LEFT JOIN master_items mi ON mi.id = pi.item_id
        LEFT JOIN epc_bom_headers bh ON bh.project_item_id = pi.id AND bh.is_current = true
        LEFT JOIN epc_drawing_controls dc ON dc.project_item_id = pi.id AND dc.status NOT IN ('superseded')
        LEFT JOIN item_planning_records ipr ON ipr.project_item_id = pi.id AND ipr.status NOT IN ('canceled', 'superseded')
        WHERE p.status NOT IN ('canceled', 'completed', 'closed') ${pidFilter}
        ORDER BY p.code, mi.item_code
      `, pidArgs);

      const stageCounts = {
        BOM: { total: 0, ready: 0, notReady: 0, missing: 0 },
        DWG: { total: 0, ready: 0, notReady: 0, missing: 0 },
        PLN: { total: 0, ready: 0, notReady: 0, missing: 0 },
        PO:  { total: 0, ready: 0, notReady: 0, missing: 0, na: 0 },
        WO:  { total: 0, ready: 0, notReady: 0, missing: 0, na: 0 },
        INS: { total: 0, ready: 0, notReady: 0, missing: 0 },
        DSP: { total: 0, ready: 0, notReady: 0, missing: 0 },
        COM: { total: 0, ready: 0, notReady: 0, missing: 0 },
        INV: { total: 0, ready: 0, notReady: 0, missing: 0 },
      };

      const gaps: any[] = [];
      const totalItems = itemPipeline.rows.length;

      for (const item of itemPipeline.rows as any[]) {
        const isBuy = item.make_or_buy === 'Buy';
        const isMake = item.make_or_buy === 'Make';
        const itemRef = `${item.project_code} / ${item.item_code || 'PI-' + item.project_item_id}`;

        const bomExists = !!item.bom_id;
        const bomReady = bomExists && ['released', 'locked'].includes(item.bom_status);
        if (bomExists) { stageCounts.BOM.total++; if (bomReady) stageCounts.BOM.ready++; else stageCounts.BOM.notReady++; }
        else stageCounts.BOM.missing++;

        const dwgExists = !!item.dwg_id;
        const dwgReady = dwgExists && ['approved', 'released'].includes(item.dwg_status);
        if (dwgExists) { stageCounts.DWG.total++; if (dwgReady) stageCounts.DWG.ready++; else stageCounts.DWG.notReady++; }
        else stageCounts.DWG.missing++;

        const plnExists = !!item.planning_id;
        const plnReady = plnExists && !['canceled', 'superseded'].includes(item.planning_status);
        if (plnExists) { stageCounts.PLN.total++; if (plnReady) stageCounts.PLN.ready++; else stageCounts.PLN.notReady++; }
        else stageCounts.PLN.missing++;

        if (isBuy) {
          const poExists = item.po_count > 0;
          const poReady = poExists && ['approved', 'issued'].includes(item.po_status);
          if (poExists) { stageCounts.PO.total++; if (poReady) stageCounts.PO.ready++; else stageCounts.PO.notReady++; }
          else stageCounts.PO.missing++;
          (stageCounts.WO as any).na = ((stageCounts.WO as any).na || 0) + 1;
        } else if (isMake) {
          const woExists = item.wo_count > 0;
          const woReady = woExists && ['approved', 'issued'].includes(item.wo_status);
          if (woExists) { stageCounts.WO.total++; if (woReady) stageCounts.WO.ready++; else stageCounts.WO.notReady++; }
          else stageCounts.WO.missing++;
          (stageCounts.PO as any).na = ((stageCounts.PO as any).na || 0) + 1;
        } else {
          (stageCounts.PO as any).na = ((stageCounts.PO as any).na || 0) + 1;
          (stageCounts.WO as any).na = ((stageCounts.WO as any).na || 0) + 1;
        }

        const insExists = item.ins_count > 0;
        const insReady = insExists && item.ins_status === 'completed';
        const qualityCleared = item.po_quality_status === 'inspection_cleared' || item.wo_quality_status === 'inspection_cleared';
        if (insExists) { stageCounts.INS.total++; if (insReady || qualityCleared) stageCounts.INS.ready++; else stageCounts.INS.notReady++; }
        else stageCounts.INS.missing++;

        const dspExists = item.dsp_count > 0;
        const dspReady = dspExists && ['shipped', 'delivered'].includes(item.dsp_status);
        if (dspExists) { stageCounts.DSP.total++; if (dspReady) stageCounts.DSP.ready++; else stageCounts.DSP.notReady++; }
        else stageCounts.DSP.missing++;

        const comExists = item.com_count > 0;
        const comReady = comExists && ['commissioned', 'handed_over'].includes(item.com_status);
        if (comExists) { stageCounts.COM.total++; if (comReady) stageCounts.COM.ready++; else stageCounts.COM.notReady++; }
        else stageCounts.COM.missing++;

        const invExists = item.inv_count > 0;
        const invReady = invExists && ['approved', 'invoiced'].includes(item.inv_status);
        if (invExists) { stageCounts.INV.total++; if (invReady) stageCounts.INV.ready++; else stageCounts.INV.notReady++; }
        else stageCounts.INV.missing++;

        // Gap detection: identify specific broken links
        if (bomReady && !dwgExists) {
          gaps.push({ type: 'BOM_NO_DWG', severity: 'warning', item: itemRef, projectCode: item.project_code, projectItemId: item.project_item_id, message: `BOM released but no drawing control exists` });
        }
        if ((item.po_count > 0 || item.wo_count > 0) && !bomReady) {
          gaps.push({ type: 'POWO_NO_BOM', severity: 'critical', item: itemRef, projectCode: item.project_code, projectItemId: item.project_item_id, message: `PO/WO exists but BOM is not Released/Locked` });
        }
        if ((item.po_count > 0 || item.wo_count > 0) && !plnExists) {
          gaps.push({ type: 'POWO_NO_PLAN', severity: 'warning', item: itemRef, projectCode: item.project_code, projectItemId: item.project_item_id, message: `PO/WO exists but no planning record found` });
        }
        if ((item.po_count > 0 || item.wo_count > 0) && !dwgReady && isMake) {
          gaps.push({ type: 'WO_NO_DWG', severity: 'critical', item: itemRef, projectCode: item.project_code, projectItemId: item.project_item_id, message: `Work Order exists but drawing not approved/released` });
        }
        if (dspExists && !qualityCleared && !insReady) {
          gaps.push({ type: 'DSP_NO_INS', severity: 'critical', item: itemRef, projectCode: item.project_code, projectItemId: item.project_item_id, message: `Dispatch initiated but inspection not completed/cleared` });
        }
        if (comExists && !dspReady) {
          gaps.push({ type: 'COM_NO_DSP', severity: 'critical', item: itemRef, projectCode: item.project_code, projectItemId: item.project_item_id, message: `Commissioning started but dispatch not shipped/delivered` });
        }
        if (invExists && !dspReady && !comReady) {
          gaps.push({ type: 'INV_NO_UPSTREAM', severity: 'critical', item: itemRef, projectCode: item.project_code, projectItemId: item.project_item_id, message: `Billing/Invoice exists but no dispatch or commissioning completed` });
        }
        if (bomReady && !plnExists) {
          gaps.push({ type: 'BOM_NO_PLAN', severity: 'warning', item: itemRef, projectCode: item.project_code, projectItemId: item.project_item_id, message: `BOM released but planning records not generated (explosion not done)` });
        }
      }

      const gapSummary: Record<string, number> = {};
      for (const g of gaps) {
        gapSummary[g.type] = (gapSummary[g.type] || 0) + 1;
      }

      const criticalGaps = gaps.filter(g => g.severity === 'critical');
      const warningGaps = gaps.filter(g => g.severity === 'warning');

      res.json({
        stageDefinitions,
        totalActiveProjectItems: totalItems,
        stageCounts,
        gapSummary,
        criticalCount: criticalGaps.length,
        warningCount: warningGaps.length,
        gaps: gaps.slice(0, 200),
      });
    } catch (err) {
      console.error('[EPC-Control-Tower] Stage gates error:', err);
      res.status(500).json({ error: 'Failed to load stage gate analysis' });
    }
  });

  app.get('/api/epc-control-tower/blocking-analysis', ensureAuthenticated, requireControlTowerAccess, async (req: Request, res: Response) => {
    try {
      const pidParam = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      const projectFilter = pidParam ? `AND p.id = $1` : '';
      const pidArgs = pidParam ? [pidParam] : [];

      const items = await pool.query(`
        SELECT
          pi.id as project_item_id,
          pi.quantity,
          mi.id as master_item_id,
          mi.item_code,
          mi.description as item_description,
          mi.make_or_buy,
          p.id as project_id,
          p.code as project_code,
          p.name as project_name,
          bh.id as bom_id, bh.status as bom_status, bh.created_at as bom_created_at,
          dc.id as dwg_id, dc.status as dwg_status, dc.created_at as dwg_created_at,
          ipr.id as planning_id, ipr.status as planning_status, ipr.planning_type, ipr.created_at as planning_created_at,
          (SELECT epo.id FROM epc_purchase_orders epo WHERE epo.project_item_id = pi.id AND epo.status NOT IN ('canceled','superseded') ORDER BY epo.id DESC LIMIT 1) as po_id,
          (SELECT epo.status FROM epc_purchase_orders epo WHERE epo.project_item_id = pi.id AND epo.status NOT IN ('canceled','superseded') ORDER BY epo.id DESC LIMIT 1) as po_status,
          (SELECT epo.quality_status FROM epc_purchase_orders epo WHERE epo.project_item_id = pi.id AND epo.status NOT IN ('canceled','superseded') ORDER BY epo.id DESC LIMIT 1) as po_quality_status,
          (SELECT epo.created_at FROM epc_purchase_orders epo WHERE epo.project_item_id = pi.id AND epo.status NOT IN ('canceled','superseded') ORDER BY epo.id DESC LIMIT 1) as po_created_at,
          (SELECT ewo.id FROM epc_work_orders ewo WHERE ewo.project_item_id = pi.id AND ewo.status NOT IN ('canceled','superseded') ORDER BY ewo.id DESC LIMIT 1) as wo_id,
          (SELECT ewo.status FROM epc_work_orders ewo WHERE ewo.project_item_id = pi.id AND ewo.status NOT IN ('canceled','superseded') ORDER BY ewo.id DESC LIMIT 1) as wo_status,
          (SELECT ewo.quality_status FROM epc_work_orders ewo WHERE ewo.project_item_id = pi.id AND ewo.status NOT IN ('canceled','superseded') ORDER BY ewo.id DESC LIMIT 1) as wo_quality_status,
          (SELECT ewo.created_at FROM epc_work_orders ewo WHERE ewo.project_item_id = pi.id AND ewo.status NOT IN ('canceled','superseded') ORDER BY ewo.id DESC LIMIT 1) as wo_created_at,
          (SELECT ier.status FROM inspection_execution_records ier WHERE ier.project_item_id = pi.id AND ier.status NOT IN ('canceled') ORDER BY ier.id DESC LIMIT 1) as ins_status,
          (SELECT ier.created_at FROM inspection_execution_records ier WHERE ier.project_item_id = pi.id AND ier.status NOT IN ('canceled') ORDER BY ier.id DESC LIMIT 1) as ins_created_at,
          (SELECT edr.status FROM epc_dispatch_records edr WHERE edr.project_item_id = pi.id AND edr.status NOT IN ('canceled') ORDER BY edr.id DESC LIMIT 1) as dsp_status,
          (SELECT edr.created_at FROM epc_dispatch_records edr WHERE edr.project_item_id = pi.id AND edr.status NOT IN ('canceled') ORDER BY edr.id DESC LIMIT 1) as dsp_created_at,
          (SELECT ecr.status FROM epc_commissioning_readiness ecr WHERE ecr.project_item_id = pi.id AND ecr.status NOT IN ('canceled','superseded') ORDER BY ecr.id DESC LIMIT 1) as com_status,
          (SELECT ecr.created_at FROM epc_commissioning_readiness ecr WHERE ecr.project_item_id = pi.id AND ecr.status NOT IN ('canceled','superseded') ORDER BY ecr.id DESC LIMIT 1) as com_created_at,
          (SELECT ebr.status FROM epc_billing_readiness ebr WHERE ebr.project_item_id = pi.id AND ebr.status NOT IN ('canceled','superseded') ORDER BY ebr.id DESC LIMIT 1) as inv_status
        FROM project_items pi
        JOIN projects p ON p.id = pi.project_id
        LEFT JOIN master_items mi ON mi.id = pi.item_id
        LEFT JOIN epc_bom_headers bh ON bh.project_item_id = pi.id AND bh.is_current = true
        LEFT JOIN epc_drawing_controls dc ON dc.project_item_id = pi.id AND dc.status NOT IN ('superseded')
        LEFT JOIN item_planning_records ipr ON ipr.project_item_id = pi.id AND ipr.status NOT IN ('canceled','superseded')
        WHERE p.status NOT IN ('canceled','completed','closed') ${projectFilter}
        ORDER BY p.code, mi.item_code
      `, pidArgs);

      const blockedItems: any[] = [];
      const stageSummary: Record<string, { blocked: number; items: any[] }> = {
        BOM: { blocked: 0, items: [] },
        DWG: { blocked: 0, items: [] },
        PLN: { blocked: 0, items: [] },
        PO_WO: { blocked: 0, items: [] },
        INS: { blocked: 0, items: [] },
        DSP: { blocked: 0, items: [] },
        COM: { blocked: 0, items: [] },
        INV: { blocked: 0, items: [] },
      };

      const now = Date.now();
      for (const item of items.rows as any[]) {
        const isBuy = item.make_or_buy === 'Buy';
        const isMake = item.make_or_buy === 'Make' || item.make_or_buy === 'Assembly';
        const itemRef = `${item.project_code} / ${item.item_code || 'PI-' + item.project_item_id}`;
        const reasons: string[] = [];
        let blockedAtStage = '';
        let stuckSinceDateStr: string | null = null;

        const bomReady = item.bom_id && ['released', 'locked'].includes(item.bom_status);
        const dwgReady = item.dwg_id && ['approved', 'released'].includes(item.dwg_status);
        const plnReady = item.planning_id && item.planning_status === 'released';
        const hasPoWo = item.po_id || item.wo_id;
        const qualityCleared = item.po_quality_status === 'inspection_cleared' || item.wo_quality_status === 'inspection_cleared';
        const dspReady = item.dsp_status && ['shipped', 'delivered'].includes(item.dsp_status);
        const comReady = item.com_status && ['commissioned', 'handed_over'].includes(item.com_status);

        if (!item.bom_id) {
          blockedAtStage = 'BOM'; reasons.push('No BOM created for this project item');
          stuckSinceDateStr = null;
        } else if (!bomReady) {
          blockedAtStage = 'BOM'; reasons.push(`BOM exists but status is '${item.bom_status}' — needs Released or Locked`);
          stuckSinceDateStr = item.bom_created_at;
        } else if (isMake && !dwgReady) {
          blockedAtStage = 'DWG';
          if (!item.dwg_id) reasons.push('No drawing control record exists (required for Make/Assembly)');
          else reasons.push(`Drawing status is '${item.dwg_status}' — needs Approved or Released`);
          stuckSinceDateStr = item.bom_created_at;
        } else if (!plnReady) {
          blockedAtStage = 'PLN';
          if (!item.planning_id) reasons.push('No planning record created — BOM explosion may not have run');
          else reasons.push(`Planning record status is '${item.planning_status}' — needs Released`);
          stuckSinceDateStr = item.planning_created_at || item.bom_created_at;
        } else if (!hasPoWo) {
          blockedAtStage = 'PO_WO';
          if (isBuy) reasons.push('Planning released but no Purchase Order created yet');
          else if (isMake) reasons.push('Planning released but no Work Order created yet');
          else reasons.push('Planning released but no PO or WO created yet');
          stuckSinceDateStr = item.planning_created_at;
        } else if (!qualityCleared) {
          blockedAtStage = 'INS';
          if (!item.ins_status) reasons.push('No inspection record exists — inspection not triggered');
          else if (item.ins_status !== 'completed') reasons.push(`Inspection status is '${item.ins_status}' — not yet completed`);
          else reasons.push('Inspection completed but quality not cleared on PO/WO');
          stuckSinceDateStr = item.po_created_at || item.wo_created_at;
        } else if (!dspReady) {
          blockedAtStage = 'DSP';
          if (!item.dsp_status) reasons.push('Quality cleared but no dispatch record created');
          else reasons.push(`Dispatch status is '${item.dsp_status}' — needs Shipped or Delivered`);
          stuckSinceDateStr = item.ins_created_at || item.po_created_at;
        } else if (!comReady) {
          blockedAtStage = 'COM';
          if (!item.com_status) reasons.push('Dispatched but commissioning not started');
          else reasons.push(`Commissioning status is '${item.com_status}' — needs Commissioned or Handed Over`);
          stuckSinceDateStr = item.dsp_created_at;
        } else if (!item.inv_status || !['approved', 'invoiced', 'ready_for_invoice'].includes(item.inv_status)) {
          blockedAtStage = 'INV';
          if (!item.inv_status) reasons.push('Commissioning complete but billing readiness not created');
          else reasons.push(`Billing status is '${item.inv_status}' — not yet invoiced`);
          stuckSinceDateStr = item.com_created_at;
        }

        if (blockedAtStage) {
          const stuckDays = stuckSinceDateStr ? Math.floor((now - new Date(stuckSinceDateStr).getTime()) / (1000 * 60 * 60 * 24)) : null;
          const entry = {
            projectId: item.project_id, projectCode: item.project_code, projectName: item.project_name,
            projectItemId: item.project_item_id, itemCode: item.item_code, itemDescription: item.item_description,
            makeOrBuy: item.make_or_buy, blockedAtStage, reasons, stuckDays,
            severity: (stuckDays !== null && stuckDays > 14) ? 'critical' : (stuckDays !== null && stuckDays > 7) ? 'warning' : 'info',
          };
          blockedItems.push(entry);
          if (stageSummary[blockedAtStage]) {
            stageSummary[blockedAtStage].blocked++;
            if (stageSummary[blockedAtStage].items.length < 10) stageSummary[blockedAtStage].items.push(entry);
          }
        }
      }

      res.json({
        totalItems: items.rows.length,
        totalBlocked: blockedItems.length,
        stageSummary,
        blockedItems: blockedItems.slice(0, 500),
      });
    } catch (err) {
      console.error('[EPC-Control-Tower] Blocking analysis error:', err);
      res.status(500).json({ error: 'Failed to load blocking analysis' });
    }
  });

  app.get('/api/epc-control-tower/risk-indicators', ensureAuthenticated, requireControlTowerAccess, async (req: Request, res: Response) => {
    try {
      const pidParam = req.query.projectId ? parseInt(req.query.projectId as string) : null;
      const pidFilter = pidParam ? `AND p.id = $1` : '';
      const pidArgs = pidParam ? [pidParam] : [];

      const pendingInspections = await pool.query(`
        SELECT
          ier.id, ier.inspection_order_number, ier.inspection_type, ier.status,
          ier.project_item_id, ier.created_at,
          EXTRACT(DAY FROM (NOW() - ier.created_at))::int as age_days,
          mi.item_code, mi.description as item_description,
          p.id as project_id, p.code as project_code, p.name as project_name
        FROM inspection_execution_records ier
        JOIN project_items pi ON ier.project_item_id = pi.id
        JOIN projects p ON pi.project_id = p.id
        LEFT JOIN master_items mi ON pi.item_id = mi.id
        WHERE ier.status NOT IN ('completed', 'canceled', 'closed')
          AND p.status NOT IN ('canceled', 'completed', 'closed') ${pidFilter}
        ORDER BY age_days DESC
        LIMIT 100
      `, pidArgs);

      const missingDrawings = await pool.query(`
        SELECT
          pi.id as project_item_id, mi.item_code, mi.description as item_description, mi.make_or_buy,
          p.id as project_id, p.code as project_code, p.name as project_name,
          bh.bom_number, bh.status as bom_status
        FROM project_items pi
        JOIN projects p ON p.id = pi.project_id
        JOIN master_items mi ON mi.id = pi.item_id
        LEFT JOIN epc_bom_headers bh ON bh.project_item_id = pi.id AND bh.is_current = true
        LEFT JOIN epc_drawing_controls dc ON dc.project_item_id = pi.id AND dc.status NOT IN ('superseded')
        WHERE mi.make_or_buy IN ('Make', 'Assembly')
          AND p.status NOT IN ('canceled', 'completed', 'closed')
          AND bh.id IS NOT NULL AND bh.status IN ('released', 'locked')
          AND dc.id IS NULL ${pidFilter}
        ORDER BY p.code, mi.item_code
        LIMIT 100
      `, pidArgs);

      const unreleasedPlanning = await pool.query(`
        SELECT
          ipr.id as planning_id, ipr.status as planning_status, ipr.planning_type, ipr.created_at,
          EXTRACT(DAY FROM (NOW() - ipr.created_at))::int as age_days,
          pi.id as project_item_id, mi.item_code, mi.description as item_description,
          p.id as project_id, p.code as project_code, p.name as project_name
        FROM item_planning_records ipr
        JOIN project_items pi ON ipr.project_item_id = pi.id
        JOIN projects p ON pi.project_id = p.id
        LEFT JOIN master_items mi ON pi.item_id = mi.id
        WHERE ipr.status NOT IN ('released', 'canceled', 'superseded')
          AND p.status NOT IN ('canceled', 'completed', 'closed') ${pidFilter}
        ORDER BY age_days DESC
        LIMIT 100
      `, pidArgs);

      const stalePoWo = pidParam
        ? await pool.query(`
            SELECT 'PO' as type, epo.id, epo.po_number as doc_number, epo.status, epo.quality_status,
              epo.project_item_id, epo.created_at,
              EXTRACT(DAY FROM (NOW() - epo.created_at))::int as age_days,
              mi.item_code, mi.description as item_description,
              p.code as project_code, p.name as project_name
            FROM epc_purchase_orders epo
            JOIN project_items pi ON epo.project_item_id = pi.id
            JOIN projects p ON pi.project_id = p.id
            LEFT JOIN master_items mi ON pi.item_id = mi.id
            WHERE epo.status NOT IN ('canceled', 'superseded')
              AND epo.quality_status != 'inspection_cleared'
              AND p.status NOT IN ('canceled', 'completed', 'closed')
              AND epo.created_at < NOW() - INTERVAL '14 days'
              AND p.id = $1
            UNION ALL
            SELECT 'WO' as type, ewo.id, ewo.wo_number as doc_number, ewo.status, ewo.quality_status,
              ewo.project_item_id, ewo.created_at,
              EXTRACT(DAY FROM (NOW() - ewo.created_at))::int as age_days,
              mi.item_code, mi.description as item_description,
              p.code as project_code, p.name as project_name
            FROM epc_work_orders ewo
            JOIN project_items pi ON ewo.project_item_id = pi.id
            JOIN projects p ON pi.project_id = p.id
            LEFT JOIN master_items mi ON pi.item_id = mi.id
            WHERE ewo.status NOT IN ('canceled', 'superseded')
              AND ewo.quality_status != 'inspection_cleared'
              AND p.status NOT IN ('canceled', 'completed', 'closed')
              AND ewo.created_at < NOW() - INTERVAL '14 days'
              AND p.id = $1
            ORDER BY age_days DESC
            LIMIT 100
          `, pidArgs)
        : await pool.query(`
            SELECT 'PO' as type, epo.id, epo.po_number as doc_number, epo.status, epo.quality_status,
              epo.project_item_id, epo.created_at,
              EXTRACT(DAY FROM (NOW() - epo.created_at))::int as age_days,
              mi.item_code, mi.description as item_description,
              p.code as project_code, p.name as project_name
            FROM epc_purchase_orders epo
            JOIN project_items pi ON epo.project_item_id = pi.id
            JOIN projects p ON pi.project_id = p.id
            LEFT JOIN master_items mi ON pi.item_id = mi.id
            WHERE epo.status NOT IN ('canceled', 'superseded')
              AND epo.quality_status != 'inspection_cleared'
              AND p.status NOT IN ('canceled', 'completed', 'closed')
              AND epo.created_at < NOW() - INTERVAL '14 days'
            UNION ALL
            SELECT 'WO' as type, ewo.id, ewo.wo_number as doc_number, ewo.status, ewo.quality_status,
              ewo.project_item_id, ewo.created_at,
              EXTRACT(DAY FROM (NOW() - ewo.created_at))::int as age_days,
              mi.item_code, mi.description as item_description,
              p.code as project_code, p.name as project_name
            FROM epc_work_orders ewo
            JOIN project_items pi ON ewo.project_item_id = pi.id
            JOIN projects p ON pi.project_id = p.id
            LEFT JOIN master_items mi ON pi.item_id = mi.id
            WHERE ewo.status NOT IN ('canceled', 'superseded')
              AND ewo.quality_status != 'inspection_cleared'
              AND p.status NOT IN ('canceled', 'completed', 'closed')
              AND ewo.created_at < NOW() - INTERVAL '14 days'
            ORDER BY age_days DESC
            LIMIT 100
          `);

      res.json({
        pendingInspections: { count: pendingInspections.rows.length, items: pendingInspections.rows },
        missingDrawings: { count: missingDrawings.rows.length, items: missingDrawings.rows },
        unreleasedPlanning: { count: unreleasedPlanning.rows.length, items: unreleasedPlanning.rows },
        stalePoWo: { count: stalePoWo.rows.length, items: stalePoWo.rows },
        summary: {
          pendingInspections: pendingInspections.rows.length,
          missingDrawings: missingDrawings.rows.length,
          unreleasedPlanning: unreleasedPlanning.rows.length,
          stalePoWo: stalePoWo.rows.length,
          totalRisks: pendingInspections.rows.length + missingDrawings.rows.length + unreleasedPlanning.rows.length + stalePoWo.rows.length,
        }
      });
    } catch (err) {
      console.error('[EPC-Control-Tower] Risk indicators error:', err);
      res.status(500).json({ error: 'Failed to load risk indicators' });
    }
  });

  app.post('/api/epc-control-tower/generate-gap-tasks', ensureAuthenticated, requireControlTowerAccess, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const { gapType, projectId, projectItemId } = req.body;

      if (!gapType) return res.status(400).json({ error: 'gapType is required' });

      const gapQueries: Record<string, { query: string; taskBuilder: (row: any) => any }> = {
        missing_bom: {
          query: `
            SELECT pi.id as project_item_id, mi.item_code, mi.description, p.id as project_id, p.code as project_code
            FROM project_items pi
            JOIN projects p ON p.id = pi.project_id
            LEFT JOIN master_items mi ON mi.id = pi.item_id
            LEFT JOIN epc_bom_headers bh ON bh.project_item_id = pi.id AND bh.is_current = true
            WHERE bh.id IS NULL AND p.status NOT IN ('canceled','completed','closed')
            ${projectId ? `AND p.id = ${parseInt(projectId)}` : ''}
            ${projectItemId ? `AND pi.id = ${parseInt(projectItemId)}` : ''}
            LIMIT 50`,
          taskBuilder: (r: any) => ({
            projectId: r.project_id, entityType: 'project_item', recordId: r.project_item_id,
            actionCode: 'create_bom',
            title: `[Gap] Create BOM for ${r.item_code || 'PI-' + r.project_item_id} (${r.project_code})`,
            description: `BOM is missing for project item ${r.item_code || r.project_item_id}. Create and release a BOM to unblock downstream stages.`,
            priority: 'High', createdBy: userId,
          }),
        },
        unreleased_bom: {
          query: `
            SELECT pi.id as project_item_id, mi.item_code, mi.description, p.id as project_id, p.code as project_code, bh.bom_number, bh.status as bom_status
            FROM project_items pi
            JOIN projects p ON p.id = pi.project_id
            LEFT JOIN master_items mi ON mi.id = pi.item_id
            JOIN epc_bom_headers bh ON bh.project_item_id = pi.id AND bh.is_current = true
            WHERE bh.status NOT IN ('released','locked') AND p.status NOT IN ('canceled','completed','closed')
            ${projectId ? `AND p.id = ${parseInt(projectId)}` : ''}
            ${projectItemId ? `AND pi.id = ${parseInt(projectItemId)}` : ''}
            LIMIT 50`,
          taskBuilder: (r: any) => ({
            projectId: r.project_id, entityType: 'bom_header', recordId: r.project_item_id,
            actionCode: 'release_bom',
            title: `[Gap] Release BOM ${r.bom_number} for ${r.item_code || 'PI-' + r.project_item_id} (${r.project_code})`,
            description: `BOM ${r.bom_number} is in '${r.bom_status}' status. Release or lock to unblock downstream stages.`,
            priority: 'High', createdBy: userId,
          }),
        },
        missing_drawing: {
          query: `
            SELECT pi.id as project_item_id, mi.item_code, mi.description, mi.make_or_buy, p.id as project_id, p.code as project_code
            FROM project_items pi
            JOIN projects p ON p.id = pi.project_id
            JOIN master_items mi ON mi.id = pi.item_id
            LEFT JOIN epc_bom_headers bh ON bh.project_item_id = pi.id AND bh.is_current = true
            LEFT JOIN epc_drawing_controls dc ON dc.project_item_id = pi.id AND dc.status NOT IN ('superseded')
            WHERE mi.make_or_buy IN ('Make','Assembly') AND bh.status IN ('released','locked') AND dc.id IS NULL
              AND p.status NOT IN ('canceled','completed','closed')
            ${projectId ? `AND p.id = ${parseInt(projectId)}` : ''}
            ${projectItemId ? `AND pi.id = ${parseInt(projectItemId)}` : ''}
            LIMIT 50`,
          taskBuilder: (r: any) => ({
            projectId: r.project_id, entityType: 'project_item', recordId: r.project_item_id,
            actionCode: 'create_drawing',
            title: `[Gap] Create drawing for ${r.item_code || 'PI-' + r.project_item_id} (${r.project_code})`,
            description: `${r.make_or_buy} item ${r.item_code || r.project_item_id} has a released BOM but no drawing control. Create and approve a drawing to unblock Work Orders.`,
            priority: 'High', createdBy: userId,
          }),
        },
        unreleased_planning: {
          query: `
            SELECT ipr.id as planning_id, ipr.status as planning_status, ipr.planning_type,
              pi.id as project_item_id, mi.item_code, mi.description, p.id as project_id, p.code as project_code
            FROM item_planning_records ipr
            JOIN project_items pi ON ipr.project_item_id = pi.id
            JOIN projects p ON pi.project_id = p.id
            LEFT JOIN master_items mi ON pi.item_id = mi.id
            WHERE ipr.status NOT IN ('released','canceled','superseded')
              AND p.status NOT IN ('canceled','completed','closed')
            ${projectId ? `AND p.id = ${parseInt(projectId)}` : ''}
            ${projectItemId ? `AND pi.id = ${parseInt(projectItemId)}` : ''}
            LIMIT 50`,
          taskBuilder: (r: any) => ({
            projectId: r.project_id, entityType: 'planning_record', recordId: r.planning_id,
            actionCode: 'release_planning',
            title: `[Gap] Release planning for ${r.item_code || 'PI-' + r.project_item_id} (${r.project_code})`,
            description: `Planning record (${r.planning_type}) is in '${r.planning_status}' status. Release to unblock PO/WO creation.`,
            priority: 'High', createdBy: userId,
          }),
        },
        pending_inspection: {
          query: `
            SELECT ier.id, ier.inspection_order_number, ier.inspection_type, ier.status,
              ier.project_item_id, EXTRACT(DAY FROM (NOW() - ier.created_at))::int as age_days,
              mi.item_code, mi.description, p.id as project_id, p.code as project_code
            FROM inspection_execution_records ier
            JOIN project_items pi ON ier.project_item_id = pi.id
            JOIN projects p ON pi.project_id = p.id
            LEFT JOIN master_items mi ON pi.item_id = mi.id
            WHERE ier.status NOT IN ('completed','canceled','closed')
              AND p.status NOT IN ('canceled','completed','closed')
              AND ier.created_at < NOW() - INTERVAL '7 days'
            ${projectId ? `AND p.id = ${parseInt(projectId)}` : ''}
            ${projectItemId ? `AND pi.id = ${parseInt(projectItemId)}` : ''}
            ORDER BY age_days DESC LIMIT 50`,
          taskBuilder: (r: any) => ({
            projectId: r.project_id, entityType: 'inspection', recordId: r.id,
            actionCode: 'complete_inspection',
            title: `[Gap] Complete inspection ${r.inspection_order_number} (${r.age_days}d old) — ${r.project_code}`,
            description: `${r.inspection_type} inspection for ${r.item_code || 'PI-' + r.project_item_id} has been pending for ${r.age_days} days. Complete to unblock dispatch.`,
            priority: r.age_days > 14 ? 'Urgent' : 'High', createdBy: userId,
          }),
        },
      };

      const config = gapQueries[gapType];
      if (!config) return res.status(400).json({ error: `Unknown gapType: ${gapType}. Valid: ${Object.keys(gapQueries).join(', ')}` });

      const result = await pool.query(config.query);
      let tasksCreated = 0;
      let tasksDuplicate = 0;

      for (const row of result.rows) {
        const params = config.taskBuilder(row);
        const assignee = await resolveManagerId(params.projectId);
        params.assignedTo = assignee;
        const taskId = await createEpcTask(params);
        if (taskId) tasksCreated++;
        else tasksDuplicate++;
      }

      res.json({
        gapType,
        itemsFound: result.rows.length,
        tasksCreated,
        tasksDuplicate,
        message: tasksCreated > 0
          ? `Created ${tasksCreated} actionable tasks for '${gapType}' gaps.`
          : tasksDuplicate > 0
          ? `All ${tasksDuplicate} gap tasks already exist (de-duplicated).`
          : `No items found matching '${gapType}' criteria.`,
      });
    } catch (err) {
      console.error('[EPC-Control-Tower] Generate gap tasks error:', err);
      res.status(500).json({ error: 'Failed to generate gap tasks' });
    }
  });

  console.log('[EPC-Control-Tower] Routes registered');
}

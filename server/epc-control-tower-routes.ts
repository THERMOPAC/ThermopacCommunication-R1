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
          p.start_date, p.target_end_date,
          u.username as manager_name,
          (SELECT COUNT(*)::int FROM project_key_stages ks WHERE ks.project_id = p.id AND ks.is_completed = true) as completed_stages,
          (SELECT COUNT(*)::int FROM project_key_stages ks WHERE ks.project_id = p.id) as total_stages,
          (SELECT COUNT(*)::int FROM deliverables d WHERE d.project_id = p.id AND d.status = 'pending' AND d.due_date IS NOT NULL AND d.due_date != '' AND d.due_date::date < CURRENT_DATE) as overdue_deliverables,
          (SELECT COUNT(*)::int FROM tasks t JOIN project_tasks pt ON pt.task_id = t.id WHERE pt.project_id = p.id AND t.status != 'completed' AND t.due_date IS NOT NULL AND t.due_date != '' AND t.due_date::date < CURRENT_DATE) as overdue_tasks,
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
        { key: 'BOM', table: 'epc_bom_headers', statusCol: 'status', label: 'Bill of Materials' },
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
        SELECT ks.id, ks.stage_name, ks.phase, p.target_end_date, p.code as project_code, p.name as project_name,
          CASE WHEN p.target_end_date IS NOT NULL AND p.target_end_date != ''
            THEN (CURRENT_DATE - p.target_end_date::date) ELSE 0 END as days_overdue
        FROM project_key_stages ks
        JOIN projects p ON ks.project_id = p.id
        WHERE ks.is_completed = false AND p.target_end_date IS NOT NULL AND p.target_end_date != '' AND p.target_end_date::date < CURRENT_DATE
        ORDER BY days_overdue DESC
        LIMIT 20
      `);

      const overdueDeliverables = await pool.query(`
        SELECT d.id, d.name, d.due_date, d.status, p.code as project_code, p.name as project_name,
          (CURRENT_DATE - d.due_date::date) as days_overdue
        FROM deliverables d
        JOIN projects p ON d.project_id = p.id
        WHERE d.status = 'pending' AND d.due_date IS NOT NULL AND d.due_date != '' AND d.due_date::date < CURRENT_DATE
        ORDER BY days_overdue DESC
        LIMIT 20
      `);

      const overdueTasks = await pool.query(`
        SELECT t.id, t.title, t.due_date, t.status, t.priority, t.assigned_to,
          u.username as assigned_to_name, p.code as project_code, p.name as project_name,
          (CURRENT_DATE - t.due_date::date) as days_overdue
        FROM tasks t
        JOIN project_tasks pt ON pt.task_id = t.id
        JOIN projects p ON pt.project_id = p.id
        LEFT JOIN users u ON t.assigned_to = u.id
        WHERE t.status != 'completed' AND t.due_date IS NOT NULL AND t.due_date != '' AND t.due_date::date < CURRENT_DATE
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

  app.get('/api/epc-control-tower/stage-gates', ensureAuthenticated, requireControlTowerAccess, async (_req: Request, res: Response) => {
    try {
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
          pi.item_number,
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
          (SELECT COUNT(*)::int FROM epc_purchase_orders epo WHERE epo.project_item_id = pi.id AND epo.status NOT IN ('cancelled', 'superseded')) as po_count,
          (SELECT epo.status FROM epc_purchase_orders epo WHERE epo.project_item_id = pi.id AND epo.status NOT IN ('cancelled', 'superseded') ORDER BY epo.id DESC LIMIT 1) as po_status,
          (SELECT epo.quality_status FROM epc_purchase_orders epo WHERE epo.project_item_id = pi.id AND epo.status NOT IN ('cancelled', 'superseded') ORDER BY epo.id DESC LIMIT 1) as po_quality_status,
          -- WO stage (count + latest status)
          (SELECT COUNT(*)::int FROM epc_work_orders ewo WHERE ewo.project_item_id = pi.id AND ewo.status NOT IN ('cancelled', 'superseded')) as wo_count,
          (SELECT ewo.status FROM epc_work_orders ewo WHERE ewo.project_item_id = pi.id AND ewo.status NOT IN ('cancelled', 'superseded') ORDER BY ewo.id DESC LIMIT 1) as wo_status,
          (SELECT ewo.quality_status FROM epc_work_orders ewo WHERE ewo.project_item_id = pi.id AND ewo.status NOT IN ('cancelled', 'superseded') ORDER BY ewo.id DESC LIMIT 1) as wo_quality_status,
          -- INS stage
          (SELECT COUNT(*)::int FROM inspection_execution_records ier WHERE ier.project_item_id = pi.id AND ier.status NOT IN ('cancelled')) as ins_count,
          (SELECT ier.status FROM inspection_execution_records ier WHERE ier.project_item_id = pi.id AND ier.status NOT IN ('cancelled') ORDER BY ier.id DESC LIMIT 1) as ins_status,
          -- DSP stage
          (SELECT COUNT(*)::int FROM epc_dispatch_readiness edr WHERE edr.project_item_id = pi.id AND edr.status NOT IN ('cancelled', 'superseded')) as dsp_readiness_count,
          (SELECT COUNT(*)::int FROM epc_dispatch_records edr2 WHERE edr2.project_item_id = pi.id AND edr2.status NOT IN ('cancelled')) as dsp_count,
          (SELECT edr2.status FROM epc_dispatch_records edr2 WHERE edr2.project_item_id = pi.id AND edr2.status NOT IN ('cancelled') ORDER BY edr2.id DESC LIMIT 1) as dsp_status,
          -- COM stage
          (SELECT COUNT(*)::int FROM epc_commissioning_readiness ecr WHERE ecr.project_item_id = pi.id AND ecr.status NOT IN ('cancelled', 'superseded')) as com_count,
          (SELECT ecr.status FROM epc_commissioning_readiness ecr WHERE ecr.project_item_id = pi.id AND ecr.status NOT IN ('cancelled', 'superseded') ORDER BY ecr.id DESC LIMIT 1) as com_status,
          -- INV stage (billing readiness)
          (SELECT COUNT(*)::int FROM epc_billing_readiness ebr WHERE ebr.project_item_id = pi.id AND ebr.status NOT IN ('cancelled', 'superseded')) as inv_count,
          (SELECT ebr.status FROM epc_billing_readiness ebr WHERE ebr.project_item_id = pi.id AND ebr.status NOT IN ('cancelled', 'superseded') ORDER BY ebr.id DESC LIMIT 1) as inv_status
        FROM project_items pi
        JOIN projects p ON p.id = pi.project_id
        LEFT JOIN master_items mi ON mi.id = pi.master_item_id
        LEFT JOIN epc_bom_headers bh ON bh.project_item_id = pi.id AND bh.is_current = true
        LEFT JOIN epc_drawing_controls dc ON dc.project_item_id = pi.id AND dc.status NOT IN ('superseded')
        LEFT JOIN item_planning_records ipr ON ipr.project_item_id = pi.id AND ipr.status NOT IN ('cancelled', 'superseded')
        WHERE p.status NOT IN ('cancelled', 'completed', 'closed')
        ORDER BY p.code, pi.item_number
      `);

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
        const itemRef = `${item.project_code} / ${item.item_number} (${item.item_code || 'no code'})`;

        const bomExists = !!item.bom_id;
        const bomReady = bomExists && ['released', 'locked'].includes(item.bom_status);
        if (bomExists) { stageCounts.BOM.total++; if (bomReady) stageCounts.BOM.ready++; else stageCounts.BOM.notReady++; }
        else stageCounts.BOM.missing++;

        const dwgExists = !!item.dwg_id;
        const dwgReady = dwgExists && ['approved', 'released'].includes(item.dwg_status);
        if (dwgExists) { stageCounts.DWG.total++; if (dwgReady) stageCounts.DWG.ready++; else stageCounts.DWG.notReady++; }
        else stageCounts.DWG.missing++;

        const plnExists = !!item.planning_id;
        const plnReady = plnExists && !['cancelled', 'superseded'].includes(item.planning_status);
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

  console.log('[EPC-Control-Tower] Routes registered');
}

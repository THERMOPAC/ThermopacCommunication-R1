import { Router, Request, Response } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';

function ensureAuthenticated(req: Request, res: Response, next: Function) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

const MONITOR_ROLES = ['General Manager', 'Superuser'];

function requireMonitorRole(req: Request, res: Response, next: Function) {
  if (!req.user || !MONITOR_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Requires General Manager or Superuser' });
  }
  next();
}

export function setupEpcMonitoringRoutes(app: Router) {

  app.get('/api/epc-monitoring/pending-uploads', ensureAuthenticated, requireMonitorRole, async (_req: Request, res: Response) => {
    try {
      const result = await db.execute(sql`
        SELECT
          edc.id,
          edc.dwg_control_number,
          edc.drawing_number,
          edc.drawing_title,
          edc.revision_code,
          edc.status,
          edc.is_current,
          edc.discipline_code,
          edc.created_at,
          EXTRACT(DAY FROM NOW() - edc.created_at)::int AS age_days,
          p.code AS project_code,
          p.name AS project_name
        FROM epc_drawing_controls edc
        JOIN projects p ON p.id = edc.project_id
        WHERE edc.status = 'pending_upload'
        ORDER BY edc.created_at ASC
      `);
      res.json({
        count: result.rows.length,
        records: result.rows,
      });
    } catch (error) {
      console.error('[EPC-Monitor] Error fetching pending uploads:', error);
      res.status(500).json({ error: 'Failed to fetch pending uploads' });
    }
  });

  app.get('/api/epc-monitoring/dsp-usage', ensureAuthenticated, requireMonitorRole, async (_req: Request, res: Response) => {
    try {
      const countResult = await db.execute(sql`
        SELECT count(*) AS total FROM epc_dispatch_records
      `);
      const firstResult = await db.execute(sql`
        SELECT MIN(created_at) AS first_created FROM epc_dispatch_records
      `);
      const byProject = await db.execute(sql`
        SELECT
          p.code AS project_code,
          p.name AS project_name,
          count(*) AS dispatch_count,
          MIN(edr.created_at) AS first_dispatch,
          MAX(edr.created_at) AS last_dispatch
        FROM epc_dispatch_records edr
        JOIN projects p ON p.id = edr.project_id
        GROUP BY p.code, p.name
        ORDER BY count(*) DESC
      `);

      res.json({
        totalEpcDispatches: parseInt((countResult.rows[0] as any).total),
        firstCreated: (firstResult.rows[0] as any).first_created || null,
        byProject: byProject.rows,
      });
    } catch (error) {
      console.error('[EPC-Monitor] Error fetching DSP usage:', error);
      res.status(500).json({ error: 'Failed to fetch DSP usage' });
    }
  });

  app.get('/api/epc-monitoring/legacy-access', ensureAuthenticated, requireMonitorRole, async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;

      const daily = await db.execute(sql`
        SELECT
          path_family,
          accessed_at::date AS access_date,
          count(*) AS access_count,
          count(DISTINCT accessed_by) AS unique_users
        FROM legacy_file_access_log
        WHERE accessed_at >= NOW() - make_interval(days => ${days})
        GROUP BY path_family, accessed_at::date
        ORDER BY accessed_at::date DESC, path_family
      `);

      const summary = await db.execute(sql`
        SELECT
          path_family,
          count(*) AS total_accesses,
          count(DISTINCT accessed_by) AS unique_users,
          MIN(accessed_at) AS first_access,
          MAX(accessed_at) AS last_access
        FROM legacy_file_access_log
        WHERE accessed_at >= NOW() - make_interval(days => ${days})
        GROUP BY path_family
        ORDER BY count(*) DESC
      `);

      const zeroUsage = await db.execute(sql`
        SELECT DISTINCT path_family FROM legacy_file_access_log
        WHERE path_family NOT IN (
          SELECT DISTINCT path_family FROM legacy_file_access_log
          WHERE accessed_at >= NOW() - '7 days'::interval
        )
      `);

      res.json({
        periodDays: days,
        daily: daily.rows,
        summary: summary.rows,
        zeroUsage7Days: zeroUsage.rows.map((r: any) => r.path_family),
      });
    } catch (error) {
      console.error('[EPC-Monitor] Error fetching legacy access:', error);
      res.status(500).json({ error: 'Failed to fetch legacy access data' });
    }
  });

  app.get('/api/epc-monitoring/cutover-readiness', ensureAuthenticated, requireMonitorRole, async (_req: Request, res: Response) => {
    try {
      const flags = await db.execute(sql`
        SELECT flag_name, enabled, description, updated_at
        FROM epc_migration_feature_flags
        ORDER BY flag_name
      `);

      const insStats = await db.execute(sql`
        SELECT
          count(*) FILTER (WHERE source_type = 'epc') AS epc_served,
          count(*) FILTER (WHERE source_type = 'legacy') AS legacy_served,
          count(*) AS total
        FROM (
          SELECT
            CASE
              WHEN EXISTS (
                SELECT 1 FROM epc_document_attachments eda
                WHERE eda.doc_type = 'INS'
                AND eda.parent_entity_id = ie.id
                AND eda.parent_entity_type = 'inspection_execution_records'
                AND eda.status = 'active'
              ) THEN 'epc'
              ELSE 'legacy'
            END AS source_type
          FROM inspection_execution_records ie
          WHERE ie.status NOT IN ('canceled')
        ) sub
      `);

      const dwgStats = await db.execute(sql`
        SELECT
          count(*) FILTER (WHERE status IN ('approved', 'released') AND has_file = true) AS epc_with_files,
          count(*) FILTER (WHERE status = 'pending_upload') AS pending_upload,
          count(*) FILTER (WHERE status = 'file_not_available') AS file_not_available,
          count(*) FILTER (WHERE status = 'superseded') AS superseded,
          count(*) AS total
        FROM (
          SELECT
            edc.status,
            EXISTS (
              SELECT 1 FROM epc_document_attachments eda
              WHERE eda.parent_entity_type = 'epc_drawing_controls'
              AND eda.parent_entity_id = edc.id
              AND eda.status = 'active'
            ) AS has_file
          FROM epc_drawing_controls edc
          WHERE edc.legacy_metadata IS NOT NULL
        ) sub
      `);

      const dspStats = await db.execute(sql`
        SELECT count(*) AS total FROM epc_dispatch_records
      `);
      const dspFirstUsage = await db.execute(sql`
        SELECT MIN(created_at) AS first_created FROM epc_dispatch_records
      `);

      const legacyTrend = await db.execute(sql`
        SELECT
          accessed_at::date AS day,
          count(*) AS accesses
        FROM legacy_file_access_log
        WHERE accessed_at >= NOW() - '7 days'::interval
        GROUP BY accessed_at::date
        ORDER BY accessed_at::date
      `);

      const ins = insStats.rows[0] as any;
      const dwg = dwgStats.rows[0] as any;
      const dsp = dspStats.rows[0] as any;

      res.json({
        featureFlags: flags.rows,
        ins: {
          epcServed: parseInt(ins.epc_served || '0'),
          legacyServed: parseInt(ins.legacy_served || '0'),
          total: parseInt(ins.total || '0'),
          epcPercent: ins.total > 0 ? Math.round((parseInt(ins.epc_served || '0') / parseInt(ins.total)) * 100) : 0,
        },
        dwg: {
          epcWithFiles: parseInt(dwg.epc_with_files || '0'),
          pendingUpload: parseInt(dwg.pending_upload || '0'),
          fileNotAvailable: parseInt(dwg.file_not_available || '0'),
          superseded: parseInt(dwg.superseded || '0'),
          total: parseInt(dwg.total || '0'),
        },
        dsp: {
          totalEpcDispatches: parseInt(dsp.total || '0'),
          firstCreated: (dspFirstUsage.rows[0] as any).first_created || null,
          status: parseInt(dsp.total || '0') > 0 ? 'active' : 'inactive',
        },
        legacyTrend7Day: legacyTrend.rows,
      });
    } catch (error) {
      console.error('[EPC-Monitor] Error fetching cutover readiness:', error);
      res.status(500).json({ error: 'Failed to fetch cutover readiness' });
    }
  });

  app.get('/api/epc-monitoring/bom-readiness', ensureAuthenticated, requireMonitorRole, async (_req: Request, res: Response) => {
    try {
      const flagResult = await db.execute(
        sql`SELECT enabled FROM epc_migration_feature_flags WHERE flag_name = 'EPC_BOM_GATING_STRICT' LIMIT 1`
      );
      const strictEnabled = flagResult.rows.length > 0 ? (flagResult.rows[0] as any).enabled === true : false;

      const itemsWithoutBom = await db.execute(sql`
        SELECT pi.id, pi.item_number, mi.item_code, mi.description,
               p.code as project_code, p.name as project_name
        FROM project_items pi
        JOIN projects p ON p.id = pi.project_id
        LEFT JOIN master_items mi ON mi.id = pi.master_item_id
        LEFT JOIN epc_bom_headers bh ON bh.project_item_id = pi.id AND bh.is_current = true
        WHERE bh.id IS NULL
          AND p.status NOT IN ('canceled', 'completed', 'closed')
        ORDER BY p.code, pi.item_number
      `);

      const bomsNotReady = await db.execute(sql`
        SELECT bh.id, bh.bom_number, bh.status, bh.revision_code,
               pi.item_number, mi.item_code,
               p.code as project_code, p.name as project_name
        FROM epc_bom_headers bh
        JOIN project_items pi ON pi.id = bh.project_item_id
        JOIN projects p ON p.id = pi.project_id
        LEFT JOIN master_items mi ON mi.id = bh.master_item_id
        WHERE bh.is_current = true
          AND bh.status NOT IN ('released', 'locked')
          AND p.status NOT IN ('canceled', 'completed', 'closed')
        ORDER BY p.code, pi.item_number
      `);

      const totalActiveItems = await db.execute(sql`
        SELECT COUNT(*) as total
        FROM project_items pi
        JOIN projects p ON p.id = pi.project_id
        WHERE p.status NOT IN ('canceled', 'completed', 'closed')
      `);

      const totalWithBom = await db.execute(sql`
        SELECT COUNT(DISTINCT pi.id) as total
        FROM project_items pi
        JOIN projects p ON p.id = pi.project_id
        JOIN epc_bom_headers bh ON bh.project_item_id = pi.id AND bh.is_current = true
        WHERE p.status NOT IN ('canceled', 'completed', 'closed')
      `);

      const totalReleasedLocked = await db.execute(sql`
        SELECT COUNT(DISTINCT pi.id) as total
        FROM project_items pi
        JOIN projects p ON p.id = pi.project_id
        JOIN epc_bom_headers bh ON bh.project_item_id = pi.id AND bh.is_current = true
        WHERE bh.status IN ('released', 'locked')
          AND p.status NOT IN ('canceled', 'completed', 'closed')
      `);

      const bypassLog = await db.execute(sql`
        SELECT bl.id, bl.document_type, bl.document_number, bl.reason, bl.created_at,
               pi.item_number, mi.item_code,
               p.code as project_code, p.name as project_name,
               u.username as created_by_name
        FROM bom_gating_bypass_log bl
        JOIN project_items pi ON pi.id = bl.project_item_id
        JOIN projects p ON p.id = bl.project_id
        LEFT JOIN master_items mi ON mi.id = pi.master_item_id
        LEFT JOIN users u ON u.id = bl.created_by
        ORDER BY bl.created_at DESC
        LIMIT 100
      `);

      const recentBypassCount = await db.execute(sql`
        SELECT COUNT(*) as total
        FROM bom_gating_bypass_log
        WHERE created_at >= NOW() - '14 days'::interval
      `);

      const totalItems = parseInt((totalActiveItems.rows[0] as any).total || '0');
      const withBom = parseInt((totalWithBom.rows[0] as any).total || '0');
      const releasedLocked = parseInt((totalReleasedLocked.rows[0] as any).total || '0');
      const recentBypasses = parseInt((recentBypassCount.rows[0] as any).total || '0');

      const canEnableStrict = totalItems > 0
        && itemsWithoutBom.rows.length === 0
        && bomsNotReady.rows.length === 0
        && recentBypasses === 0;

      res.json({
        mode: strictEnabled ? 'strict' : 'transitional',
        strictEnabled,
        summary: {
          totalActiveProjectItems: totalItems,
          withBom,
          withReleasedLockedBom: releasedLocked,
          bomCoveragePercent: totalItems > 0 ? Math.round((withBom / totalItems) * 100) : 0,
          bomReadyPercent: totalItems > 0 ? Math.round((releasedLocked / totalItems) * 100) : 0,
          itemsWithoutBom: itemsWithoutBom.rows.length,
          bomsNotReady: bomsNotReady.rows.length,
          recentBypasses14d: recentBypasses,
          totalBypasses: bypassLog.rows.length,
        },
        canEnableStrict,
        cutoverBlockers: canEnableStrict ? [] : [
          ...(itemsWithoutBom.rows.length > 0 ? [`${itemsWithoutBom.rows.length} project item(s) have no BOM`] : []),
          ...(bomsNotReady.rows.length > 0 ? [`${bomsNotReady.rows.length} BOM(s) not in Released/Locked status`] : []),
          ...(recentBypasses > 0 ? [`${recentBypasses} PO/WO created without BOM in last 14 days`] : []),
          ...(totalItems === 0 ? ['No active project items found'] : []),
        ],
        itemsWithoutBom: itemsWithoutBom.rows,
        bomsNotReady: bomsNotReady.rows,
        bypassLog: bypassLog.rows,
      });
    } catch (error) {
      console.error('[EPC-Monitor] Error fetching BOM readiness:', error);
      res.status(500).json({ error: 'Failed to fetch BOM readiness data' });
    }
  });

  console.log('EPC Monitoring routes registered at /api/epc-monitoring');
}

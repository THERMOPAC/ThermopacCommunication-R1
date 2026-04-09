import type { Express, Request, Response } from 'express';
import { db } from './db';
import { gcsFileIndex, projectMembers } from '@shared/schema';
import { eq, sql, and, or, ilike, inArray, isNotNull } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import { syncGcsIndex, getLastSyncTime, isSyncRunning } from './gcs-dashboard-service';

async function getAccessibleProjectIds(userId: number, role: string): Promise<number[] | 'all'> {
  if (role === 'Superuser') return 'all';

  const rows = await db.select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(and(
      eq(projectMembers.userId, userId),
      eq(projectMembers.isActive, true)
    ));

  return rows.map(r => r.projectId);
}

function buildAccessFilter(projectIds: number[] | 'all') {
  if (projectIds === 'all') return sql`1=1`;
  if (projectIds.length === 0) return sql`1=0`;
  const idList = projectIds.map(id => sql`${id}`);
  return sql`project_id IN (${sql.join(idList, sql`, `)})`;
}

export function setupGcsDashboardRoutes(app: Express) {
  app.get('/api/gcs-dashboard/summary', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const projectIds = await getAccessibleProjectIds(user.id, user.role);
      const accessFilter = buildAccessFilter(projectIds);

      const result = await db.execute(sql`
        SELECT
          COUNT(*)::int AS total_files,
          COALESCE(SUM(size_bytes), 0)::bigint AS total_size_bytes,
          COUNT(DISTINCT project_code) AS projects_covered,
          MAX(last_synced_at) AS last_sync_time
        FROM gcs_file_index
        WHERE ${accessFilter}
      `);

      const row = result.rows[0] || {};
      res.json({
        totalFiles: parseInt(row.total_files as string) || 0,
        totalSizeBytes: parseInt(row.total_size_bytes as string) || 0,
        projectsCovered: parseInt(row.projects_covered as string) || 0,
        lastSyncTime: row.last_sync_time || getLastSyncTime(),
        syncInProgress: isSyncRunning(),
      });
    } catch (err) {
      console.error('[GCS-DASHBOARD] Summary error:', err);
      res.status(500).json({ error: 'Failed to load summary' });
    }
  });

  app.get('/api/gcs-dashboard/files', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const projectIds = await getAccessibleProjectIds(user.id, user.role);
      const accessFilter = buildAccessFilter(projectIds);

      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = (page - 1) * limit;

      const conditions: any[] = [accessFilter];

      if (req.query.continent) conditions.push(sql`continent_code = ${req.query.continent}`);
      if (req.query.country) conditions.push(sql`country_code = ${req.query.country}`);
      if (req.query.customer) conditions.push(sql`customer_code = ${req.query.customer}`);
      if (req.query.fy) conditions.push(sql`fy_code = ${req.query.fy}`);
      if (req.query.project) conditions.push(sql`project_code = ${req.query.project}`);
      if (req.query.docType) conditions.push(sql`doc_type = ${req.query.docType}`);
      if (req.query.search) {
        const term = `%${req.query.search}%`;
        conditions.push(sql`(file_name ILIKE ${term} OR project_code ILIKE ${term} OR file_path ILIKE ${term})`);
      }

      const whereClause = sql.join(conditions, sql` AND `);

      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total FROM gcs_file_index WHERE ${whereClause}
      `);
      const total = parseInt(countResult.rows[0]?.total as string) || 0;

      const rows = await db.execute(sql`
        SELECT * FROM gcs_file_index
        WHERE ${whereClause}
        ORDER BY gcs_updated_at DESC NULLS LAST, file_name ASC
        LIMIT ${limit} OFFSET ${offset}
      `);

      res.json({
        files: rows.rows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (err) {
      console.error('[GCS-DASHBOARD] Files error:', err);
      res.status(500).json({ error: 'Failed to load files' });
    }
  });

  app.get('/api/gcs-dashboard/tree', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const projectIds = await getAccessibleProjectIds(user.id, user.role);
      const accessFilter = buildAccessFilter(projectIds);

      const rows = await db.execute(sql`
        SELECT
          continent_code, continent_name,
          country_code, country_name,
          customer_code, customer_name,
          fy_code, fy_label,
          project_code,
          COUNT(*)::int AS file_count,
          COALESCE(SUM(size_bytes), 0)::bigint AS total_size
        FROM gcs_file_index
        WHERE ${accessFilter}
        GROUP BY continent_code, continent_name, country_code, country_name,
                 customer_code, customer_name, fy_code, fy_label, project_code
        ORDER BY continent_name, country_name, customer_name, fy_code, project_code
      `);

      interface TreeNode {
        code: string;
        name: string;
        fileCount: number;
        totalSize: number;
        children: Record<string, TreeNode>;
      }

      const root: TreeNode = { code: 'TPEL', name: 'TPEL', fileCount: 0, totalSize: 0, children: {} };

      for (const row of rows.rows) {
        const r = row as any;
        const cc = r.continent_code || '_other';
        const co = r.country_code || '_other';
        const cu = r.customer_code || '_other';
        const fy = r.fy_code || '_other';
        const pc = r.project_code || '_other';
        const count = parseInt(r.file_count) || 0;
        const size = parseInt(r.total_size) || 0;

        if (!root.children[cc]) {
          root.children[cc] = { code: cc, name: r.continent_name || cc, fileCount: 0, totalSize: 0, children: {} };
        }
        const ccNode = root.children[cc];
        ccNode.fileCount += count;
        ccNode.totalSize += size;

        if (!ccNode.children[co]) {
          ccNode.children[co] = { code: co, name: r.country_name || co, fileCount: 0, totalSize: 0, children: {} };
        }
        const coNode = ccNode.children[co];
        coNode.fileCount += count;
        coNode.totalSize += size;

        if (!coNode.children[cu]) {
          coNode.children[cu] = { code: cu, name: r.customer_name || cu, fileCount: 0, totalSize: 0, children: {} };
        }
        const cuNode = coNode.children[cu];
        cuNode.fileCount += count;
        cuNode.totalSize += size;

        if (!cuNode.children[fy]) {
          cuNode.children[fy] = { code: fy, name: r.fy_label || fy, fileCount: 0, totalSize: 0, children: {} };
        }
        const fyNode = cuNode.children[fy];
        fyNode.fileCount += count;
        fyNode.totalSize += size;

        if (!fyNode.children[pc]) {
          fyNode.children[pc] = { code: pc, name: pc, fileCount: 0, totalSize: 0, children: {} };
        }
        const pcNode = fyNode.children[pc];
        pcNode.fileCount += count;
        pcNode.totalSize += size;

        root.fileCount += count;
        root.totalSize += size;
      }

      res.json(root);
    } catch (err) {
      console.error('[GCS-DASHBOARD] Tree error:', err);
      res.status(500).json({ error: 'Failed to build tree' });
    }
  });

  app.get('/api/gcs-dashboard/filters', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const projectIds = await getAccessibleProjectIds(user.id, user.role);
      const accessFilter = buildAccessFilter(projectIds);

      const [continents, countries, cust, fys, projs, docTypes] = await Promise.all([
        db.execute(sql`SELECT DISTINCT continent_code AS code, continent_name AS name FROM gcs_file_index WHERE ${accessFilter} AND continent_code IS NOT NULL ORDER BY continent_name`),
        db.execute(sql`SELECT DISTINCT country_code AS code, country_name AS name FROM gcs_file_index WHERE ${accessFilter} AND country_code IS NOT NULL ORDER BY country_name`),
        db.execute(sql`SELECT DISTINCT customer_code AS code, customer_name AS name FROM gcs_file_index WHERE ${accessFilter} AND customer_code IS NOT NULL ORDER BY customer_name`),
        db.execute(sql`SELECT DISTINCT fy_code AS code, fy_label AS name FROM gcs_file_index WHERE ${accessFilter} AND fy_code IS NOT NULL ORDER BY fy_code DESC`),
        db.execute(sql`SELECT DISTINCT project_code AS code, project_code AS name FROM gcs_file_index WHERE ${accessFilter} AND project_code IS NOT NULL ORDER BY project_code`),
        db.execute(sql`SELECT DISTINCT doc_type AS code, doc_type AS name FROM gcs_file_index WHERE ${accessFilter} AND doc_type IS NOT NULL ORDER BY doc_type`),
      ]);

      res.json({
        continents: continents.rows,
        countries: countries.rows,
        customers: cust.rows,
        financialYears: fys.rows,
        projects: projs.rows,
        docTypes: docTypes.rows,
      });
    } catch (err) {
      console.error('[GCS-DASHBOARD] Filters error:', err);
      res.status(500).json({ error: 'Failed to load filters' });
    }
  });

  app.post('/api/gcs-dashboard/sync', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'Superuser') {
        return res.status(403).json({ error: 'Only Superuser can trigger manual sync' });
      }

      if (isSyncRunning()) {
        return res.status(409).json({ error: 'Sync already in progress' });
      }

      const result = await syncGcsIndex();
      res.json({
        message: 'Sync completed',
        synced: result.synced,
        errors: result.errors,
        syncTime: getLastSyncTime(),
      });
    } catch (err) {
      console.error('[GCS-DASHBOARD] Sync error:', err);
      res.status(500).json({ error: 'Sync failed' });
    }
  });
}

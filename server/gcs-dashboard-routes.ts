import type { Express, Request, Response } from 'express';
import { db } from './db';
import { gcsFileIndex, projectMembers, gcsAccessPermissions, users, projects } from '@shared/schema';
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

      if (req.query.rootFolder) conditions.push(sql`file_path LIKE ${req.query.rootFolder + '%'}`);
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

      const tpelRows = await db.execute(sql`
        SELECT
          continent_code, continent_name,
          country_code, country_name,
          customer_code, customer_name,
          fy_code, fy_label,
          project_code,
          COUNT(*)::int AS file_count,
          COALESCE(SUM(size_bytes), 0)::bigint AS total_size
        FROM gcs_file_index
        WHERE ${accessFilter} AND SPLIT_PART(file_path, '/', 1) = 'TPEL'
        GROUP BY continent_code, continent_name, country_code, country_name,
                 customer_code, customer_name, fy_code, fy_label, project_code
        ORDER BY continent_name, country_name, customer_name, fy_code, project_code
      `);

      const nonTpelRows = await db.execute(sql`
        SELECT
          SPLIT_PART(file_path, '/', 1) AS root_folder,
          SPLIT_PART(file_path, '/', 2) AS level2,
          SPLIT_PART(file_path, '/', 3) AS level3,
          COUNT(*)::int AS file_count,
          COALESCE(SUM(size_bytes), 0)::bigint AS total_size
        FROM gcs_file_index
        WHERE SPLIT_PART(file_path, '/', 1) != 'TPEL'
        GROUP BY root_folder, level2, level3
        ORDER BY root_folder, level2, level3
      `);

      interface TreeNode {
        code: string;
        name: string;
        fileCount: number;
        totalSize: number;
        children: Record<string, TreeNode>;
        isNonTpel?: boolean;
      }

      const bucketRoot: TreeNode = { code: 'thermopac_storage', name: 'thermopac_storage', fileCount: 0, totalSize: 0, children: {} };

      const tpelNode: TreeNode = { code: 'TPEL', name: 'TPEL/', fileCount: 0, totalSize: 0, children: {} };

      for (const row of tpelRows.rows) {
        const r = row as any;
        const cc = r.continent_code || '_other';
        const co = r.country_code || '_other';
        const cu = r.customer_code || '_other';
        const fy = r.fy_code || '_other';
        const pc = r.project_code || '_other';
        const count = parseInt(r.file_count) || 0;
        const size = parseInt(r.total_size) || 0;

        if (!tpelNode.children[cc]) {
          tpelNode.children[cc] = { code: cc, name: r.continent_name || cc, fileCount: 0, totalSize: 0, children: {} };
        }
        const ccNode = tpelNode.children[cc];
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

        tpelNode.fileCount += count;
        tpelNode.totalSize += size;
      }

      bucketRoot.children['TPEL'] = tpelNode;
      bucketRoot.fileCount += tpelNode.fileCount;
      bucketRoot.totalSize += tpelNode.totalSize;

      for (const row of nonTpelRows.rows) {
        const r = row as any;
        const rootFolder = r.root_folder;
        const level2 = r.level2 || '';
        const level3 = r.level3 || '';
        const count = parseInt(r.file_count) || 0;
        const size = parseInt(r.total_size) || 0;

        if (!rootFolder) continue;

        if (!bucketRoot.children[rootFolder]) {
          bucketRoot.children[rootFolder] = { code: rootFolder, name: rootFolder + '/', fileCount: 0, totalSize: 0, children: {}, isNonTpel: true };
        }
        const rootNode = bucketRoot.children[rootFolder];
        rootNode.fileCount += count;
        rootNode.totalSize += size;

        if (level2) {
          if (!rootNode.children[level2]) {
            rootNode.children[level2] = { code: `${rootFolder}/${level2}`, name: level2 + '/', fileCount: 0, totalSize: 0, children: {}, isNonTpel: true };
          }
          const l2Node = rootNode.children[level2];
          l2Node.fileCount += count;
          l2Node.totalSize += size;

          if (level3) {
            if (!l2Node.children[level3]) {
              l2Node.children[level3] = { code: `${rootFolder}/${level2}/${level3}`, name: level3 + '/', fileCount: 0, totalSize: 0, children: {}, isNonTpel: true };
            }
            const l3Node = l2Node.children[level3];
            l3Node.fileCount += count;
            l3Node.totalSize += size;
          }
        }

        bucketRoot.fileCount += count;
        bucketRoot.totalSize += size;
      }

      res.json(bucketRoot);
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

  app.get('/api/gcs-dashboard/health', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'Superuser') {
        return res.status(403).json({ error: 'Only Superuser can view health data' });
      }

      const result = await db.execute(sql`
        SELECT
          COUNT(*)::int AS total_files,
          COUNT(*) FILTER (WHERE is_resolved = false)::int AS unresolved_count,
          COUNT(*) FILTER (WHERE 'orphan_no_project_match' = ANY(assurance_flags))::int AS orphan_count,
          COUNT(*) FILTER (WHERE 'non_tpel_path' = ANY(assurance_flags))::int AS non_tpel_count,
          COUNT(*) FILTER (WHERE 'misplaced_no_project_folder' = ANY(assurance_flags))::int AS misplaced_count,
          COUNT(*) FILTER (WHERE project_id IS NULL AND file_path LIKE 'TPEL/%')::int AS no_project_link_count
        FROM gcs_file_index
      `);

      const row = result.rows[0] || {};
      res.json({
        totalFiles: parseInt(row.total_files as string) || 0,
        unresolvedCount: parseInt(row.unresolved_count as string) || 0,
        orphanCount: parseInt(row.orphan_count as string) || 0,
        nonTpelCount: parseInt(row.non_tpel_count as string) || 0,
        misplacedCount: parseInt(row.misplaced_count as string) || 0,
        noProjectLinkCount: parseInt(row.no_project_link_count as string) || 0,
        lastSyncTime: getLastSyncTime(),
      });
    } catch (err) {
      console.error('[GCS-DASHBOARD] Health error:', err);
      res.status(500).json({ error: 'Failed to load health data' });
    }
  });

  app.get('/api/gcs-dashboard/flagged', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'Superuser') {
        return res.status(403).json({ error: 'Only Superuser can view flagged files' });
      }

      const flagType = req.query.flag as string || 'all';
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = (page - 1) * limit;

      let condition;
      switch (flagType) {
        case 'orphan': condition = sql`'orphan_no_project_match' = ANY(assurance_flags)`; break;
        case 'non_tpel': condition = sql`'non_tpel_path' = ANY(assurance_flags)`; break;
        case 'misplaced': condition = sql`'misplaced_no_project_folder' = ANY(assurance_flags)`; break;
        case 'unresolved': condition = sql`is_resolved = false`; break;
        default: condition = sql`(assurance_flags IS NOT NULL AND array_length(assurance_flags, 1) > 0) OR is_resolved = false`;
      }

      const countResult = await db.execute(sql`SELECT COUNT(*)::int AS total FROM gcs_file_index WHERE ${condition}`);
      const total = parseInt(countResult.rows[0]?.total as string) || 0;

      const rows = await db.execute(sql`
        SELECT * FROM gcs_file_index WHERE ${condition}
        ORDER BY file_path ASC LIMIT ${limit} OFFSET ${offset}
      `);

      res.json({ files: rows.rows, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
      console.error('[GCS-DASHBOARD] Flagged error:', err);
      res.status(500).json({ error: 'Failed to load flagged files' });
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

  app.get('/api/gcs-access/permissions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'Superuser') {
        return res.status(403).json({ error: 'Only Superuser can manage GCS access' });
      }

      const rows = await db.execute(sql`
        SELECT gap.*, u.username, u.first_name, u.last_name, u.role, u.department,
               p.code AS project_code, p.name AS project_name,
               g.username AS granted_by_name
        FROM gcs_access_permissions gap
        JOIN users u ON gap.user_id = u.id
        LEFT JOIN projects p ON gap.project_id = p.id
        JOIN users g ON gap.granted_by = g.id
        ORDER BY gap.granted_at DESC
      `);

      res.json(rows.rows);
    } catch (err) {
      console.error('[GCS-ACCESS] List error:', err);
      res.status(500).json({ error: 'Failed to load permissions' });
    }
  });

  app.post('/api/gcs-access/permissions', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'Superuser') {
        return res.status(403).json({ error: 'Only Superuser can manage GCS access' });
      }

      const { userId, projectId, accessLevel, notes } = req.body;
      if (!userId) return res.status(400).json({ error: 'userId is required' });

      await db.execute(sql`
        INSERT INTO gcs_access_permissions (user_id, project_id, access_level, granted_by, notes)
        VALUES (${userId}, ${projectId || null}, ${accessLevel || 'viewer'}, ${user.id}, ${notes || null})
      `);

      res.json({ message: 'Permission granted' });
    } catch (err) {
      console.error('[GCS-ACCESS] Create error:', err);
      res.status(500).json({ error: 'Failed to create permission' });
    }
  });

  app.delete('/api/gcs-access/permissions/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'Superuser') {
        return res.status(403).json({ error: 'Only Superuser can manage GCS access' });
      }

      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid permission ID' });

      await db.execute(sql`DELETE FROM gcs_access_permissions WHERE id = ${id}`);
      res.json({ message: 'Permission revoked' });
    } catch (err) {
      console.error('[GCS-ACCESS] Delete error:', err);
      res.status(500).json({ error: 'Failed to delete permission' });
    }
  });

  app.put('/api/gcs-access/permissions/:id', ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'Superuser') {
        return res.status(403).json({ error: 'Only Superuser can manage GCS access' });
      }

      const id = parseInt(req.params.id);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid permission ID' });

      const { accessLevel, isActive, notes, expiresAt } = req.body;

      await db.execute(sql`
        UPDATE gcs_access_permissions SET
          access_level = COALESCE(${accessLevel}, access_level),
          is_active = COALESCE(${isActive}, is_active),
          notes = COALESCE(${notes}, notes),
          expires_at = ${expiresAt || null}
        WHERE id = ${id}
      `);

      res.json({ message: 'Permission updated' });
    } catch (err) {
      console.error('[GCS-ACCESS] Update error:', err);
      res.status(500).json({ error: 'Failed to update permission' });
    }
  });
}

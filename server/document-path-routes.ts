/**
 * document-path-routes.ts
 * Phase 6 API — Document Path & Folder Template Governance
 * Baseline v1.0
 */

import { Router } from 'express';
import { db } from './db';
import {
  documentPathTemplates,
  folderTemplates,
  folderTemplateNodes,
  resolvedProjectFolders,
  insertDocumentPathTemplateSchema,
  insertFolderTemplateSchema,
  insertFolderTemplateNodeSchema,
} from '../shared/schema';
import { eq, and, asc } from 'drizzle-orm';
import { ensureAuthenticated } from './auth-middleware';
import {
  validateTemplateTokens,
  previewResolvedPath,
  resolveRelativePath,
  resolveFileName,
} from './services/document-path-resolver';
import { previewFolderTree, resolveProjectFolderTree } from './services/folder-template-resolver';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT PATH TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/doc-path-templates
router.get('/doc-path-templates', ensureAuthenticated, async (req, res) => {
  try {
    const rows = await db.select().from(documentPathTemplates).orderBy(asc(documentPathTemplates.documentType));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/doc-path-templates/:id
router.get('/doc-path-templates/:id', ensureAuthenticated, async (req, res) => {
  try {
    const [row] = await db.select().from(documentPathTemplates).where(eq(documentPathTemplates.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/doc-path-templates
router.post('/doc-path-templates', ensureAuthenticated, async (req, res) => {
  try {
    const parsed = insertDocumentPathTemplateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Validate tokens in templates
    const pathErrors = validateTemplateTokens(parsed.data.relativePathTemplate);
    if (pathErrors.length > 0) {
      return res.status(400).json({ error: `Unknown token(s) in path template: {${pathErrors.join('}, {')}}` });
    }
    if (parsed.data.fileNameTemplate) {
      const fileErrors = validateTemplateTokens(parsed.data.fileNameTemplate);
      if (fileErrors.length > 0) {
        return res.status(400).json({ error: `Unknown token(s) in file name template: {${fileErrors.join('}, {')}}` });
      }
    }

    const [created] = await db.insert(documentPathTemplates).values(parsed.data).returning();
    res.status(201).json(created);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/doc-path-templates/:id
router.patch('/doc-path-templates/:id', ensureAuthenticated, async (req, res) => {
  try {
    const [existing] = await db.select().from(documentPathTemplates).where(eq(documentPathTemplates.id, Number(req.params.id)));
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { id, createdAt, ...rest } = req.body;

    // GCS-managed templates: only fileExtension and fileNameTemplate are user-editable
    let allowedUpdates: Record<string, any>;
    if (existing.gcsRuleId) {
      allowedUpdates = {};
      if (rest.fileExtension    !== undefined) allowedUpdates.fileExtension    = rest.fileExtension;
      if (rest.fileNameTemplate !== undefined) allowedUpdates.fileNameTemplate = rest.fileNameTemplate;
    } else {
      allowedUpdates = rest;
      if (allowedUpdates.relativePathTemplate) {
        const errs = validateTemplateTokens(allowedUpdates.relativePathTemplate);
        if (errs.length > 0) return res.status(400).json({ error: `Unknown tokens: {${errs.join('}, {')}}` });
      }
    }

    const [updated] = await db
      .update(documentPathTemplates)
      .set({ ...allowedUpdates, updatedAt: new Date() })
      .where(eq(documentPathTemplates.id, Number(req.params.id)))
      .returning();
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/doc-path-templates/:id/toggle-active
router.post('/doc-path-templates/:id/toggle-active', ensureAuthenticated, async (req, res) => {
  try {
    const [row] = await db.select().from(documentPathTemplates).where(eq(documentPathTemplates.id, Number(req.params.id)));
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.gcsRuleId) {
      return res.status(400).json({
        error: 'This template is managed by GCS Doc Governance. Use the GCS Doc Governance page to change its active state.',
        gcsManaged: true,
      });
    }
    const [updated] = await db
      .update(documentPathTemplates)
      .set({ active: !row.active, updatedAt: new Date() })
      .where(eq(documentPathTemplates.id, Number(req.params.id)))
      .returning();
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/doc-path-templates/preview
// Body: { relativePathTemplate, fileNameTemplate?, ctx? }
router.post('/doc-path-templates/preview', ensureAuthenticated, async (req, res) => {
  try {
    const { relativePathTemplate, fileNameTemplate, ctx } = req.body;
    if (!relativePathTemplate) return res.status(400).json({ error: 'relativePathTemplate required' });

    const pathPreview = previewResolvedPath(relativePathTemplate, ctx ?? {});
    const filePreview = fileNameTemplate ? previewResolvedPath(fileNameTemplate, ctx ?? {}) : null;
    const fullPath = filePreview ? `${pathPreview}/${filePreview}` : pathPreview;

    const pathTokenErrors = validateTemplateTokens(relativePathTemplate);
    const fileTokenErrors = fileNameTemplate ? validateTemplateTokens(fileNameTemplate) : [];

    res.json({
      pathPreview,
      filePreview,
      fullPath,
      tokenErrors: [...pathTokenErrors, ...fileTokenErrors],
      valid: pathTokenErrors.length === 0 && fileTokenErrors.length === 0,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FOLDER TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/folder-templates
router.get('/folder-templates', ensureAuthenticated, async (req, res) => {
  try {
    const rows = await db.select().from(folderTemplates).orderBy(asc(folderTemplates.templateCode));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/folder-templates/:id/nodes
router.get('/folder-templates/:id/nodes', ensureAuthenticated, async (req, res) => {
  try {
    const nodes = await db
      .select()
      .from(folderTemplateNodes)
      .where(eq(folderTemplateNodes.folderTemplateId, Number(req.params.id)))
      .orderBy(asc(folderTemplateNodes.sequence));
    res.json(nodes);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/folder-templates
router.post('/folder-templates', ensureAuthenticated, async (req, res) => {
  try {
    const parsed = insertFolderTemplateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const [created] = await db.insert(folderTemplates).values(parsed.data).returning();
    res.status(201).json(created);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/folder-templates/:id/nodes
router.post('/folder-templates/:id/nodes', ensureAuthenticated, async (req, res) => {
  try {
    const parsed = insertFolderTemplateNodeSchema.safeParse({
      ...req.body,
      folderTemplateId: Number(req.params.id),
    });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const [created] = await db.insert(folderTemplateNodes).values(parsed.data).returning();
    res.status(201).json(created);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/folder-template-nodes/:id
router.patch('/folder-template-nodes/:id', ensureAuthenticated, async (req, res) => {
  try {
    const { id, createdAt, ...rest } = req.body;
    const [updated] = await db
      .update(folderTemplateNodes)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(folderTemplateNodes.id, Number(req.params.id)))
      .returning();
    res.json(updated);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/folder-templates/:code/preview
// Body: { projectId?, companyCode, cc, co, cust, fy, nnn, assemblies? }
router.post('/folder-templates/:code/preview', ensureAuthenticated, async (req, res) => {
  try {
    const { companyCode = 'TPEL', cc = 'EPC', co = 'C10357', cust = 'ApolloRefinery',
            fy = '2627', nnn = '017', assemblies = [], projectId = 0 } = req.body;
    console.log(`[DocPath] folder-template preview: code=${req.params.code} assemblies=${JSON.stringify(assemblies)}`);
    const preview = await previewFolderTree(req.params.code, {
      projectId, companyCode, cc, co, cust, fy, nnn, assemblies,
    });
    if (!preview) return res.status(404).json({ error: 'Template not found' });
    console.log(`[DocPath] preview OK: ${preview.totalFolders} folders`);
    res.json(preview);
  } catch (e: any) {
    console.error('[DocPath] folder-template preview error:', e);
    res.status(500).json({ error: e.message, stack: e.stack?.split('\n').slice(0, 5) });
  }
});

// POST /api/folder-templates/:code/resolve/:projectId
// Resolves folder tree for a project and writes resolved_project_folders records
router.post('/folder-templates/:code/resolve/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const { companyCode = 'TPEL', cc = 'EPC', co = '', cust = '', fy = '', nnn = '', assemblies = [] } = req.body;
    const result = await resolveProjectFolderTree(req.params.code, {
      projectId: Number(req.params.projectId),
      companyCode, cc, co, cust, fy, nnn, assemblies,
    });
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/resolved-project-folders/:projectId
router.get('/resolved-project-folders/:projectId', ensureAuthenticated, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(resolvedProjectFolders)
      .where(eq(resolvedProjectFolders.projectId, Number(req.params.projectId)));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export function setupDocumentPathRoutes(app: any) {
  app.use('/api', router);
  console.log('Document Path & Folder Template routes registered at /api');
}


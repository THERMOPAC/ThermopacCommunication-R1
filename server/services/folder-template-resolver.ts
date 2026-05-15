/**
 * folder-template-resolver.ts
 * Phase 7 — Folder Resolution Service (baseline v1.0)
 *
 * Creates ERP records (resolved_project_folders) only.
 * No local filesystem writes. No UNC paths. No SMB.
 */

import { db } from '../db';
import {
  folderTemplates,
  folderTemplateNodes,
  resolvedProjectFolders,
  FolderTemplateNode,
} from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import {
  resolveRelativePath,
  normalizeRelativePath,
  rejectUnsafePath,
  TokenContext,
} from './document-path-resolver';

// ─── Types ────────────────────────────────────────────────────────────────

export interface ProjectMeta {
  projectId: number;
  companyCode: string;    // TPEL
  cc: string;             // EPC
  co: string;             // C10357
  cust: string;           // ApolloRefinery
  fy: string;             // 2627
  nnn: string;            // 017
  assemblies?: string[];  // ['Assembly_1', 'Assembly_2']
}

export interface FolderNode {
  nodeId: number | null;
  folderCode: string;
  relativePath: string;
  isDynamic: boolean;
  children: FolderNode[];
}

export interface FolderTreePreview {
  templateCode: string;
  templateName: string;
  rootPath: string;
  nodes: FolderNode[];
  totalFolders: number;
}

// ─── buildTokenContext ────────────────────────────────────────────────────
function buildTokenContext(meta: ProjectMeta, assemblyOverride?: string): TokenContext {
  return {
    COMPANY: meta.companyCode,
    CC: meta.cc,
    CO: meta.co,
    Cust: meta.cust,
    FY: meta.fy,
    NNN: meta.nnn,
    PROJECT_CODE: `${meta.companyCode}-${meta.cc}-${meta.co}-${meta.fy}-${meta.nnn}`,
    Assembly: assemblyOverride,
    YYMMDD: new Date().toISOString().slice(2, 10).replace(/-/g, ''),
  };
}

// ─── resolveFolderNode ────────────────────────────────────────────────────
/**
 * Resolves a single folder node template into a concrete relative path.
 * parentPath is the already-resolved parent segment.
 */
export function resolveFolderNode(
  node: FolderTemplateNode,
  parentPath: string,
  ctx: TokenContext
): { ok: boolean; path?: string; error?: string } {
  const nameResult = resolveRelativePath(node.folderNameTemplate, ctx);
  if (!nameResult.ok) return nameResult;

  const fullPath = parentPath
    ? normalizeRelativePath(`${parentPath}/${nameResult.path}`)
    : normalizeRelativePath(nameResult.path ?? '');

  const unsafe = rejectUnsafePath(fullPath);
  if (unsafe) return { ok: false, error: unsafe };

  return { ok: true, path: fullPath };
}

// ─── expandDynamicAssemblies ──────────────────────────────────────────────
/**
 * Given a dynamic node with dynamicSource = 'project_assemblies',
 * returns one copy per assembly name.
 */
export function expandDynamicAssemblies(
  node: FolderTemplateNode,
  parentPath: string,
  assemblies: string[]
): Array<{ assemblyName: string; path: string }> {
  const results: Array<{ assemblyName: string; path: string }> = [];
  const effectiveAssemblies = assemblies.length > 0 ? assemblies : [];

  for (const asm of effectiveAssemblies) {
    const ctx: TokenContext = { Assembly: asm };
    const nameResult = resolveRelativePath(node.folderNameTemplate, ctx);
    if (!nameResult.ok) continue;

    const fullPath = normalizeRelativePath(`${parentPath}/${nameResult.path}`);
    const unsafe = rejectUnsafePath(fullPath);
    if (unsafe) continue;

    results.push({ assemblyName: asm, path: fullPath });
  }
  return results;
}

// ─── previewFolderTree ────────────────────────────────────────────────────
/**
 * Generates a preview of the full folder tree for a project
 * without writing any DB records.
 */
export async function previewFolderTree(
  templateCode: string,
  meta: ProjectMeta
): Promise<FolderTreePreview | null> {
  const [template] = await db
    .select()
    .from(folderTemplates)
    .where(eq(folderTemplates.templateCode, templateCode));

  if (!template) return null;

  const allNodes = await db
    .select()
    .from(folderTemplateNodes)
    .where(
      and(
        eq(folderTemplateNodes.folderTemplateId, template.id),
        eq(folderTemplateNodes.active, true)
      )
    );

  const rootCtx = buildTokenContext(meta);
  const projectRootTemplate = `{COMPANY}/{CC}/{CO}/{Cust}/{FY}/{NNN}`;
  const rootResult = resolveRelativePath(projectRootTemplate, rootCtx);
  const projectRoot = rootResult.ok ? (rootResult.path ?? '') : '';

  const assemblies = meta.assemblies ?? [];

  // Build tree recursively
  function buildTree(parentId: number | null, parentPath: string): FolderNode[] {
    const children = allNodes
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => a.sequence - b.sequence);

    const nodes: FolderNode[] = [];

    for (const node of children) {
      if (node.isDynamic && node.dynamicSource === 'project_assemblies') {
        const expanded = expandDynamicAssemblies(node, parentPath, assemblies);
        for (const { assemblyName, path } of expanded) {
          const asmCtx = buildTokenContext(meta, assemblyName);
          const subChildren = buildTree(node.id, path);
          // Also add rev-00 if revision-controlled
          if (node.isRevisionControlled) {
            subChildren.unshift({
              nodeId: null,
              folderCode: 'rev-00',
              relativePath: `${path}/rev-00`,
              isDynamic: false,
              children: [],
            });
          }
          nodes.push({
            nodeId: node.id,
            folderCode: `${node.folderCode}[${assemblyName}]`,
            relativePath: path,
            isDynamic: true,
            children: subChildren,
          });
        }
      } else {
        const ctx = buildTokenContext(meta);
        const resolved = resolveFolderNode(node, parentPath, ctx);
        if (!resolved.ok) continue;

        const nodePath = resolved.path ?? '';
        const subChildren = buildTree(node.id, nodePath);

        if (node.isRevisionControlled) {
          subChildren.unshift({
            nodeId: null,
            folderCode: 'rev-00',
            relativePath: `${nodePath}/rev-00`,
            isDynamic: false,
            children: [],
          });
        }

        nodes.push({
          nodeId: node.id,
          folderCode: node.folderCode,
          relativePath: nodePath,
          isDynamic: false,
          children: subChildren,
        });
      }
    }
    return nodes;
  }

  const tree = buildTree(null, projectRoot);

  function countNodes(nodes: FolderNode[]): number {
    return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children), 0);
  }

  return {
    templateCode: template.templateCode,
    templateName: template.templateName,
    rootPath: projectRoot,
    nodes: tree,
    totalFolders: countNodes(tree),
  };
}

// ─── resolveProjectFolderTree ─────────────────────────────────────────────
/**
 * Resolves the complete folder tree for a project and writes
 * resolved_project_folders records to the DB.
 * Returns the list of created records.
 */
export async function resolveProjectFolderTree(
  templateCode: string,
  meta: ProjectMeta
): Promise<{ created: number; paths: string[] }> {
  const preview = await previewFolderTree(templateCode, meta);
  if (!preview) {
    throw new Error(`Folder template not found: ${templateCode}`);
  }

  const [template] = await db
    .select()
    .from(folderTemplates)
    .where(eq(folderTemplates.templateCode, templateCode));

  // Delete existing pending records for this project + template
  await db
    .delete(resolvedProjectFolders)
    .where(
      and(
        eq(resolvedProjectFolders.projectId, meta.projectId),
        eq(resolvedProjectFolders.folderTemplateId, template.id)
      )
    );

  // Flatten the tree into records
  const allPaths: string[] = [];
  function flatten(nodes: FolderNode[]): void {
    for (const node of nodes) {
      allPaths.push(node.relativePath);
      flatten(node.children);
    }
  }
  flatten(preview.nodes);

  if (allPaths.length === 0) return { created: 0, paths: [] };

  // Insert records
  await db.insert(resolvedProjectFolders).values(
    allPaths.map((p) => ({
      projectId: meta.projectId,
      folderTemplateId: template.id,
      folderNodeId: null,
      relativePath: p,
      folderCode: p.split('/').pop() ?? p,
      status: 'pending',
    }))
  );

  return { created: allPaths.length, paths: allPaths };
}

// ─── createResolvedProjectFolderRecords ───────────────────────────────────
/**
 * Alias: directly insert resolved folder records for a list of paths.
 */
export async function createResolvedProjectFolderRecords(
  projectId: number,
  folderTemplateId: number,
  paths: string[]
): Promise<number> {
  if (paths.length === 0) return 0;
  await db.insert(resolvedProjectFolders).values(
    paths.map((p) => ({
      projectId,
      folderTemplateId,
      relativePath: p,
      folderCode: p.split('/').pop() ?? p,
      status: 'pending',
    }))
  );
  return paths.length;
}

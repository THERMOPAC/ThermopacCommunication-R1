import { Router } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';
import { authenticateUser, isAdmin } from './middlewares/auth';
import { resolveEpcAssignee, testEpcAssignee } from './epc-assignment-engine';

const router = Router();

function isAdminOrGM(req: any): boolean {
  const role = req.user?.role;
  return ['Superuser', 'General Manager', 'Admin'].includes(role);
}

function canViewAudit(req: any): boolean {
  const role = req.user?.role;
  return ['Superuser', 'General Manager', 'Admin', 'Senior Executive'].includes(role);
}

router.get('/api/epc-assignment-rules', authenticateUser, async (req, res) => {
  try {
    const rules = await db.execute(
      sql`SELECT r.*,
             cu.username AS created_by_name,
             uu.username AS updated_by_name
          FROM epc_assignment_rules r
          LEFT JOIN users cu ON cu.id = r.created_by
          LEFT JOIN users uu ON uu.id = r.updated_by
          ORDER BY r.stage_gate, r.action_type, r.id`
    );
    res.json(rules.rows);
  } catch (err) {
    console.error('[EPC-Assignment] GET rules error:', err);
    res.status(500).json({ error: 'Failed to fetch assignment rules' });
  }
});

router.put('/api/epc-assignment-rules/:id', authenticateUser, async (req, res) => {
  if (!isAdminOrGM(req)) return res.status(403).json({ error: 'Insufficient permissions' });
  try {
    const id = parseInt(req.params.id);
    const { department, role, fallbackDepartment, fallbackRole, isActive, executionMode, description } = req.body;

    if (!department || !role) {
      return res.status(400).json({ error: 'department and role are required' });
    }

    if (executionMode && !['auto', 'manual'].includes(executionMode)) {
      return res.status(400).json({ error: "executionMode must be 'auto' or 'manual'" });
    }

    const deptCheck = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM users WHERE department = ${department} AND is_active = true`
    );
    if (parseInt((deptCheck.rows[0] as any).cnt) === 0) {
      return res.status(400).json({ error: `No active users found in department '${department}'` });
    }

    const roleCheck = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM users WHERE role = ${role} AND is_active = true`
    );
    if (parseInt((roleCheck.rows[0] as any).cnt) === 0) {
      return res.status(400).json({ error: `No active users found with role '${role}'` });
    }

    if (fallbackDepartment && fallbackRole) {
      const fbDeptCheck = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM users WHERE department = ${fallbackDepartment} AND is_active = true`
      );
      if (parseInt((fbDeptCheck.rows[0] as any).cnt) === 0) {
        return res.status(400).json({ error: `No active users found in fallback department '${fallbackDepartment}'` });
      }
    }

    await db.execute(
      sql`UPDATE epc_assignment_rules
          SET department = ${department},
              role = ${role},
              fallback_department = ${fallbackDepartment || null},
              fallback_role = ${fallbackRole || null},
              is_active = ${isActive ?? true},
              execution_mode = ${executionMode || 'manual'},
              description = ${description || null},
              updated_by = ${(req as any).user.id},
              updated_at = NOW()
          WHERE id = ${id}`
    );

    const updated = await db.execute(
      sql`SELECT * FROM epc_assignment_rules WHERE id = ${id}`
    );
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[EPC-Assignment] PUT rule error:', err);
    res.status(500).json({ error: 'Failed to update assignment rule' });
  }
});

router.get('/api/epc-assignment-rules/preflight', authenticateUser, async (req, res) => {
  try {
    const rules = await db.execute(
      sql`SELECT * FROM epc_assignment_rules WHERE is_active = true ORDER BY stage_gate, action_type, id`
    );

    const results: Record<string, any[]> = {};

    for (const row of rules.rows as any[]) {
      const primary = await db.execute(
        sql`SELECT id, username, department, role FROM users
            WHERE department = ${row.department}
              AND role = ${row.role}
              AND is_active = true
            ORDER BY id ASC
            LIMIT 1`
      );

      let fallbackUser = null;
      if (!primary.rows.length && row.fallback_department && row.fallback_role) {
        const fallback = await db.execute(
          sql`SELECT id, username, department, role FROM users
              WHERE department = ${row.fallback_department}
                AND role = ${row.fallback_role}
                AND is_active = true
              ORDER BY id ASC
              LIMIT 1`
        );
        fallbackUser = fallback.rows[0] || null;
      }

      const status = primary.rows.length > 0 ? 'primary' : fallbackUser ? 'fallback' : 'unassigned';
      const resolvedUser = primary.rows.length > 0 ? primary.rows[0] : fallbackUser;

      if (!results[row.stage_gate]) results[row.stage_gate] = [];
      results[row.stage_gate].push({
        workflowCode: row.workflow_code,
        actionType: row.action_type,
        department: row.department,
        role: row.role,
        fallbackDepartment: row.fallback_department,
        fallbackRole: row.fallback_role,
        status,
        resolvedUser,
      });
    }

    const hasUnassigned = Object.values(results).flat().some(r => r.status === 'unassigned');
    res.json({ valid: !hasUnassigned, gates: results });
  } catch (err) {
    console.error('[EPC-Assignment] Preflight error:', err);
    res.status(500).json({ error: 'Preflight check failed' });
  }
});

router.get('/api/epc-assignment-rules/test/:workflowCode', authenticateUser, async (req, res) => {
  try {
    const result = await testEpcAssignee(req.params.workflowCode);
    res.json(result);
  } catch (err) {
    console.error('[EPC-Assignment] Test error:', err);
    res.status(500).json({ error: 'Test resolution failed' });
  }
});

router.get('/api/epc-assignment-audit-log', authenticateUser, async (req, res) => {
  if (!canViewAudit(req)) return res.status(403).json({ error: 'Insufficient permissions' });
  try {
    const { stageGate, method, from, to, limit = '100', offset = '0' } = req.query as any;

    const conditions: string[] = [];
    if (stageGate && stageGate !== 'all') conditions.push(`a.stage_gate = '${stageGate.replace(/'/g, "''")}'`);
    if (method && method !== 'all') conditions.push(`a.resolution_method = '${method.replace(/'/g, "''")}'`);
    if (from) conditions.push(`a.logged_at >= '${from}'`);
    if (to) conditions.push(`a.logged_at <= '${to}'`);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const logs = await db.execute(
      sql.raw(`
        SELECT a.*, u.username AS resolved_user_name, p.code AS project_code
        FROM epc_assignment_audit_log a
        LEFT JOIN users u ON u.id = a.resolved_user_id
        LEFT JOIN projects p ON p.id = a.project_id
        ${where}
        ORDER BY a.logged_at DESC
        LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
      `)
    );

    const total = await db.execute(
      sql.raw(`SELECT COUNT(*) as cnt FROM epc_assignment_audit_log a ${where}`)
    );

    res.json({ logs: logs.rows, total: parseInt((total.rows[0] as any).cnt) });
  } catch (err) {
    console.error('[EPC-Assignment] Audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

router.get('/api/epc-assignment-departments', authenticateUser, async (req, res) => {
  try {
    const result = await db.execute(
      sql`SELECT DISTINCT department FROM users WHERE is_active = true AND department IS NOT NULL ORDER BY department`
    );
    res.json(result.rows.map((r: any) => r.department));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

router.get('/api/epc-assignment-roles', authenticateUser, async (req, res) => {
  try {
    const result = await db.execute(
      sql`SELECT DISTINCT role FROM users WHERE is_active = true AND role IS NOT NULL ORDER BY role`
    );
    res.json(result.rows.map((r: any) => r.role));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

export default router;

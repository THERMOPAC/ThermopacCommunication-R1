import { Router, Request, Response } from 'express';
import { pool } from './db';
import { freezeConfirmedArtifact, attachConfirmedArtifactToEpc } from './utils/quotation-pdf-artifact';

const router = Router();

const VALID_CHANGE_TYPES = ['scope_addition', 'scope_reduction', 'price_revision', 'specification_change', 'schedule_change'];
const TERMINAL_STATUSES = ['approved', 'rejected'];

function ensureAuthenticated(req: Request, res: Response, next: any) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

function ensureManager(req: Request, res: Response, next: any) {
  const user = req.user as any;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  const allowedRoles = ['Superuser', 'General Manager', 'Senior Manager', 'Manager'];
  if (!allowedRoles.includes(user.role)) {
    return res.status(403).json({ error: 'Manager role or above required' });
  }
  next();
}

router.post('/change-orders', ensureAuthenticated, ensureManager, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const { projectId, changeType, description, changeValue, notes } = req.body;

    if (!projectId || !changeType || !description || changeValue === undefined) {
      return res.status(400).json({ error: 'Missing required fields: projectId, changeType, description, changeValue' });
    }
    if (!VALID_CHANGE_TYPES.includes(changeType)) {
      return res.status(400).json({ error: `Invalid changeType. Must be one of: ${VALID_CHANGE_TYPES.join(', ')}` });
    }

    const projectResult = await pool.query(
      `SELECT p.id, p.source_offer_id, p.source_order_number, p.code as project_code,
              o.customer_id, o.status AS offer_status
       FROM projects p
       JOIN offers o ON o.id = p.source_offer_id
       WHERE p.id = $1`,
      [projectId]
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found or has no source offer' });
    }
    const project = projectResult.rows[0];
    if (project.offer_status !== 'Order Confirmed') {
      return res.status(400).json({ error: 'Original offer must be Order Confirmed before creating change orders' });
    }

    const openCheck = await pool.query(
      `SELECT id, change_order_number, status FROM commercial_change_orders
       WHERE project_id = $1 AND status NOT IN ('approved', 'rejected')
       ORDER BY id LIMIT 1`,
      [projectId]
    );
    if (openCheck.rows.length > 0) {
      return res.status(400).json({
        error: `An open change order already exists for this project: ${openCheck.rows[0].change_order_number} (${openCheck.rows[0].status}). Complete or reject it before creating a new one.`
      });
    }

    const seqResult = await pool.query(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_seq FROM commercial_change_orders WHERE project_id = $1`,
      [projectId]
    );
    const nextSeq = seqResult.rows[0].next_seq;
    const changeOrderNumber = `${project.source_order_number}-CO${String(nextSeq).padStart(2, '0')}`;

    const insertResult = await pool.query(
      `INSERT INTO commercial_change_orders
       (change_order_number, sequence, original_offer_id, original_order_number, project_id,
        change_type, description, change_value, status, requested_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9, $10)
       RETURNING *`,
      [changeOrderNumber, nextSeq, project.source_offer_id, project.source_order_number,
       projectId, changeType, description, changeValue, user.id, notes || null]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (error: any) {
    console.error('[cco] Error creating change order:', error);
    res.status(500).json({ error: 'Failed to create change order' });
  }
});

router.get('/change-orders', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;
    if (!projectId) {
      return res.status(400).json({ error: 'projectId query parameter required' });
    }

    const result = await pool.query(
      `SELECT cco.*,
              u1.username AS requested_by_name,
              u2.username AS approved_by_name,
              ro.offer_number AS revised_offer_number,
              ro.status AS revised_offer_status,
              ro.total_amount AS revised_offer_total
       FROM commercial_change_orders cco
       LEFT JOIN users u1 ON u1.id = cco.requested_by
       LEFT JOIN users u2 ON u2.id = cco.approved_by
       LEFT JOIN offers ro ON ro.id = cco.revised_offer_id
       WHERE cco.project_id = $1
       ORDER BY cco.sequence ASC`,
      [projectId]
    );

    res.json(result.rows);
  } catch (error: any) {
    console.error('[cco] Error listing change orders:', error);
    res.status(500).json({ error: 'Failed to list change orders' });
  }
});

router.get('/change-orders/:id', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const result = await pool.query(
      `SELECT cco.*,
              u1.username AS requested_by_name,
              u2.username AS approved_by_name,
              ro.offer_number AS revised_offer_number,
              ro.status AS revised_offer_status,
              ro.total_amount AS revised_offer_total
       FROM commercial_change_orders cco
       LEFT JOIN users u1 ON u1.id = cco.requested_by
       LEFT JOIN users u2 ON u2.id = cco.approved_by
       LEFT JOIN offers ro ON ro.id = cco.revised_offer_id
       WHERE cco.id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Change order not found' });
    }

    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('[cco] Error fetching change order:', error);
    res.status(500).json({ error: 'Failed to fetch change order' });
  }
});

router.patch('/change-orders/:id', ensureAuthenticated, ensureManager, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const existing = await pool.query(`SELECT * FROM commercial_change_orders WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Change order not found' });
    }
    const cco = existing.rows[0];

    if (TERMINAL_STATUSES.includes(cco.status)) {
      return res.status(400).json({ error: `Change order is ${cco.status} — no further edits allowed` });
    }

    const { status, revisedOfferId, ecrId, changeType, description, changeValue, notes } = req.body;

    if (status === 'approved') {
      const approvalResult = await handleApproval(cco, req.body, user);
      if (approvalResult.error) {
        return res.status(400).json({ error: approvalResult.error });
      }
      return res.json(approvalResult.data);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (status && !TERMINAL_STATUSES.includes(status)) {
      const validTransitions: Record<string, string[]> = {
        draft: ['submitted'],
        submitted: ['under_review', 'rejected'],
        under_review: ['approved', 'rejected'],
      };
      if (!validTransitions[cco.status]?.includes(status)) {
        return res.status(400).json({ error: `Cannot transition from ${cco.status} to ${status}` });
      }
      if (status === 'rejected') {
        updates.push(`status = $${paramIdx++}`);
        values.push('rejected');
      } else {
        updates.push(`status = $${paramIdx++}`);
        values.push(status);
      }
    }

    if (revisedOfferId !== undefined) {
      if (revisedOfferId) {
        const linkResult = await validateAndLinkChain(cco, revisedOfferId);
        if (linkResult.error) {
          return res.status(400).json({ error: linkResult.error });
        }
      }
      updates.push(`revised_offer_id = $${paramIdx++}`);
      values.push(revisedOfferId);
    }
    if (ecrId !== undefined) {
      updates.push(`ecr_id = $${paramIdx++}`);
      values.push(ecrId);
    }
    if (changeType && VALID_CHANGE_TYPES.includes(changeType)) {
      updates.push(`change_type = $${paramIdx++}`);
      values.push(changeType);
    }
    if (description) {
      updates.push(`description = $${paramIdx++}`);
      values.push(description);
    }
    if (changeValue !== undefined) {
      updates.push(`change_value = $${paramIdx++}`);
      values.push(changeValue);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIdx++}`);
      values.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(id);
    const updateResult = await pool.query(
      `UPDATE commercial_change_orders SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );

    res.json(updateResult.rows[0]);
  } catch (error: any) {
    console.error('[cco] Error updating change order:', error);
    res.status(500).json({ error: 'Failed to update change order' });
  }
});

async function handleApproval(cco: any, body: any, user: any): Promise<{ error?: string; data?: any }> {
  const revisedOfferId = body.revisedOfferId || cco.revised_offer_id;
  let ecrId = body.ecrId || cco.ecr_id;

  if (!revisedOfferId) {
    return { error: 'Cannot approve: no revised quotation linked (revised_offer_id required)' };
  }

  const revisedOffer = await pool.query(
    `SELECT id, customer_id, status, revision, offer_number, total_amount FROM offers WHERE id = $1`,
    [revisedOfferId]
  );
  if (revisedOffer.rows.length === 0) {
    return { error: 'Cannot approve: revised offer not found' };
  }
  const revised = revisedOffer.rows[0];

  if (revised.status !== 'Order Confirmed') {
    return { error: 'Cannot approve: revised quotation not yet confirmed (status must be Order Confirmed)' };
  }

  const confirmedArtifactCheck = await pool.query(
    `SELECT id FROM quotation_pdf_artifacts WHERE offer_id = $1 AND is_confirmed = true LIMIT 1`,
    [revisedOfferId]
  );
  if (confirmedArtifactCheck.rows.length === 0) {
    return { error: 'Cannot approve: revised quotation has no confirmed PDF artifact' };
  }

  const originalOffer = await pool.query(
    `SELECT customer_id FROM offers WHERE id = $1`,
    [cco.original_offer_id]
  );
  if (originalOffer.rows.length > 0 && revised.customer_id !== originalOffer.rows[0].customer_id) {
    return { error: 'Cannot approve: revised offer belongs to a different customer than the original' };
  }

  const reuseCheck = await pool.query(
    `SELECT id, change_order_number FROM commercial_change_orders
     WHERE revised_offer_id = $1 AND status = 'approved' AND id != $2`,
    [revisedOfferId, cco.id]
  );
  if (reuseCheck.rows.length > 0) {
    return { error: `Cannot approve: revised offer is already used by approved change order ${reuseCheck.rows[0].change_order_number}` };
  }

  const chainLinkResult = await validateAndLinkChain(cco, revisedOfferId);
  if (chainLinkResult.error) {
    return { error: `Cannot approve: ${chainLinkResult.error}` };
  }

  if (!ecrId) {
    const ecrInsert = await pool.query(
      `INSERT INTO engineering_change_requests
       (document_number, description, reason, status, requested_by, requested_date, approved_by, approved_date, notes)
       VALUES ($1, $2, $3, 'Approved', $4, NOW(), $5, NOW(), $6)
       RETURNING id`,
      [
        `ECR-${cco.change_order_number}`,
        cco.description,
        'Commercial change order — auto-generated',
        cco.requested_by,
        user.id,
        `Auto-created from commercial change order ${cco.change_order_number}`,
      ]
    );
    ecrId = ecrInsert.rows[0].id;
  } else {
    const ecrCheck = await pool.query(`SELECT id FROM engineering_change_requests WHERE id = $1`, [ecrId]);
    if (ecrCheck.rows.length === 0) {
      return { error: 'Cannot approve: referenced ECR not found' };
    }
  }

  const updateResult = await pool.query(
    `UPDATE commercial_change_orders
     SET status = 'approved', approved_by = $1, approved_at = NOW(),
         revised_offer_id = $2, ecr_id = $3
     WHERE id = $4 RETURNING *`,
    [user.id, revisedOfferId, ecrId, cco.id]
  );

  await pool.query(
    `UPDATE projects SET current_commercial_reference_id = $1 WHERE id = $2`,
    [cco.id, cco.project_id]
  );

  const project = await pool.query(
    `SELECT code FROM projects WHERE id = $1`,
    [cco.project_id]
  );
  const projectCode = project.rows[0]?.code || '';

  const confirmedArtifact = confirmedArtifactCheck.rows[0];
  const changeLabel = `Change Order CO${String(cco.sequence).padStart(2, '0')} — ${formatChangeType(cco.change_type)}`;
  try {
    const attachResult = await attachConfirmedArtifactToEpc(
      confirmedArtifact.id,
      cco.project_id,
      projectCode,
      revisedOfferId,
      revised.offer_number,
      user.id,
      changeLabel
    );
    if (attachResult.success) {
      console.log(`[cco] EPC attachment ${attachResult.epcAttachmentId} created for CCO ${cco.change_order_number}`);
    } else {
      console.error(`[cco] EPC attachment failed for CCO ${cco.change_order_number}: ${attachResult.error}`);
    }
  } catch (err: any) {
    console.error(`[cco] EPC attachment error for CCO ${cco.change_order_number}:`, err);
  }

  await pool.query(
    `INSERT INTO project_workflow_events
     (project_id, event_name, event_payload, emitted_by, emitted_at, processed)
     VALUES ($1, 'commercial_change_order_approved', $2, 'cco-routes', NOW(), false)`,
    [cco.project_id, JSON.stringify({
      changeOrderId: cco.id,
      changeOrderNumber: cco.change_order_number,
      changeType: cco.change_type,
      changeValue: cco.change_value,
      revisedOfferId,
      ecrId,
    })]
  );

  return { data: updateResult.rows[0] };
}

async function validateAndLinkChain(cco: any, revisedOfferId: number): Promise<{ error?: string }> {
  const rootOffer = await pool.query(
    `SELECT id, commercial_chain_id, root_offer_id FROM offers WHERE id = $1`,
    [cco.original_offer_id]
  );
  if (rootOffer.rows.length === 0) {
    return { error: 'Original offer not found' };
  }
  const root = rootOffer.rows[0];
  const expectedChainId = root.commercial_chain_id;
  const expectedRootId = root.root_offer_id || root.id;

  const project = await pool.query(
    `SELECT current_commercial_reference_id, source_offer_id FROM projects WHERE id = $1`,
    [cco.project_id]
  );
  let expectedParentId: number;
  if (project.rows[0]?.current_commercial_reference_id) {
    const prevCco = await pool.query(
      `SELECT revised_offer_id FROM commercial_change_orders WHERE id = $1`,
      [project.rows[0].current_commercial_reference_id]
    );
    expectedParentId = prevCco.rows[0]?.revised_offer_id || cco.original_offer_id;
  } else {
    expectedParentId = cco.original_offer_id;
  }

  const revisedOffer = await pool.query(
    `SELECT id, commercial_chain_id, parent_offer_id, root_offer_id FROM offers WHERE id = $1`,
    [revisedOfferId]
  );
  if (revisedOffer.rows.length === 0) {
    return { error: 'Revised offer not found' };
  }
  const revised = revisedOffer.rows[0];

  const isDefaultChain = revised.commercial_chain_id !== expectedChainId;
  const isUnlinkedParent = revised.parent_offer_id === null;
  const isDefaultRoot = revised.root_offer_id === revised.id || revised.root_offer_id === null;

  if (isUnlinkedParent && isDefaultRoot) {
    try {
      await pool.query(
        `UPDATE offers SET commercial_chain_id = $1, parent_offer_id = $2, root_offer_id = $3 WHERE id = $4`,
        [expectedChainId, expectedParentId, expectedRootId, revisedOfferId]
      );
      console.log(`[cco-chain] Linked offer ${revisedOfferId} into chain ${expectedChainId} (parent=${expectedParentId}, root=${expectedRootId})`);
    } catch (err: any) {
      return { error: `Chain linkage failed: ${err.message}` };
    }
  } else {
    if (revised.commercial_chain_id !== expectedChainId) {
      return { error: 'Cannot link: offer already belongs to another commercial chain or has conflicting chain ID' };
    }
    if (revised.parent_offer_id !== null && revised.parent_offer_id !== expectedParentId) {
      return { error: 'Cannot link: offer parent linkage conflicts with the commercial chain sequence' };
    }
    if (revised.root_offer_id !== null && revised.root_offer_id !== expectedRootId) {
      return { error: 'Cannot link: offer root_offer_id conflicts with the commercial chain' };
    }
  }

  return {};
}

function formatChangeType(type: string): string {
  const labels: Record<string, string> = {
    scope_addition: 'Scope Addition',
    scope_reduction: 'Scope Reduction',
    price_revision: 'Price Revision',
    specification_change: 'Specification Change',
    schedule_change: 'Schedule Change',
  };
  return labels[type] || type;
}

router.get('/change-orders/project/:projectId/summary', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ error: 'Invalid project ID' });

    const project = await pool.query(
      `SELECT p.id, p.source_offer_id, p.source_order_number, p.current_commercial_reference_id,
              o.total_amount AS original_order_value, o.offer_number AS original_offer_number
       FROM projects p
       LEFT JOIN offers o ON o.id = p.source_offer_id
       WHERE p.id = $1`,
      [projectId]
    );
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const proj = project.rows[0];

    const approvedCcos = await pool.query(
      `SELECT cco.id, cco.change_order_number, cco.sequence, cco.change_type, cco.change_value,
              cco.description, cco.approved_at, cco.revised_offer_id,
              ro.total_amount AS revised_offer_total, ro.offer_number AS revised_offer_number
       FROM commercial_change_orders cco
       LEFT JOIN offers ro ON ro.id = cco.revised_offer_id
       WHERE cco.project_id = $1 AND cco.status = 'approved'
       ORDER BY cco.sequence ASC`,
      [projectId]
    );

    const originalValue = parseFloat(proj.original_order_value || '0');
    const totalApprovedDelta = approvedCcos.rows.reduce(
      (sum: number, r: any) => sum + parseFloat(r.change_value || '0'), 0
    );
    const currentRevisedValue = originalValue + totalApprovedDelta;

    let governingReferenceType: string;
    let governingReference: string;
    if (proj.current_commercial_reference_id) {
      const lastCco = approvedCcos.rows.find((r: any) => r.id === proj.current_commercial_reference_id);
      governingReferenceType = 'change_order';
      governingReference = lastCco?.change_order_number || `CCO #${proj.current_commercial_reference_id}`;
    } else {
      governingReferenceType = 'original_baseline';
      governingReference = proj.source_order_number || proj.original_offer_number || 'Original Order';
    }

    const pendingCco = await pool.query(
      `SELECT id, change_order_number, status, change_value FROM commercial_change_orders
       WHERE project_id = $1 AND status NOT IN ('approved', 'rejected')
       LIMIT 1`,
      [projectId]
    );

    const chainTimeline = await buildChainTimeline(proj.source_offer_id, projectId, proj.current_commercial_reference_id);

    res.json({
      projectId,
      originalOrderNumber: proj.source_order_number,
      originalOfferNumber: proj.original_offer_number,
      originalOrderValue: originalValue,
      approvedChanges: approvedCcos.rows.map((r: any) => ({
        id: r.id,
        number: r.change_order_number,
        type: r.change_type,
        typeLabel: formatChangeType(r.change_type),
        value: parseFloat(r.change_value || '0'),
        description: r.description,
        approvedAt: r.approved_at,
        revisedOfferNumber: r.revised_offer_number,
      })),
      totalApprovedDelta,
      currentRevisedValue,
      governingReferenceType,
      governingReference,
      pendingChangeOrder: pendingCco.rows[0] || null,
      chainTimeline,
    });
  } catch (error: any) {
    console.error('[cco] Error fetching summary:', error);
    res.status(500).json({ error: 'Failed to fetch commercial summary' });
  }
});

async function buildChainTimeline(sourceOfferId: number, projectId: number, currentRefId: number | null) {
  if (!sourceOfferId) return [];

  const rootOffer = await pool.query(
    `SELECT id, offer_number, total_amount, status, commercial_chain_id, created_at FROM offers WHERE id = $1`,
    [sourceOfferId]
  );
  if (rootOffer.rows.length === 0) return [];
  const root = rootOffer.rows[0];

  const nodes: any[] = [{
    offerId: root.id,
    offerNumber: root.offer_number,
    totalAmount: parseFloat(root.total_amount || '0'),
    status: root.status,
    role: 'root',
    isGoverning: !currentRefId,
    ccoNumber: null,
    ccoSequence: null,
    createdAt: root.created_at,
  }];

  const approvedCcos = await pool.query(
    `SELECT cco.id, cco.change_order_number, cco.sequence, cco.change_type, cco.change_value,
            cco.revised_offer_id, cco.approved_at,
            ro.offer_number AS revised_offer_number, ro.total_amount AS revised_total, ro.status AS revised_status
     FROM commercial_change_orders cco
     LEFT JOIN offers ro ON ro.id = cco.revised_offer_id
     WHERE cco.project_id = $1 AND cco.status = 'approved'
     ORDER BY cco.sequence ASC`,
    [projectId]
  );

  for (const cco of approvedCcos.rows) {
    const isGoverning = currentRefId === cco.id;
    nodes.push({
      offerId: cco.revised_offer_id,
      offerNumber: cco.revised_offer_number,
      totalAmount: parseFloat(cco.revised_total || '0'),
      status: cco.revised_status,
      role: 'revision',
      isGoverning,
      ccoNumber: cco.change_order_number,
      ccoSequence: cco.sequence,
      changeType: cco.change_type,
      changeTypeLabel: formatChangeType(cco.change_type),
      changeValue: parseFloat(cco.change_value || '0'),
      approvedAt: cco.approved_at,
    });
  }

  return nodes;
}

router.get('/offers/chain/:chainId', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    const chainId = req.params.chainId;
    if (!chainId) return res.status(400).json({ error: 'chainId parameter required' });

    const offers = await pool.query(
      `SELECT o.id, o.offer_number, o.customer_name, o.subject, o.total_amount, o.status,
              o.revision, o.commercial_chain_id, o.parent_offer_id, o.root_offer_id,
              o.created_at, o.updated_at
       FROM offers o
       WHERE o.commercial_chain_id = $1::uuid
       ORDER BY o.id ASC`,
      [chainId]
    );

    if (offers.rows.length === 0) {
      return res.status(404).json({ error: 'No offers found for this chain' });
    }

    const rootId = offers.rows[0].root_offer_id || offers.rows[0].id;
    const root = offers.rows.find((o: any) => o.id === rootId) || offers.rows[0];

    res.json({
      chainId,
      rootOfferId: rootId,
      rootOfferNumber: root.offer_number,
      customerName: root.customer_name,
      offers: offers.rows.map((o: any) => ({
        id: o.id,
        offerNumber: o.offer_number,
        totalAmount: parseFloat(o.total_amount || '0'),
        status: o.status,
        revision: o.revision,
        parentOfferId: o.parent_offer_id,
        rootOfferId: o.root_offer_id,
        isRoot: o.parent_offer_id === null,
        createdAt: o.created_at,
      })),
    });
  } catch (error: any) {
    console.error('[cco] Error fetching chain:', error);
    res.status(500).json({ error: 'Failed to fetch offer chain' });
  }
});

export function setupCommercialChangeOrderRoutes(app: any) {
  app.use('/api/sales-marketing', router);
}

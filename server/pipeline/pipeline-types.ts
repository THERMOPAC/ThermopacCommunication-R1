export type DraftDocType = 'DO' | 'WO' | 'PO' | 'IO';

export type ApprovalStatus =
  | 'not_applicable'
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'on_hold'
  | 'canceled';

export type ActivationStatus =
  | 'not_activated'
  | 'pending_activation'
  | 'activated'
  | 'activation_failed';

export type DependencyStatus = 'not_required' | 'blocked' | 'met';

export interface RoutingTarget {
  department: string;
  preferredRole: string;
}

export const ROUTING_MAP: Record<DraftDocType, RoutingTarget> = {
  DO: { department: 'Projects',        preferredRole: 'Senior Executive' },
  WO: { department: 'Production',      preferredRole: 'Manager' },
  PO: { department: 'Purchase',        preferredRole: 'Senior Executive' },
  IO: { department: 'Quality Control', preferredRole: 'Senior Executive' },
};

export const SLA_DAYS: Record<DraftDocType, number> = {
  DO: 5,
  WO: 3,
  PO: 3,
  IO: 5,
};

export const PRIORITY_MAP: Record<DraftDocType, string> = {
  DO: 'High',
  WO: 'High',
  PO: 'High',
  IO: 'Medium',
};

export const APPROVAL_ROLES = ['Senior Executive', 'Manager', 'Senior Manager', 'General Manager', 'Superuser'];
export const ACTION_ROLES = ['Senior Executive', 'Manager', 'Senior Manager', 'General Manager', 'Superuser'];

export interface DraftGenerationSummary {
  projectId: number;
  created: number;
  notApplicable: number;
  blocked: number;
  failed: number;
  skipped: number;
  skippedItems: Array<{ projectItemId: number; reason: string }>;
  drafts: Array<{
    docType: DraftDocType;
    docNumber: string | null;
    projectItemId: number;
    approvalStatus: ApprovalStatus;
    applicable: boolean;
  }>;
}

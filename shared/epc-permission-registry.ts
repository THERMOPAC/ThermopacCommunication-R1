export type PagePermission = {
  id: string;
  label: string;
  route: string;
  moduleGate: string;
  minViewRole: number;
  description: string;
  frontendSource: string;
  backendSource: string;
};

export type ActionPermission = {
  id: string;
  pageId: string;
  label: string;
  actionKey: string;
  minRoleLevel: number;
  statusRequired: string[];
  frontendCheck: string;
  frontendSource: string;
  backendCheck: string;
  backendRoute: string;
  backendSource: string;
  aligned: boolean;
  selfActionPrevention: boolean;
  selfActionDetail?: string;
  extraConditions?: string;
};

export type DataRule = {
  id: string;
  label: string;
  location: string;
  pageId: string;
  minViewRole: number;
  frontendEnforced: boolean;
  backendEnforced: boolean;
  frontendSource: string;
  backendSource: string;
  note: string;
};

export type GapFinding = {
  id: string;
  severity: "high" | "medium" | "low";
  category: "data_visibility" | "frontend_only" | "missing_backend" | "pattern_mismatch" | "self_action" | "visibility_scope";
  title: string;
  description: string;
  affectedModules: string[];
  affectedRoles: number[];
  recommendation: string;
};

export const EPC_PAGES: PagePermission[] = [
  {
    id: "project-dashboard",
    label: "Project Dashboard",
    route: "/project-dashboard",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Overview dashboard with project statistics and charts",
    frontendSource: "client/src/components/layout.tsx (menuItems, line ~383)",
    backendSource: "server/project-routes.ts — GET /api/design/projects (ensureAuthenticated)",
  },
  {
    id: "projects",
    label: "Projects",
    route: "/projects",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Project list with search, filters, expandable rows",
    frontendSource: "client/src/components/layout.tsx (menuItems)",
    backendSource: "server/project-routes.ts — GET /api/design/projects (ensureAuthenticated)",
  },
  {
    id: "item-master",
    label: "Item Master",
    route: "/item-master",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Master item registry across all projects",
    frontendSource: "client/src/components/layout.tsx (menuItems)",
    backendSource: "server/project-routes.ts — GET /api/projects/:id/items (ensureAuthenticated)",
  },
  {
    id: "execution-control",
    label: "Execution Control Dashboard",
    route: "/execution-control",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Control Tower with Pipeline + Reconciliation tabs, aggregated lifecycle view",
    frontendSource: "client/src/components/layout.tsx (menuItems)",
    backendSource: "server/project-routes.ts — GET /api/execution-control/:projectId/pipeline (ensureAuthenticated)",
  },
  {
    id: "drawing-controls",
    label: "EPC Drawing Controls",
    route: "/epc/drawing-controls",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Drawing revision control with lifecycle (draft→released), procurement/manufacturing release gates",
    frontendSource: "client/src/pages/epc-drawing-control-page.tsx",
    backendSource: "server/project-routes.ts — /api/drawing-controls/*",
  },
  {
    id: "bom-controls",
    label: "EPC BOM Controls",
    route: "/epc/bom-controls",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Bill of Materials governance with lifecycle, BOM line CRUD, revision history",
    frontendSource: "client/src/pages/epc-bom-control-page.tsx",
    backendSource: "server/project-routes.ts — /api/epc-bom-headers/*",
  },
  {
    id: "purchase-orders",
    label: "EPC Purchase Orders",
    route: "/epc/purchase-orders",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Purchase order lifecycle (draft→approved→issued)",
    frontendSource: "client/src/pages/epc-purchase-orders-page.tsx",
    backendSource: "server/project-routes.ts — /api/epc-purchase-orders/*",
  },
  {
    id: "work-orders",
    label: "EPC Work Orders",
    route: "/epc/work-orders",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Work order lifecycle (draft→approved→released)",
    frontendSource: "client/src/pages/epc-work-orders-page.tsx",
    backendSource: "server/project-routes.ts — /api/epc-work-orders/*",
  },
  {
    id: "planning-control",
    label: "EPC Planning Control",
    route: "/epc/planning-control",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Planning records with submit/review/release lifecycle",
    frontendSource: "client/src/pages/epc-planning-control-page.tsx",
    backendSource: "server/project-routes.ts — /api/planning-records/*",
  },
  {
    id: "procurement-production",
    label: "EPC Procurement & Production",
    route: "/epc/execution-control",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Procurement and production execution (preparation→ready lifecycle)",
    frontendSource: "client/src/pages/epc-execution-control-page.tsx",
    backendSource: "server/project-routes.ts — /api/procurement-executions/*, /api/production-executions/*",
  },
  {
    id: "quality-inspection",
    label: "EPC Quality & Inspection",
    route: "/epc/quality-inspection",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Quality plans and inspection execution (schedule→inspect→close)",
    frontendSource: "client/src/pages/epc-quality-inspection-page.tsx",
    backendSource: "server/project-routes.ts — /api/quality-plans/*, /api/inspection-executions/*",
  },
  {
    id: "dispatch-logistics",
    label: "EPC Dispatch & Logistics",
    route: "/epc/dispatch-logistics",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Dispatch readiness and dispatch record management",
    frontendSource: "client/src/pages/epc-dispatch-logistics-page.tsx",
    backendSource: "server/project-routes.ts — /api/dispatch-readiness/*, /api/dispatch-records/*",
  },
  {
    id: "commissioning-handover",
    label: "EPC Commissioning & Handover",
    route: "/epc/commissioning-handover",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Commissioning readiness with handover lifecycle",
    frontendSource: "client/src/pages/epc-commissioning-handover-page.tsx",
    backendSource: "server/project-routes.ts — /api/commissioning-readiness/*",
  },
  {
    id: "invoices",
    label: "EPC Invoices",
    route: "/epc/invoices",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Invoice lifecycle (draft→approved→issued→paid) with payment recording",
    frontendSource: "client/src/pages/epc-invoices-page.tsx",
    backendSource: "server/project-routes.ts — /api/epc-invoices/*",
  },
  {
    id: "epc-risks",
    label: "EPC Risks",
    route: "/epc-risks",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "Read-only monitoring dashboard for EPC agent findings",
    frontendSource: "client/src/pages/epc-risks-dashboard.tsx",
    backendSource: "server/project-routes.ts — GET /api/epc-agent-findings (ensureAuthenticated)",
  },
  {
    id: "document-attachments",
    label: "EPC Document Attachments",
    route: "(panel within pages)",
    moduleGate: "Project Management",
    minViewRole: 4,
    description: "GCS-backed file storage panel embedded in EPC pages — upload, download, withdraw, reinstate",
    frontendSource: "client/src/components/epc-document-panel.tsx",
    backendSource: "server/epc-document-routes.ts — /api/projects/:id/epc-documents/*",
  },
];

export const EPC_ACTIONS: ActionPermission[] = [
  // ======================== Drawing Controls ========================
  {
    id: "dwg-submit-review", pageId: "drawing-controls", label: "Submit for Review", actionKey: "submit-for-review",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-drawing-control-page.tsx:128",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/drawing-controls/:id/submit-for-review", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "dwg-review", pageId: "drawing-controls", label: "Review", actionKey: "review",
    minRoleLevel: 3, statusRequired: ["under_review"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-drawing-control-page.tsx:129",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/drawing-controls/:id/review", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "dwg-approve", pageId: "drawing-controls", label: "Approve", actionKey: "approve",
    minRoleLevel: 2, statusRequired: ["under_review"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2 + extraCheck: !!rec.reviewed_by", frontendSource: "epc-drawing-control-page.tsx:130",
    backendCheck: "roleHierarchy[userRole] > 2 check", backendRoute: "POST /api/drawing-controls/:id/approve", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false, extraConditions: "Requires reviewed_by to be set (frontend extraCheck)",
  },
  {
    id: "dwg-release", pageId: "drawing-controls", label: "Release", actionKey: "release",
    minRoleLevel: 2, statusRequired: ["approved"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2", frontendSource: "epc-drawing-control-page.tsx:131",
    backendCheck: "requireMinRole('Senior Manager')", backendRoute: "POST /api/drawing-controls/:id/release", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "dwg-release-gate-procurement", pageId: "drawing-controls", label: "Mark Released for Procurement", actionKey: "release-gate-procurement",
    minRoleLevel: 3, statusRequired: ["released"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3 + extraCheck: procurement_release_required && !released_for_procurement", frontendSource: "epc-drawing-control-page.tsx:132",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/drawing-controls/:id/release-gate-procurement", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false, extraConditions: "Only shown when procurement_release_required=true and not yet released",
  },
  {
    id: "dwg-release-gate-manufacturing", pageId: "drawing-controls", label: "Mark Released for Manufacturing", actionKey: "release-gate-manufacturing",
    minRoleLevel: 3, statusRequired: ["released"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3 + extraCheck: manufacturing_release_required && !released_for_manufacturing", frontendSource: "epc-drawing-control-page.tsx:133",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/drawing-controls/:id/release-gate-manufacturing", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false, extraConditions: "Only shown when manufacturing_release_required=true and not yet released",
  },
  {
    id: "dwg-client-approval", pageId: "drawing-controls", label: "Record Client Approval", actionKey: "client-approval",
    minRoleLevel: 3, statusRequired: ["draft", "under_review"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3 + extraCheck: client_approval_required && status !== approved", frontendSource: "epc-drawing-control-page.tsx:134",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/drawing-controls/:id/client-approval", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false, extraConditions: "Only shown when client_approval_required=true and not yet approved",
  },
  {
    id: "dwg-revert-to-draft", pageId: "drawing-controls", label: "Revert to Draft", actionKey: "revert-to-draft",
    minRoleLevel: 3, statusRequired: ["under_review"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-drawing-control-page.tsx:135",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/drawing-controls/:id/revert-to-draft", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "dwg-cancel", pageId: "drawing-controls", label: "Cancel", actionKey: "cancel",
    minRoleLevel: 2, statusRequired: ["draft", "under_review", "approved"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2", frontendSource: "epc-drawing-control-page.tsx:136",
    backendCheck: "roleHierarchy[userRole] > 2 check (Senior Manager+)", backendRoute: "POST /api/drawing-controls/:id/cancel", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "dwg-supersede", pageId: "drawing-controls", label: "Supersede", actionKey: "supersede",
    minRoleLevel: 2, statusRequired: ["draft", "under_review", "approved", "released"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2 + extraCheck: is_current", frontendSource: "epc-drawing-control-page.tsx:137",
    backendCheck: "roleHierarchy[userRole] > 2 (Senior Manager+)", backendRoute: "POST /api/drawing-controls/:id/supersede", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false, extraConditions: "Only shown for current revision (is_current=true)",
  },
  {
    id: "dwg-create", pageId: "drawing-controls", label: "Create Drawing Control", actionKey: "create",
    minRoleLevel: 3, statusRequired: ["n/a"],
    frontendCheck: "userLevel <= 3 button visibility", frontendSource: "epc-drawing-control-page.tsx",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/drawing-controls", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },

  // ======================== BOM Controls ========================
  {
    id: "bom-submit-review", pageId: "bom-controls", label: "Submit for Review", actionKey: "submit-for-review",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-bom-control-page.tsx:70",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/epc-bom-headers/:id/submit-for-review", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "bom-review", pageId: "bom-controls", label: "Review", actionKey: "review",
    minRoleLevel: 3, statusRequired: ["under_review"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-bom-control-page.tsx:71",
    backendCheck: "managerRoles includes check", backendRoute: "POST /api/epc-bom-headers/:id/review", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "bom-approve", pageId: "bom-controls", label: "Approve", actionKey: "approve",
    minRoleLevel: 2, statusRequired: ["under_review"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2 + extraCheck: !!rec.reviewed_by", frontendSource: "epc-bom-control-page.tsx:72",
    backendCheck: "seniorRoles = ['Senior Manager','General Manager','Superuser']", backendRoute: "POST /api/epc-bom-headers/:id/approve", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false, extraConditions: "Requires reviewed_by to be set",
  },
  {
    id: "bom-release", pageId: "bom-controls", label: "Release", actionKey: "release",
    minRoleLevel: 2, statusRequired: ["approved"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2", frontendSource: "epc-bom-control-page.tsx:73",
    backendCheck: "seniorRoles = ['Senior Manager','General Manager','Superuser']", backendRoute: "POST /api/epc-bom-headers/:id/release", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "bom-lock", pageId: "bom-controls", label: "Lock BOM", actionKey: "lock",
    minRoleLevel: 2, statusRequired: ["released"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2", frontendSource: "epc-bom-control-page.tsx:74",
    backendCheck: "roleHierarchy[userRole] > 2 (Senior Manager+)", backendRoute: "POST /api/epc-bom-headers/:id/lock", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "bom-revert-to-draft", pageId: "bom-controls", label: "Revert to Draft", actionKey: "revert-to-draft",
    minRoleLevel: 3, statusRequired: ["under_review"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-bom-control-page.tsx:75",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/epc-bom-headers/:id/revert-to-draft", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "bom-cancel", pageId: "bom-controls", label: "Cancel", actionKey: "cancel",
    minRoleLevel: 2, statusRequired: ["draft", "under_review", "approved"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2", frontendSource: "epc-bom-control-page.tsx:76",
    backendCheck: "roleHierarchy[userRole] > 2 (Senior Manager+)", backendRoute: "POST /api/epc-bom-headers/:id/cancel", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "bom-supersede", pageId: "bom-controls", label: "Supersede", actionKey: "supersede",
    minRoleLevel: 2, statusRequired: ["released", "locked"],
    frontendCheck: "Supersede button in revision history, minRoleLevel: 2", frontendSource: "epc-bom-control-page.tsx",
    backendCheck: "seniorRoles = ['Senior Manager','General Manager','Superuser']", backendRoute: "POST /api/epc-bom-headers/:id/supersede", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "bom-create", pageId: "bom-controls", label: "Create BOM", actionKey: "create",
    minRoleLevel: 3, statusRequired: ["n/a"],
    frontendCheck: "userLevel <= 3 button visibility", frontendSource: "epc-bom-control-page.tsx",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/epc-bom-headers", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "bom-line-crud", pageId: "bom-controls", label: "BOM Line CRUD", actionKey: "line-crud",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "userLevel <= 3 button visibility", frontendSource: "epc-bom-control-page.tsx",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST/PUT/DELETE /api/epc-bom-headers/:id/lines", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },

  // ======================== Purchase Orders ========================
  {
    id: "po-approve", pageId: "purchase-orders", label: "Approve", actionKey: "approve",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-purchase-orders-page.tsx:67",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/epc-purchase-orders/:id/approve", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "po-issue", pageId: "purchase-orders", label: "Issue PO", actionKey: "issue",
    minRoleLevel: 2, statusRequired: ["approved"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2", frontendSource: "epc-purchase-orders-page.tsx:68",
    backendCheck: "requireMinRole('Senior Manager')", backendRoute: "POST /api/epc-purchase-orders/:id/issue", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "po-revert-to-draft", pageId: "purchase-orders", label: "Revert to Draft", actionKey: "revert-to-draft",
    minRoleLevel: 3, statusRequired: ["approved"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-purchase-orders-page.tsx:69",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/epc-purchase-orders/:id/revert-to-draft", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "po-cancel", pageId: "purchase-orders", label: "Cancel", actionKey: "cancel",
    minRoleLevel: 3, statusRequired: ["draft", "approved"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-purchase-orders-page.tsx:70",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/epc-purchase-orders/:id/cancel", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },

  // ======================== Work Orders ========================
  {
    id: "wo-approve", pageId: "work-orders", label: "Approve", actionKey: "approve",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-work-orders-page.tsx:73",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/epc-work-orders/:id/approve", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "wo-release", pageId: "work-orders", label: "Release WO", actionKey: "release",
    minRoleLevel: 2, statusRequired: ["approved"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2", frontendSource: "epc-work-orders-page.tsx:74",
    backendCheck: "requireMinRole('Senior Manager')", backendRoute: "POST /api/epc-work-orders/:id/release", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "wo-revert-to-draft", pageId: "work-orders", label: "Revert to Draft", actionKey: "revert-to-draft",
    minRoleLevel: 3, statusRequired: ["approved"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-work-orders-page.tsx:75",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/epc-work-orders/:id/revert-to-draft", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "wo-cancel", pageId: "work-orders", label: "Cancel", actionKey: "cancel",
    minRoleLevel: 3, statusRequired: ["draft", "approved"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-work-orders-page.tsx:76",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/epc-work-orders/:id/cancel", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },

  // ======================== Planning Control ========================
  {
    id: "plan-submit-review", pageId: "planning-control", label: "Submit for Review", actionKey: "submit-for-review",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-planning-control-page.tsx:63",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/planning-records/:id/submit-for-review", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "plan-review", pageId: "planning-control", label: "Mark Reviewed", actionKey: "review",
    minRoleLevel: 3, statusRequired: ["under_review"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3 + inline: creator cannot review", frontendSource: "epc-planning-control-page.tsx:64",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/planning-records/:id/review", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: true, selfActionDetail: "Frontend: rec.created_by === userId filtered out. Backend: no explicit check.",
  },
  {
    id: "plan-release", pageId: "planning-control", label: "Release", actionKey: "release",
    minRoleLevel: 2, statusRequired: ["under_review"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2 + inline: creator/reviewer cannot release, requires reviewed_by", frontendSource: "epc-planning-control-page.tsx:65",
    backendCheck: "requireMinRole('Senior Manager')", backendRoute: "POST /api/planning-records/:id/release", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: true, selfActionDetail: "Frontend: reviewed_by===userId || created_by===userId filtered out. Backend: no explicit check.",
    extraConditions: "Frontend requires reviewed_by to be set before showing release button",
  },
  {
    id: "plan-cancel", pageId: "planning-control", label: "Cancel", actionKey: "cancel",
    minRoleLevel: 3, statusRequired: ["draft", "under_review"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-planning-control-page.tsx:66",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/planning-records/:id/cancel", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },

  // ======================== Procurement & Production ========================
  {
    id: "proc-start-preparation", pageId: "procurement-production", label: "Start Preparation (Procurement)", actionKey: "start-preparation",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "PROC_ACTIONS minRoleLevel: 3", frontendSource: "epc-execution-control-page.tsx:66",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/procurement-executions/:id/start-preparation", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "proc-mark-ready", pageId: "procurement-production", label: "Mark Ready for PO", actionKey: "mark-ready",
    minRoleLevel: 3, statusRequired: ["under_preparation"],
    frontendCheck: "PROC_ACTIONS minRoleLevel: 3", frontendSource: "epc-execution-control-page.tsx:67",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/procurement-executions/:id/mark-ready", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "proc-revert", pageId: "procurement-production", label: "Revert to Preparation (Procurement)", actionKey: "revert-to-preparation",
    minRoleLevel: 3, statusRequired: ["ready_for_po"],
    frontendCheck: "PROC_ACTIONS minRoleLevel: 3", frontendSource: "epc-execution-control-page.tsx:68",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/procurement-executions/:id/revert-to-preparation", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "proc-cancel", pageId: "procurement-production", label: "Cancel (Procurement)", actionKey: "cancel",
    minRoleLevel: 3, statusRequired: ["draft", "under_preparation", "ready_for_po"],
    frontendCheck: "PROC_ACTIONS minRoleLevel: 3", frontendSource: "epc-execution-control-page.tsx:69",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/procurement-executions/:id/cancel", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "prod-start-preparation", pageId: "procurement-production", label: "Start Preparation (Production)", actionKey: "start-preparation",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "PROD_ACTIONS minRoleLevel: 3", frontendSource: "epc-execution-control-page.tsx:73",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/production-executions/:id/start-preparation", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "prod-mark-ready", pageId: "procurement-production", label: "Mark Ready for WO", actionKey: "mark-ready",
    minRoleLevel: 3, statusRequired: ["under_preparation"],
    frontendCheck: "PROD_ACTIONS minRoleLevel: 3", frontendSource: "epc-execution-control-page.tsx:74",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/production-executions/:id/mark-ready", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "prod-revert", pageId: "procurement-production", label: "Revert to Preparation (Production)", actionKey: "revert-to-preparation",
    minRoleLevel: 3, statusRequired: ["ready_for_wo"],
    frontendCheck: "PROD_ACTIONS minRoleLevel: 3", frontendSource: "epc-execution-control-page.tsx:75",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/production-executions/:id/revert-to-preparation", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "prod-cancel", pageId: "procurement-production", label: "Cancel (Production)", actionKey: "cancel",
    minRoleLevel: 3, statusRequired: ["draft", "under_preparation", "ready_for_wo"],
    frontendCheck: "PROD_ACTIONS minRoleLevel: 3", frontendSource: "epc-execution-control-page.tsx:76",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/production-executions/:id/cancel", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },

  // ======================== Quality & Inspection ========================
  {
    id: "qp-start-preparation", pageId: "quality-inspection", label: "Start Preparation (QP)", actionKey: "start-preparation",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "QP_ACTIONS minRoleLevel: 3", frontendSource: "epc-quality-inspection-page.tsx:67",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/quality-plans/:id/start-preparation", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "qp-mark-ready", pageId: "quality-inspection", label: "Mark Ready for Inspection", actionKey: "mark-ready",
    minRoleLevel: 3, statusRequired: ["under_preparation"],
    frontendCheck: "QP_ACTIONS minRoleLevel: 3", frontendSource: "epc-quality-inspection-page.tsx:68",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/quality-plans/:id/mark-ready", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "qp-revert", pageId: "quality-inspection", label: "Revert to Preparation (QP)", actionKey: "revert-to-preparation",
    minRoleLevel: 3, statusRequired: ["ready_for_inspection_setup"],
    frontendCheck: "QP_ACTIONS minRoleLevel: 3", frontendSource: "epc-quality-inspection-page.tsx:69",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/quality-plans/:id/revert-to-preparation", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "qp-cancel", pageId: "quality-inspection", label: "Cancel (QP)", actionKey: "cancel",
    minRoleLevel: 3, statusRequired: ["draft", "under_preparation", "ready_for_inspection_setup"],
    frontendCheck: "QP_ACTIONS minRoleLevel: 3", frontendSource: "epc-quality-inspection-page.tsx:70",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/quality-plans/:id/cancel", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "ie-schedule", pageId: "quality-inspection", label: "Schedule Inspection", actionKey: "schedule",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "IE_ACTIONS minRoleLevel: 3", frontendSource: "epc-quality-inspection-page.tsx:74",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/inspection-executions/:id/schedule", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "ie-start", pageId: "quality-inspection", label: "Start Inspection", actionKey: "start",
    minRoleLevel: 3, statusRequired: ["scheduled"],
    frontendCheck: "IE_ACTIONS minRoleLevel: 3", frontendSource: "epc-quality-inspection-page.tsx:75",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/inspection-executions/:id/start", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "ie-complete", pageId: "quality-inspection", label: "Record Result", actionKey: "complete",
    minRoleLevel: 3, statusRequired: ["in_progress"],
    frontendCheck: "IE_ACTIONS minRoleLevel: 3", frontendSource: "epc-quality-inspection-page.tsx:76",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/inspection-executions/:id/complete", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "ie-rework", pageId: "quality-inspection", label: "Require Rework", actionKey: "require-rework",
    minRoleLevel: 3, statusRequired: ["completed_fail"],
    frontendCheck: "IE_ACTIONS minRoleLevel: 3", frontendSource: "epc-quality-inspection-page.tsx",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/inspection-executions/:id/require-rework", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "ie-close", pageId: "quality-inspection", label: "Close Inspection", actionKey: "close",
    minRoleLevel: 2, statusRequired: ["completed_pass", "completed_fail"],
    frontendCheck: "IE_ACTIONS minRoleLevel: 2", frontendSource: "epc-quality-inspection-page.tsx",
    backendCheck: "requireMinRole('Senior Manager')", backendRoute: "POST /api/inspection-executions/:id/close", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "ie-cancel", pageId: "quality-inspection", label: "Cancel (Inspection)", actionKey: "cancel",
    minRoleLevel: 3, statusRequired: ["draft", "scheduled", "in_progress"],
    frontendCheck: "IE_ACTIONS minRoleLevel: 3", frontendSource: "epc-quality-inspection-page.tsx",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/inspection-executions/:id/cancel", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },

  // ======================== Dispatch & Logistics ========================
  {
    id: "dr-start-preparation", pageId: "dispatch-logistics", label: "Start Preparation (Dispatch)", actionKey: "start-preparation",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "DR_ACTIONS minRoleLevel: 3", frontendSource: "epc-dispatch-logistics-page.tsx:64",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/dispatch-readiness/:id/start-preparation", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "dr-mark-ready", pageId: "dispatch-logistics", label: "Mark Ready (Dispatch)", actionKey: "mark-ready",
    minRoleLevel: 3, statusRequired: ["under_preparation"],
    frontendCheck: "DR_ACTIONS minRoleLevel: 3", frontendSource: "epc-dispatch-logistics-page.tsx:65",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/dispatch-readiness/:id/mark-ready", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "dr-dispatch", pageId: "dispatch-logistics", label: "Mark Dispatched", actionKey: "dispatch",
    minRoleLevel: 3, statusRequired: ["ready_for_dispatch"],
    frontendCheck: "DR_ACTIONS minRoleLevel: 3", frontendSource: "epc-dispatch-logistics-page.tsx:66",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/dispatch-readiness/:id/dispatch", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "dr-cancel", pageId: "dispatch-logistics", label: "Cancel (Dispatch Readiness)", actionKey: "cancel",
    minRoleLevel: 3, statusRequired: ["draft", "under_preparation", "ready_for_dispatch"],
    frontendCheck: "DR_ACTIONS minRoleLevel: 3", frontendSource: "epc-dispatch-logistics-page.tsx:67",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/dispatch-readiness/:id/cancel", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "dsp-confirm", pageId: "dispatch-logistics", label: "Confirm (Dispatch Record)", actionKey: "confirm",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "DSP_ACTIONS minRoleLevel: 3", frontendSource: "epc-dispatch-logistics-page.tsx:71",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/dispatch-records/:id/confirm", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "dsp-ship", pageId: "dispatch-logistics", label: "Mark Shipped", actionKey: "ship",
    minRoleLevel: 3, statusRequired: ["confirmed"],
    frontendCheck: "DSP_ACTIONS minRoleLevel: 3", frontendSource: "epc-dispatch-logistics-page.tsx:72",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/dispatch-records/:id/ship", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "dsp-deliver", pageId: "dispatch-logistics", label: "Confirm Delivery", actionKey: "deliver",
    minRoleLevel: 3, statusRequired: ["shipped"],
    frontendCheck: "DSP_ACTIONS minRoleLevel: 3", frontendSource: "epc-dispatch-logistics-page.tsx:73",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/dispatch-records/:id/deliver", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "dsp-cancel", pageId: "dispatch-logistics", label: "Cancel (Dispatch Record)", actionKey: "cancel",
    minRoleLevel: 3, statusRequired: ["draft", "confirmed", "shipped"],
    frontendCheck: "DSP_ACTIONS minRoleLevel: 3", frontendSource: "epc-dispatch-logistics-page.tsx:74",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/dispatch-records/:id/cancel", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },

  // ======================== Commissioning & Handover ========================
  {
    id: "cr-start-preparation", pageId: "commissioning-handover", label: "Start Preparation", actionKey: "start-preparation",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "CR_ACTIONS minRoleLevel: 3", frontendSource: "epc-commissioning-handover-page.tsx:64",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/commissioning-readiness/:id/start-preparation", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "cr-mark-ready", pageId: "commissioning-handover", label: "Mark Ready for Commissioning", actionKey: "mark-ready",
    minRoleLevel: 3, statusRequired: ["under_preparation"],
    frontendCheck: "CR_ACTIONS minRoleLevel: 3", frontendSource: "epc-commissioning-handover-page.tsx:65",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/commissioning-readiness/:id/mark-ready", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "cr-commission", pageId: "commissioning-handover", label: "Commission", actionKey: "commission",
    minRoleLevel: 3, statusRequired: ["ready_for_commissioning"],
    frontendCheck: "CR_ACTIONS minRoleLevel: 3", frontendSource: "epc-commissioning-handover-page.tsx:66",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/commissioning-readiness/:id/commission", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "cr-open-punch-list", pageId: "commissioning-handover", label: "Open Punch List", actionKey: "open-punch-list",
    minRoleLevel: 3, statusRequired: ["commissioned"],
    frontendCheck: "CR_ACTIONS minRoleLevel: 3", frontendSource: "epc-commissioning-handover-page.tsx:67",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/commissioning-readiness/:id/open-punch-list", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "cr-resolve-punch-list", pageId: "commissioning-handover", label: "Resolve Punch List", actionKey: "resolve-punch-list",
    minRoleLevel: 3, statusRequired: ["punch_list_open"],
    frontendCheck: "CR_ACTIONS minRoleLevel: 3", frontendSource: "epc-commissioning-handover-page.tsx:68",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/commissioning-readiness/:id/resolve-punch-list", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "cr-handover", pageId: "commissioning-handover", label: "Handover", actionKey: "handover",
    minRoleLevel: 2, statusRequired: ["commissioned", "ready_for_handover"],
    frontendCheck: "CR_ACTIONS minRoleLevel: 2", frontendSource: "epc-commissioning-handover-page.tsx:69",
    backendCheck: "explicit Senior Manager array check", backendRoute: "POST /api/commissioning-readiness/:id/handover", backendSource: "project-routes.ts:6662",
    aligned: true, selfActionPrevention: false, extraConditions: "Backend checks test_certificates_available and training confirmation",
  },
  {
    id: "cr-close", pageId: "commissioning-handover", label: "Close", actionKey: "close",
    minRoleLevel: 2, statusRequired: ["handed_over"],
    frontendCheck: "CR_ACTIONS minRoleLevel: 2", frontendSource: "epc-commissioning-handover-page.tsx:70",
    backendCheck: "requireMinRole('Senior Manager')", backendRoute: "POST /api/commissioning-readiness/:id/close", backendSource: "project-routes.ts:6897",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "cr-cancel", pageId: "commissioning-handover", label: "Cancel", actionKey: "cancel",
    minRoleLevel: 3, statusRequired: ["draft", "under_preparation", "ready_for_commissioning", "commissioned", "punch_list_open", "ready_for_handover"],
    frontendCheck: "CR_ACTIONS minRoleLevel: 3", frontendSource: "epc-commissioning-handover-page.tsx:71",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/commissioning-readiness/:id/cancel", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },

  // ======================== Billing Readiness ========================
  {
    id: "br-submit-review", pageId: "execution-control", label: "Submit for Review (Billing)", actionKey: "submit-review",
    minRoleLevel: 3, statusRequired: ["draft"],
    frontendCheck: "getAvailableActions minLevel: M (3)", frontendSource: "execution-control-dashboard.tsx",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/billing-readiness/:id/submit-review", backendSource: "project-routes.ts:7137",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "br-approve", pageId: "execution-control", label: "Approve (Billing)", actionKey: "approve",
    minRoleLevel: 2, statusRequired: ["under_review"],
    frontendCheck: "getAvailableActions minLevel: SM (2)", frontendSource: "execution-control-dashboard.tsx",
    backendCheck: "allowedRoles = ['Superuser','General Manager','Senior Manager']", backendRoute: "POST /api/billing-readiness/:id/approve", backendSource: "project-routes.ts:7171",
    aligned: true, selfActionPrevention: true, selfActionDetail: "Backend: br.created_by === userId → rejected. Frontend: no explicit check.",
  },
  {
    id: "br-cancel", pageId: "execution-control", label: "Cancel (Billing)", actionKey: "cancel",
    minRoleLevel: 3, statusRequired: ["draft", "under_review"],
    frontendCheck: "getAvailableActions minLevel: M (3)", frontendSource: "execution-control-dashboard.tsx",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/billing-readiness/:id/cancel", backendSource: "project-routes.ts:7265",
    aligned: true, selfActionPrevention: false,
  },

  // ======================== Invoices ========================
  {
    id: "inv-approve", pageId: "invoices", label: "Approve Invoice", actionKey: "approve",
    minRoleLevel: 2, statusRequired: ["draft"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2", frontendSource: "epc-invoices-page.tsx:64",
    backendCheck: "allowedRoles = ['Superuser','General Manager','Senior Manager']", backendRoute: "POST /api/epc-invoices/:id/approve", backendSource: "project-routes.ts:7562",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "inv-issue", pageId: "invoices", label: "Issue Invoice", actionKey: "issue",
    minRoleLevel: 2, statusRequired: ["approved"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 2", frontendSource: "epc-invoices-page.tsx:65",
    backendCheck: "allowedRoles = ['Superuser','General Manager','Senior Manager']", backendRoute: "POST /api/epc-invoices/:id/issue", backendSource: "project-routes.ts:7605",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "inv-record-payment", pageId: "invoices", label: "Record Payment", actionKey: "record-payment",
    minRoleLevel: 3, statusRequired: ["issued", "partially_paid"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-invoices-page.tsx:66",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/epc-invoices/:id/record-payment", backendSource: "project-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "inv-cancel", pageId: "invoices", label: "Cancel Invoice", actionKey: "cancel",
    minRoleLevel: 3, statusRequired: ["draft", "approved", "issued"],
    frontendCheck: "LIFECYCLE_ACTIONS minRoleLevel: 3", frontendSource: "epc-invoices-page.tsx:67",
    backendCheck: "requireMinRole('Manager')", backendRoute: "POST /api/epc-invoices/:id/cancel", backendSource: "project-routes.ts:7708",
    aligned: true, selfActionPrevention: false,
  },

  // ======================== Document Attachments ========================
  {
    id: "doc-upload", pageId: "document-attachments", label: "Upload Document", actionKey: "upload",
    minRoleLevel: 3, statusRequired: ["n/a"],
    frontendCheck: "UPLOAD_ROLES visibility check", frontendSource: "epc-document-panel.tsx",
    backendCheck: "UPLOAD_ROLES array check", backendRoute: "POST /api/projects/:id/epc-documents/upload", backendSource: "epc-document-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "doc-withdraw", pageId: "document-attachments", label: "Withdraw Document", actionKey: "withdraw",
    minRoleLevel: 3, statusRequired: ["active"],
    frontendCheck: "Manager+ visibility", frontendSource: "epc-document-panel.tsx",
    backendCheck: "Manager+ role check", backendRoute: "POST /api/projects/:id/epc-documents/:docId/withdraw", backendSource: "epc-document-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "doc-withdraw-released", pageId: "document-attachments", label: "Withdraw Released Document", actionKey: "withdraw-released",
    minRoleLevel: 2, statusRequired: ["active"],
    frontendCheck: "WITHDRAW_RELEASED_ROLES visibility", frontendSource: "epc-document-panel.tsx",
    backendCheck: "WITHDRAW_RELEASED_ROLES array check", backendRoute: "POST /api/projects/:id/epc-documents/:docId/withdraw", backendSource: "epc-document-routes.ts",
    aligned: true, selfActionPrevention: false, extraConditions: "Only applies when the parent DWG/BOM revision is in 'released' status",
  },
  {
    id: "doc-reinstate", pageId: "document-attachments", label: "Reinstate Document", actionKey: "reinstate",
    minRoleLevel: 2, statusRequired: ["withdrawn"],
    frontendCheck: "Senior Manager+ visibility", frontendSource: "epc-document-panel.tsx",
    backendCheck: "Senior Manager+ role check", backendRoute: "POST /api/projects/:id/epc-documents/:docId/reinstate", backendSource: "epc-document-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
  {
    id: "doc-access-log", pageId: "document-attachments", label: "View Access Log", actionKey: "access-log",
    minRoleLevel: 1, statusRequired: ["n/a"],
    frontendCheck: "ACCESS_LOG_ROLES = ['General Manager','Superuser']", frontendSource: "epc-document-panel.tsx",
    backendCheck: "GM/Superuser role check", backendRoute: "GET /api/projects/:id/epc-documents/:docNum/access-log", backendSource: "epc-document-routes.ts",
    aligned: true, selfActionPrevention: false,
  },
];

export const EPC_DATA_RULES: DataRule[] = [
  {
    id: "recon-amounts",
    label: "Commercial Amounts (Reconciliation Tab)",
    location: "Execution Control Dashboard → Reconciliation Tab",
    pageId: "execution-control",
    minViewRole: 3,
    frontendEnforced: true,
    backendEnforced: false,
    frontendSource: "execution-control-dashboard.tsx — userLevel > 3 → 'Restricted'",
    backendSource: "API returns all amounts regardless of role",
    note: "Frontend replaces amount columns with 'Restricted' text for Employee (level 4). Backend still returns the data.",
  },
  {
    id: "invoice-amounts",
    label: "Invoice Amounts (EPC Invoices Page)",
    location: "EPC Invoices Page → main table columns",
    pageId: "invoices",
    minViewRole: 4,
    frontendEnforced: false,
    backendEnforced: false,
    frontendSource: "epc-invoices-page.tsx — no role check on amount columns",
    backendSource: "API returns all invoice amounts to all authenticated users",
    note: "All amounts (gross, paid, outstanding) visible to all roles including Employee. No restriction.",
  },
  {
    id: "billing-amounts",
    label: "Billing Amounts (Billing Readiness)",
    location: "Execution Control Dashboard → Billing layer",
    pageId: "execution-control",
    minViewRole: 4,
    frontendEnforced: false,
    backendEnforced: false,
    frontendSource: "execution-control-dashboard.tsx — billing amount shown in expanded row",
    backendSource: "API returns billing amounts to all authenticated users",
    note: "Billing amounts visible to all roles. No restriction applied.",
  },
  {
    id: "access-logs",
    label: "Document Access Audit Logs",
    location: "EPC Document Panel → Audit button",
    pageId: "document-attachments",
    minViewRole: 1,
    frontendEnforced: true,
    backendEnforced: true,
    frontendSource: "epc-document-panel.tsx — ACCESS_LOG_ROLES = ['General Manager','Superuser']",
    backendSource: "epc-document-routes.ts — 403 for non-GM/Superuser",
    note: "Both frontend and backend enforce GM/Superuser only. Well-aligned.",
  },
];

export const EPC_GAPS: GapFinding[] = [
  {
    id: "gap-invoice-amount-visibility",
    severity: "medium",
    category: "data_visibility",
    title: "Invoice Amount Visibility Inconsistency",
    description: "The Reconciliation tab on the Execution Control Dashboard hides commercial amounts for Employee role (userLevel > 3), but the EPC Invoices page and Billing Readiness views display all amounts (gross, paid, outstanding) to all roles including Employee. An Employee can navigate to the Invoices page to see amounts that are hidden in the Reconciliation tab.",
    affectedModules: ["execution-control", "invoices"],
    affectedRoles: [4],
    recommendation: "Apply the same userLevel > 3 restriction to invoice and billing amount columns on their dedicated pages.",
  },
  {
    id: "gap-all-or-nothing-visibility",
    severity: "medium",
    category: "visibility_scope",
    title: "All-or-Nothing Module Visibility",
    description: "All 16 EPC pages are gated by a single 'Project Management' module permission check. There is no per-page visibility — if a user has 'Project Management' view access, they can see all EPC pages including Invoices, Drawing Controls, BOM Controls, etc. There is no way to give an Employee access to only Quality & Inspection without also exposing Invoices.",
    affectedModules: ["all"],
    affectedRoles: [3, 4],
    recommendation: "Consider introducing per-page or per-module-area permission checks for sensitive EPC pages (Invoices, Billing, BOM Controls).",
  },
  {
    id: "gap-checklist-frontend-only",
    severity: "low",
    category: "frontend_only",
    title: "Commissioning Checklist Toggle — Frontend-Only Enforcement",
    description: "Commissioning checklist item toggling (test_certificates_available, training_completed, etc.) is restricted by userLevel <= 3 only on the frontend. The backend PATCH endpoint for commissioning readiness records does not have a corresponding role check for individual checklist fields. An Employee with API knowledge could toggle checklist items via direct API calls.",
    affectedModules: ["commissioning-handover"],
    affectedRoles: [4],
    recommendation: "Add requireMinRole('Manager') to the commissioning readiness PATCH endpoint or add field-level validation for checklist fields.",
  },
  {
    id: "gap-mixed-auth-patterns",
    severity: "low",
    category: "pattern_mismatch",
    title: "Mixed Backend Authorization Patterns",
    description: "Backend route authorization uses three different patterns interchangeably: (1) requireMinRole('Senior Manager'), (2) explicit role arrays ['Senior Manager','General Manager','Superuser'], (3) roleHierarchy[userRole] > 2 numeric comparison. While functionally equivalent, the inconsistency makes security auditing harder and increases risk that a pattern change in one place is not reflected in others.",
    affectedModules: ["drawing-controls", "bom-controls", "invoices", "commissioning-handover"],
    affectedRoles: [],
    recommendation: "Standardize all Senior Manager+ checks to use requireMinRole('Senior Manager') consistently.",
  },
  {
    id: "gap-self-action-invoice",
    severity: "medium",
    category: "self_action",
    title: "Missing Self-Action Prevention on Invoice Approval",
    description: "Billing Readiness approval has explicit self-action prevention (br.created_by === userId → rejected on backend). Invoice approval does NOT have this check — the person who created the invoice (or triggered its auto-generation) could also approve it. This is a separation-of-duties gap.",
    affectedModules: ["invoices"],
    affectedRoles: [2],
    recommendation: "Add self-action prevention to the invoice approve endpoint similar to billing readiness.",
  },
  {
    id: "gap-planning-self-action-frontend-only",
    severity: "low",
    category: "frontend_only",
    title: "Planning Control Self-Action Prevention — Frontend-Only",
    description: "Planning Control's review and release actions have self-action prevention on the frontend (creator cannot review, creator/reviewer cannot release). These checks are NOT enforced on the backend endpoints. A user with API knowledge could bypass these restrictions.",
    affectedModules: ["planning-control"],
    affectedRoles: [3],
    recommendation: "Add backend checks: review endpoint should reject if req.user.id === record.created_by; release endpoint should reject if req.user.id === record.reviewed_by or record.created_by.",
  },
  {
    id: "gap-recon-amounts-backend",
    severity: "low",
    category: "data_visibility",
    title: "Reconciliation Amounts — Frontend-Only Restriction",
    description: "The Reconciliation tab hides amounts for Employee on the frontend (replaces with 'Restricted' text), but the API endpoint still returns all amount data. An Employee with API knowledge could read amount values from the raw API response.",
    affectedModules: ["execution-control"],
    affectedRoles: [4],
    recommendation: "Add role-based field filtering to the reconciliation API endpoint so amount fields are omitted or nulled for Employee role.",
  },
];

export const ROLE_LABELS: Record<number, string> = {
  0: "Superuser",
  1: "General Manager",
  2: "Senior Manager",
  3: "Manager",
  4: "Employee",
};

export const ROLE_LEVELS = [0, 1, 2, 3, 4] as const;

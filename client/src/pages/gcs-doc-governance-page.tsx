import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, Database, List, Plus, Eye, EyeOff, ChevronRight,
  AlertTriangle, CheckCircle, HelpCircle, RefreshCw, Info,
  Edit2, X, ChevronDown, ChevronUp, FileText, Settings, Key, Activity,
  Ticket, Copy, Clock, Check, Zap, Lock, GitBranch, History,
  ShieldCheck, AlertCircle, ArrowUpDown,
} from "lucide-react";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { fmtDateTime } from "@/lib/date-format";

// ─── Types ─────────────────────────────────────────────────────────────────

interface GcsGovernanceRule {
  id: number;
  moduleKey: string;
  submoduleKey: string | null;
  documentType: string;
  displayName: string;
  rootPrefix: string;
  pathTemplate: string;
  revisionMode: string;
  allowedTokens: string[] | null;
  requiredTokens: string[] | null;
  maxFileSizeMb: number | null;
  allowedMimeTypes: string[] | null;
  active: boolean;
  notes: string | null;
  governanceMode: string;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  routingDeprecatedAt: string | null;
}

interface PerRuleTokenData {
  tokens: IssuedToken[];
  stats: { total: number; live: number; used: number; expired: number };
}

interface PerRuleMonitorData {
  logs: MonitorLogEntry[];
  stats: { total: number; conforming: number; violations: number };
}

interface GcsRuleVersion {
  id: number;
  ruleId: number;
  versionNumber: number;
  pathTemplate: string;
  revisionMode: string;
  rootPrefix: string;
  displayName: string;
  notes: string | null;
  status: string;
  createdBy: number | null;
  createdAt: string;
  approvedBy: number | null;
  approvedAt: string | null;
  activatedBy: number | null;
  activatedAt: string | null;
  supersededAt: string | null;
  validationEvidence: {
    overall: 'PASS' | 'FAIL';
    checks: { checkName: string; passed: boolean; detail: string; highImpact?: boolean }[];
    ranAt: string;
    syntheticExamples?: string[];
  } | null;
  diffFromPrev: Record<string, unknown> | null;
}

interface MigrationLogEntry {
  id: number;
  ruleId: number;
  routeFile: string;
  routeFunction: string | null;
  oldMethod: string;
  migrationPhase: string;
  migratedAt: string | null;
  migratedBy: number | null;
  status: string;
  notes: string | null;
}

interface GcsGovernanceToken {
  id: number;
  tokenName: string;
  description: string;
  exampleValue: string;
  sourceDescription: string;
  active: boolean;
  createdAt: string;
}

interface MonitorLogEntry {
  id: number;
  detectedAt: string;
  matchedRuleId: number | null;
  moduleKey: string | null;
  documentType: string | null;
  detectedGcsPath: string;
  pathConforms: boolean | null;
  violationReason: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  uploadedBy: number | null;
  routeFile: string | null;
}

interface MonitorStats {
  total: number;
  conforming: number;
  violations: number;
  unmatched: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<string, string> = {
  epc: "EPC", dvs: "DVS", qms: "QMS", design: "Design", hr: "HR / Admin",
  legal: "Legal", finance: "Finance", sales: "Sales", sap: "SAP", legacy: "Legacy",
};

const MODULE_COLORS: Record<string, string> = {
  epc: "bg-blue-100 text-blue-800",
  dvs: "bg-purple-100 text-purple-800",
  qms: "bg-green-100 text-green-800",
  design: "bg-orange-100 text-orange-800",
  hr: "bg-pink-100 text-pink-800",
  legal: "bg-indigo-100 text-indigo-800",
  finance: "bg-red-100 text-red-800",
  sales: "bg-yellow-100 text-yellow-800",
  sap: "bg-teal-100 text-teal-800",
  legacy: "bg-gray-100 text-gray-700",
};

const REVISION_MODES = ["none", "numeric", "alphabetic"];

const SLUG_RE = /^[a-z0-9_]+$/;
function toSlug(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, '_');
  // NOTE: no silent stripping — isSlugSafe validation will surface hyphens, dots, slashes etc. as errors
}
function isSlugSafe(v: string): boolean {
  return SLUG_RE.test(v);
}

function ModuleBadge({ module }: { module: string }) {
  const cls = MODULE_COLORS[module] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {MODULE_LABELS[module] ?? module.toUpperCase()}
    </span>
  );
}

function ConformsBadge({ conforms, ruleMatched }: { conforms: boolean | null; ruleMatched: boolean }) {
  if (!ruleMatched) return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
      <HelpCircle className="w-3 h-3" /> No rule
    </span>
  );
  if (conforms === true) return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
      <CheckCircle className="w-3 h-3" /> Conforms
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
      <AlertTriangle className="w-3 h-3" /> Violation
    </span>
  );
}

// ─── Path Preview ──────────────────────────────────────────────────────────

function PathPreviewPanel({ template }: { template: string }) {
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ resolved: string; unresolvedTokens: string[] } | null>(null);
  const { toast } = useToast();

  const tokens = template.match(/\{(\w+)\}/g)?.map(t => t.slice(1, -1)) ?? [];
  const uniqueTokens = [...new Set(tokens)];

  // Fetch token registry to seed example values
  const { data: registryTokens = [] } = useQuery<GcsGovernanceToken[]>({
    queryKey: ["/api/gcs-governance/tokens"],
  });

  // Auto-populate fields with example values from registry when template changes
  useEffect(() => {
    if (registryTokens.length === 0 || uniqueTokens.length === 0) return;
    const seeded: Record<string, string> = {};
    uniqueTokens.forEach(tok => {
      const entry = registryTokens.find(r => r.tokenName === tok);
      seeded[tok] = entry?.exampleValue ?? "";
    });
    setTokenValues(seeded);
    setPreview(null);
  }, [template, registryTokens.length]);

  const handlePreview = async (vals?: Record<string, string>) => {
    try {
      const result = await apiRequest("POST", "/api/gcs-governance/rules/preview", {
        pathTemplate: template,
        tokens: vals ?? tokenValues,
      });
      setPreview(result);
    } catch {
      toast({ title: "Preview failed", variant: "destructive" });
    }
  };

  // Auto-generate preview once example values are seeded
  useEffect(() => {
    if (Object.keys(tokenValues).length > 0 && uniqueTokens.length > 0) {
      handlePreview(tokenValues);
    }
  }, [tokenValues]);

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-slate-50">
      <p className="text-xs font-semibold text-slate-600 flex items-center gap-1">
        <Eye className="w-3.5 h-3.5" /> Live Path Preview
      </p>
      {uniqueTokens.length === 0 ? (
        <p className="text-xs text-slate-400">No tokens detected in template.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {uniqueTokens.map(token => (
            <div key={token}>
              <Label className="text-xs text-slate-500">{token}</Label>
              <Input
                className="h-7 text-xs"
                placeholder={`value for ${token}`}
                value={tokenValues[token] ?? ""}
                onChange={e => setTokenValues(prev => ({ ...prev, [token]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}
      <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => handlePreview()}>
        Refresh Preview
      </Button>
      {preview && (
        <div className="space-y-1">
          <p className="text-xs font-mono bg-white border rounded p-2 break-all text-slate-800">
            {preview.resolved}
          </p>
          {preview.unresolvedTokens.length > 0 && (
            <p className="text-[11px] text-amber-600">
              Unresolved: {preview.unresolvedTokens.map(t => `{${t}}`).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Rule Form (slide-over) ────────────────────────────────────────────────

interface RuleFormProps {
  open: boolean;
  onClose: () => void;
  initial?: GcsGovernanceRule | null;
  existingRules: GcsGovernanceRule[];
}

const BLANK_FORM: Partial<GcsGovernanceRule> = {
  moduleKey: "", submoduleKey: "", documentType: "", displayName: "",
  rootPrefix: "", pathTemplate: "", revisionMode: "none",
  maxFileSizeMb: undefined, notes: "", active: true,
};

function RuleForm({ open, onClose, initial, existingRules }: RuleFormProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!initial;

  const [form, setForm] = useState<Partial<GcsGovernanceRule>>(initial ?? BLANK_FORM);
  const [moduleKeyInputMode, setModuleKeyInputMode] = useState(false);
  const [submoduleKeyInputMode, setSubmoduleKeyInputMode] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(initial ?? BLANK_FORM);
      setModuleKeyInputMode(false);
      setSubmoduleKeyInputMode(false);
      setErrors({});
    }
  }, [open]);

  const handleChange = useCallback((field: string, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value })), []);

  // DB-driven module list (canonical + DB values merged)
  const { data: moduleMeta } = useQuery<{ modules: string[] }>({
    queryKey: ["/api/gcs-governance/rules/meta/modules"],
    enabled: open,
  });
  const modules = moduleMeta?.modules ?? [];

  // Dependent submodule list for the selected module (add mode only)
  const selectedModule = form.moduleKey ?? "";
  const { data: submoduleMeta } = useQuery<{ submodules: string[] }>({
    queryKey: [`/api/gcs-governance/rules/meta/submodules?moduleKey=${encodeURIComponent(selectedModule)}`],
    enabled: open && !!selectedModule && !isEdit,
  });
  const existingSubmodules = submoduleMeta?.submodules ?? [];

  // Live duplicate detection — (moduleKey + submoduleKey + documentType) must be unique
  const normalizedDocType = (form.documentType ?? "").trim().toUpperCase();
  const duplicateRule = existingRules.find(r => {
    if (isEdit && r.id === initial?.id) return false;
    return (
      r.moduleKey === (form.moduleKey ?? "") &&
      (r.submoduleKey ?? "") === (form.submoduleKey ?? "") &&
      r.documentType === normalizedDocType
    );
  });

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const mk = form.moduleKey ?? "";
    const sk = form.submoduleKey ?? "";
    if (!mk) errs.moduleKey = "Module key is required.";
    else if (!isSlugSafe(mk)) errs.moduleKey = "Must be slug-safe: lowercase letters, digits, underscores only (e.g. qms, test_procedures).";
    if (sk && !isSlugSafe(sk)) errs.submoduleKey = "Must be slug-safe: lowercase letters, digits, underscores only (e.g. pma, wpqr).";
    if (!normalizedDocType) errs.documentType = "Document type is required.";
    if (!form.displayName?.trim()) errs.displayName = "Display name is required.";
    if (!form.rootPrefix?.trim()) errs.rootPrefix = "Root prefix is required.";
    if (!form.pathTemplate?.trim()) errs.pathTemplate = "Path template is required.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const mutation = useMutation({
    mutationFn: (data: typeof form) => {
      const normalized = {
        ...data,
        moduleKey: toSlug(data.moduleKey ?? ""),
        submoduleKey: data.submoduleKey ? toSlug(data.submoduleKey) : "",
        documentType: (data.documentType ?? "").trim().toUpperCase(),
        displayName: data.displayName?.trim(),
        rootPrefix: data.rootPrefix?.trim(),
        pathTemplate: data.pathTemplate?.trim(),
      };
      return isEdit
        ? apiRequest("PATCH", `/api/gcs-governance/rules/${initial!.id}`, normalized)
        : apiRequest("POST", "/api/gcs-governance/rules", normalized);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/gcs-governance/rules"] });
      qc.invalidateQueries({ queryKey: ["/api/gcs-governance/rules/meta/modules"] });
      qc.invalidateQueries({ queryKey: ["/api/gcs-governance/rules/meta/submodules"] });
      toast({ title: isEdit ? "Rule updated" : "Rule created" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!validate()) return;
    mutation.mutate(form);
  };

  // ── Module Key field ────────────────────────────────────────────────────────
  const renderModuleKey = () => {
    if (isEdit) {
      return (
        <div>
          <Label className="text-xs flex items-center gap-1 text-slate-500">
            <Lock className="w-3 h-3" /> Module Key
          </Label>
          <div className="h-8 px-3 mt-1 flex items-center bg-slate-50 border rounded text-xs font-mono text-slate-700">
            {initial?.moduleKey}
          </div>
          <p className="text-[11px] text-amber-600 mt-1 flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            Permanent governance identifier — cannot be changed after creation.
          </p>
        </div>
      );
    }
    if (moduleKeyInputMode) {
      return (
        <div>
          <Label className="text-xs">Module Key *</Label>
          <div className="flex gap-1 mt-1">
            <Input
              className={`h-8 text-xs font-mono flex-1 ${errors.moduleKey ? "border-red-400" : ""}`}
              value={form.moduleKey ?? ""}
              onChange={e => handleChange("moduleKey", toSlug(e.target.value))}
              placeholder="e.g. my_module"
              autoFocus
            />
            <Button size="sm" variant="ghost" className="h-8 text-xs px-2 shrink-0"
              onClick={() => { setModuleKeyInputMode(false); handleChange("moduleKey", ""); handleChange("submoduleKey", ""); setSubmoduleKeyInputMode(false); }}>
              ← Back
            </Button>
          </div>
          {errors.moduleKey && <p className="text-[11px] text-red-500 mt-1">{errors.moduleKey}</p>}
          <p className="text-[11px] text-slate-400 mt-1">Slug-safe only. Auto-normalized as you type.</p>
        </div>
      );
    }
    return (
      <div>
        <Label className="text-xs">Module Key *</Label>
        <Select
          value={form.moduleKey ?? ""}
          onValueChange={v => {
            if (v === "__new__") {
              setModuleKeyInputMode(true);
              setForm(prev => ({ ...prev, moduleKey: "", submoduleKey: "" }));
              setSubmoduleKeyInputMode(false);
            } else {
              setForm(prev => ({ ...prev, moduleKey: v, submoduleKey: "" }));
              setSubmoduleKeyInputMode(false);
            }
          }}
        >
          <SelectTrigger className={`h-8 text-xs mt-1 font-mono ${errors.moduleKey ? "border-red-400" : ""}`}>
            <SelectValue placeholder="Select module key" />
          </SelectTrigger>
          <SelectContent>
            {modules.map(m => (
              <SelectItem key={m} value={m} className="text-xs font-mono">{m}</SelectItem>
            ))}
            <SelectItem value="__new__" className="text-xs text-blue-600">— Enter new module key…</SelectItem>
          </SelectContent>
        </Select>
        {errors.moduleKey && <p className="text-[11px] text-red-500 mt-1">{errors.moduleKey}</p>}
        <p className="text-[11px] text-slate-400 mt-1">Major governance domain. Permanent once saved.</p>
      </div>
    );
  };

  // ── Submodule Key field ─────────────────────────────────────────────────────
  const renderSubmoduleKey = () => {
    if (isEdit) {
      return (
        <div>
          <Label className="text-xs flex items-center gap-1 text-slate-500">
            <Lock className="w-3 h-3" /> Submodule Key
          </Label>
          <div className="h-8 px-3 mt-1 flex items-center bg-slate-50 border rounded text-xs font-mono text-slate-700">
            {initial?.submoduleKey || <span className="italic text-slate-400">none</span>}
          </div>
          <p className="text-[11px] text-amber-600 mt-1 flex items-start gap-1">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            Permanent governance identifier — cannot be changed after creation.
          </p>
        </div>
      );
    }
    const disabled = !form.moduleKey;
    if (submoduleKeyInputMode) {
      return (
        <div>
          <Label className="text-xs">Submodule Key</Label>
          <div className="flex gap-1 mt-1">
            <Input
              className={`h-8 text-xs font-mono flex-1 ${errors.submoduleKey ? "border-red-400" : ""}`}
              value={form.submoduleKey ?? ""}
              onChange={e => handleChange("submoduleKey", toSlug(e.target.value))}
              placeholder="e.g. test_procedures"
              autoFocus
            />
            <Button size="sm" variant="ghost" className="h-8 text-xs px-2 shrink-0"
              onClick={() => { setSubmoduleKeyInputMode(false); handleChange("submoduleKey", ""); }}>
              ← Back
            </Button>
          </div>
          {errors.submoduleKey && <p className="text-[11px] text-red-500 mt-1">{errors.submoduleKey}</p>}
          <p className="text-[11px] text-slate-400 mt-1">Slug-safe only. Permanent once saved.</p>
        </div>
      );
    }
    return (
      <div>
        <Label className="text-xs">Submodule Key</Label>
        <Select
          value={form.submoduleKey || "__none__"}
          onValueChange={v => {
            if (v === "__new__") { setSubmoduleKeyInputMode(true); handleChange("submoduleKey", ""); }
            else if (v === "__none__") handleChange("submoduleKey", "");
            else handleChange("submoduleKey", v);
          }}
          disabled={disabled}
        >
          <SelectTrigger className={`h-8 text-xs mt-1 font-mono ${errors.submoduleKey ? "border-red-400" : ""}`}>
            <SelectValue placeholder={disabled ? "Select module key first" : "Select or enter submodule"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs text-slate-400">— None (no submodule) —</SelectItem>
            {existingSubmodules.map(s => (
              <SelectItem key={s} value={s} className="text-xs font-mono">{s}</SelectItem>
            ))}
            <SelectItem value="__new__" className="text-xs text-blue-600">— Enter new submodule key…</SelectItem>
          </SelectContent>
        </Select>
        {errors.submoduleKey && <p className="text-[11px] text-red-500 mt-1">{errors.submoduleKey}</p>}
        <p className="text-[11px] text-slate-400 mt-1">Optional subdivision within the module. Permanent once saved.</p>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-[520px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{isEdit ? "Edit Governance Rule" : "Add Governance Rule"}</SheetTitle>
          <SheetDescription>Define a path template for a module's document type.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          {/* Internal governance keys */}
          <div className="grid grid-cols-2 gap-3">
            {renderModuleKey()}
            {renderSubmoduleKey()}
          </div>

          {/* Document Type + Display Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Document Type *</Label>
              <Input
                className={`h-8 text-xs font-mono mt-1 ${errors.documentType ? "border-red-400" : ""}`}
                value={form.documentType ?? ""}
                onChange={e => handleChange("documentType", e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                placeholder="e.g. TEST_PROCEDURE"
              />
              {errors.documentType && <p className="text-[11px] text-red-500 mt-1">{errors.documentType}</p>}
              <p className="text-[11px] text-slate-400 mt-1">Uppercase. Auto-normalized.</p>
            </div>
            <div>
              <Label className="text-xs">Display Name *</Label>
              <Input
                className={`h-8 text-xs mt-1 ${errors.displayName ? "border-red-400" : ""}`}
                value={form.displayName ?? ""}
                onChange={e => handleChange("displayName", e.target.value)}
                placeholder="Human-readable name"
              />
              {errors.displayName && <p className="text-[11px] text-red-500 mt-1">{errors.displayName}</p>}
            </div>
          </div>

          {/* Duplicate warning — live as user types */}
          {duplicateRule && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
              <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-xs text-red-700">
                Rule #{duplicateRule.id} ("{duplicateRule.displayName}") already uses this module / submodule / document type combination. Edit that rule instead.
              </p>
            </div>
          )}

          <div>
            <Label className="text-xs">Root Prefix *</Label>
            <Input
              className={`h-8 text-xs font-mono mt-1 ${errors.rootPrefix ? "border-red-400" : ""}`}
              value={form.rootPrefix ?? ""}
              onChange={e => handleChange("rootPrefix", e.target.value)}
              placeholder="e.g. TPEL or QMS"
            />
            {errors.rootPrefix && <p className="text-[11px] text-red-500 mt-1">{errors.rootPrefix}</p>}
          </div>

          <div>
            <Label className="text-xs">Path Template *</Label>
            <Textarea
              className={`text-xs font-mono resize-none mt-1 ${errors.pathTemplate ? "border-red-400" : ""}`}
              rows={3}
              value={form.pathTemplate ?? ""}
              onChange={e => handleChange("pathTemplate", e.target.value)}
              placeholder="TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{DocType}/rev-{rev}/{Seq}-{Label}.{ext}"
            />
            {errors.pathTemplate && <p className="text-[11px] text-red-500 mt-1">{errors.pathTemplate}</p>}
            <p className="text-[11px] text-slate-400 mt-1">Use {"{TOKEN}"} for variable segments. Tokens are auto-detected from the template.</p>
          </div>

          {form.pathTemplate && <PathPreviewPanel template={form.pathTemplate} />}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Revision Mode</Label>
              <Select value={form.revisionMode ?? "none"} onValueChange={v => handleChange("revisionMode", v)}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REVISION_MODES.map(m => <SelectItem key={m} value={m} className="text-xs capitalize">{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Max File Size (MB)</Label>
              <Input className="h-8 text-xs mt-1" type="number" value={form.maxFileSizeMb ?? ""} onChange={e => handleChange("maxFileSizeMb", e.target.value ? parseInt(e.target.value) : null)} placeholder="No limit" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea className="text-xs resize-none mt-1" rows={2} value={form.notes ?? ""} onChange={e => handleChange("notes", e.target.value)} placeholder="Migration status, source route file, etc." />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={form.active ?? true} onCheckedChange={v => handleChange("active", v)} id="active-switch" />
            <Label htmlFor="active-switch" className="text-xs">Active</Label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              disabled={mutation.isPending || !!duplicateRule}
              onClick={handleSubmit}
            >
              {mutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Create Rule"}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Token Form (slide-over) ───────────────────────────────────────────────

const BLANK_TOKEN: Partial<GcsGovernanceToken> = {
  tokenName: "", description: "", exampleValue: "", sourceDescription: "", active: true,
};

function TokenForm({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: GcsGovernanceToken | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!initial;

  const [form, setForm] = useState<Partial<GcsGovernanceToken>>(initial ?? BLANK_TOKEN);

  useEffect(() => {
    if (open) setForm(initial ?? BLANK_TOKEN);
  }, [open]);

  const mutation = useMutation({
    mutationFn: (data: typeof form) => isEdit
      ? apiRequest("PATCH", `/api/gcs-governance/tokens/${initial!.id}`, data)
      : apiRequest("POST", "/api/gcs-governance/tokens", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/gcs-governance/tokens"] });
      toast({ title: isEdit ? "Token updated" : "Token registered" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const set = (field: string, value: unknown) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-[420px]">
        <SheetHeader className="mb-4">
          <SheetTitle>{isEdit ? "Edit Token" : "Register Token"}</SheetTitle>
          <SheetDescription>Path token used in governance rule templates.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Token Name *</Label>
            <Input className="h-8 text-xs font-mono" value={form.tokenName ?? ""} onChange={e => set("tokenName", e.target.value)} placeholder="e.g. CC" disabled={isEdit} />
            <p className="text-[11px] text-slate-400 mt-1">Used as {"{TokenName}"} in path templates.</p>
          </div>
          <div>
            <Label className="text-xs">Description *</Label>
            <Input className="h-8 text-xs" value={form.description ?? ""} onChange={e => set("description", e.target.value)} placeholder="Human-readable description" />
          </div>
          <div>
            <Label className="text-xs">Example Value *</Label>
            <Input className="h-8 text-xs font-mono" value={form.exampleValue ?? ""} onChange={e => set("exampleValue", e.target.value)} placeholder="e.g. EPC" />
          </div>
          <div>
            <Label className="text-xs">Source Description *</Label>
            <Textarea className="text-xs resize-none" rows={2} value={form.sourceDescription ?? ""} onChange={e => set("sourceDescription", e.target.value)} placeholder="Where is this value populated from at runtime?" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.active ?? true} onCheckedChange={v => set("active", v)} id="tok-active" />
            <Label htmlFor="tok-active" className="text-xs">Active</Label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" disabled={mutation.isPending} onClick={() => mutation.mutate(form)}>
              {mutation.isPending ? "Saving…" : isEdit ? "Save" : "Register"}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Version Status Badge ──────────────────────────────────────────────────

const VERSION_STATUS_STYLES: Record<string, string> = {
  draft:            'bg-slate-100 text-slate-600 border-slate-200',
  pending_approval: 'bg-amber-100 text-amber-700 border-amber-300',
  approved:         'bg-blue-100 text-blue-700 border-blue-300',
  active:           'bg-green-100 text-green-700 border-green-300',
  superseded:       'bg-gray-100 text-gray-500 border-gray-200',
  retired:          'bg-red-50 text-red-400 border-red-200',
};

function VersionStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${VERSION_STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status === 'active' && <Zap className="w-2.5 h-2.5" />}
      {status === 'approved' && <ShieldCheck className="w-2.5 h-2.5" />}
      {status === 'pending_approval' && <Clock className="w-2.5 h-2.5" />}
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── ZeroTrust Validation Evidence Panel ──────────────────────────────────

function ValidationEvidencePanel({ evidence }: { evidence: GcsRuleVersion['validationEvidence'] }) {
  if (!evidence) return null;
  return (
    <div className={`rounded-lg border p-3 mt-2 ${evidence.overall === 'PASS' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-center gap-2 mb-2">
        {evidence.overall === 'PASS'
          ? <CheckCircle className="w-4 h-4 text-green-600" />
          : <AlertCircle className="w-4 h-4 text-red-600" />
        }
        <span className={`text-xs font-bold ${evidence.overall === 'PASS' ? 'text-green-700' : 'text-red-700'}`}>
          Zero-Trust Validation: {evidence.overall}
        </span>
        <span className="text-[10px] text-slate-400 ml-auto">{evidence.ranAt ? fmtDateTime(evidence.ranAt) : ''}</span>
      </div>
      <div className="space-y-1">
        {evidence.checks.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            {c.passed
              ? <Check className="w-3 h-3 text-green-600 mt-0.5 shrink-0" />
              : <X className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <span className={`text-[10px] font-mono font-medium ${c.passed ? 'text-slate-600' : 'text-red-700'}`}>{c.checkName}</span>
              {c.highImpact && <span className="ml-1 text-[10px] font-bold text-amber-600">HIGH_IMPACT</span>}
              <p className={`text-[10px] mt-0.5 break-words ${c.passed ? 'text-slate-500' : 'text-red-600'}`}>{c.detail}</p>
            </div>
          </div>
        ))}
      </div>
      {evidence.syntheticExamples && evidence.syntheticExamples.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-200">
          <p className="text-[10px] font-medium text-slate-500 mb-1">Synthetic examples:</p>
          {evidence.syntheticExamples.slice(0, 2).map((p, i) => (
            <p key={i} className="text-[10px] font-mono text-slate-600 break-all">{p}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Rule Version Form (Sheet) ─────────────────────────────────────────────

function RuleVersionForm({ open, onClose, rule }: {
  open: boolean; onClose: () => void; rule: GcsGovernanceRule;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: versions = [] } = useQuery<GcsRuleVersion[]>({
    queryKey: ['/api/gcs-governance/rules', rule.id, 'versions'],
    queryFn: () => apiRequest('GET', `/api/gcs-governance/rules/${rule.id}/versions`),
    enabled: open,
  });

  const activeVersion = versions.find(v => v.status === 'active');

  const [form, setForm] = useState({
    pathTemplate: activeVersion?.pathTemplate ?? rule.pathTemplate,
    revisionMode: activeVersion?.revisionMode ?? rule.revisionMode,
    rootPrefix:   activeVersion?.rootPrefix   ?? rule.rootPrefix,
    displayName:  rule.displayName,
    notes: '',
  });

  useEffect(() => {
    if (open) {
      const av = versions.find(v => v.status === 'active');
      setForm({
        pathTemplate: av?.pathTemplate ?? rule.pathTemplate,
        revisionMode: av?.revisionMode ?? rule.revisionMode,
        rootPrefix:   av?.rootPrefix   ?? rule.rootPrefix,
        displayName:  rule.displayName,
        notes: '',
      });
    }
  }, [open, versions]);

  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest('POST', `/api/gcs-governance/rules/${rule.id}/versions`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/gcs-governance/rules', rule.id, 'versions'] });
      toast({ title: 'Draft version created' });
      onClose();
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const templateChanged = form.pathTemplate !== (activeVersion?.pathTemplate ?? rule.pathTemplate);
  const rootChanged = form.rootPrefix !== (activeVersion?.rootPrefix ?? rule.rootPrefix);

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-[480px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-indigo-600" /> Create New Version Draft
          </SheetTitle>
          <SheetDescription>
            Rule #{rule.id} · {rule.moduleKey}/{rule.documentType}. New versions start as drafts and must pass Zero-Trust validation before activation.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4">
          {activeVersion && (
            <div className="bg-slate-50 border rounded-lg p-3 text-[11px]">
              <p className="font-medium text-slate-600 mb-1">Current active: v{activeVersion.versionNumber}</p>
              <p className="font-mono text-slate-500 break-all">{activeVersion.pathTemplate}</p>
            </div>
          )}

          <div>
            <Label className="text-xs">Path Template *</Label>
            <Textarea
              className={`text-xs font-mono resize-none mt-1 ${templateChanged ? 'border-indigo-400 bg-indigo-50/30' : ''}`}
              rows={3}
              value={form.pathTemplate}
              onChange={e => setForm(p => ({ ...p, pathTemplate: e.target.value }))}
              placeholder="TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/..."
            />
            {templateChanged && <p className="text-[10px] text-indigo-600 mt-1">Changed from current active version</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Root Prefix *</Label>
              <Input className={`h-8 text-xs font-mono mt-1 ${rootChanged ? 'border-amber-400' : ''}`}
                value={form.rootPrefix}
                onChange={e => setForm(p => ({ ...p, rootPrefix: e.target.value }))}
              />
              {rootChanged && <p className="text-[10px] text-amber-600 mt-1">⚠ Root changed — high impact</p>}
            </div>
            <div>
              <Label className="text-xs">Revision Mode</Label>
              <Select value={form.revisionMode} onValueChange={v => setForm(p => ({ ...p, revisionMode: v }))}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['none', 'numeric', 'alphabetic'].map(m => <SelectItem key={m} value={m} className="text-xs capitalize">{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Change Notes *</Label>
            <Textarea className="text-xs resize-none mt-1" rows={2}
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Describe what changed and why (required for audit trail)"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button className="flex-1" disabled={mutation.isPending || !form.pathTemplate || !form.notes.trim()}
              onClick={() => mutation.mutate(form)}>
              {mutation.isPending ? 'Creating…' : 'Create Draft'}
            </Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Rule Version Panel (expandable per-rule card section) ─────────────────

function RuleVersionPanel({ rule, forceExpanded = false }: { rule: GcsGovernanceRule; forceExpanded?: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(forceExpanded);
  const [showNewVersionForm, setShowNewVersionForm] = useState(false);
  const [confirmState, setConfirmState] = useState<{ action: string; versionId: number; input: string } | null>(null);
  const [showEvidence, setShowEvidence] = useState<number | null>(null);

  const { data: versions = [], isLoading } = useQuery<GcsRuleVersion[]>({
    queryKey: ['/api/gcs-governance/rules', rule.id, 'versions'],
    queryFn: () => apiRequest('GET', `/api/gcs-governance/rules/${rule.id}/versions`),
    enabled: expanded,
  });

  const activeVersion = versions.find(v => v.status === 'active');
  const pendingCount = versions.filter(v => ['draft', 'pending_approval', 'approved'].includes(v.status)).length;

  const [dryRunState, setDryRunState] = useState<{ versionId: number; result: any } | null>(null);
  const [freezeError, setFreezeError] = useState<{ versionId: number; message: string; latestExpiry: string | null } | null>(null);

  const dryRunMutation = useMutation({
    mutationFn: (versionId: number) =>
      apiRequest('POST', `/api/gcs-governance/rules/${rule.id}/versions/${versionId}/activate`, { dryRun: true }),
    onSuccess: (result: any, versionId) => {
      setDryRunState({ versionId, result });
      qc.invalidateQueries({ queryKey: ['/api/gcs-governance/rules', rule.id, 'versions'] });
      if (result.overallDryRun === 'PASS') {
        toast({ title: `Dry-run PASS — ${result.sampleCount} sample(s) validated (${result.sampleSource})` });
      } else {
        toast({ title: 'Dry-run FAIL', description: result.failureReason ?? 'See results below', variant: 'destructive' });
      }
    },
    onError: (err: any) => toast({ title: 'Dry-run error', description: err.message, variant: 'destructive' }),
  });

  const lifecycleMutation = useMutation({
    mutationFn: ({ versionId, action, body }: { versionId: number; action: string; body?: Record<string, unknown> }) =>
      apiRequest('POST', `/api/gcs-governance/rules/${rule.id}/versions/${versionId}/${action}`, body ?? {}),
    onSuccess: (_, { action }) => {
      qc.invalidateQueries({ queryKey: ['/api/gcs-governance/rules', rule.id, 'versions'] });
      qc.invalidateQueries({ queryKey: ['/api/gcs-governance/rules'] });
      setConfirmState(null);
      setDryRunState(null);
      setFreezeError(null);
      toast({ title: `Version ${action.replace(/_/g, ' ')} successful` });
    },
    onError: (err: any) => {
      const body = (err as any)?.responseBody ?? {};
      if (body?.error === 'ACTIVATION_FREEZE' || body?.error === 'ROLLBACK_FREEZE') {
        setFreezeError({
          versionId: (err as any)._versionId ?? 0,
          message: body.message ?? 'Live tokens exist — wait for expiry',
          latestExpiry: body.latestExpiry ?? null,
        });
        setConfirmState(null);
      }
      toast({ title: 'Error', description: body.message ?? err.message, variant: 'destructive' });
    },
  });

  const retireMutation = useMutation({
    mutationFn: (versionId: number) =>
      apiRequest('POST', `/api/gcs-governance/rules/${rule.id}/versions/${versionId}/retire`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/gcs-governance/rules', rule.id, 'versions'] });
      toast({ title: 'Version retired' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const handleConfirmedAction = (action: string, versionId: number, input: string) => {
    const expected = action === 'activate' ? 'ACTIVATE' : 'ROLLBACK';
    if (input !== expected) {
      toast({ title: `Type "${expected}" exactly to confirm`, variant: 'destructive' });
      return;
    }
    if (action === 'activate') {
      lifecycleMutation.mutate({ versionId, action, body: { dryRun: false, confirmation: 'ACTIVATE' } });
    } else {
      lifecycleMutation.mutate({ versionId, action, body: { confirmation: 'ROLLBACK' } });
    }
  };

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <button
        className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700 select-none w-full"
        onClick={() => setExpanded(v => !v)}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <GitBranch className="w-3 h-3" />
        <span>Version History</span>
        {activeVersion && (
          <span className="ml-1 font-mono text-[10px] text-green-700 bg-green-100 px-1 rounded">v{activeVersion.versionNumber} active</span>
        )}
        {pendingCount > 0 && (
          <span className="ml-1 text-[10px] text-amber-600 bg-amber-100 px-1 rounded">{pendingCount} pending</span>
        )}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {isLoading && <p className="text-[11px] text-slate-400">Loading versions…</p>}

          {!isLoading && versions.length === 0 && (
            <p className="text-[11px] text-slate-400">No versions yet. Create a v1 via seed or the button below.</p>
          )}

          {versions.map(ver => (
            <div key={ver.id} className={`rounded-lg border p-2 ${ver.status === 'active' ? 'border-green-200 bg-green-50/30' : ver.status === 'pending_approval' ? 'border-amber-200 bg-amber-50/20' : 'bg-slate-50/50 border-slate-100'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-slate-700">v{ver.versionNumber}</span>
                <VersionStatusBadge status={ver.status} />
                <span className="text-[10px] text-slate-400 ml-auto">{fmtDateTime(ver.createdAt)}</span>
              </div>

              <p className="text-[10px] font-mono text-slate-500 break-all mt-1">{ver.pathTemplate}</p>

              {ver.notes && (
                <p className="text-[10px] text-slate-500 mt-1 italic">{ver.notes.replace(/^v1: Phase 0 bootstrap from rule definition\. ?/, '').trim() || ver.notes}</p>
              )}

              {/* Evidence toggle */}
              {ver.validationEvidence && (
                <button className="text-[10px] text-blue-600 hover:underline mt-1" onClick={() => setShowEvidence(showEvidence === ver.id ? null : ver.id)}>
                  {showEvidence === ver.id ? 'Hide' : 'Show'} validation evidence ({ver.validationEvidence.overall})
                </button>
              )}
              {showEvidence === ver.id && <ValidationEvidencePanel evidence={ver.validationEvidence} />}

              {/* Confirm input (ACTIVATE/ROLLBACK) */}
              {confirmState?.versionId === ver.id && (
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    className="h-7 text-xs font-mono w-32"
                    placeholder={confirmState.action === 'activate' ? 'ACTIVATE' : 'ROLLBACK'}
                    value={confirmState.input}
                    onChange={e => setConfirmState(s => s ? { ...s, input: e.target.value } : s)}
                  />
                  <Button size="sm" className="h-7 text-[11px]"
                    disabled={lifecycleMutation.isPending}
                    onClick={() => handleConfirmedAction(confirmState.action, confirmState.versionId, confirmState.input)}>
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setConfirmState(null)}>Cancel</Button>
                </div>
              )}

              {/* Freeze error banner */}
              {freezeError?.versionId === ver.id && (
                <div className="mt-2 rounded border border-orange-300 bg-orange-50 p-2 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-orange-600 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-orange-700">Activation Blocked — Live Tokens</p>
                    <p className="text-[10px] text-orange-600 mt-0.5">{freezeError.message}</p>
                    {freezeError.latestExpiry && (
                      <p className="text-[10px] text-orange-500 mt-0.5">Retry after: {fmtDateTime(freezeError.latestExpiry)}</p>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 shrink-0"
                    onClick={() => setFreezeError(null)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}

              {/* Dry-run result panel */}
              {dryRunState?.versionId === ver.id && (
                <div className={`mt-2 rounded border p-2 ${dryRunState.result.overallDryRun === 'PASS' ? 'border-green-200 bg-green-50/40' : 'border-red-200 bg-red-50/40'}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {dryRunState.result.overallDryRun === 'PASS'
                      ? <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                      : <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                    }
                    <span className={`text-[10px] font-bold ${dryRunState.result.overallDryRun === 'PASS' ? 'text-green-700' : 'text-red-700'}`}>
                      Dry-Run: {dryRunState.result.overallDryRun}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-auto">
                      {dryRunState.result.sampleCount} sample{dryRunState.result.sampleCount !== 1 ? 's' : ''} · {dryRunState.result.sampleSource === 'synthetic' ? 'synthetic' : 'real tokens'}
                    </span>
                  </div>
                  {dryRunState.result.results?.slice(0, 3).map((r: any, i: number) => (
                    <div key={i} className="flex items-start gap-1 mt-0.5">
                      {r.assertPassed && !r.pathCollision
                        ? <Check className="w-2.5 h-2.5 text-green-600 mt-0.5 shrink-0" />
                        : <X className="w-2.5 h-2.5 text-red-500 mt-0.5 shrink-0" />
                      }
                      <p className="text-[9px] font-mono text-slate-500 break-all leading-tight">
                        {r.simulatedResolvedPath ?? 'simulation failed'}
                        {r.pathCollision && <span className="text-red-600 ml-1">[COLLISION]</span>}
                        {r.parseError && <span className="text-red-600 ml-1">{r.parseError}</span>}
                      </p>
                    </div>
                  ))}
                  {dryRunState.result.failureReason && (
                    <p className="text-[10px] text-red-600 mt-1">{dryRunState.result.failureReason}</p>
                  )}
                </div>
              )}

              {/* Action buttons per status */}
              <div className="flex gap-1 mt-2 flex-wrap">
                {ver.status === 'draft' && (
                  <>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                      disabled={lifecycleMutation.isPending}
                      onClick={() => lifecycleMutation.mutate({ versionId: ver.id, action: 'submit' })}>
                      Submit for Approval
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-red-500 hover:text-red-700"
                      disabled={retireMutation.isPending}
                      onClick={() => retireMutation.mutate(ver.id)}>
                      Retire
                    </Button>
                  </>
                )}
                {ver.status === 'pending_approval' && (
                  <>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 border-blue-400 text-blue-700"
                      disabled={lifecycleMutation.isPending}
                      onClick={() => lifecycleMutation.mutate({ versionId: ver.id, action: 'approve' })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-red-500 hover:text-red-700"
                      disabled={retireMutation.isPending}
                      onClick={() => retireMutation.mutate(ver.id)}>
                      Retire
                    </Button>
                  </>
                )}
                {ver.status === 'approved' && (() => {
                  const storedDryRun = (ver.validationEvidence as any)?.dry_run;
                  const inSessionDryRun = dryRunState?.versionId === ver.id ? dryRunState.result : null;
                  const effectiveDryRun = inSessionDryRun ?? storedDryRun;
                  const dryRunPassed = effectiveDryRun?.overallDryRun === 'PASS';

                  return (
                    <>
                      {/* Step 1: Run Dry-Run */}
                      <Button size="sm" variant="outline"
                        className={`h-6 text-[10px] px-2 ${dryRunPassed ? 'border-green-400 text-green-700' : 'border-indigo-300 text-indigo-700'}`}
                        disabled={dryRunMutation.isPending || !!confirmState}
                        onClick={() => dryRunMutation.mutate(ver.id)}>
                        {dryRunMutation.isPending && dryRunMutation.variables === ver.id
                          ? 'Running…'
                          : dryRunPassed ? '✓ Dry-Run PASS (re-run)' : 'Run Dry-Run'
                        }
                      </Button>

                      {/* Step 2: Activate (only after dry-run PASS) */}
                      <Button size="sm"
                        className={`h-6 text-[10px] px-2 ${dryRunPassed ? 'bg-green-700 hover:bg-green-800' : 'bg-slate-300 text-slate-400 cursor-not-allowed'}`}
                        disabled={!dryRunPassed || lifecycleMutation.isPending || !!confirmState}
                        title={!dryRunPassed ? 'Run dry-run first — must PASS before activation' : undefined}
                        onClick={() => dryRunPassed && setConfirmState({ action: 'activate', versionId: ver.id, input: '' })}>
                        Activate
                      </Button>

                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2 text-red-500 hover:text-red-700"
                        disabled={retireMutation.isPending}
                        onClick={() => retireMutation.mutate(ver.id)}>
                        Retire
                      </Button>
                    </>
                  );
                })()}
                {ver.status === 'superseded' && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 border-amber-400 text-amber-700"
                    disabled={lifecycleMutation.isPending || !!confirmState}
                    onClick={() => setConfirmState({ action: 'rollback', versionId: ver.id, input: '' })}>
                    Rollback to This
                  </Button>
                )}
              </div>
            </div>
          ))}

          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1 w-full"
            onClick={() => setShowNewVersionForm(true)}>
            <Plus className="w-3 h-3" /> Create New Version Draft
          </Button>
        </div>
      )}

      <RuleVersionForm
        open={showNewVersionForm}
        onClose={() => setShowNewVersionForm(false)}
        rule={rule}
      />
    </div>
  );
}

// ─── Governance State Badge ─────────────────────────────────────────────────

function GovernanceStateBadge({ mode }: { mode: string }) {
  if (mode === 'db_driven') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">
        <Database className="w-3 h-3" /> DB-Driven
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
      <Settings className="w-3 h-3" /> Hardcoded
    </span>
  );
}

// ─── Enable Governance Button (inline confirm) ──────────────────────────────

function EnableGovernanceButton({ rule }: { rule: GcsGovernanceRule }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [input, setInput] = useState('');

  const mutation = useMutation({
    mutationFn: () => apiRequest('PATCH', `/api/gcs-governance/rules/${rule.id}/governance-mode`, { mode: 'db_driven' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/gcs-governance/rules'] });
      setConfirming(false);
      setInput('');
      toast({ title: `DB-Driven governance enabled for "${rule.displayName}"` });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  if (rule.governanceMode === 'db_driven') return null;

  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-[11px] gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50 px-2"
        onClick={() => setConfirming(true)}
      >
        <Database className="w-3 h-3" /> Enable DB-Driven Governance
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap mt-1">
      <span className="text-[11px] text-slate-600">Type <span className="font-mono font-bold">ENABLE</span> to confirm:</span>
      <Input
        className="h-6 text-xs font-mono w-24 px-2"
        placeholder="ENABLE"
        value={input}
        onChange={e => setInput(e.target.value)}
        autoFocus
      />
      <Button
        size="sm"
        className="h-6 text-[11px] px-3 bg-blue-700 hover:bg-blue-800"
        disabled={input !== 'ENABLE' || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Enabling…' : 'Confirm'}
      </Button>
      <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => { setConfirming(false); setInput(''); }}>
        Cancel
      </Button>
    </div>
  );
}

// ─── Governance Details Panel ───────────────────────────────────────────────

function GovernanceDetailsPanel({ rule }: { rule: GcsGovernanceRule }) {
  const [expanded, setExpanded] = useState(false);
  const [section, setSection] = useState<'evidence' | 'tokens' | 'monitor' | 'versions'>('evidence');

  const { data: versions = [] } = useQuery<GcsRuleVersion[]>({
    queryKey: ['/api/gcs-governance/rules', rule.id, 'versions'],
    queryFn: () => apiRequest('GET', `/api/gcs-governance/rules/${rule.id}/versions`),
    enabled: expanded && section === 'evidence',
  });

  const { data: tokenData, isLoading: tokensLoading } = useQuery<PerRuleTokenData>({
    queryKey: ['/api/gcs-governance/rules', rule.id, 'tokens'],
    queryFn: () => apiRequest('GET', `/api/gcs-governance/rules/${rule.id}/tokens`),
    enabled: expanded && section === 'tokens',
  });

  const { data: monitorData, isLoading: monitorLoading } = useQuery<PerRuleMonitorData>({
    queryKey: ['/api/gcs-governance/rules', rule.id, 'monitor-log'],
    queryFn: () => apiRequest('GET', `/api/gcs-governance/rules/${rule.id}/monitor-log`),
    enabled: expanded && section === 'monitor',
  });

  const activeVersion = versions.find(v => v.status === 'active');

  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <button
        className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-700 select-none w-full"
        onClick={() => setExpanded(v => !v)}
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        <Activity className="w-3 h-3" />
        <span>Governance Details</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-1 border-b border-slate-100 pb-1">
            {(['evidence', 'tokens', 'monitor', 'versions'] as const).map(s => (
              <button
                key={s}
                className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${section === s ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                onClick={() => setSection(s)}
              >
                {s === 'evidence' ? 'Validation Evidence' : s === 'tokens' ? 'Issued Tokens' : s === 'monitor' ? 'Monitor Log' : 'Rollback History'}
              </button>
            ))}
          </div>

          {section === 'evidence' && (
            activeVersion?.validationEvidence
              ? <ValidationEvidencePanel evidence={activeVersion.validationEvidence} />
              : <p className="text-[11px] text-slate-400 py-1">No validation evidence recorded. Run a dry-run on the active version first (Rollback History tab).</p>
          )}

          {section === 'tokens' && (
            tokensLoading ? <p className="text-[11px] text-slate-400">Loading…</p>
            : tokenData ? (
              <div className="space-y-2">
                <div className="flex gap-4 text-[10px]">
                  <span className="text-slate-600 font-medium">{tokenData.stats.total} Total</span>
                  <span className="text-green-700 font-medium">{tokenData.stats.live} Live</span>
                  <span className="text-blue-700 font-medium">{tokenData.stats.used} Used</span>
                  <span className="text-gray-500 font-medium">{tokenData.stats.expired} Expired</span>
                </div>
                {tokenData.tokens.length === 0 ? (
                  <p className="text-[11px] text-slate-400">No tokens issued for this rule yet.</p>
                ) : (
                  <div className="rounded border overflow-auto max-h-52">
                    <table className="w-full text-[10px]">
                      <thead className="bg-slate-50 border-b sticky top-0">
                        <tr>
                          {['Issued At', 'Resolved Path', 'Status', 'Expires / Used', 'Notes'].map(h => (
                            <th key={h} className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {tokenData.tokens.map(token => {
                          const status = computeTokenStatus(token);
                          return (
                            <tr key={token.id} className="hover:bg-slate-50">
                              <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{fmtDateTime(token.issuedAt)}</td>
                              <td className="px-2 py-1.5 font-mono text-slate-700 max-w-[180px] truncate" title={token.resolvedPath}>{token.resolvedPath}</td>
                              <td className="px-2 py-1.5"><TokenStatusBadge token={token} /></td>
                              <td className="px-2 py-1.5 whitespace-nowrap">
                                {status === 'used'
                                  ? <span className="text-blue-600">{fmtDateTime(token.usedAt!)}</span>
                                  : <span className="text-slate-400">{fmtDateTime(token.expiresAt)}</span>
                                }
                              </td>
                              <td className="px-2 py-1.5 text-slate-400 max-w-[100px] truncate" title={token.notes ?? ''}>{token.notes ?? '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : <p className="text-[11px] text-slate-400">No data.</p>
          )}

          {section === 'monitor' && (
            monitorLoading ? <p className="text-[11px] text-slate-400">Loading…</p>
            : monitorData ? (
              <div className="space-y-2">
                <div className="flex gap-4 text-[10px]">
                  <span className="text-slate-600 font-medium">{monitorData.stats.total} Total</span>
                  <span className="text-green-700 font-medium">{monitorData.stats.conforming} Conforming</span>
                  <span className="text-amber-700 font-medium">{monitorData.stats.violations} Violations</span>
                </div>
                {monitorData.logs.length === 0 ? (
                  <p className="text-[11px] text-slate-400">No monitor entries for this rule yet.</p>
                ) : (
                  <div className="rounded border overflow-auto max-h-52">
                    <table className="w-full text-[10px]">
                      <thead className="bg-slate-50 border-b sticky top-0">
                        <tr>
                          {['Detected At', 'GCS Path', 'Conforms', 'Violation Reason'].map(h => (
                            <th key={h} className="px-2 py-1.5 text-left font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {monitorData.logs.map(log => (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">{fmtDateTime(log.detectedAt)}</td>
                            <td className="px-2 py-1.5 font-mono text-slate-700 max-w-[220px] truncate" title={log.detectedGcsPath}>{log.detectedGcsPath}</td>
                            <td className="px-2 py-1.5"><ConformsBadge conforms={log.pathConforms} ruleMatched={log.matchedRuleId !== null} /></td>
                            <td className="px-2 py-1.5 text-amber-700 max-w-[160px] truncate" title={log.violationReason ?? ''}>{log.violationReason ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : <p className="text-[11px] text-slate-400">No data.</p>
          )}

          {section === 'versions' && (
            <RuleVersionPanel rule={rule} forceExpanded />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Governance Rules ─────────────────────────────────────────────────

function GovernanceRulesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filterModule, setFilterModule] = useState("all");
  const [filterActive, setFilterActive] = useState("all");
  const [ruleForm, setRuleForm] = useState<{ open: boolean; rule: GcsGovernanceRule | null }>({ open: false, rule: null });

  const { data: rules = [], isLoading } = useQuery<GcsGovernanceRule[]>({
    queryKey: ["/api/gcs-governance/rules"],
  });

  const hasWarning = (r: GcsGovernanceRule) => r.notes?.startsWith("⚠") || r.notes?.startsWith("🚨");

  const filtered = rules.filter(r => {
    if (filterModule !== "all" && r.moduleKey !== filterModule) return false;
    if (filterActive === "active" && !r.active) return false;
    if (filterActive === "inactive" && r.active) return false;
    if (filterActive === "issues" && !hasWarning(r)) return false;
    if (filterActive === "db-driven" && r.governanceMode !== "db_driven") return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <Select value={filterModule} onValueChange={setFilterModule}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All modules" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All modules</SelectItem>
              {Object.entries(MODULE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterActive} onValueChange={setFilterActive}>
            <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All status</SelectItem>
              <SelectItem value="active" className="text-xs">Active only</SelectItem>
              <SelectItem value="inactive" className="text-xs">Inactive only</SelectItem>
              <SelectItem value="issues" className="text-xs text-amber-700">⚠ Issues only</SelectItem>
              <SelectItem value="db-driven" className="text-xs text-blue-700">DB-Driven</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-400 self-center">{filtered.length} rule{filtered.length !== 1 ? "s" : ""}</span>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setRuleForm({ open: true, rule: null })}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-slate-400 text-sm">Loading rules…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No rules found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(rule => (
            <Card key={rule.id} className={`border ${!rule.active ? "opacity-60" : ""} ${hasWarning(rule) ? "border-l-4 border-l-amber-400" : ""}`}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <ModuleBadge module={rule.moduleKey} />
                      {rule.submoduleKey && (
                        <span className="text-[11px] text-slate-400">{rule.submoduleKey}</span>
                      )}
                      <span className="text-xs font-semibold text-slate-700">{rule.displayName}</span>
                      <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 rounded">{rule.documentType}</span>
                      {!rule.active && <Badge variant="outline" className="text-[10px] h-4">Inactive</Badge>}
                      <GovernanceStateBadge mode={rule.governanceMode ?? 'hardcoded'} />
                    </div>
                    <p className="text-[11px] font-mono text-slate-500 break-all mb-1">{rule.pathTemplate}</p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      <span>Rev: <span className="font-medium capitalize">{rule.revisionMode}</span></span>
                      {rule.maxFileSizeMb && <span>Max: {rule.maxFileSizeMb}MB</span>}
                      {rule.allowedTokens && rule.allowedTokens.length > 0 && (
                        <span>{rule.allowedTokens.length} token{rule.allowedTokens.length !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                    {rule.notes && (
                      <p className={`text-[11px] mt-1 ${rule.notes.startsWith("🚨") ? "text-red-600 font-medium" : rule.notes.startsWith("⚠") ? "text-amber-600" : "text-slate-400"}`}>
                        {rule.notes}
                      </p>
                    )}
                    <div className="mt-1.5">
                      <EnableGovernanceButton rule={rule} />
                    </div>
                    <GovernanceDetailsPanel rule={rule} />
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRuleForm({ open: true, rule })}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RuleForm
        open={ruleForm.open}
        onClose={() => setRuleForm({ open: false, rule: null })}
        initial={ruleForm.rule}
        existingRules={rules}
      />
    </div>
  );
}

// ─── Tab: Token Registry ───────────────────────────────────────────────────

function TokenRegistryTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tokenForm, setTokenForm] = useState<{ open: boolean; token: GcsGovernanceToken | null }>({ open: false, token: null });
  const [showInactive, setShowInactive] = useState(false);

  const { data: tokens = [], isLoading } = useQuery<GcsGovernanceToken[]>({
    queryKey: ["/api/gcs-governance/tokens"],
  });

  const { data: rules = [] } = useQuery<GcsGovernanceRule[]>({
    queryKey: ["/api/gcs-governance/rules"],
  });

  const tokenUsageCount = (tokenName: string) => {
    return rules.filter(r => r.allowedTokens?.includes(tokenName)).length;
  };

  const activeCount = tokens.filter(t => t.active).length;
  const inactiveCount = tokens.length - activeCount;
  const displayed = showInactive ? tokens : tokens.filter(t => t.active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            {activeCount} active
            {inactiveCount > 0
              ? <>, <span className="text-amber-600">{inactiveCount} inactive</span></>
              : <span className="text-slate-300"> · 0 inactive</span>
            }
          </span>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} disabled={inactiveCount === 0} />
            Show inactive
            {inactiveCount === 0 && <span className="text-slate-300">(none)</span>}
          </label>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setTokenForm({ open: true, token: null })}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Register Token
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-slate-400 text-sm">Loading…</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-slate-600">Token</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600">Description</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600">Example</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600">Source</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600">Used in</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayed.map(token => (
                <tr key={token.id} className={`hover:bg-slate-50 ${!token.active ? "opacity-50" : ""}`}>
                  <td className="px-3 py-2 font-mono font-semibold text-blue-700">{"{"}{ token.tokenName}{"}"}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-[160px]">{token.description}</td>
                  <td className="px-3 py-2 font-mono text-slate-500">{token.exampleValue}</td>
                  <td className="px-3 py-2 text-slate-500 max-w-[180px] truncate" title={token.sourceDescription}>{token.sourceDescription}</td>
                  <td className="px-3 py-2">
                    <span className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">
                      {tokenUsageCount(token.tokenName)} rule{tokenUsageCount(token.tokenName) !== 1 ? "s" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setTokenForm({ open: true, token })}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TokenForm
        open={tokenForm.open}
        onClose={() => setTokenForm({ open: false, token: null })}
        initial={tokenForm.token}
      />
    </div>
  );
}

// ─── Tab: Monitor Log ──────────────────────────────────────────────────────

function MonitorLogTab() {
  const [filterModule, setFilterModule] = useState("all");
  const [filterConforms, setFilterConforms] = useState("all");
  const qc = useQueryClient();

  const { data: stats, isLoading: statsLoading } = useQuery<MonitorStats>({
    queryKey: ["/api/gcs-governance/monitor-log/stats"],
  });

  const params = new URLSearchParams({ limit: "200" });
  if (filterModule !== "all") params.set("module", filterModule);
  if (filterConforms !== "all") params.set("conforms", filterConforms);

  const { data: logs = [], isLoading: logsLoading } = useQuery<MonitorLogEntry[]>({
    queryKey: ["/api/gcs-governance/monitor-log", filterModule, filterConforms],
    queryFn: () => apiRequest("GET", `/api/gcs-governance/monitor-log?${params.toString()}`),
  });

  const statCards = [
    { label: "Total Logged", value: stats?.total ?? 0, color: "text-slate-700", bg: "bg-slate-50" },
    { label: "Conforming", value: stats?.conforming ?? 0, color: "text-green-700", bg: "bg-green-50" },
    { label: "Violations", value: stats?.violations ?? 0, color: "text-amber-700", bg: "bg-amber-50" },
    { label: "No Rule Matched", value: stats?.unmatched ?? 0, color: "text-slate-500", bg: "bg-slate-50" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
        <Info className="w-4 h-4 flex-shrink-0" />
        <span><strong>Monitor mode active.</strong> This log records upload events for audit purposes only — no uploads are blocked.</span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {statCards.map(s => (
          <Card key={s.label} className={`${s.bg} border-0`}>
            <CardContent className="p-3">
              <div className={`text-2xl font-bold ${s.color}`}>{statsLoading ? "…" : s.value.toLocaleString()}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterModule} onValueChange={setFilterModule}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="All modules" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All modules</SelectItem>
            {Object.entries(MODULE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterConforms} onValueChange={setFilterConforms}>
          <SelectTrigger className="h-8 text-xs w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All entries</SelectItem>
            <SelectItem value="true" className="text-xs">Conforming</SelectItem>
            <SelectItem value="false" className="text-xs">Violations</SelectItem>
            <SelectItem value="unmatched" className="text-xs">No rule matched</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => {
          qc.invalidateQueries({ queryKey: ["/api/gcs-governance/monitor-log"] });
          qc.invalidateQueries({ queryKey: ["/api/gcs-governance/monitor-log/stats"] });
        }}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
        <span className="text-xs text-slate-400 self-center">{logs.length} entr{logs.length !== 1 ? "ies" : "y"}</span>
      </div>

      {logsLoading ? (
        <div className="text-center py-10 text-slate-400 text-sm">Loading log…</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No upload events logged yet.
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-xs min-w-[800px]">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 w-36">When</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 w-20">Module</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 w-28">Doc Type</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600">GCS Path</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 w-28">Status</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 w-44">Reason</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600 w-28">Route</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map(log => (
                <tr key={log.id} className={`hover:bg-slate-50 ${log.pathConforms === false ? "bg-amber-50" : ""}`}>
                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtDateTime(log.detectedAt)}</td>
                  <td className="px-3 py-2">{log.moduleKey ? <ModuleBadge module={log.moduleKey} /> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2 text-slate-500 truncate max-w-[100px]" title={log.documentType ?? ""}>{log.documentType ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-slate-700 max-w-[300px] truncate" title={log.detectedGcsPath}>{log.detectedGcsPath}</td>
                  <td className="px-3 py-2"><ConformsBadge conforms={log.pathConforms} ruleMatched={log.matchedRuleId !== null} /></td>
                  <td className="px-3 py-2 text-amber-700 text-[11px] truncate max-w-[160px]" title={log.violationReason ?? ""}>{log.violationReason ?? "—"}</td>
                  <td className="px-3 py-2 text-slate-400 text-[11px] truncate max-w-[110px]" title={log.routeFile ?? ""}>{log.routeFile ? log.routeFile.replace("server/", "") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Issued Tokens Tab (Phase 1) ───────────────────────────────────────────

interface IssuedToken {
  id: number;
  ruleId: number;
  resolvedPath: string;
  rootPrefix: string;
  moduleKey: string;
  documentType: string;
  tokenValues: Record<string, string> | null;
  maxFileSizeBytes: number | null;
  allowedMimeTypes: string[] | null;
  issuedTo: number;
  issuedAt: string;
  expiresAt: string;
  usedAt: string | null;
  usedForPath: string | null;
  notes: string | null;
}

interface TokenStats {
  total: number;
  live: number;
  used: number;
  expired: number;
}

function computeTokenStatus(token: IssuedToken): 'live' | 'used' | 'expired' {
  if (token.usedAt) return 'used';
  if (new Date(token.expiresAt) <= new Date()) return 'expired';
  return 'live';
}

function TokenStatusBadge({ token }: { token: IssuedToken }) {
  const status = computeTokenStatus(token);
  if (status === 'live') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
      <Zap className="w-3 h-3" /> Live
    </span>
  );
  if (status === 'used') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
      <Check className="w-3 h-3" /> Used
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
      <Clock className="w-3 h-3" /> Expired
    </span>
  );
}

function ExpiryCountdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    function calc() {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining('—'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}m ${s}s`);
    }
    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  return <span className="font-mono text-xs text-slate-500">{remaining}</span>;
}

function IssueTokenSheet({ rules, onIssued }: { rules: GcsGovernanceRule[]; onIssued: (raw: string, path: string, exp: string) => void }) {
  const [open, setOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string>('');
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({});
  const [ttl, setTtl] = useState('300');
  const [notes, setNotes] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const selectedRule = rules.find(r => r.id === parseInt(selectedRuleId));
  const templateTokens = selectedRule
    ? [...new Set((selectedRule.pathTemplate.match(/\{(\w+)\}/g) ?? []).map(t => t.slice(1, -1)))]
    : [];

  const issueMutation = useMutation({
    mutationFn: (body: any) => apiRequest('POST', '/api/gcs-governance/upload-tokens/issue', body),
    onSuccess: (data: any) => {
      setOpen(false);
      setSelectedRuleId('');
      setTokenValues({});
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['/api/gcs-governance/upload-tokens'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gcs-governance/upload-tokens/stats'] });
      onIssued(data.rawToken, data.resolvedPath, data.expiresAt);
    },
    onError: (err: any) => {
      toast({ title: 'Issue failed', description: err.message, variant: 'destructive' });
    },
  });

  const handleIssue = () => {
    if (!selectedRuleId) { toast({ title: 'Select a rule', variant: 'destructive' }); return; }
    issueMutation.mutate({
      ruleId: parseInt(selectedRuleId),
      tokenValues,
      ttlSeconds: parseInt(ttl) || 300,
      notes: notes || undefined,
    });
  };

  return (
    <>
      <Button size="sm" className="gap-2" onClick={() => setOpen(true)}>
        <Ticket className="h-4 w-4" /> Issue Test Token
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><Ticket className="h-5 w-5 text-blue-600" /> Issue Upload Token</SheetTitle>
            <SheetDescription>
              Issue a short-lived authorisation token for a specific governed path. The raw token is shown once.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {/* Rule selector */}
            <div className="space-y-1.5">
              <Label>Governance Rule</Label>
              <Select value={selectedRuleId} onValueChange={v => { setSelectedRuleId(v); setTokenValues({}); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a rule…" />
                </SelectTrigger>
                <SelectContent>
                  {rules.filter(r => r.active).map(r => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      <span className="font-medium">{r.displayName}</span>
                      <span className="ml-2 text-muted-foreground text-xs">{r.moduleKey.toUpperCase()}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Path template preview */}
            {selectedRule && (
              <div className="bg-slate-50 rounded-md border p-3 space-y-1">
                <p className="text-xs font-medium text-slate-600">Path Template</p>
                <p className="font-mono text-xs text-slate-700 break-all">{selectedRule.pathTemplate}</p>
              </div>
            )}

            {/* Token value inputs */}
            {templateTokens.length > 0 && (
              <div className="space-y-3">
                <Label className="text-sm">Token Values</Label>
                {templateTokens.map(token => (
                  <div key={token} className="space-y-1">
                    <Label className="text-xs text-slate-600">{`{${token}}`}</Label>
                    <Input
                      placeholder={`Enter ${token}…`}
                      value={tokenValues[token] ?? ''}
                      onChange={e => setTokenValues(prev => ({ ...prev, [token]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Resolved path preview */}
            {selectedRule && (
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-600">Resolved Path Preview</Label>
                <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
                  <p className="font-mono text-xs text-blue-800 break-all">
                    {selectedRule.pathTemplate.replace(/\{(\w+)\}/g, (_, t) => tokenValues[t] || `{${t}}`)}
                  </p>
                </div>
              </div>
            )}

            {/* TTL and Notes */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">TTL (seconds)</Label>
                <Input type="number" min={30} max={3600} value={ttl} onChange={e => setTtl(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes (optional)</Label>
                <Input placeholder="e.g. EPC C10357 upload" value={notes} onChange={e => setNotes(e.target.value)} />
              </div>
            </div>

            <Button className="w-full gap-2" disabled={issueMutation.isPending} onClick={handleIssue}>
              {issueMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Ticket className="h-4 w-4" />}
              Issue Token
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function RawTokenDisplay({ rawToken, resolvedPath, expiresAt, onDismiss }: {
  rawToken: string; resolvedPath: string; expiresAt: string; onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(rawToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="border border-green-300 bg-green-50 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
          <p className="text-sm font-semibold text-green-800">Token Issued — Copy Now (shown once only)</p>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onDismiss}><X className="h-4 w-4" /></Button>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-slate-600 font-medium">Raw Token</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-white border rounded px-2 py-1 text-xs font-mono text-slate-800 break-all">{rawToken}</code>
          <Button variant="outline" size="sm" className="gap-1 shrink-0" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-slate-600 font-medium">Authorised Path</p>
        <p className="font-mono text-xs text-slate-700 break-all bg-white border rounded px-2 py-1">{resolvedPath}</p>
      </div>
      <p className="text-xs text-amber-700">
        Expires: {fmtDateTime(expiresAt)}. This token will not be shown again.
      </p>
    </div>
  );
}

function IssuedTokensTab({ rules }: { rules: GcsGovernanceRule[] }) {
  const [lastIssuedToken, setLastIssuedToken] = useState<{ rawToken: string; resolvedPath: string; expiresAt: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: stats, isLoading: statsLoading } = useQuery<TokenStats>({
    queryKey: ['/api/gcs-governance/upload-tokens/stats'],
    refetchInterval: 30000,
  });

  const { data: tokens = [], isLoading: tokensLoading, refetch } = useQuery<IssuedToken[]>({
    queryKey: ['/api/gcs-governance/upload-tokens', statusFilter],
    queryFn: () => apiRequest('GET', `/api/gcs-governance/upload-tokens?status=${statusFilter}&limit=100`),
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Issued Upload Tokens</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Short-lived path-authorisation tokens. Each raw token is returned once. Tokens expire after 5 minutes by default.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <IssueTokenSheet
            rules={rules}
            onIssued={(raw, path, exp) => setLastIssuedToken({ rawToken: raw, resolvedPath: path, expiresAt: exp })}
          />
        </div>
      </div>

      {/* Raw token display (one-time) */}
      {lastIssuedToken && (
        <RawTokenDisplay
          rawToken={lastIssuedToken.rawToken}
          resolvedPath={lastIssuedToken.resolvedPath}
          expiresAt={lastIssuedToken.expiresAt}
          onDismiss={() => setLastIssuedToken(null)}
        />
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Issued', value: stats?.total ?? 0, cls: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
          { label: 'Live',         value: stats?.live    ?? 0, cls: 'text-green-700', bg: 'bg-green-50 border-green-200' },
          { label: 'Used',         value: stats?.used    ?? 0, cls: 'text-blue-700',  bg: 'bg-blue-50 border-blue-200' },
          { label: 'Expired',      value: stats?.expired ?? 0, cls: 'text-gray-500',  bg: 'bg-gray-50 border-gray-200' },
        ].map(({ label, value, cls, bg }) => (
          <Card key={label} className={`border ${bg}`}>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${cls}`}>{statsLoading ? '…' : value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2">
        <p className="text-xs text-slate-500">Filter:</p>
        {(['all', 'live', 'used', 'expired'] as const).map(s => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs capitalize"
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </Button>
        ))}
      </div>

      {/* Tokens table */}
      {tokensLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading tokens…
        </div>
      ) : tokens.length === 0 ? (
        <div className="border rounded-lg py-12 flex flex-col items-center gap-3 text-muted-foreground">
          <Ticket className="h-10 w-10 text-slate-300" />
          <p className="text-sm">No tokens found. Use "Issue Test Token" to issue your first token.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                {['Issued At', 'Module', 'Document Type', 'Resolved Path', 'Status', 'Expires / Used At', 'Notes'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {tokens.map(token => {
                const status = computeTokenStatus(token);
                return (
                  <tr key={token.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap text-xs">{fmtDateTime(token.issuedAt)}</td>
                    <td className="px-3 py-2"><ModuleBadge module={token.moduleKey} /></td>
                    <td className="px-3 py-2 text-slate-500 text-xs truncate max-w-[100px]" title={token.documentType}>{token.documentType}</td>
                    <td className="px-3 py-2 font-mono text-slate-700 text-xs max-w-[280px] truncate" title={token.resolvedPath}>{token.resolvedPath}</td>
                    <td className="px-3 py-2"><TokenStatusBadge token={token} /></td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {status === 'live'
                        ? <ExpiryCountdown expiresAt={token.expiresAt} />
                        : status === 'used'
                          ? <span className="text-blue-600">{fmtDateTime(token.usedAt!)}</span>
                          : <span className="text-slate-400">{fmtDateTime(token.expiresAt)}</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-slate-400 text-xs truncate max-w-[120px]" title={token.notes ?? ''}>{token.notes ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Migration Tracker ────────────────────────────────────────────────

const MIGRATION_STATUS_STYLES: Record<string, string> = {
  pending:     'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  done:        'bg-green-100 text-green-700',
  blocked:     'bg-red-100 text-red-600',
};

function MigrationTrackerTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNotes, setEditNotes] = useState('');

  const { data: rules = [] } = useQuery<GcsGovernanceRule[]>({
    queryKey: ['/api/gcs-governance/rules'],
  });

  const { data: entries = [], isLoading } = useQuery<MigrationLogEntry[]>({
    queryKey: ['/api/gcs-governance/migration-log', filterStatus],
    queryFn: () => apiRequest('GET', `/api/gcs-governance/migration-log${filterStatus !== 'all' ? `?status=${filterStatus}` : ''}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: number; status: string; notes: string }) =>
      apiRequest('PATCH', `/api/gcs-governance/migration-log/${id}`, { status, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/gcs-governance/migration-log'] });
      setEditingId(null);
      toast({ title: 'Migration entry updated' });
    },
    onError: (err: any) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
  });

  const getRuleName = (ruleId: number) => {
    const r = rules.find(r => r.id === ruleId);
    return r ? `${r.moduleKey}/${r.documentType}` : `Rule #${ruleId}`;
  };

  const statusCounts = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
        <ArrowUpDown className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-indigo-800">Path Migration Tracker — Phase 0</p>
          <p className="text-xs text-indigo-700 mt-0.5">
            Tracks all hardcoded GCS path builders pending migration to DB-driven routing. 
            Entries are populated when migration work is registered via admin or Phase 1+.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: entries.length, cls: 'text-slate-700', bg: 'bg-slate-50' },
          { label: 'Pending', value: statusCounts.pending ?? 0, cls: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'In Progress', value: statusCounts.in_progress ?? 0, cls: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Done', value: statusCounts.done ?? 0, cls: 'text-green-700', bg: 'bg-green-50' },
        ].map(s => (
          <Card key={s.label} className={`border-0 ${s.bg}`}>
            <CardContent className="p-3">
              <div className={`text-2xl font-bold ${s.cls}`}>{s.value}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{s.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All statuses</SelectItem>
            <SelectItem value="pending" className="text-xs">Pending</SelectItem>
            <SelectItem value="in_progress" className="text-xs">In Progress</SelectItem>
            <SelectItem value="done" className="text-xs">Done</SelectItem>
            <SelectItem value="blocked" className="text-xs">Blocked</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => qc.invalidateQueries({ queryKey: ['/api/gcs-governance/migration-log'] })}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
        <span className="text-xs text-slate-400 self-center">{entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}</span>
      </div>

      {isLoading ? (
        <div className="text-center py-10 text-slate-400 text-sm">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          <ArrowUpDown className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>No migration log entries yet.</p>
          <p className="text-xs mt-1">Entries are added here as hardcoded builders are registered for migration in later phases.</p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <thead className="bg-slate-50 border-b">
              <tr>
                {['Rule', 'Route File', 'Function', 'Old Method', 'Phase', 'Status', 'Notes', ''].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map(e => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{getRuleName(e.ruleId)}</td>
                  <td className="px-3 py-2 font-mono text-slate-500 text-[10px] max-w-[140px] truncate" title={e.routeFile}>{e.routeFile}</td>
                  <td className="px-3 py-2 font-mono text-slate-400 text-[10px] max-w-[100px] truncate" title={e.routeFunction ?? ''}>{e.routeFunction ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-slate-500 text-[10px] max-w-[120px] truncate" title={e.oldMethod}>{e.oldMethod}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{e.migrationPhase}</td>
                  <td className="px-3 py-2">
                    {editingId === e.id ? (
                      <Select value={e.status} onValueChange={(v) => updateMutation.mutate({ id: e.id, status: v, notes: editNotes })}>
                        <SelectTrigger className="h-6 text-[10px] w-24"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['pending', 'in_progress', 'done', 'blocked'].map(s => (
                            <SelectItem key={s} value={s} className="text-[10px]">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${MIGRATION_STATUS_STYLES[e.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {e.status.replace(/_/g, ' ')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[140px]">
                    {editingId === e.id ? (
                      <Input className="h-6 text-[10px]" value={editNotes} onChange={ev => setEditNotes(ev.target.value)} />
                    ) : (
                      <span className="text-slate-400 text-[10px] truncate" title={e.notes ?? ''}>{e.notes ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editingId === e.id ? (
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1" onClick={() => setEditingId(null)}>✕</Button>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setEditingId(e.id); setEditNotes(e.notes ?? ''); }}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function GcsDocGovernancePage() {
  const { user } = useAuth();
  const isSuperuser = user?.role === "Superuser";
  const [tab, setTab] = useState("rules");

  const { data: allRules = [] } = useQuery<GcsGovernanceRule[]>({
    queryKey: ['/api/gcs-governance/rules'],
  });

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">GCS Doc Governance</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              GCS path governance rules, token definitions, upload audit log, and upload token authorisation
            </p>
          </div>
          <Badge variant="outline" className="ml-auto text-[11px] bg-indigo-50 text-indigo-700 border-indigo-200">
            Phase 0 — DB-Driven Routing
          </Badge>
        </div>

        {/* Module coverage summary */}
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Monitor Mode Active — No uploads are blocked</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  This registry documents the expected GCS path structure for every module. Upload tokens can be issued and validated but enforcement is introduced in Phase 2.
                  Modules registered:&nbsp;
                  {Object.entries(MODULE_LABELS).map(([k, v]) => (
                    <span key={k} className="inline-block mr-1"><ModuleBadge module={k} /></span>
                  ))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex items-center gap-1 h-9">
            <TabsTrigger value="rules" className="flex items-center gap-1.5">
              <List className="h-4 w-4" /> Governance Rules
            </TabsTrigger>
            <TabsTrigger value="tokens" className="flex items-center gap-1.5">
              <Key className="h-4 w-4" /> Token Registry
            </TabsTrigger>
            {isSuperuser && (
              <TabsTrigger value="monitor" className="flex items-center gap-1.5">
                <Activity className="h-4 w-4" /> Monitor Log
              </TabsTrigger>
            )}
            {isSuperuser && (
              <TabsTrigger value="issued-tokens" className="flex items-center gap-1.5">
                <Ticket className="h-4 w-4" /> Issued Tokens
              </TabsTrigger>
            )}
            {isSuperuser && (
              <TabsTrigger value="migration" className="flex items-center gap-1.5">
                <ArrowUpDown className="h-4 w-4" /> Migration
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="rules" className="mt-4">
            <GovernanceRulesTab />
          </TabsContent>

          <TabsContent value="tokens" className="mt-4">
            <TokenRegistryTab />
          </TabsContent>

          {isSuperuser && (
            <TabsContent value="monitor" className="mt-4">
              <MonitorLogTab />
            </TabsContent>
          )}

          {isSuperuser && (
            <TabsContent value="issued-tokens" className="mt-4">
              <IssuedTokensTab rules={allRules} />
            </TabsContent>
          )}
          {isSuperuser && (
            <TabsContent value="migration" className="mt-4">
              <MigrationTrackerTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </Layout>
  );
}

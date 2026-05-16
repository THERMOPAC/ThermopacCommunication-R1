import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, Database, List, Plus, Eye, EyeOff, ChevronRight,
  AlertTriangle, CheckCircle, HelpCircle, RefreshCw, Info,
  Edit2, X, ChevronDown, FileText, Settings, Key, Activity,
  Ticket, Copy, Clock, Check, Zap,
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
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
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

  const handlePreview = async () => {
    try {
      const result = await apiRequest("POST", "/api/gcs-governance/rules/preview", {
        pathTemplate: template,
        tokens: tokenValues,
      });
      setPreview(result);
    } catch {
      toast({ title: "Preview failed", variant: "destructive" });
    }
  };

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
      <Button size="sm" variant="outline" className="w-full text-xs" onClick={handlePreview}>
        Generate Preview
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
}

function RuleForm({ open, onClose, initial }: RuleFormProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!initial;

  const [form, setForm] = useState<Partial<GcsGovernanceRule>>(initial ?? {
    moduleKey: "", submoduleKey: "", documentType: "", displayName: "",
    rootPrefix: "", pathTemplate: "", revisionMode: "none",
    maxFileSizeMb: undefined, notes: "", active: true,
  });

  // Reset form when slide-over opens
  const handleChange = useCallback((field: string, value: unknown) =>
    setForm(prev => ({ ...prev, [field]: value })), []);

  const mutation = useMutation({
    mutationFn: (data: typeof form) => isEdit
      ? apiRequest("PATCH", `/api/gcs-governance/rules/${initial!.id}`, data)
      : apiRequest("POST", "/api/gcs-governance/rules", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/gcs-governance/rules"] });
      toast({ title: isEdit ? "Rule updated" : "Rule created" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-[520px] overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{isEdit ? "Edit Governance Rule" : "Add Governance Rule"}</SheetTitle>
          <SheetDescription>Define a path template for a module's document type.</SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Module Key *</Label>
              <Select value={form.moduleKey} onValueChange={v => handleChange("moduleKey", v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select module" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MODULE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Submodule Key</Label>
              <Input className="h-8 text-xs" value={form.submoduleKey ?? ""} onChange={e => handleChange("submoduleKey", e.target.value)} placeholder="e.g. procurement" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Document Type *</Label>
              <Input className="h-8 text-xs" value={form.documentType ?? ""} onChange={e => handleChange("documentType", e.target.value)} placeholder="e.g. DATASHEET" />
            </div>
            <div>
              <Label className="text-xs">Display Name *</Label>
              <Input className="h-8 text-xs" value={form.displayName ?? ""} onChange={e => handleChange("displayName", e.target.value)} placeholder="Human-readable name" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Root Prefix *</Label>
            <Input className="h-8 text-xs font-mono" value={form.rootPrefix ?? ""} onChange={e => handleChange("rootPrefix", e.target.value)} placeholder="e.g. TPEL or QMS" />
          </div>

          <div>
            <Label className="text-xs">Path Template *</Label>
            <Textarea
              className="text-xs font-mono resize-none"
              rows={3}
              value={form.pathTemplate ?? ""}
              onChange={e => handleChange("pathTemplate", e.target.value)}
              placeholder="TPEL/{CC}/{CO}/{Cust}/{FY}/{NNN}/{DocType}/rev-{rev}/{Seq}-{Label}.{ext}"
            />
            <p className="text-[11px] text-slate-400 mt-1">Use {"{TOKEN}"} for variable segments. Tokens are auto-detected from the template.</p>
          </div>

          {form.pathTemplate && (
            <PathPreviewPanel template={form.pathTemplate} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Revision Mode</Label>
              <Select value={form.revisionMode ?? "none"} onValueChange={v => handleChange("revisionMode", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REVISION_MODES.map(m => <SelectItem key={m} value={m} className="text-xs capitalize">{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Max File Size (MB)</Label>
              <Input className="h-8 text-xs" type="number" value={form.maxFileSizeMb ?? ""} onChange={e => handleChange("maxFileSizeMb", e.target.value ? parseInt(e.target.value) : null)} placeholder="No limit" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea className="text-xs resize-none" rows={2} value={form.notes ?? ""} onChange={e => handleChange("notes", e.target.value)} placeholder="Migration status, source route file, etc." />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={form.active ?? true} onCheckedChange={v => handleChange("active", v)} id="active-switch" />
            <Label htmlFor="active-switch" className="text-xs">Active</Label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              className="flex-1"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(form)}
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

function TokenForm({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: GcsGovernanceToken | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const isEdit = !!initial;

  const [form, setForm] = useState<Partial<GcsGovernanceToken>>(initial ?? {
    tokenName: "", description: "", exampleValue: "", sourceDescription: "", active: true,
  });

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

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/gcs-governance/rules/${id}/deactivate`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/gcs-governance/rules"] }); toast({ title: "Rule deactivated" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/gcs-governance/rules/${id}/activate`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/gcs-governance/rules"] }); toast({ title: "Rule activated" }); },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const filtered = rules.filter(r => {
    if (filterModule !== "all" && r.moduleKey !== filterModule) return false;
    if (filterActive === "active" && !r.active) return false;
    if (filterActive === "inactive" && r.active) return false;
    return true;
  });

  const hasWarning = (r: GcsGovernanceRule) => r.notes?.startsWith("⚠") || r.notes?.startsWith("🚨");

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
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRuleForm({ open: true, rule })}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    {rule.active ? (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600 hover:text-amber-700" onClick={() => deactivateMutation.mutate(rule.id)} title="Deactivate">
                        <EyeOff className="w-3.5 h-3.5" />
                      </Button>
                    ) : (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:text-green-700" onClick={() => activateMutation.mutate(rule.id)} title="Activate">
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    )}
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

  const displayed = showInactive ? tokens : tokens.filter(t => t.active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{displayed.length} token{displayed.length !== 1 ? "s" : ""}</span>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Show inactive
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
            Phase 1 — Token Auth
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
        </Tabs>
      </div>
    </Layout>
  );
}

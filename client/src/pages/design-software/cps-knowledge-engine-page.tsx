// ── CPS Sizing Tool — Knowledge Engine (Phase 1) ──────────────────────────────
// GLOBAL controlled source of all CPS engineering parameters. Read-only for
// normal users; only Superusers may edit (also enforced server-side).
// NULL value = "Not defined" — never a silent placeholder.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Pencil, Plus, History, Info, FlaskConical } from "lucide-react";
import { CpsSizingNav } from "./cps-sizing-shared";

type CpsParam = {
  id: number; category: string; parameter_name: string; parameter_code: string;
  symbol: string | null; parameter_type: string; value: string | null; unit: string | null;
  description: string | null; engineering_notes: string | null; display_order: number;
  is_active: boolean; updated_at: string; updated_by_name?: string;
  is_derived: boolean; derived_formula: string | null;
};

type CpsHistory = {
  id: number; parameter_code: string; old_value: string | null; new_value: string | null;
  changed_by_name?: string; changed_at: string;
};

const CATEGORIES: { key: string; label: string }[] = [
  { key: "media_column", label: "Media & Column" },
  { key: "material_properties", label: "Material Properties" },
  { key: "heating_cooling", label: "Heating & Cooling" },
  { key: "process_cutoff", label: "Process Cut-Off Thresholds" },
  { key: "process_times", label: "Process Times" },
  { key: "regeneration_recovery", label: "Regeneration & Recovery" },
  { key: "standard_equipment", label: "Standard Equipment" },
  { key: "regen_offgas_tox", label: "Regeneration Off-Gas / TOX Basis" },
];

const PARAM_TYPES: { key: string; label: string }[] = [
  { key: "performance", label: "Performance" },
  // Display label only — the stored value stays 'physical_constant' so existing
  // data and the DB CHECK constraint are unaffected. Covers both physical/
  // material properties and fixed equipment design properties.
  { key: "physical_constant", label: "Physical / Property" },
  { key: "process_threshold", label: "Process Threshold" },
  { key: "process_time", label: "Process Time" },
  { key: "equipment_standard", label: "Equipment Standard" },
];

const TYPE_COLOURS: Record<string, string> = {
  performance: "bg-purple-100 text-purple-800",
  physical_constant: "bg-blue-100 text-blue-800",
  process_threshold: "bg-amber-100 text-amber-800",
  process_time: "bg-teal-100 text-teal-800",
  equipment_standard: "bg-slate-100 text-slate-700",
};

const BLANK = {
  category: "media_column", parameterName: "", parameterCode: "", symbol: "",
  parameterType: "performance", value: "", unit: "", description: "", engineeringNotes: "", displayOrder: "0",
};

function fmtValue(v: string | null): string {
  if (v === null || v === "") return "";
  const n = Number(v);
  return isFinite(n) ? String(n) : String(v);
}

export default function CpsKnowledgeEnginePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isSuperuser = user?.role === "Superuser";

  const [activeCategory, setActiveCategory] = useState("media_column");
  const paramsQ = useQuery<CpsParam[]>({
    queryKey: ["/api/design-software/cps/parameters"],
    queryFn: () => apiRequest("GET", "/api/design-software/cps/parameters") as Promise<CpsParam[]>,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CpsParam | null>(null);
  const [form, setForm] = useState<typeof BLANK>(BLANK);
  const set = (k: keyof typeof BLANK) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditing(null);
    setForm({ ...BLANK, category: activeCategory });
    setDialogOpen(true);
  };
  const openEdit = (p: CpsParam) => {
    setEditing(p);
    setForm({
      category: p.category, parameterName: p.parameter_name, parameterCode: p.parameter_code,
      symbol: p.symbol ?? "", parameterType: p.parameter_type, value: fmtValue(p.value),
      unit: p.unit ?? "", description: p.description ?? "", engineeringNotes: p.engineering_notes ?? "",
      displayOrder: String(p.display_order),
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        category: form.category, parameterName: form.parameterName, symbol: form.symbol || null,
        parameterType: form.parameterType, value: form.value.trim() === "" ? null : form.value,
        unit: form.unit || null, description: form.description || null,
        engineeringNotes: form.engineeringNotes || null, displayOrder: Number(form.displayOrder) || 0,
      };
      if (editing) return apiRequest("PATCH", `/api/design-software/cps/parameters/${editing.id}`, payload);
      return apiRequest("POST", "/api/design-software/cps/parameters", { ...payload, parameterCode: form.parameterCode });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/design-software/cps/parameters"] });
      setDialogOpen(false);
      toast({ title: editing ? "Parameter updated" : "Parameter created" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? String(e), variant: "destructive" }),
  });

  const activeMutation = useMutation({
    mutationFn: (p: { id: number; isActive: boolean }) =>
      apiRequest("PATCH", `/api/design-software/cps/parameters/${p.id}`, { isActive: p.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/design-software/cps/parameters"] }),
    onError: (e: any) => toast({ title: "Change failed", description: e?.message ?? String(e), variant: "destructive" }),
  });

  const [historyParam, setHistoryParam] = useState<CpsParam | null>(null);
  const historyQ = useQuery<CpsHistory[]>({
    queryKey: ["/api/design-software/cps/parameters", historyParam?.id, "history"],
    queryFn: () => apiRequest("GET", `/api/design-software/cps/parameters/${historyParam!.id}/history`) as Promise<CpsHistory[]>,
    enabled: historyParam !== null,
  });

  const rows = (paramsQ.data ?? []).filter(p => p.category === activeCategory);

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-blue-700" /> CPS Sizing Tool — Knowledge Engine
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Single controlled source of all CPS engineering parameters. Future sizing calculations
              retrieve every constant from here by parameter code — nothing is hard-coded.
            </p>
          </div>
          {isSuperuser && (
            <Button onClick={openAdd} data-testid="button-add-parameter">
              <Plus className="h-4 w-4 mr-1" /> New Parameter
            </Button>
          )}
        </div>

        <CpsSizingNav />

        <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 flex gap-2">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Only Superusers may edit Knowledge Engine parameters (enforced server-side). Parameter codes are
            immutable after creation. A blank value means <b>Not defined</b> — the system never substitutes a
            placeholder engineering value. Every value change is recorded in the change history.
          </span>
        </div>

        {/* Category tabs */}
        <div className="flex flex-wrap gap-1 border-b pb-2">
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              onClick={() => setActiveCategory(c.key)}
              data-testid={`tab-${c.key}`}
              className={`px-3 py-1.5 rounded-md text-sm ${activeCategory === c.key ? "bg-blue-600 text-white" : "hover:bg-slate-100 text-slate-700"}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {paramsQ.isLoading ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading parameters…</div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Parameter</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2">Unit</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Last Updated</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(p => (
                  <tr key={p.id} className={p.is_active ? "" : "opacity-50"} data-testid={`row-param-${p.parameter_code}`}>
                    <td className="px-3 py-2 font-medium">
                      {p.parameter_name}
                      {p.is_derived && (
                        <Badge className="ml-2 bg-emerald-100 text-emerald-800 inline-flex items-center gap-1">
                          <FlaskConical className="h-3 w-3" /> Auto-calculated
                        </Badge>
                      )}
                      {!p.is_active && <Badge className="ml-2 bg-gray-100 text-gray-500">Inactive</Badge>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{p.parameter_code}</td>
                    <td className="px-3 py-2">{p.symbol ?? ""}</td>
                    <td className="px-3 py-2">
                      <Badge className={TYPE_COLOURS[p.parameter_type] ?? "bg-slate-100 text-slate-700"}>
                        {PARAM_TYPES.find(t => t.key === p.parameter_type)?.label ?? p.parameter_type}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {p.value === null
                        ? <Badge className="bg-red-50 text-red-700 border border-red-200">Not defined</Badge>
                        : fmtValue(p.value)}
                      {p.is_derived && p.derived_formula && (
                        <div className="text-xs text-emerald-700 mt-0.5 font-normal">= {p.derived_formula}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">{p.unit ?? ""}</td>
                    <td className="px-3 py-2 max-w-md text-xs text-slate-600">{p.description ?? ""}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(p.updated_at).toLocaleDateString()}
                      {p.updated_by_name ? <span className="block">{p.updated_by_name}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setHistoryParam(p)} title="Value change history" data-testid={`button-history-${p.parameter_code}`}>
                        <History className="h-4 w-4" />
                      </Button>
                      {isSuperuser && !p.is_derived && (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Edit parameter" data-testid={`button-edit-${p.parameter_code}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {isSuperuser && p.is_derived && (
                        <span className="px-2 text-xs text-emerald-700 italic">Read-only</span>
                      )}
                      {isSuperuser && (
                        <Button variant="ghost" size="sm" onClick={() => activeMutation.mutate({ id: p.id, isActive: !p.is_active })}>
                          {p.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">No parameters in this category.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Edit / create dialog (Superuser only) */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? `Edit — ${editing.parameter_code}` : "New Knowledge Engine Parameter"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Parameter Name *</Label>
                <Input value={form.parameterName} onChange={e => set("parameterName")(e.target.value)} data-testid="input-parameter-name" />
              </div>
              <div>
                <Label>Parameter Code * {editing && <span className="text-xs text-muted-foreground">(immutable)</span>}</Label>
                <Input value={form.parameterCode} disabled={!!editing} placeholder="e.g. MEDIA_WT_PER_COL"
                  onChange={e => set("parameterCode")(e.target.value.toUpperCase())} data-testid="input-parameter-code" />
              </div>
              <div>
                <Label>Symbol</Label>
                <Input value={form.symbol} onChange={e => set("symbol")(e.target.value)} />
              </div>
              <div>
                <Label>Category *</Label>
                <Select value={form.category} onValueChange={set("category")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Parameter Type *</Label>
                <Select value={form.parameterType} onValueChange={set("parameterType")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PARAM_TYPES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Value <span className="text-xs text-muted-foreground">(blank = not defined)</span></Label>
                <Input value={form.value} onChange={e => set("value")(e.target.value)} data-testid="input-value" />
              </div>
              <div>
                <Label>Unit</Label>
                <Input value={form.unit} onChange={e => set("unit")(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea rows={2} value={form.description} onChange={e => set("description")(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Engineering Notes</Label>
                <Textarea rows={2} value={form.engineeringNotes} onChange={e => set("engineeringNotes")(e.target.value)} />
              </div>
              <div>
                <Label>Display Order</Label>
                <Input type="number" value={form.displayOrder} onChange={e => set("displayOrder")(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-parameter">
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* History dialog */}
        <Dialog open={historyParam !== null} onOpenChange={(o) => { if (!o) setHistoryParam(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Value Change History — {historyParam?.parameter_code}</DialogTitle>
            </DialogHeader>
            {historyQ.isLoading ? (
              <div className="text-sm text-muted-foreground py-4 text-center">Loading…</div>
            ) : (historyQ.data ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">No value changes recorded.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-1">Old Value</th>
                    <th className="py-1">New Value</th>
                    <th className="py-1">Changed By</th>
                    <th className="py-1">Changed At</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(historyQ.data ?? []).map(h => (
                    <tr key={h.id}>
                      <td className="py-1.5 font-mono">{h.old_value === null ? "—" : fmtValue(h.old_value)}</td>
                      <td className="py-1.5 font-mono">{h.new_value === null ? "—" : fmtValue(h.new_value)}</td>
                      <td className="py-1.5">{h.changed_by_name ?? ""}</td>
                      <td className="py-1.5 text-xs text-slate-500">{new Date(h.changed_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

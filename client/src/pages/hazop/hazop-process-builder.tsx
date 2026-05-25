import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ShieldAlert, Plus, Trash2, Loader2, Edit2, ArrowLeft, AlertTriangle, GitBranch, List } from "lucide-react";

// ── Controlled vocabulary ──────────────────────────────────────────────────────

const EQUIPMENT_CATEGORIES = [
  "Tank", "Pump", "Heat Exchanger", "Heater", "Vessel", "Column", "Separator",
  "Filter", "Control Valve", "Isolation Valve", "Check Valve", "Instrument",
  "Utility System", "Drain", "Vent", "Product Outlet", "Waste Outlet", "Next Loop",
];

const CONNECTION_TYPES = [
  "Pipe (flanged)", "Pipe (screwed)", "Pipe (welded)", "Flexible hose",
  "Instrumentation line", "Electrical signal", "Mechanical link", "Virtual (logic only)", "Loop transition",
];

const OUTLET_DESTINATIONS = [
  { value: "next_step", label: "Next Step" },
  { value: "prev_step", label: "Previous Step" },
  { value: "start_of_loop", label: "Start of Loop" },
  { value: "specific_step", label: "Specific Step" },
  { value: "next_loop", label: "Next Loop" },
  { value: "recycle", label: "Recycle" },
  { value: "bypass", label: "Bypass" },
  { value: "drain", label: "Drain" },
  { value: "vent", label: "Vent" },
  { value: "product_outlet", label: "Product Outlet" },
  { value: "waste_outlet", label: "Waste Outlet" },
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface Study {
  id: number;
  study_number: string;
  title: string;
  status: string;
  study_mode: string;
  project_id: number | null;
}

interface Loop {
  id: number;
  loop_number: number;
  loop_name: string;
  fluid: string | null;
  p_and_id_ref: string | null;
  line_number: string | null;
  operating_pressure_min: number | null;
  operating_pressure_max: number | null;
  operating_temp_min: number | null;
  operating_temp_max: number | null;
  status: string;
  step_count: string;
}

interface Step {
  id: number;
  sequence_no: number;
  equipment_category: string;
  equipment_tag: string | null;
  equipment_role: string | null;
  connection_type: string;
  outlet_type: string | null;
  outlet_destination: string;
  outlet_destination_ref: string | null;
  operating_pressure: number | null;
  operating_temperature: number | null;
  fluid: string | null;
  remarks: string | null;
  buy_list_line_id: number | null;
  concept_equipment_id: number | null;
  node_id: number | null;
  node_reference: string | null;
  deviation_count: number;
  action_count: number;
  concept_equipment_tag: string | null;
  buy_list_tag: string | null;
}

interface EquipmentPoolItem {
  id: number;
  concept_tag?: string;
  tag_no?: string;
  equipment_category?: string;
  equipment_role?: string;
  service_description?: string;
}

interface ConceptEquipment {
  id: number;
  concept_tag: string;
  equipment_category: string;
  equipment_role: string | null;
}

// ── Loop status badge ──────────────────────────────────────────────────────────

function LoopStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    hazop_generated: "bg-green-100 text-green-700",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status === "hazop_generated" ? "Generated" : "Draft"}
    </span>
  );
}

// ── Loop form dialog ───────────────────────────────────────────────────────────

interface LoopFormProps {
  open: boolean;
  onClose: () => void;
  studyId: number;
  editing?: Loop | null;
}

function LoopFormDialog({ open, onClose, studyId, editing }: LoopFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.loop_name ?? "");
  const [fluid, setFluid] = useState(editing?.fluid ?? "");
  const [pandid, setPandid] = useState(editing?.p_and_id_ref ?? "");
  const [lineNo, setLineNo] = useState(editing?.line_number ?? "");
  const [pMin, setPMin] = useState(editing?.operating_pressure_min?.toString() ?? "");
  const [pMax, setPMax] = useState(editing?.operating_pressure_max?.toString() ?? "");
  const [tMin, setTMin] = useState(editing?.operating_temp_min?.toString() ?? "");
  const [tMax, setTMax] = useState(editing?.operating_temp_max?.toString() ?? "");

  const mutation = useMutation({
    mutationFn: (body: Record<string, any>) =>
      editing
        ? apiRequest("PATCH", `/api/hazop/loops/${editing.id}`, body)
        : apiRequest("POST", `/api/hazop/studies/${studyId}/loops`, body),
    onSuccess: () => {
      toast({ title: editing ? "Loop updated" : "Loop created" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/studies", studyId, "loops"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!name.trim()) { toast({ title: "Loop name is required", variant: "destructive" }); return; }
    mutation.mutate({
      loop_name: name.trim(), fluid: fluid || null, p_and_id_ref: pandid || null,
      line_number: lineNo || null,
      operating_pressure_min: pMin ? parseFloat(pMin) : null,
      operating_pressure_max: pMax ? parseFloat(pMax) : null,
      operating_temp_min: tMin ? parseFloat(tMin) : null,
      operating_temp_max: tMax ? parseFloat(tMax) : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Loop" : "Add Process Loop"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Loop Name <span className="text-red-500">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Feed Pump Loop" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>P&ID Reference</Label>
              <Input value={pandid} onChange={e => setPandid(e.target.value)} placeholder="e.g. P&ID-001-A" />
            </div>
            <div>
              <Label>Line Number</Label>
              <Input value={lineNo} onChange={e => setLineNo(e.target.value)} placeholder='e.g. 6"-P-101-CS' />
            </div>
          </div>
          <div>
            <Label>Fluid</Label>
            <Input value={fluid} onChange={e => setFluid(e.target.value)} placeholder="e.g. Used Engine Oil" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Pressure Min (barg)</Label>
              <Input type="number" value={pMin} onChange={e => setPMin(e.target.value)} />
            </div>
            <div>
              <Label>Pressure Max (barg)</Label>
              <Input type="number" value={pMax} onChange={e => setPMax(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Temp Min (°C)</Label>
              <Input type="number" value={tMin} onChange={e => setTMin(e.target.value)} />
            </div>
            <div>
              <Label>Temp Max (°C)</Label>
              <Input type="number" value={tMax} onChange={e => setTMax(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {editing ? "Save Changes" : "Create Loop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Concept Equipment mini-form ────────────────────────────────────────────────

interface ConceptEquipmentFormProps {
  open: boolean;
  onClose: () => void;
  studyId: number;
  defaultCategory?: string;
}

function ConceptEquipmentFormDialog({ open, onClose, studyId, defaultCategory }: ConceptEquipmentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState(defaultCategory ?? "");
  const [tag, setTag] = useState("");
  const [role, setRole] = useState("");

  const mutation = useMutation({
    mutationFn: (body: Record<string, any>) =>
      apiRequest("POST", `/api/hazop/studies/${studyId}/concept-equipment`, body),
    onSuccess: () => {
      toast({ title: "Concept equipment added" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/studies", studyId, "equipment-pool"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/studies", studyId, "concept-equipment"] });
      setTag(""); setRole("");
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Concept Equipment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Category <span className="text-red-500">*</span></Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>{EQUIPMENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Concept Tag <span className="text-red-500">*</span></Label>
            <Input value={tag} onChange={e => setTag(e.target.value)} placeholder="e.g. P-101" />
          </div>
          <div>
            <Label>Equipment Role</Label>
            <Input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Feed Pump" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate({ equipment_category: category, concept_tag: tag, equipment_role: role || null })} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Step form dialog ───────────────────────────────────────────────────────────

interface StepFormProps {
  open: boolean;
  onClose: () => void;
  loopId: number;
  studyId: number;
  studyMode: string;
  editing?: Step | null;
}

function StepFormDialog({ open, onClose, loopId, studyId, studyMode, editing }: StepFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState(editing?.equipment_category ?? "");
  const [tag, setTag] = useState(editing?.equipment_tag ?? "");
  const [role, setRole] = useState(editing?.equipment_role ?? "");
  const [connType, setConnType] = useState(editing?.connection_type ?? "");
  const [outletDest, setOutletDest] = useState(editing?.outlet_destination ?? "next_step");
  const [outletType, setOutletType] = useState(editing?.outlet_type ?? "");
  const [outletRef, setOutletRef] = useState(editing?.outlet_destination_ref ?? "");
  const [pressure, setPressure] = useState(editing?.operating_pressure?.toString() ?? "");
  const [temperature, setTemperature] = useState(editing?.operating_temperature?.toString() ?? "");
  const [fluid, setFluid] = useState(editing?.fluid ?? "");
  const [remarks, setRemarks] = useState(editing?.remarks ?? "");
  const [ceId, setCeId] = useState<string>(editing?.concept_equipment_id?.toString() ?? "");
  const [blId, setBlId] = useState<string>(editing?.buy_list_line_id?.toString() ?? "");
  const [showAddConcept, setShowAddConcept] = useState(false);

  const isConceptMode = studyMode === "concept_expected_project";

  const { data: poolData } = useQuery<{ mode: string; items: EquipmentPoolItem[] }>({
    queryKey: ["/api/hazop/studies", studyId, "equipment-pool", category],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}/equipment-pool${category ? `?category=${encodeURIComponent(category)}` : ""}`).then(r => r.json()),
    enabled: open,
  });

  const poolItems = poolData?.items ?? [];

  const mutation = useMutation({
    mutationFn: (body: Record<string, any>) =>
      editing
        ? apiRequest("PATCH", `/api/hazop/steps/${editing.id}`, body)
        : apiRequest("POST", `/api/hazop/loops/${loopId}/steps`, body),
    onSuccess: (data: any) => {
      if (data?.warnings?.length) {
        data.warnings.forEach((w: string) => toast({ title: "Warning", description: w, variant: "destructive" }));
      }
      toast({ title: editing ? "Step updated" : "Step added" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/loops", loopId, "steps"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!category) { toast({ title: "Equipment category is required", variant: "destructive" }); return; }
    if (!connType) { toast({ title: "Connection type is required", variant: "destructive" }); return; }
    if (!outletDest) { toast({ title: "Outlet destination is required", variant: "destructive" }); return; }

    const body: Record<string, any> = {
      equipment_category: category,
      equipment_tag: tag || null,
      equipment_role: role || null,
      connection_type: connType,
      outlet_type: outletType || null,
      outlet_destination: outletDest,
      outlet_destination_ref: outletRef || null,
      operating_pressure: pressure ? parseFloat(pressure) : null,
      operating_temperature: temperature ? parseFloat(temperature) : null,
      fluid: fluid || null,
      remarks: remarks || null,
    };
    if (isConceptMode && ceId) body.concept_equipment_id = parseInt(ceId);
    if (!isConceptMode && blId) body.buy_list_line_id = parseInt(blId);

    mutation.mutate(body);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit Step (Seq ${editing.sequence_no})` : "Add Process Step"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Equipment Category <span className="text-red-500">*</span></Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{EQUIPMENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Connection Type <span className="text-red-500">*</span></Label>
                <Select value={connType} onValueChange={setConnType}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{CONNECTION_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {isConceptMode ? (
              <div>
                <Label>Concept Equipment</Label>
                <div className="flex gap-2">
                  <Select value={ceId || "__none__"} onValueChange={v => setCeId(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={poolItems.length === 0 ? "No equipment for this category" : "Select concept equipment…"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {poolItems.map(e => (
                        <SelectItem key={e.id} value={String(e.id)}>
                          {e.concept_tag} {e.equipment_role ? `— ${e.equipment_role}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => setShowAddConcept(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {poolItems.length === 0 && category && (
                  <p className="text-xs text-amber-600 mt-1">No concept equipment found for "{category}". Click + to add one.</p>
                )}
              </div>
            ) : (
              <div>
                <Label>BUY List Equipment Tag</Label>
                <Select value={blId || "__none__"} onValueChange={v => setBlId(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={poolItems.length === 0 ? "No tagged items in BUY list" : "Select tag…"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {poolItems.map(e => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.tag_no} {e.service_description ? `— ${e.service_description}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Equipment Tag</Label>
                <Input value={tag} onChange={e => setTag(e.target.value)} placeholder="e.g. P-101" />
              </div>
              <div>
                <Label>Equipment Role</Label>
                <Input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Feed Pump" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Outlet Destination <span className="text-red-500">*</span></Label>
                <Select value={outletDest} onValueChange={setOutletDest}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {OUTLET_DESTINATIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Outlet Ref / Target Step</Label>
                <Input value={outletRef} onChange={e => setOutletRef(e.target.value)} placeholder="e.g. 3" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Fluid</Label>
                <Input value={fluid} onChange={e => setFluid(e.target.value)} placeholder="e.g. UEO" />
              </div>
              <div>
                <Label>Pressure (barg)</Label>
                <Input type="number" value={pressure} onChange={e => setPressure(e.target.value)} />
              </div>
              <div>
                <Label>Temperature (°C)</Label>
                <Input type="number" value={temperature} onChange={e => setTemperature(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Remarks</Label>
              <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} placeholder="Optional notes…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editing ? "Save Changes" : "Add Step"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConceptEquipmentFormDialog
        open={showAddConcept}
        onClose={() => setShowAddConcept(false)}
        studyId={studyId}
        defaultCategory={category}
      />
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HazopProcessBuilderPage() {
  const params = useParams<{ id: string }>();
  const studyId = parseInt(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedLoopId, setSelectedLoopId] = useState<number | null>(null);
  const [loopFormOpen, setLoopFormOpen] = useState(false);
  const [editingLoop, setEditingLoop] = useState<Loop | null>(null);
  const [deleteLoopTarget, setDeleteLoopTarget] = useState<Loop | null>(null);
  const [stepFormOpen, setStepFormOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<Step | null>(null);
  const [deleteStepTarget, setDeleteStepTarget] = useState<Step | null>(null);

  const { data: study, isLoading: studyLoading } = useQuery<Study>({
    queryKey: ["/api/hazop/studies", studyId],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}`).then(r => r.json()),
  });

  const { data: loops = [], isLoading: loopsLoading } = useQuery<Loop[]>({
    queryKey: ["/api/hazop/studies", studyId, "loops"],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}/loops`).then(r => r.json()),
    enabled: !isNaN(studyId),
  });

  const { data: steps = [], isLoading: stepsLoading } = useQuery<Step[]>({
    queryKey: ["/api/hazop/loops", selectedLoopId, "steps"],
    queryFn: () => fetch(`/api/hazop/loops/${selectedLoopId}/steps`).then(r => r.json()),
    enabled: selectedLoopId !== null,
  });

  const deleteLoopMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/hazop/loops/${id}`),
    onSuccess: () => {
      toast({ title: "Loop deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/studies", studyId, "loops"] });
      setDeleteLoopTarget(null);
      setSelectedLoopId(null);
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const deleteStepMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/hazop/steps/${id}`),
    onSuccess: () => {
      toast({ title: "Step deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/loops", selectedLoopId, "steps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/studies", studyId, "nodes"] });
      setDeleteStepTarget(null);
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const selectedLoop = loops.find(l => l.id === selectedLoopId) ?? null;
  const isDraft = study?.status === "draft";

  if (studyLoading) {
    return <Layout><div className="flex justify-center items-center h-64"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div></Layout>;
  }

  if (!study) {
    return <Layout><div className="p-8 text-center text-gray-500">Study not found.</div></Layout>;
  }

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/hazop/dashboard")} className="gap-1 text-gray-500">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-red-50 border border-red-100">
                <GitBranch className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">{study.study_number}</div>
                <div className="text-xs text-gray-500">{study.title}</div>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${study.study_mode === "concept_expected_project" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
              {study.study_mode === "concept_expected_project" ? "Concept" : "Project"}
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/nodes`)} className="gap-1">
              <List className="h-4 w-4" /> Node Register
            </Button>
            {isDraft && (
              <Button size="sm" onClick={() => { setEditingLoop(null); setLoopFormOpen(true); }} className="gap-1">
                <Plus className="h-4 w-4" /> Add Loop
              </Button>
            )}
          </div>
        </div>

        {/* Body: split panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Loop list */}
          <div className="w-64 border-r bg-gray-50 flex flex-col">
            <div className="px-3 py-2 border-b bg-white">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Process Loops</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {loopsLoading && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>}
              {!loopsLoading && loops.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <p className="text-xs">No loops yet.</p>
                  {isDraft && <p className="text-xs mt-1">Use "Add Loop" to begin.</p>}
                </div>
              )}
              {loops.map(loop => (
                <div
                  key={loop.id}
                  className={`rounded-md p-2 cursor-pointer border transition-colors ${selectedLoopId === loop.id ? "bg-white border-blue-200 shadow-sm" : "border-transparent hover:bg-white hover:border-gray-200"}`}
                  onClick={() => setSelectedLoopId(loop.id)}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium text-gray-800 truncate">#{loop.loop_number} {loop.loop_name}</span>
                    <LoopStatusBadge status={loop.status} />
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{loop.step_count} step{parseInt(loop.step_count) !== 1 ? "s" : ""}</div>
                  {isDraft && (
                    <div className="flex gap-1 mt-1">
                      <button className="text-gray-400 hover:text-blue-600 p-0.5 rounded" onClick={e => { e.stopPropagation(); setEditingLoop(loop); setLoopFormOpen(true); }}>
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button className="text-gray-400 hover:text-red-600 p-0.5 rounded" onClick={e => { e.stopPropagation(); setDeleteLoopTarget(loop); }}>
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Step table */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedLoop ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <GitBranch className="h-10 w-10 mb-3 opacity-20" />
                <p>Select a loop to view steps</p>
                {isDraft && loops.length === 0 && <p className="text-sm mt-1">Start by adding a process loop.</p>}
              </div>
            ) : (
              <>
                {/* Loop header */}
                <div className="px-5 py-3 border-b bg-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-semibold text-gray-900">Loop #{selectedLoop.loop_number} — {selectedLoop.loop_name}</h2>
                      <div className="flex gap-4 mt-0.5 text-xs text-gray-500">
                        {selectedLoop.fluid && <span>Fluid: <strong>{selectedLoop.fluid}</strong></span>}
                        {selectedLoop.p_and_id_ref && <span>P&ID: <strong>{selectedLoop.p_and_id_ref}</strong></span>}
                        {selectedLoop.line_number && <span>Line: <strong>{selectedLoop.line_number}</strong></span>}
                        {(selectedLoop.operating_pressure_min != null || selectedLoop.operating_pressure_max != null) && (
                          <span>P: <strong>{selectedLoop.operating_pressure_min ?? "—"} – {selectedLoop.operating_pressure_max ?? "—"} barg</strong></span>
                        )}
                      </div>
                    </div>
                    {isDraft && (
                      <Button size="sm" onClick={() => { setEditingStep(null); setStepFormOpen(true); }} className="gap-1">
                        <Plus className="h-4 w-4" /> Add Step
                      </Button>
                    )}
                  </div>
                </div>

                {/* Steps */}
                <div className="flex-1 overflow-auto">
                  {stepsLoading ? (
                    <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>
                  ) : steps.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                      <p>No steps in this loop yet.</p>
                      {isDraft && <p className="text-sm mt-1">Add at least 2 steps before running HAZOP generation.</p>}
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b text-left">
                          <th className="px-3 py-2 font-medium text-gray-600 w-12">Seq</th>
                          <th className="px-3 py-2 font-medium text-gray-600">Category</th>
                          <th className="px-3 py-2 font-medium text-gray-600">Tag</th>
                          <th className="px-3 py-2 font-medium text-gray-600">Role</th>
                          <th className="px-3 py-2 font-medium text-gray-600">Connection</th>
                          <th className="px-3 py-2 font-medium text-gray-600">Outlet To</th>
                          <th className="px-3 py-2 font-medium text-gray-600">Node Ref</th>
                          {isDraft && <th className="px-3 py-2 font-medium text-gray-600 text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {steps.map(s => (
                          <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2 font-mono text-xs text-gray-500">{s.sequence_no}</td>
                            <td className="px-3 py-2 text-gray-800">{s.equipment_category}</td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-700">
                              {s.equipment_tag ?? <span className="text-amber-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />No tag</span>}
                            </td>
                            <td className="px-3 py-2 text-gray-600 text-xs">{s.equipment_role ?? "—"}</td>
                            <td className="px-3 py-2 text-gray-500 text-xs">{s.connection_type}</td>
                            <td className="px-3 py-2 text-gray-500 text-xs">
                              {OUTLET_DESTINATIONS.find(o => o.value === s.outlet_destination)?.label ?? s.outlet_destination}
                              {s.outlet_destination_ref && <span className="text-gray-400"> → {s.outlet_destination_ref}</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600 font-mono">{s.node_reference ?? "—"}</td>
                            {isDraft && (
                              <td className="px-3 py-2 text-right">
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => { setEditingStep(s); setStepFormOpen(true); }}>
                                    <Edit2 className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteStepTarget(s)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {steps.length > 0 && steps.length < 2 && (
                    <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 text-xs text-amber-700 flex items-center gap-2">
                      <AlertTriangle className="h-3 w-3" />
                      Minimum 2 steps required before HAZOP generation (Phase 3).
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <LoopFormDialog
        open={loopFormOpen}
        onClose={() => { setLoopFormOpen(false); setEditingLoop(null); }}
        studyId={studyId}
        editing={editingLoop}
      />

      {study && (
        <StepFormDialog
          open={stepFormOpen}
          onClose={() => { setStepFormOpen(false); setEditingStep(null); }}
          loopId={selectedLoopId!}
          studyId={studyId}
          studyMode={study.study_mode}
          editing={editingStep}
        />
      )}

      <AlertDialog open={!!deleteLoopTarget} onOpenChange={(v) => { if (!v) setDeleteLoopTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Loop?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete Loop #{deleteLoopTarget?.loop_number} — <strong>{deleteLoopTarget?.loop_name}</strong> and all its steps and nodes. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteLoopTarget && deleteLoopMutation.mutate(deleteLoopTarget.id)}>
              {deleteLoopMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteStepTarget} onOpenChange={(v) => { if (!v) setDeleteStepTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Step?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete Step {deleteStepTarget?.sequence_no} (<strong>{deleteStepTarget?.equipment_category}</strong>) and its node. Remaining steps keep their sequence numbers unchanged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteStepTarget && deleteStepMutation.mutate(deleteStepTarget.id)}>
              {deleteStepMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

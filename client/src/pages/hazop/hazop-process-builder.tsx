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
import { ShieldAlert, Plus, Trash2, Loader2, Edit2, ArrowLeft, GitBranch, List, ChevronRight, Layers } from "lucide-react";

// ── Controlled vocabulary ──────────────────────────────────────────────────────

const EQUIPMENT_CATEGORIES = [
  "Tank", "Pump", "Heat Exchanger", "Heater", "Vessel", "Column", "Separator",
  "Filter", "Control Valve", "Isolation Valve", "Check Valve", "Instrument",
  "Utility System", "Drain", "Vent", "Product Outlet", "Waste Outlet", "Next Loop",
  // Phase 3B — TWFE equipment categories (step vocabulary only, no virtual regime categories)
  "TWFE Evaporator", "Vacuum Condenser", "Degasoil Flash Vessel",
  "Vacuum Ejector System", "Residue Pump", "Dehydration Column",
];

const PROCESS_FUNCTIONS = [
  "General", "Dehydration", "Degasoil Flash", "TWFE Evaporation",
  "Vacuum Distillation", "Condensation", "Residue Discharge",
];
const OPERATING_REGIMES = ["atmospheric", "vacuum", "pressure"];
const PHASE_STATES = ["liquid", "two_phase", "vapor"];

const CONNECTION_TYPES = [
  "Pipe (flanged)", "Pipe (screwed)", "Pipe (welded)", "Flexible hose",
  "Instrumentation line", "Electrical signal", "Mechanical link", "Virtual (logic only)", "Loop transition",
];

const OUTLET_DESTINATIONS = [
  { value: "next_step",      label: "Next Step" },
  { value: "prev_step",      label: "Previous Step" },
  { value: "start_of_loop",  label: "Start of Loop" },
  { value: "next_node",      label: "Next Node" },
  { value: "next_loop",      label: "Next Loop" },
  { value: "specific_step",  label: "Specific Step" },
  { value: "recycle",        label: "Recycle" },
  { value: "bypass",         label: "Bypass" },
  { value: "drain",          label: "Drain" },
  { value: "vent",           label: "Vent" },
  { value: "product_outlet", label: "Product Outlet" },
  { value: "waste_outlet",   label: "Waste Outlet" },
];

const REF_REQUIRED = new Set(["specific_step", "recycle", "bypass"]);

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
  node_count: string;
  step_count: string;
}

interface Node {
  id: number;
  node_number: number;
  node_name: string;
  node_reference: string;
  node_description: string | null;
  design_intent: string | null;
  p_and_id_ref: string | null;
  deviation_count: number;
  action_count: number;
  step_count: string;
  process_function: string | null;
  operating_regime: string;
  phase_state: string;
  topology_changed_after_review: boolean;
  generated_at: string | null;
  generated_by: number | null;
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
  concept_equipment_tag: string | null;
  buy_list_tag: string | null;
}

interface EquipmentPoolItem {
  id: number;
  concept_tag?: string;
  tag_no?: string;
  equipment_role?: string;
  service_description?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function outletLabel(value: string) {
  return OUTLET_DESTINATIONS.find(o => o.value === value)?.label ?? value;
}

function LoopStatusBadge({ status }: { status: string }) {
  const cls = status === "hazop_generated" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600";
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{status === "hazop_generated" ? "Generated" : "Draft"}</span>;
}

// ── Loop form dialog ───────────────────────────────────────────────────────────

function LoopFormDialog({ open, onClose, studyId, editing }: { open: boolean; onClose: () => void; studyId: number; editing?: Loop | null }) {
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
      editing ? apiRequest("PATCH", `/api/hazop/loops/${editing.id}`, body)
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
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Edit Loop" : "Add Process Loop"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Loop Name <span className="text-red-500">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Feed Pump Loop" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>P&ID Reference</Label><Input value={pandid} onChange={e => setPandid(e.target.value)} placeholder="e.g. P&ID-001-A" /></div>
            <div><Label>Line Number</Label><Input value={lineNo} onChange={e => setLineNo(e.target.value)} placeholder='e.g. 6"-P-101-CS' /></div>
          </div>
          <div><Label>Fluid</Label><Input value={fluid} onChange={e => setFluid(e.target.value)} placeholder="e.g. Used Engine Oil" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Pressure Min (barg)</Label><Input type="number" value={pMin} onChange={e => setPMin(e.target.value)} /></div>
            <div><Label>Pressure Max (barg)</Label><Input type="number" value={pMax} onChange={e => setPMax(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Temp Min (°C)</Label><Input type="number" value={tMin} onChange={e => setTMin(e.target.value)} /></div>
            <div><Label>Temp Max (°C)</Label><Input type="number" value={tMax} onChange={e => setTMax(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {editing ? "Save Changes" : "Create Loop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Node form dialog ───────────────────────────────────────────────────────────

function NodeFormDialog({ open, onClose, loopId, studyId, editing }: { open: boolean; onClose: () => void; loopId: number; studyId: number; editing?: Node | null }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.node_name ?? "");
  const [desc, setDesc] = useState(editing?.node_description ?? "");
  const [intent, setIntent] = useState(editing?.design_intent ?? "");
  const [pandid, setPandid] = useState(editing?.p_and_id_ref ?? "");
  const [processFunction, setProcessFunction] = useState(editing?.process_function ?? "General");
  const [operatingRegime, setOperatingRegime] = useState(editing?.operating_regime ?? "atmospheric");
  const [phaseState, setPhaseState] = useState(editing?.phase_state ?? "liquid");

  const mutation = useMutation({
    mutationFn: (body: Record<string, any>) =>
      editing ? apiRequest("PATCH", `/api/hazop/nodes/${editing.id}`, body)
               : apiRequest("POST", `/api/hazop/loops/${loopId}/nodes`, body),
    onSuccess: () => {
      toast({ title: editing ? "Node updated" : "Node created" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/loops", loopId, "nodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/studies", studyId, "nodes"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!name.trim()) { toast({ title: "Node name is required", variant: "destructive" }); return; }
    mutation.mutate({
      node_name: name.trim(),
      node_description: desc || null,
      design_intent: intent || null,
      p_and_id_ref: pandid || null,
      process_function: processFunction || "General",
      operating_regime: operatingRegime || "atmospheric",
      phase_state: phaseState || "liquid",
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{editing ? "Edit Node" : "Add Process Node"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Node Name <span className="text-red-500">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Feed Pump Suction" />
          </div>
          <div><Label>P&ID Reference</Label><Input value={pandid} onChange={e => setPandid(e.target.value)} placeholder="e.g. P&ID-001-A" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Process Function</Label>
              <Select value={processFunction} onValueChange={setProcessFunction}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{PROCESS_FUNCTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Operating Regime</Label>
              <Select value={operatingRegime} onValueChange={setOperatingRegime}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="atmospheric">Atmospheric</SelectItem>
                  <SelectItem value="vacuum">Vacuum</SelectItem>
                  <SelectItem value="pressure">Pressure</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Phase State</Label>
              <Select value={phaseState} onValueChange={setPhaseState}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="liquid">Liquid</SelectItem>
                  <SelectItem value="two_phase">Two Phase</SelectItem>
                  <SelectItem value="vapor">Vapor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Design Intent</Label><Textarea value={intent} onChange={e => setIntent(e.target.value)} rows={2} placeholder="Describe the intended function of this node…" /></div>
          <div><Label>Description</Label><Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Short label (optional)" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {editing ? "Save Changes" : "Create Node"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Concept equipment mini-form ────────────────────────────────────────────────

function ConceptEquipmentFormDialog({ open, onClose, studyId, defaultCategory }: { open: boolean; onClose: () => void; studyId: number; defaultCategory?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState(defaultCategory ?? "");
  const [tag, setTag] = useState("");
  const [role, setRole] = useState("");

  const mutation = useMutation({
    mutationFn: (body: Record<string, any>) => apiRequest("POST", `/api/hazop/studies/${studyId}/concept-equipment`, body),
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
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Add Concept Equipment</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Category <span className="text-red-500">*</span></Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>{EQUIPMENT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Concept Tag <span className="text-red-500">*</span></Label><Input value={tag} onChange={e => setTag(e.target.value)} placeholder="e.g. P-101" /></div>
          <div><Label>Equipment Role</Label><Input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Feed Pump" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate({ equipment_category: category, concept_tag: tag, equipment_role: role || null })} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Step form dialog ───────────────────────────────────────────────────────────

function StepFormDialog({ open, onClose, nodeId, studyId, studyMode, editing }: {
  open: boolean; onClose: () => void; nodeId: number; studyId: number; studyMode: string; editing?: Step | null;
}) {
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
  const needsRef = REF_REQUIRED.has(outletDest);

  const { data: poolData } = useQuery<{ mode: string; items: EquipmentPoolItem[] }>({
    queryKey: ["/api/hazop/studies", studyId, "equipment-pool", category],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}/equipment-pool${category ? `?category=${encodeURIComponent(category)}` : ""}`).then(r => r.json()),
    enabled: open,
  });
  const poolItems = poolData?.items ?? [];

  const mutation = useMutation({
    mutationFn: (body: Record<string, any>) =>
      editing ? apiRequest("PATCH", `/api/hazop/steps/${editing.id}`, body)
               : apiRequest("POST", `/api/hazop/nodes/${nodeId}/steps`, body),
    onSuccess: (data: any) => {
      if (data?.warnings?.length) {
        data.warnings.forEach((w: string) => toast({ title: "Warning", description: w }));
      }
      toast({ title: editing ? "Step updated" : "Step added" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/nodes", nodeId, "steps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/loops"] });
      onClose();
    },
    onError: (err: any) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  function handleSubmit() {
    if (!category) { toast({ title: "Equipment category is required", variant: "destructive" }); return; }
    if (!connType) { toast({ title: "Connection type is required", variant: "destructive" }); return; }
    if (!outletDest) { toast({ title: "Outlet destination is required", variant: "destructive" }); return; }
    if (needsRef && !outletRef.trim()) {
      toast({ title: "Outlet reference required", description: `Format: {L}.{N}.{S} (e.g. 1.2.3)`, variant: "destructive" }); return;
    }
    const body: Record<string, any> = {
      equipment_category: category,
      equipment_tag: tag || null,
      equipment_role: role || null,
      connection_type: connType,
      outlet_type: outletType || null,
      outlet_destination: outletDest,
      outlet_destination_ref: outletRef.trim() || null,
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
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
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
                  <Button variant="outline" size="sm" onClick={() => setShowAddConcept(true)}><Plus className="h-4 w-4" /></Button>
                </div>
                {poolItems.length === 0 && category && (
                  <p className="text-xs text-amber-600 mt-1">No concept equipment for "{category}". Click + to add one.</p>
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
              <div><Label>Equipment Tag</Label><Input value={tag} onChange={e => setTag(e.target.value)} placeholder="e.g. P-101" /></div>
              <div><Label>Equipment Role</Label><Input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Feed Pump" /></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Outlet Destination <span className="text-red-500">*</span></Label>
                <Select value={outletDest} onValueChange={setOutletDest}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{OUTLET_DESTINATIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>
                  Outlet Ref {needsRef && <span className="text-red-500">*</span>}
                  {needsRef && <span className="ml-1 text-xs text-gray-400 font-normal">format: L.N.S e.g. 1.2.3</span>}
                </Label>
                <Input
                  value={outletRef}
                  onChange={e => setOutletRef(e.target.value)}
                  placeholder={needsRef ? "e.g. 1.2.3" : "—"}
                  className={needsRef && !outletRef.trim() ? "border-amber-400" : ""}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div><Label>Fluid</Label><Input value={fluid} onChange={e => setFluid(e.target.value)} placeholder="e.g. UEO" /></div>
              <div><Label>Pressure (barg)</Label><Input type="number" value={pressure} onChange={e => setPressure(e.target.value)} /></div>
              <div><Label>Temperature (°C)</Label><Input type="number" value={temperature} onChange={e => setTemperature(e.target.value)} /></div>
            </div>

            <div><Label>Remarks</Label><Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} placeholder="Optional notes…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
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
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  const [loopFormOpen, setLoopFormOpen] = useState(false);
  const [editingLoop, setEditingLoop] = useState<Loop | null>(null);
  const [deleteLoopTarget, setDeleteLoopTarget] = useState<Loop | null>(null);

  const [nodeFormOpen, setNodeFormOpen] = useState(false);
  const [editingNode, setEditingNode] = useState<Node | null>(null);
  const [deleteNodeTarget, setDeleteNodeTarget] = useState<Node | null>(null);

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

  const { data: nodes = [], isLoading: nodesLoading } = useQuery<Node[]>({
    queryKey: ["/api/hazop/loops", selectedLoopId, "nodes"],
    queryFn: () => fetch(`/api/hazop/loops/${selectedLoopId}/nodes`).then(r => r.json()),
    enabled: selectedLoopId !== null,
  });

  const { data: steps = [], isLoading: stepsLoading } = useQuery<Step[]>({
    queryKey: ["/api/hazop/nodes", selectedNodeId, "steps"],
    queryFn: () => fetch(`/api/hazop/nodes/${selectedNodeId}/steps`).then(r => r.json()),
    enabled: selectedNodeId !== null,
  });

  const deleteLoopMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/hazop/loops/${id}`),
    onSuccess: () => {
      toast({ title: "Loop deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/studies", studyId, "loops"] });
      setDeleteLoopTarget(null);
      setSelectedLoopId(null);
      setSelectedNodeId(null);
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const deleteNodeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/hazop/nodes/${id}`),
    onSuccess: () => {
      toast({ title: "Node deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/loops", selectedLoopId, "nodes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/studies", studyId, "nodes"] });
      setDeleteNodeTarget(null);
      setSelectedNodeId(null);
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const deleteStepMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/hazop/steps/${id}`),
    onSuccess: () => {
      toast({ title: "Step deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/nodes", selectedNodeId, "steps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hazop/loops", selectedLoopId, "nodes"] });
      setDeleteStepTarget(null);
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const selectedLoop = loops.find(l => l.id === selectedLoopId) ?? null;
  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null;
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
        <div className="px-6 py-4 border-b bg-white flex items-center justify-between shrink-0">
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
            <Button variant="outline" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/worksheet`)} className="gap-1">
              <Layers className="h-4 w-4" /> Worksheet
            </Button>
            {isDraft && (
              <Button size="sm" onClick={() => { setEditingLoop(null); setLoopFormOpen(true); }} className="gap-1">
                <Plus className="h-4 w-4" /> Add Loop
              </Button>
            )}
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="px-6 py-2 border-b bg-gray-50 flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
          <span className="font-medium text-gray-700">Loops</span>
          {selectedLoop && <><ChevronRight className="h-3 w-3" /><span className="font-medium text-gray-700">Loop {selectedLoop.loop_number} — {selectedLoop.loop_name}</span></>}
          {selectedNode && <><ChevronRight className="h-3 w-3" /><span className="font-medium text-gray-700">Node {selectedNode.node_reference} — {selectedNode.node_name}</span></>}
        </div>

        {/* Three-panel body */}
        <div className="flex flex-1 overflow-hidden">

          {/* ── Panel 1: Loops ── */}
          <div className="w-64 border-r flex flex-col bg-white shrink-0">
            <div className="px-3 py-2.5 border-b bg-gray-50 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Loops</span>
              <span className="text-xs text-gray-400">{loops.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loopsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>
              ) : loops.length === 0 ? (
                <div className="py-10 text-center px-3">
                  <GitBranch className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No loops yet.</p>
                  {isDraft && <Button variant="outline" size="sm" className="mt-3 text-xs gap-1" onClick={() => { setEditingLoop(null); setLoopFormOpen(true); }}><Plus className="h-3 w-3" /> Add Loop</Button>}
                </div>
              ) : (
                <div className="py-1">
                  {loops.map(loop => (
                    <div
                      key={loop.id}
                      onClick={() => { setSelectedLoopId(loop.id); setSelectedNodeId(null); }}
                      className={`px-3 py-2.5 cursor-pointer border-b last:border-0 transition-colors ${selectedLoopId === loop.id ? "bg-red-50 border-l-2 border-l-red-500" : "hover:bg-gray-50 border-l-2 border-l-transparent"}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-800 truncate">#{loop.loop_number} {loop.loop_name}</div>
                          {loop.fluid && <div className="text-xs text-gray-400 truncate">{loop.fluid}</div>}
                          <div className="flex gap-2 mt-1">
                            <span className="text-xs text-gray-400">{loop.node_count ?? 0} nodes</span>
                            <LoopStatusBadge status={loop.status} />
                          </div>
                        </div>
                        {isDraft && (
                          <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingLoop(loop); setLoopFormOpen(true); }}><Edit2 className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => setDeleteLoopTarget(loop)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Panel 2: Nodes ── */}
          <div className="w-72 border-r flex flex-col bg-white shrink-0">
            <div className="px-3 py-2.5 border-b bg-gray-50 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Nodes</span>
              {selectedLoop && isDraft && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingNode(null); setNodeFormOpen(true); }}>
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {!selectedLoop ? (
                <div className="py-10 text-center px-3 text-xs text-gray-400">
                  <Layers className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  Select a loop to view nodes.
                </div>
              ) : nodesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>
              ) : nodes.length === 0 ? (
                <div className="py-10 text-center px-3">
                  <Layers className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-gray-400">No nodes in this loop.</p>
                  {isDraft && <Button variant="outline" size="sm" className="mt-3 text-xs gap-1" onClick={() => { setEditingNode(null); setNodeFormOpen(true); }}><Plus className="h-3 w-3" /> Add Node</Button>}
                </div>
              ) : (
                <div className="py-1">
                  {nodes.map(node => (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`px-3 py-2.5 cursor-pointer border-b last:border-0 transition-colors ${selectedNodeId === node.id ? "bg-blue-50 border-l-2 border-l-blue-500" : "hover:bg-gray-50 border-l-2 border-l-transparent"}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs text-gray-500 shrink-0">{node.node_reference}</span>
                            <span className="text-xs font-semibold text-gray-800 truncate">{node.node_name}</span>
                          </div>
                          {node.p_and_id_ref && <div className="text-xs text-gray-400 truncate">{node.p_and_id_ref}</div>}
                          <div className="text-xs text-gray-400 mt-0.5">{node.step_count ?? 0} steps</div>
                        </div>
                        {isDraft && (
                          <div className="flex gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingNode(node); setNodeFormOpen(true); }}><Edit2 className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400 hover:text-red-600" onClick={() => setDeleteNodeTarget(node)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Panel 3: Steps ── */}
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Steps</span>
                {selectedNode && (
                  <span className="text-xs text-gray-400">— Node {selectedNode.node_reference}: {selectedNode.node_name}</span>
                )}
              </div>
              {selectedNode && isDraft && (
                <Button size="sm" className="gap-1 h-7 text-xs" onClick={() => { setEditingStep(null); setStepFormOpen(true); }}>
                  <Plus className="h-3 w-3" /> Add Step
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-auto">
              {!selectedNode ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 p-8">
                  <ShieldAlert className="h-10 w-10 opacity-20 mb-3" />
                  <p className="font-medium text-sm">Select a node to view steps.</p>
                  <p className="text-xs mt-1">Loops → Nodes → Steps</p>
                </div>
              ) : stepsLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-300" /></div>
              ) : steps.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 p-8">
                  <ShieldAlert className="h-10 w-10 opacity-20 mb-3" />
                  <p className="font-medium text-sm">No steps in this node.</p>
                  {isDraft && (
                    <Button variant="outline" size="sm" className="mt-4 gap-1" onClick={() => { setEditingStep(null); setStepFormOpen(true); }}>
                      <Plus className="h-4 w-4" /> Add First Step
                    </Button>
                  )}
                </div>
              ) : (
                <div className="p-4 space-y-2">
                  {steps.map(step => (
                    <div key={step.id} className="border rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">#{step.sequence_no}</span>
                            <span className="text-sm font-semibold text-gray-800">{step.equipment_category}</span>
                            {step.equipment_tag && (
                              <span className="font-mono text-xs text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{step.equipment_tag}</span>
                            )}
                            {step.equipment_role && <span className="text-xs text-gray-500">{step.equipment_role}</span>}
                          </div>
                          <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-gray-500">
                            <span>{step.connection_type}</span>
                            <span className="text-gray-300">|</span>
                            <span className="font-medium text-gray-700">{outletLabel(step.outlet_destination)}</span>
                            {step.outlet_destination_ref && (
                              <span className="font-mono text-gray-500">→ {step.outlet_destination_ref}</span>
                            )}
                            {step.fluid && <><span className="text-gray-300">|</span><span>{step.fluid}</span></>}
                            {step.operating_pressure != null && <span>{step.operating_pressure} barg</span>}
                            {step.operating_temperature != null && <span>{step.operating_temperature} °C</span>}
                          </div>
                          {step.remarks && <div className="mt-1 text-xs text-gray-400 italic">{step.remarks}</div>}
                          {(step.concept_equipment_tag || step.buy_list_tag) && (
                            <div className="mt-1 text-xs text-purple-600">
                              {step.concept_equipment_tag ? `Concept: ${step.concept_equipment_tag}` : `Tag: ${step.buy_list_tag}`}
                            </div>
                          )}
                        </div>
                        {isDraft && (
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingStep(step); setStepFormOpen(true); }}><Edit2 className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={() => setDeleteStepTarget(step)}><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Dialogs ── */}
      <LoopFormDialog
        open={loopFormOpen}
        onClose={() => { setLoopFormOpen(false); setEditingLoop(null); }}
        studyId={studyId}
        editing={editingLoop}
      />

      {selectedLoopId !== null && (
        <NodeFormDialog
          open={nodeFormOpen}
          onClose={() => { setNodeFormOpen(false); setEditingNode(null); }}
          loopId={selectedLoopId}
          studyId={studyId}
          editing={editingNode}
        />
      )}

      {selectedNodeId !== null && study && (
        <StepFormDialog
          open={stepFormOpen}
          onClose={() => { setStepFormOpen(false); setEditingStep(null); }}
          nodeId={selectedNodeId}
          studyId={studyId}
          studyMode={study.study_mode}
          editing={editingStep}
        />
      )}

      {/* Delete Loop */}
      <AlertDialog open={!!deleteLoopTarget} onOpenChange={v => { if (!v) setDeleteLoopTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Loop?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete loop "{deleteLoopTarget?.loop_name}" and all its nodes and steps. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteLoopTarget && deleteLoopMutation.mutate(deleteLoopTarget.id)}>
              {deleteLoopMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Node */}
      <AlertDialog open={!!deleteNodeTarget} onOpenChange={v => { if (!v) setDeleteNodeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Node?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete node "{deleteNodeTarget?.node_name}" and all its steps. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteNodeTarget && deleteNodeMutation.mutate(deleteNodeTarget.id)}>
              {deleteNodeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Step */}
      <AlertDialog open={!!deleteStepTarget} onOpenChange={v => { if (!v) setDeleteStepTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Step?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete step #{deleteStepTarget?.sequence_no} ({deleteStepTarget?.equipment_category})? The node will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => deleteStepTarget && deleteStepMutation.mutate(deleteStepTarget.id)}>
              {deleteStepMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}

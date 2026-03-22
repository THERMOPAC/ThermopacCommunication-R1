import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Award, Users, Calendar, Clock, Target, Star, FileText, Settings,
  Plus, Edit, Trash2, Send, CheckCircle, AlertCircle, Eye, Play,
  Pause, RotateCcw, BarChart3, ChevronRight, Loader2, Shield,
  TrendingUp, UserCheck, AlertTriangle, ClipboardCheck
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  open: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  self_submitted: "bg-yellow-100 text-yellow-800",
  l1_reviewed: "bg-orange-100 text-orange-800",
  l2_reviewed: "bg-purple-100 text-purple-800",
  approved: "bg-green-100 text-green-800",
  closed: "bg-gray-200 text-gray-700",
  paused: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", open: "Open", active: "Active",
  self_submitted: "Self Submitted", l1_reviewed: "L1 Reviewed",
  l2_reviewed: "L2 Reviewed", approved: "Approved",
  closed: "Closed", paused: "Paused",
};

const RATING_COLORS: Record<string, string> = {
  excellent: "bg-green-600 text-white",
  very_good: "bg-green-500 text-white",
  good: "bg-blue-500 text-white",
  fair: "bg-yellow-500 text-white",
  poor: "bg-red-500 text-white",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={`${STATUS_COLORS[status] || "bg-gray-100"} border-0`}>
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

function RatingBadge({ rating }: { rating: string }) {
  return (
    <Badge className={`${RATING_COLORS[rating] || "bg-gray-100"} border-0`}>
      {rating?.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
    </Badge>
  );
}

export default function EmployeeAppraisalsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("my-appraisals");

  const { data: roleCheck } = useQuery<any>({
    queryKey: ["/api/appraisals/role-check"],
  });

  const isHrOrSuperuser = user?.role === "Superuser" || user?.role === "HR";

  const tabs = useMemo(() => {
    const t = [{ id: "my-appraisals", label: "My Appraisals", icon: FileText }];
    if (roleCheck?.isL1Reviewer) t.push({ id: "team-review", label: "Team Review (L1)", icon: UserCheck });
    if (roleCheck?.isL2Reviewer) t.push({ id: "l2-review", label: "L2 Review", icon: Shield });
    if (roleCheck?.isL3Approver) t.push({ id: "l3-approval", label: "L3 Approval", icon: CheckCircle });
    if (isHrOrSuperuser) {
      t.push({ id: "all-appraisals", label: "All Appraisals", icon: Users });
      t.push({ id: "cycles", label: "Cycles", icon: Calendar });
      t.push({ id: "templates", label: "Templates", icon: Settings });
      t.push({ id: "jobs", label: "Jobs & Status", icon: Play });
    }
    return t;
  }, [roleCheck, isHrOrSuperuser]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Award className="h-7 w-7 text-blue-600" /> Employee Appraisals</h1>
          <p className="text-sm text-muted-foreground mt-1">Performance evaluation and review management</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          {tabs.map(tab => (
            <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-1.5 text-xs">
              <tab.icon className="h-3.5 w-3.5" /> {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="my-appraisals"><AppraisalListTab view="my" /></TabsContent>
        <TabsContent value="team-review"><AppraisalListTab view="l1" /></TabsContent>
        <TabsContent value="l2-review"><AppraisalListTab view="l2" /></TabsContent>
        <TabsContent value="l3-approval"><AppraisalListTab view="l3" /></TabsContent>
        <TabsContent value="all-appraisals"><AppraisalListTab view="all" /></TabsContent>
        <TabsContent value="cycles"><CyclesTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="jobs"><JobsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function AppraisalListTab({ view }: { view: string }) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: appraisals, isLoading } = useQuery<any[]>({
    queryKey: ["/api/appraisals", { view }],
    queryFn: async () => {
      const res = await fetch(`/api/appraisals?view=${view}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  if (selectedId) {
    return <AppraisalDetail appraisalId={selectedId} onBack={() => setSelectedId(null)} view={view} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {view === "my" ? "My Appraisals" : view === "l1" ? "Team Appraisals (L1 Review)" : view === "l2" ? "L2 Review Queue" : view === "l3" ? "L3 Approval Queue" : "All Appraisals"}
        </CardTitle>
        <CardDescription>{appraisals?.length || 0} appraisal(s) found</CardDescription>
      </CardHeader>
      <CardContent>
        {!appraisals?.length ? (
          <div className="text-center py-8 text-muted-foreground">No appraisals found for this view.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>L1 Reviewer</TableHead>
                {view !== "my" && <TableHead>Score</TableHead>}
                <TableHead>Rating</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appraisals.map((a: any) => (
                <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedId(a.id)}>
                  <TableCell className="font-medium">{a.employeeName}</TableCell>
                  <TableCell>{a.department || "-"}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell>{a.l1ReviewerName}</TableCell>
                  {view !== "my" && <TableCell>{a.finalScore || a.overallCalculatedScore || "-"}</TableCell>}
                  <TableCell>{a.finalRating ? <RatingBadge rating={a.finalRating} /> : "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm"><Eye className="h-4 w-4 mr-1" /> View</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AppraisalDetail({ appraisalId, onBack, view }: { appraisalId: number; onBack: () => void; view: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [detailTab, setDetailTab] = useState("overview");

  const { data: appraisal, isLoading } = useQuery<any>({
    queryKey: ["/api/appraisals", appraisalId],
    queryFn: async () => {
      const res = await fetch(`/api/appraisals/${appraisalId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: score } = useQuery<any>({
    queryKey: ["/api/appraisals", appraisalId, "score"],
    queryFn: async () => {
      const res = await fetch(`/api/appraisals/${appraisalId}/score`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: kpis } = useQuery<any[]>({
    queryKey: ["/api/appraisals", appraisalId, "kpis"],
    queryFn: async () => {
      const res = await fetch(`/api/appraisals/${appraisalId}/kpis`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: competencies } = useQuery<any[]>({
    queryKey: ["/api/appraisals", appraisalId, "competencies"],
    queryFn: async () => {
      const res = await fetch(`/api/appraisals/${appraisalId}/competencies`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: comments } = useQuery<any[]>({
    queryKey: ["/api/appraisals", appraisalId, "comments"],
    queryFn: async () => {
      const res = await fetch(`/api/appraisals/${appraisalId}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: approvals } = useQuery<any[]>({
    queryKey: ["/api/appraisals", appraisalId, "approvals"],
    queryFn: async () => {
      const res = await fetch(`/api/appraisals/${appraisalId}/approvals`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (!appraisal) return <div className="text-center p-8">Appraisal not found</div>;

  const isEmployee = appraisal.employeeId === user?.id;
  const isL1 = appraisal.l1ReviewerId === user?.id;
  const isL2 = appraisal.l2ReviewerId === user?.id;
  const isL3 = appraisal.l3ApproverId === user?.id;
  const isAdmin = user?.role === "Superuser" || user?.role === "HR";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>Back</Button>
        <h2 className="text-lg font-semibold">{appraisal.employeeName} — Appraisal</h2>
        <StatusBadge status={appraisal.status} />
        {appraisal.finalRating && <RatingBadge rating={appraisal.finalRating} />}
        {appraisal.isLocked && <Badge variant="destructive">Locked</Badge>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <InfoCard label="Department" value={appraisal.department || "-"} />
        <InfoCard label="Designation" value={appraisal.designation || "-"} />
        <InfoCard label="L1 Reviewer" value={appraisal.l1ReviewerName} />
        <InfoCard label="L2 Reviewer" value={appraisal.l2ReviewerName} />
      </div>

      {score && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <ScoreCard label="KPI Score (70%)" value={score.kpiWeightedScore} />
          <ScoreCard label="Competency Score (30%)" value={score.competencyAvgScore} />
          <ScoreCard label="Overall Score" value={score.overallCalculatedScore} highlight />
          <ScoreCard label="Effective Score" value={score.effectiveScore} highlight />
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Weight Valid</p>
            <p className={`text-lg font-bold ${score.weightageValid ? "text-green-600" : "text-red-600"}`}>
              {score.weightageValid ? "Yes" : `No (${score.totalKpiWeight}%)`}
            </p>
          </div>
        </div>
      )}

      <Tabs value={detailTab} onValueChange={setDetailTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="kpis">KPIs ({kpis?.length || 0})</TabsTrigger>
          <TabsTrigger value="competencies">Competencies ({competencies?.length || 0})</TabsTrigger>
          <TabsTrigger value="comments">Comments ({comments?.length || 0})</TabsTrigger>
          <TabsTrigger value="history">History ({approvals?.length || 0})</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewSection appraisal={appraisal} isEmployee={isEmployee} appraisalId={appraisalId} />
        </TabsContent>
        <TabsContent value="kpis">
          <KpiSection appraisalId={appraisalId} appraisal={appraisal} kpis={kpis || []} isEmployee={isEmployee} isL1={isL1} isL2={isL2} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="competencies">
          <CompetencySection appraisalId={appraisalId} appraisal={appraisal} competencies={competencies || []} isEmployee={isEmployee} isL1={isL1} isL2={isL2} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="comments">
          <CommentsSection appraisalId={appraisalId} comments={comments || []} appraisal={appraisal} />
        </TabsContent>
        <TabsContent value="history">
          <HistorySection approvals={approvals || []} />
        </TabsContent>
        <TabsContent value="actions">
          <ActionsSection appraisalId={appraisalId} appraisal={appraisal} isEmployee={isEmployee} isL1={isL1} isL2={isL2} isL3={isL3} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium text-sm">{value}</p>
    </div>
  );
}

function ScoreCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "bg-blue-50 border-blue-200" : ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold ${highlight ? "text-blue-700" : ""}`}>{value?.toFixed(2) || "0.00"}</p>
    </div>
  );
}

function OverviewSection({ appraisal, isEmployee, appraisalId }: { appraisal: any; isEmployee: boolean; appraisalId: number }) {
  const { toast } = useToast();
  const [narrative, setNarrative] = useState(appraisal.selfAssessmentNarrative || "");
  const canEdit = isEmployee && ["open", "draft"].includes(appraisal.status) && !appraisal.isLocked;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/appraisals/${appraisalId}/self-assessment`, { selfAssessmentNarrative: narrative });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId] });
      toast({ title: "Saved", description: "Self-assessment narrative updated." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Self-Assessment Narrative</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {canEdit ? (
          <>
            <Textarea value={narrative} onChange={e => setNarrative(e.target.value)} rows={6} placeholder="Describe your achievements, challenges, and goals..." />
            <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Save Narrative
            </Button>
          </>
        ) : (
          <p className="whitespace-pre-wrap text-sm">{appraisal.selfAssessmentNarrative || "No self-assessment narrative provided."}</p>
        )}

        {appraisal.l1Comments && (
          <div className="mt-4 p-3 bg-orange-50 rounded-lg">
            <p className="text-xs font-medium text-orange-700 mb-1">L1 Comments</p>
            <p className="text-sm">{appraisal.l1Comments}</p>
          </div>
        )}
        {appraisal.l2Comments && (
          <div className="mt-2 p-3 bg-purple-50 rounded-lg">
            <p className="text-xs font-medium text-purple-700 mb-1">L2 Comments</p>
            <p className="text-sm">{appraisal.l2Comments}</p>
          </div>
        )}
        {appraisal.l3Comments && (
          <div className="mt-2 p-3 bg-green-50 rounded-lg">
            <p className="text-xs font-medium text-green-700 mb-1">L3 Comments</p>
            <p className="text-sm">{appraisal.l3Comments}</p>
          </div>
        )}

        {appraisal.l2Score && (
          <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-xs font-medium text-yellow-700 mb-1">L2 Override Score: {appraisal.l2Score}</p>
            <p className="text-sm text-yellow-600">Reason: {appraisal.l2OverrideReason}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KpiSection({ appraisalId, appraisal, kpis, isEmployee, isL1, isL2, isAdmin }: any) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ kpiTitle: "", kpiDescription: "", weightage: "", targetValue: "", selfScore: "", selfComments: "", managerScore: "", managerComments: "", l2Score: "", l2Comments: "" });

  const canAddKpi = (isEmployee && ["open", "draft"].includes(appraisal.status)) || isAdmin;
  const canEditSelf = isEmployee && ["open", "draft"].includes(appraisal.status);
  const canEditL1 = isL1 && appraisal.status === "self_submitted";
  const canEditL2 = isL2 && appraisal.status === "l1_reviewed";

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/appraisals/${appraisalId}/kpis`, {
        kpiTitle: form.kpiTitle, kpiDescription: form.kpiDescription,
        weightage: parseFloat(form.weightage), targetValue: form.targetValue,
        selfScore: form.selfScore ? parseFloat(form.selfScore) : undefined,
        selfComments: form.selfComments,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "score"] });
      setShowAdd(false);
      setForm({ kpiTitle: "", kpiDescription: "", weightage: "", targetValue: "", selfScore: "", selfComments: "", managerScore: "", managerComments: "", l2Score: "", l2Comments: "" });
      toast({ title: "KPI added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (kpiId: number) => {
      const body: any = {};
      if (canEditSelf) { body.kpiTitle = form.kpiTitle; body.kpiDescription = form.kpiDescription; body.weightage = parseFloat(form.weightage); body.targetValue = form.targetValue; body.selfScore = form.selfScore ? parseFloat(form.selfScore) : undefined; body.selfComments = form.selfComments; }
      if (canEditL1) { body.managerScore = form.managerScore ? parseFloat(form.managerScore) : undefined; body.managerComments = form.managerComments; }
      if (canEditL2) { body.l2Score = form.l2Score ? parseFloat(form.l2Score) : undefined; body.l2Comments = form.l2Comments; }
      const res = await apiRequest("PUT", `/api/appraisals/${appraisalId}/kpis/${kpiId}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "score"] });
      setEditId(null);
      toast({ title: "KPI updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (kpiId: number) => {
      await apiRequest("DELETE", `/api/appraisals/${appraisalId}/kpis/${kpiId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "score"] });
      toast({ title: "KPI deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startEdit = (kpi: any) => {
    setForm({ kpiTitle: kpi.kpiTitle || "", kpiDescription: kpi.kpiDescription || "", weightage: kpi.weightage || "", targetValue: kpi.targetValue || "", selfScore: kpi.selfScore || "", selfComments: kpi.selfComments || "", managerScore: kpi.managerScore || "", managerComments: kpi.managerComments || "", l2Score: kpi.l2Score || "", l2Comments: kpi.l2Comments || "" });
    setEditId(kpi.id);
  };

  const totalWeight = kpis.reduce((s: number, k: any) => s + (parseFloat(k.weightage) || 0), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Key Performance Indicators</CardTitle>
          <CardDescription>Total weight: {totalWeight}% {Math.abs(totalWeight - 100) < 0.01 ? "(Valid)" : "(Must equal 100%)"}</CardDescription>
        </div>
        {canAddKpi && !appraisal.isLocked && (
          <Button size="sm" onClick={() => { setShowAdd(true); setForm({ kpiTitle: "", kpiDescription: "", weightage: "", targetValue: "", selfScore: "", selfComments: "", managerScore: "", managerComments: "", l2Score: "", l2Comments: "" }); }}>
            <Plus className="h-4 w-4 mr-1" /> Add KPI
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {kpis.length === 0 ? (
          <p className="text-center py-4 text-muted-foreground">No KPIs added yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>KPI</TableHead>
                <TableHead className="w-20">Weight</TableHead>
                <TableHead className="w-20">Target</TableHead>
                <TableHead className="w-20">Self</TableHead>
                <TableHead className="w-20">L1</TableHead>
                <TableHead className="w-20">L2</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kpis.map((kpi: any) => (
                <TableRow key={kpi.id}>
                  <TableCell>
                    <p className="font-medium text-sm">{kpi.kpiTitle}</p>
                    {kpi.kpiDescription && <p className="text-xs text-muted-foreground">{kpi.kpiDescription}</p>}
                  </TableCell>
                  <TableCell>{kpi.weightage}%</TableCell>
                  <TableCell>{kpi.targetValue || "-"}</TableCell>
                  <TableCell>{kpi.selfScore || "-"}</TableCell>
                  <TableCell>{kpi.managerScore || "-"}</TableCell>
                  <TableCell>{kpi.l2Score || "-"}</TableCell>
                  <TableCell>
                    {(canEditSelf || canEditL1 || canEditL2) && !appraisal.isLocked && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(kpi)}><Edit className="h-3.5 w-3.5" /></Button>
                        {canAddKpi && <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(kpi.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={showAdd || editId !== null} onOpenChange={() => { setShowAdd(false); setEditId(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Edit KPI" : "Add KPI"}</DialogTitle>
              <DialogDescription>Fill in the KPI details below.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {(canEditSelf || showAdd) && (
                <>
                  <div><Label>KPI Title</Label><Input value={form.kpiTitle} onChange={e => setForm({ ...form, kpiTitle: e.target.value })} /></div>
                  <div><Label>Description</Label><Textarea value={form.kpiDescription} onChange={e => setForm({ ...form, kpiDescription: e.target.value })} rows={2} /></div>
                  <div className="grid grid-cols-3 gap-2">
                    <div><Label>Weight (%)</Label><Input type="number" value={form.weightage} onChange={e => setForm({ ...form, weightage: e.target.value })} /></div>
                    <div><Label>Target</Label><Input value={form.targetValue} onChange={e => setForm({ ...form, targetValue: e.target.value })} /></div>
                    <div><Label>Self Score (1-5)</Label><Input type="number" min="1" max="5" step="0.1" value={form.selfScore} onChange={e => setForm({ ...form, selfScore: e.target.value })} /></div>
                  </div>
                  <div><Label>Self Comments</Label><Textarea value={form.selfComments} onChange={e => setForm({ ...form, selfComments: e.target.value })} rows={2} /></div>
                </>
              )}
              {canEditL1 && editId && (
                <div className="space-y-2 p-3 bg-orange-50 rounded-lg">
                  <p className="text-xs font-medium text-orange-700">L1 Manager Scoring</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Manager Score (1-5)</Label><Input type="number" min="1" max="5" step="0.1" value={form.managerScore} onChange={e => setForm({ ...form, managerScore: e.target.value })} /></div>
                  </div>
                  <div><Label>Manager Comments</Label><Textarea value={form.managerComments} onChange={e => setForm({ ...form, managerComments: e.target.value })} rows={2} /></div>
                </div>
              )}
              {canEditL2 && editId && (
                <div className="space-y-2 p-3 bg-purple-50 rounded-lg">
                  <p className="text-xs font-medium text-purple-700">L2 Scoring (Optional Override)</p>
                  <div><Label>L2 Score (1-5)</Label><Input type="number" min="1" max="5" step="0.1" value={form.l2Score} onChange={e => setForm({ ...form, l2Score: e.target.value })} /></div>
                  <div><Label>L2 Comments</Label><Textarea value={form.l2Comments} onChange={e => setForm({ ...form, l2Comments: e.target.value })} rows={2} /></div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAdd(false); setEditId(null); }}>Cancel</Button>
              <Button onClick={() => editId ? updateMutation.mutate(editId) : addMutation.mutate()} disabled={addMutation.isPending || updateMutation.isPending}>
                {(addMutation.isPending || updateMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editId ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function CompetencySection({ appraisalId, appraisal, competencies, isEmployee, isL1, isL2, isAdmin }: any) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ competencyName: "", competencyDescription: "", selfScore: "", selfComments: "", managerScore: "", managerComments: "", l2Score: "", l2Comments: "" });

  const canAdd = (isEmployee && ["open", "draft"].includes(appraisal.status)) || isAdmin;
  const canEditSelf = isEmployee && ["open", "draft"].includes(appraisal.status);
  const canEditL1 = isL1 && appraisal.status === "self_submitted";
  const canEditL2 = isL2 && appraisal.status === "l1_reviewed";

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/appraisals/${appraisalId}/competencies`, {
        competencyName: form.competencyName, competencyDescription: form.competencyDescription,
        selfScore: form.selfScore ? parseFloat(form.selfScore) : undefined, selfComments: form.selfComments,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "competencies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "score"] });
      setShowAdd(false);
      setForm({ competencyName: "", competencyDescription: "", selfScore: "", selfComments: "", managerScore: "", managerComments: "", l2Score: "", l2Comments: "" });
      toast({ title: "Competency added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (compId: number) => {
      const body: any = {};
      if (canEditSelf) { body.competencyName = form.competencyName; body.competencyDescription = form.competencyDescription; body.selfScore = form.selfScore ? parseFloat(form.selfScore) : undefined; body.selfComments = form.selfComments; }
      if (canEditL1) { body.managerScore = form.managerScore ? parseFloat(form.managerScore) : undefined; body.managerComments = form.managerComments; }
      if (canEditL2) { body.l2Score = form.l2Score ? parseFloat(form.l2Score) : undefined; body.l2Comments = form.l2Comments; }
      const res = await apiRequest("PUT", `/api/appraisals/${appraisalId}/competencies/${compId}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "competencies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "score"] });
      setEditId(null);
      toast({ title: "Competency updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (compId: number) => { await apiRequest("DELETE", `/api/appraisals/${appraisalId}/competencies/${compId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "competencies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "score"] });
      toast({ title: "Competency deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startEdit = (comp: any) => {
    setForm({ competencyName: comp.competencyName || "", competencyDescription: comp.competencyDescription || "", selfScore: comp.selfScore || "", selfComments: comp.selfComments || "", managerScore: comp.managerScore || "", managerComments: comp.managerComments || "", l2Score: comp.l2Score || "", l2Comments: comp.l2Comments || "" });
    setEditId(comp.id);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Competencies</CardTitle>
        {canAdd && !appraisal.isLocked && (
          <Button size="sm" onClick={() => { setShowAdd(true); setForm({ competencyName: "", competencyDescription: "", selfScore: "", selfComments: "", managerScore: "", managerComments: "", l2Score: "", l2Comments: "" }); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Competency
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {competencies.length === 0 ? (
          <p className="text-center py-4 text-muted-foreground">No competencies added yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competency</TableHead>
                <TableHead className="w-20">Self</TableHead>
                <TableHead className="w-20">L1</TableHead>
                <TableHead className="w-20">L2</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {competencies.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <p className="font-medium text-sm">{c.competencyName}</p>
                    {c.competencyDescription && <p className="text-xs text-muted-foreground">{c.competencyDescription}</p>}
                  </TableCell>
                  <TableCell>{c.selfScore || "-"}</TableCell>
                  <TableCell>{c.managerScore || "-"}</TableCell>
                  <TableCell>{c.l2Score || "-"}</TableCell>
                  <TableCell>
                    {(canEditSelf || canEditL1 || canEditL2) && !appraisal.isLocked && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(c)}><Edit className="h-3.5 w-3.5" /></Button>
                        {canAdd && <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(c.id)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={showAdd || editId !== null} onOpenChange={() => { setShowAdd(false); setEditId(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editId ? "Edit Competency" : "Add Competency"}</DialogTitle>
              <DialogDescription>Fill in the competency details below.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {(canEditSelf || showAdd) && (
                <>
                  <div><Label>Competency Name</Label><Input value={form.competencyName} onChange={e => setForm({ ...form, competencyName: e.target.value })} /></div>
                  <div><Label>Description</Label><Textarea value={form.competencyDescription} onChange={e => setForm({ ...form, competencyDescription: e.target.value })} rows={2} /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label>Self Score (1-5)</Label><Input type="number" min="1" max="5" step="0.1" value={form.selfScore} onChange={e => setForm({ ...form, selfScore: e.target.value })} /></div>
                  </div>
                  <div><Label>Self Comments</Label><Textarea value={form.selfComments} onChange={e => setForm({ ...form, selfComments: e.target.value })} rows={2} /></div>
                </>
              )}
              {canEditL1 && editId && (
                <div className="space-y-2 p-3 bg-orange-50 rounded-lg">
                  <p className="text-xs font-medium text-orange-700">L1 Manager Scoring</p>
                  <div><Label>Manager Score (1-5)</Label><Input type="number" min="1" max="5" step="0.1" value={form.managerScore} onChange={e => setForm({ ...form, managerScore: e.target.value })} /></div>
                  <div><Label>Manager Comments</Label><Textarea value={form.managerComments} onChange={e => setForm({ ...form, managerComments: e.target.value })} rows={2} /></div>
                </div>
              )}
              {canEditL2 && editId && (
                <div className="space-y-2 p-3 bg-purple-50 rounded-lg">
                  <p className="text-xs font-medium text-purple-700">L2 Scoring</p>
                  <div><Label>L2 Score (1-5)</Label><Input type="number" min="1" max="5" step="0.1" value={form.l2Score} onChange={e => setForm({ ...form, l2Score: e.target.value })} /></div>
                  <div><Label>L2 Comments</Label><Textarea value={form.l2Comments} onChange={e => setForm({ ...form, l2Comments: e.target.value })} rows={2} /></div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAdd(false); setEditId(null); }}>Cancel</Button>
              <Button onClick={() => editId ? updateMutation.mutate(editId) : addMutation.mutate()} disabled={addMutation.isPending || updateMutation.isPending}>
                {editId ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function CommentsSection({ appraisalId, comments, appraisal }: { appraisalId: number; comments: any[]; appraisal: any }) {
  const { toast } = useToast();
  const [newComment, setNewComment] = useState("");
  const [section, setSection] = useState("general");

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/appraisals/${appraisalId}/comments`, { section, comment: newComment });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "comments"] });
      setNewComment("");
      toast({ title: "Comment added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Comments & Discussion</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-center py-4 text-muted-foreground">No comments yet.</p>
        ) : (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {comments.map((c: any) => (
              <div key={c.id} className="p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">{c.commentByName}</span>
                  <Badge variant="outline" className="text-xs">{c.commentByRole}</Badge>
                  <Badge variant="outline" className="text-xs">{c.section}</Badge>
                  <span className="text-xs text-muted-foreground ml-auto">{new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm">{c.comment}</p>
              </div>
            ))}
          </div>
        )}
        {!appraisal.isLocked && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex gap-2">
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="kpi">KPI</SelectItem>
                  <SelectItem value="competency">Competency</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                  <SelectItem value="recommendation">Recommendation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea value={newComment} onChange={e => setNewComment(e.target.value)} placeholder="Add a comment..." rows={2} />
            <Button size="sm" onClick={() => addMutation.mutate()} disabled={!newComment.trim() || addMutation.isPending}>Add Comment</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HistorySection({ approvals }: { approvals: any[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Approval History</CardTitle></CardHeader>
      <CardContent>
        {approvals.length === 0 ? (
          <p className="text-center py-4 text-muted-foreground">No approval actions yet.</p>
        ) : (
          <div className="space-y-3">
            {approvals.map((a: any) => (
              <div key={a.id} className="flex items-start gap-3 p-3 border rounded-lg">
                <ChevronRight className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.previousStatus} />
                    <span className="text-xs">→</span>
                    <StatusBadge status={a.newStatus} />
                    <span className="text-xs text-muted-foreground ml-2">by {a.performedByName}</span>
                  </div>
                  {a.remarks && <p className="text-sm text-muted-foreground mt-1">{a.remarks}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{new Date(a.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionsSection({ appraisalId, appraisal, isEmployee, isL1, isL2, isL3, isAdmin }: any) {
  const { toast } = useToast();
  const [actionDialog, setActionDialog] = useState<string | null>(null);
  const [actionForm, setActionForm] = useState({ remarks: "", l1Comments: "", l2Comments: "", l2Score: "", l2OverrideReason: "", l3Comments: "", reopenReason: "", reopenTargetStage: "open", l1IncrementRecommendation: "", l1PromotionRecommendation: "", l1TrainingRecommendation: "", l2IncrementRecommendation: "", l2PromotionRecommendation: "", l2TrainingRecommendation: "" });

  const actionMutation = useMutation({
    mutationFn: async ({ action, body }: { action: string; body: any }) => {
      const res = await apiRequest("POST", `/api/appraisals/${appraisalId}/${action}`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "score"] });
      setActionDialog(null);
      toast({ title: "Action completed successfully" });
    },
    onError: (e: any) => toast({ title: "Action failed", description: e.message, variant: "destructive" }),
  });

  const handleAction = (action: string) => {
    let body: any = { remarks: actionForm.remarks };
    if (action === "l1-review") {
      body.l1Comments = actionForm.l1Comments;
      body.l1IncrementRecommendation = actionForm.l1IncrementRecommendation;
      body.l1PromotionRecommendation = actionForm.l1PromotionRecommendation;
      body.l1TrainingRecommendation = actionForm.l1TrainingRecommendation;
    }
    if (action === "l2-review") {
      body.l2Comments = actionForm.l2Comments;
      body.l2Score = actionForm.l2Score ? parseFloat(actionForm.l2Score) : undefined;
      body.l2OverrideReason = actionForm.l2OverrideReason;
      body.l2IncrementRecommendation = actionForm.l2IncrementRecommendation;
      body.l2PromotionRecommendation = actionForm.l2PromotionRecommendation;
      body.l2TrainingRecommendation = actionForm.l2TrainingRecommendation;
    }
    if (action === "l3-approve") { body.l3Comments = actionForm.l3Comments; }
    if (action === "reopen") { body.reopenReason = actionForm.reopenReason; body.reopenTargetStage = actionForm.reopenTargetStage; }
    actionMutation.mutate({ action, body });
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Available Actions</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isEmployee && appraisal.status === "open" && (
          <Button className="w-full justify-start" onClick={() => setActionDialog("self-submit")}>
            <Send className="h-4 w-4 mr-2" /> Submit Self-Assessment
          </Button>
        )}
        {isL1 && appraisal.status === "self_submitted" && (
          <Button className="w-full justify-start" variant="outline" onClick={() => setActionDialog("l1-review")}>
            <ClipboardCheck className="h-4 w-4 mr-2" /> Complete L1 Review
          </Button>
        )}
        {isL2 && appraisal.status === "l1_reviewed" && (
          <Button className="w-full justify-start" variant="outline" onClick={() => setActionDialog("l2-review")}>
            <Shield className="h-4 w-4 mr-2" /> Complete L2 Review
          </Button>
        )}
        {isL3 && appraisal.status === "l2_reviewed" && (
          <Button className="w-full justify-start bg-green-600 hover:bg-green-700" onClick={() => setActionDialog("l3-approve")}>
            <CheckCircle className="h-4 w-4 mr-2" /> Final Approval (L3)
          </Button>
        )}
        {isAdmin && ["approved", "closed"].includes(appraisal.status) && (
          <Button className="w-full justify-start" variant="destructive" onClick={() => setActionDialog("reopen")}>
            <RotateCcw className="h-4 w-4 mr-2" /> Reopen Appraisal
          </Button>
        )}
        {!isEmployee && !isL1 && !isL2 && !isL3 && !isAdmin && (
          <p className="text-muted-foreground text-sm">No actions available for your role at this stage.</p>
        )}

        <Dialog open={actionDialog !== null} onOpenChange={() => setActionDialog(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {actionDialog === "self-submit" && "Submit Self-Assessment"}
                {actionDialog === "l1-review" && "Complete L1 Review"}
                {actionDialog === "l2-review" && "Complete L2 Review"}
                {actionDialog === "l3-approve" && "Final Approval"}
                {actionDialog === "reopen" && "Reopen Appraisal"}
              </DialogTitle>
              <DialogDescription>
                {actionDialog === "self-submit" && "This will submit your self-assessment for L1 review. Ensure all KPIs have weightages summing to 100%."}
                {actionDialog === "l1-review" && "Complete your review with manager scores for all KPIs and competencies."}
                {actionDialog === "l2-review" && "Review and optionally override the L1 score."}
                {actionDialog === "l3-approve" && "This will finalize the appraisal and lock the record."}
                {actionDialog === "reopen" && "This will unlock the appraisal and reset it to the selected stage."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {actionDialog === "l1-review" && (
                <>
                  <div><Label>L1 Comments (Required)</Label><Textarea value={actionForm.l1Comments} onChange={e => setActionForm({ ...actionForm, l1Comments: e.target.value })} rows={3} /></div>
                  <div><Label>Increment Recommendation</Label><Input value={actionForm.l1IncrementRecommendation} onChange={e => setActionForm({ ...actionForm, l1IncrementRecommendation: e.target.value })} /></div>
                  <div><Label>Promotion Recommendation</Label><Input value={actionForm.l1PromotionRecommendation} onChange={e => setActionForm({ ...actionForm, l1PromotionRecommendation: e.target.value })} /></div>
                  <div><Label>Training Recommendation</Label><Input value={actionForm.l1TrainingRecommendation} onChange={e => setActionForm({ ...actionForm, l1TrainingRecommendation: e.target.value })} /></div>
                </>
              )}
              {actionDialog === "l2-review" && (
                <>
                  <div><Label>L2 Comments (Required)</Label><Textarea value={actionForm.l2Comments} onChange={e => setActionForm({ ...actionForm, l2Comments: e.target.value })} rows={3} /></div>
                  <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 space-y-2">
                    <p className="text-xs font-medium text-yellow-700">Score Override (Optional)</p>
                    <div><Label>Override Score (1-5)</Label><Input type="number" min="1" max="5" step="0.1" value={actionForm.l2Score} onChange={e => setActionForm({ ...actionForm, l2Score: e.target.value })} /></div>
                    {actionForm.l2Score && <div><Label>Override Reason (Required)</Label><Textarea value={actionForm.l2OverrideReason} onChange={e => setActionForm({ ...actionForm, l2OverrideReason: e.target.value })} rows={2} /></div>}
                  </div>
                  <div><Label>Increment Recommendation</Label><Input value={actionForm.l2IncrementRecommendation} onChange={e => setActionForm({ ...actionForm, l2IncrementRecommendation: e.target.value })} /></div>
                  <div><Label>Promotion Recommendation</Label><Input value={actionForm.l2PromotionRecommendation} onChange={e => setActionForm({ ...actionForm, l2PromotionRecommendation: e.target.value })} /></div>
                  <div><Label>Training Recommendation</Label><Input value={actionForm.l2TrainingRecommendation} onChange={e => setActionForm({ ...actionForm, l2TrainingRecommendation: e.target.value })} /></div>
                </>
              )}
              {actionDialog === "l3-approve" && (
                <div><Label>L3 Comments</Label><Textarea value={actionForm.l3Comments} onChange={e => setActionForm({ ...actionForm, l3Comments: e.target.value })} rows={3} /></div>
              )}
              {actionDialog === "reopen" && (
                <>
                  <div><Label>Reason for Reopening (Required)</Label><Textarea value={actionForm.reopenReason} onChange={e => setActionForm({ ...actionForm, reopenReason: e.target.value })} rows={3} /></div>
                  <div>
                    <Label>Target Stage</Label>
                    <Select value={actionForm.reopenTargetStage} onValueChange={v => setActionForm({ ...actionForm, reopenTargetStage: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open (Employee edits)</SelectItem>
                        <SelectItem value="self_submitted">Self Submitted (L1 re-review)</SelectItem>
                        <SelectItem value="l1_reviewed">L1 Reviewed (L2 re-review)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div><Label>Remarks</Label><Input value={actionForm.remarks} onChange={e => setActionForm({ ...actionForm, remarks: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
              <Button onClick={() => actionDialog && handleAction(actionDialog)} disabled={actionMutation.isPending}>
                {actionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function CyclesTab() {
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({ name: "", cycleType: "annual", financialYear: "", startDate: "", selfAssessmentDeadline: "", managerReviewDeadline: "", l2ReviewDeadline: "", approvalDeadline: "", closureDate: "" });

  const { data: cycles, isLoading } = useQuery<any[]>({
    queryKey: ["/api/appraisals/cycles"],
    queryFn: async () => {
      const res = await fetch("/api/appraisals/cycles", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: progress } = useQuery<any>({
    queryKey: ["/api/appraisals/cycles", selectedCycleId, "progress"],
    queryFn: async () => {
      const res = await fetch(`/api/appraisals/cycles/${selectedCycleId}/progress`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: selectedCycleId !== null,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/appraisals/cycles", createForm);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals/cycles"] });
      setShowCreate(false);
      toast({ title: "Cycle created" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: async (cycleId: number) => {
      const res = await apiRequest("POST", `/api/appraisals/cycles/${cycleId}/activate`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals/cycles"] });
      toast({ title: "Cycle activated", description: `${data.created?.length || 0} appraisals created.` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const pauseMutation = useMutation({
    mutationFn: async (cycleId: number) => {
      const res = await apiRequest("POST", `/api/appraisals/cycles/${cycleId}/pause`, { pauseReason: "Paused by administrator" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals/cycles"] });
      toast({ title: "Cycle paused" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resumeMutation = useMutation({
    mutationFn: async (cycleId: number) => {
      const res = await apiRequest("POST", `/api/appraisals/cycles/${cycleId}/resume`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals/cycles"] });
      toast({ title: "Cycle resumed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Appraisal Cycles</CardTitle>
          <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> New Cycle</Button>
        </CardHeader>
        <CardContent>
          {!cycles?.length ? (
            <p className="text-center py-4 text-muted-foreground">No cycles created yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>FY</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Appraisals</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Closure</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycles.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.financialYear}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell>{c.completedAppraisals}/{c.totalAppraisals}</TableCell>
                    <TableCell>{c.startDate}</TableCell>
                    <TableCell>{c.closureDate}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedCycleId(c.id === selectedCycleId ? null : c.id)}>
                          <BarChart3 className="h-3.5 w-3.5" />
                        </Button>
                        {c.status === "draft" && <Button variant="ghost" size="sm" onClick={() => activateMutation.mutate(c.id)}><Play className="h-3.5 w-3.5 text-green-600" /></Button>}
                        {["active", "draft"].includes(c.status) && <Button variant="ghost" size="sm" onClick={() => pauseMutation.mutate(c.id)}><Pause className="h-3.5 w-3.5 text-yellow-600" /></Button>}
                        {c.status === "paused" && <Button variant="ghost" size="sm" onClick={() => resumeMutation.mutate(c.id)}><Play className="h-3.5 w-3.5 text-green-600" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedCycleId && progress && (
        <Card>
          <CardHeader><CardTitle className="text-base">Cycle Progress: {progress.cycle?.name}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">Completion: {progress.completionRate}%</span>
              <Progress value={progress.completionRate} className="flex-1" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(progress.statusCounts || {}).map(([status, count]) => (
                <div key={status} className="rounded-lg border p-3">
                  <StatusBadge status={status} />
                  <p className="text-lg font-bold mt-1">{count as number}</p>
                </div>
              ))}
            </div>
            {progress.overdueBreakdown && Object.values(progress.overdueBreakdown).some((v: any) => v > 0) && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-xs font-medium text-red-700 mb-2">Overdue Items</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  {progress.overdueBreakdown.selfAssessmentOverdue > 0 && <span>Self: {progress.overdueBreakdown.selfAssessmentOverdue}</span>}
                  {progress.overdueBreakdown.managerReviewOverdue > 0 && <span>L1: {progress.overdueBreakdown.managerReviewOverdue}</span>}
                  {progress.overdueBreakdown.l2ReviewOverdue > 0 && <span>L2: {progress.overdueBreakdown.l2ReviewOverdue}</span>}
                  {progress.overdueBreakdown.approvalOverdue > 0 && <span>Approval: {progress.overdueBreakdown.approvalOverdue}</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Appraisal Cycle</DialogTitle>
            <DialogDescription>Set up a new appraisal cycle with deadlines.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Cycle Name</Label><Input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })} placeholder="Annual Appraisal FY 2026-27" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Cycle Type</Label>
                <Select value={createForm.cycleType} onValueChange={v => setCreateForm({ ...createForm, cycleType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="mid_year">Mid-Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Financial Year</Label><Input value={createForm.financialYear} onChange={e => setCreateForm({ ...createForm, financialYear: e.target.value })} placeholder="2026-27" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Start Date</Label><Input type="date" value={createForm.startDate} onChange={e => setCreateForm({ ...createForm, startDate: e.target.value })} /></div>
              <div><Label>Self-Assessment Deadline</Label><Input type="date" value={createForm.selfAssessmentDeadline} onChange={e => setCreateForm({ ...createForm, selfAssessmentDeadline: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Manager Review Deadline</Label><Input type="date" value={createForm.managerReviewDeadline} onChange={e => setCreateForm({ ...createForm, managerReviewDeadline: e.target.value })} /></div>
              <div><Label>L2 Review Deadline</Label><Input type="date" value={createForm.l2ReviewDeadline} onChange={e => setCreateForm({ ...createForm, l2ReviewDeadline: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Approval Deadline</Label><Input type="date" value={createForm.approvalDeadline} onChange={e => setCreateForm({ ...createForm, approvalDeadline: e.target.value })} /></div>
              <div><Label>Closure Date</Label><Input type="date" value={createForm.closureDate} onChange={e => setCreateForm({ ...createForm, closureDate: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplatesTab() {
  const { toast } = useToast();
  const { data: templates, isLoading } = useQuery<any[]>({
    queryKey: ["/api/appraisals/templates"],
    queryFn: async () => {
      const res = await fetch("/api/appraisals/templates", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">Cycle Templates</CardTitle><CardDescription>Templates define auto-creation rules for appraisal cycles</CardDescription></CardHeader>
      <CardContent>
        {!templates?.length ? (
          <p className="text-center py-4 text-muted-foreground">No templates found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Deadlines (days)</TableHead>
                <TableHead>Min Service</TableHead>
                <TableHead>Auto Create</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.cycleType}</TableCell>
                  <TableCell>{t.triggerDay}/{t.triggerMonth}</TableCell>
                  <TableCell className="text-xs">Self: {t.selfDeadlineDays}d, L1: {t.managerDeadlineDays}d, L2: {t.l2DeadlineDays}d, Approval: {t.approvalDeadlineDays}d</TableCell>
                  <TableCell>{t.minServiceDays} days</TableCell>
                  <TableCell>{t.autoCreate ? <Badge className="bg-green-100 text-green-700 border-0">Yes</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                  <TableCell>{t.isActive ? <Badge className="bg-green-100 text-green-700 border-0">Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function JobsTab() {
  const { toast } = useToast();

  const { data: jobStatus, isLoading } = useQuery<any>({
    queryKey: ["/api/appraisals/jobs/status"],
    queryFn: async () => {
      const res = await fetch("/api/appraisals/jobs/status", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const runJobMutation = useMutation({
    mutationFn: async (endpoint: string) => {
      const res = await apiRequest("POST", `/api/appraisals/jobs/${endpoint}`, {});
      return res.json();
    },
    onSuccess: (data: any, endpoint: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals/jobs/status"] });
      toast({ title: `Job completed`, description: `${endpoint.includes("dry-run") ? "Dry run" : "Execution"} finished.` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-lg">Scheduled Jobs</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-3">
            {jobStatus?.scheduledJobs?.map((job: any) => (
              <div key={job.name} className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span className="font-medium text-sm">{job.name}</span>
                  <Badge variant="outline" className="ml-auto text-xs">{job.schedule}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{job.description}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => runJobMutation.mutate(`${job.name === "CycleGeneratorJob" ? "cycle-generator" : job.name === "ActivationJob" ? "activation" : job.name === "ReminderJob" ? "reminder" : "closure"}/dry-run`)} disabled={runJobMutation.isPending}>
                    <Eye className="h-3.5 w-3.5 mr-1" /> Dry Run
                  </Button>
                  <Button size="sm" onClick={() => runJobMutation.mutate(`${job.name === "CycleGeneratorJob" ? "cycle-generator" : job.name === "ActivationJob" ? "activation" : job.name === "ReminderJob" ? "reminder" : "closure"}/run`)} disabled={runJobMutation.isPending}>
                    <Play className="h-3.5 w-3.5 mr-1" /> Run Now
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active Templates</p>
            <p className="text-2xl font-bold text-blue-600">{jobStatus?.activeTemplates || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active Cycles</p>
            <p className="text-2xl font-bold text-green-600">{jobStatus?.activeCycles || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Draft Cycles</p>
            <p className="text-2xl font-bold text-yellow-600">{jobStatus?.draftCycles || 0}</p>
          </CardContent>
        </Card>
      </div>

      {jobStatus?.recentJobRuns?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Job Runs</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobStatus.recentJobRuns.map((log: any) => (
                  <TableRow key={log.id}>
                    <TableCell>{log.action.replace(/_/g, " ")}</TableCell>
                    <TableCell>{log.performedByName || "System"}</TableCell>
                    <TableCell className="text-xs">{new Date(log.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

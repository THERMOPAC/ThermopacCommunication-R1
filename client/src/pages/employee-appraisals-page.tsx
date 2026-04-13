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
import { apiRequest, queryClient, getErrorMessage } from "@/lib/queryClient";
import {
  Award, Users, Calendar, Clock, Target, Star, FileText, Settings,
  Plus, Edit, Trash2, Send, CheckCircle, AlertCircle, Eye, Play,
  Pause, RotateCcw, BarChart3, ChevronRight, Loader2, Shield,
  TrendingUp, UserCheck, AlertTriangle, ClipboardCheck, Library,
  Archive, Power, GripVertical, Copy, Download
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
  resubmission_required: "bg-red-100 text-red-800",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", open: "Open", active: "Active",
  self_submitted: "Self Submitted", l1_reviewed: "L1 Reviewed",
  l2_reviewed: "L2 Reviewed", approved: "Approved",
  closed: "Closed", paused: "Paused",
  resubmission_required: "Resubmission Required",
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
    queryKey: ["/api/appraisals/user/role-check"],
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
      t.push({ id: "kpi-templates", label: "KPI Library", icon: Library });
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
        <TabsContent value="kpi-templates"><KpiTemplateLibraryTab /></TabsContent>
        <TabsContent value="jobs"><JobsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function AppraisalListTab({ view }: { view: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: appraisals, isLoading } = useQuery<any[]>({
    queryKey: ["/api/appraisals", { view }],
    queryFn: async () => {
      const res = await fetch(`/api/appraisals?view=${view}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const deleteAppraisalMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/appraisals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals"] });
      toast({ title: "Appraisal deleted", description: "The appraisal has been removed." });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: getErrorMessage(err), variant: "destructive" });
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
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm"><Eye className="h-4 w-4 mr-1" /> View</Button>
                      {user?.role === 'Superuser' && a.status === 'open' && a.cycleStatus === 'paused' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={deleteAppraisalMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete this appraisal for ${a.employeeName}? This action cannot be undone.`)) {
                              deleteAppraisalMutation.mutate(a.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-1" /> Delete
                        </Button>
                      )}
                      {['approved', 'closed'].includes(a.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-green-700 hover:text-green-800"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const resp = await fetch(`/api/appraisals/${a.id}/report`, { credentials: "include" });
                              if (!resp.ok) {
                                const err = await resp.json().catch(() => null);
                                throw new Error(err?.message || 'Failed to download report');
                              }
                              const blob = await resp.blob();
                              const url = window.URL.createObjectURL(blob);
                              const link = document.createElement("a");
                              link.href = url;
                              const cd = resp.headers.get("content-disposition");
                              link.download = cd?.match(/filename="(.+)"/)?.[1] || `appraisal_report_${a.id}.pdf`;
                              document.body.appendChild(link);
                              link.click();
                              link.remove();
                              window.URL.revokeObjectURL(url);
                            } catch (err: any) {
                              toast({ title: "Download Failed", description: getErrorMessage(err), variant: "destructive" });
                            }
                          }}
                        >
                          <Download className="h-4 w-4 mr-1" /> Report
                        </Button>
                      )}
                    </div>
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
          <TabsTrigger value="actions">Actions</TabsTrigger>
          <TabsTrigger value="history">History ({approvals?.length || 0})</TabsTrigger>
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
        <TabsContent value="actions">
          <ActionsSection appraisalId={appraisalId} appraisal={appraisal} isEmployee={isEmployee} isL1={isL1} isL2={isL2} isL3={isL3} isAdmin={isAdmin} score={score} />
        </TabsContent>
        <TabsContent value="history">
          <HistorySection approvals={approvals || []} />
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

const NARRATIVE_MIN_LENGTH = 150;
const NARRATIVE_PLACEHOLDER = `Please cover the following areas in your self-assessment:

1. KEY ACHIEVEMENTS
   What were your most significant accomplishments during this period?

2. CHALLENGES FACED
   What challenges did you encounter and how did you handle them?

3. SKILL IMPROVEMENTS
   What new skills did you develop or improve?

4. CONTRIBUTIONS TO TEAM / PROJECT
   How did you contribute to your team's or project's success?

5. GOALS FOR NEXT PERIOD
   What are your professional goals and development plans going forward?`;

const NARRATIVE_SECTIONS = [
  { title: "Key Achievements", hint: "Describe your most significant accomplishments" },
  { title: "Challenges Faced", hint: "What obstacles did you face and how did you handle them?" },
  { title: "Skill Improvements", hint: "New skills learned or existing skills enhanced" },
  { title: "Team / Project Contributions", hint: "How did you contribute to team or project success?" },
  { title: "Goals for Next Period", hint: "Your professional goals and development plans" },
];

function parseSections(text: string): Record<string, string> {
  const sections: Record<string, string> = { achievements: "", challenges: "", skills: "", contributions: "", goals: "" };
  if (!text) return sections;
  const keys = Object.keys(sections);
  const markers = ["KEY ACHIEVEMENTS", "CHALLENGES FACED", "SKILL IMPROVEMENTS", "TEAM / PROJECT CONTRIBUTIONS", "GOALS FOR NEXT PERIOD"];
  let currentKey = "";
  for (const line of text.split("\n")) {
    const upperLine = line.trim().toUpperCase();
    const markerIdx = markers.findIndex(m => upperLine.includes(m));
    if (markerIdx >= 0) { currentKey = keys[markerIdx]; continue; }
    if (currentKey) sections[currentKey] += (sections[currentKey] ? "\n" : "") + line;
    else sections.achievements += (sections.achievements ? "\n" : "") + line;
  }
  for (const k of keys) sections[k] = sections[k].trim();
  return sections;
}

function combineSections(s: Record<string, string>): string {
  const parts: string[] = [];
  if (s.achievements) parts.push(`KEY ACHIEVEMENTS\n${s.achievements}`);
  if (s.challenges) parts.push(`CHALLENGES FACED\n${s.challenges}`);
  if (s.skills) parts.push(`SKILL IMPROVEMENTS\n${s.skills}`);
  if (s.contributions) parts.push(`TEAM / PROJECT CONTRIBUTIONS\n${s.contributions}`);
  if (s.goals) parts.push(`GOALS FOR NEXT PERIOD\n${s.goals}`);
  return parts.join("\n\n");
}

function OverviewSection({ appraisal, isEmployee, appraisalId }: { appraisal: any; isEmployee: boolean; appraisalId: number }) {
  const { toast } = useToast();
  const initialSections = parseSections(appraisal.selfAssessmentNarrative || "");
  const [sections, setSections] = useState(initialSections);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const canEdit = isEmployee && ["open", "resubmission_required"].includes(appraisal.status) && !appraisal.isLocked;
  const narrative = combineSections(sections);
  const charCount = narrative.trim().length;
  const isValid = charCount >= NARRATIVE_MIN_LENGTH;
  const filledCount = NARRATIVE_SECTIONS.filter((_, i) => {
    const keys = ["achievements", "challenges", "skills", "contributions", "goals"];
    return sections[keys[i]]?.trim().length > 0;
  }).length;
  const wasReopened = !!appraisal.reopenedAt;

  const updateSection = (key: string, value: string) => {
    setSections(prev => ({ ...prev, [key]: value }));
  };

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PUT", `/api/appraisals/${appraisalId}/self-assessment`, { selfAssessmentNarrative: narrative });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId] });
      toast({ title: "Draft Saved", description: "Your self-assessment narrative has been saved as a draft." });
    },
    onError: (e: any) => toast({ title: "Error", description: getErrorMessage(e), variant: "destructive" }),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PUT", `/api/appraisals/${appraisalId}/self-assessment`, { selfAssessmentNarrative: narrative });
      return await apiRequest("POST", `/api/appraisals/${appraisalId}/self-submit`, { remarks: "Self-assessment submitted" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "approvals"] });
      setShowSubmitConfirm(false);
      toast({ title: "Submitted", description: "Your self-assessment has been submitted for L1 review." });
    },
    onError: (e: any) => { setShowSubmitConfirm(false); toast({ title: "Submission Failed", description: getErrorMessage(e), variant: "destructive" }); },
  });

  const sectionKeys = ["achievements", "challenges", "skills", "contributions", "goals"];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" /> Self-Assessment Narrative
              </CardTitle>
              <CardDescription>
                {canEdit
                  ? "Fill in each section below with your self-assessment. Minimum 150 characters total required."
                  : appraisal.status === "open" ? "Only the employee can edit this section." : "Submitted — read-only view."}
              </CardDescription>
            </div>
            {canEdit && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{filledCount}/5 sections</span>
                <span className={`text-xs font-medium px-2 py-1 rounded ${isValid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {charCount} / {NARRATIVE_MIN_LENGTH} min chars
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {wasReopened && appraisal.reopenReason && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-700">This appraisal was reopened</p>
                <p className="text-xs text-amber-600">Reason: {appraisal.reopenReason}</p>
                <p className="text-xs text-amber-500 mt-1">Your previous narrative has been preserved below. Please review and update as needed.</p>
              </div>
            </div>
          )}
          {appraisal.status === "resubmission_required" && appraisal.lastReturnRemarks && (
            <div className="p-3 bg-red-50 border border-red-300 rounded-lg flex items-start gap-2">
              <RotateCcw className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-700">Returned for Resubmission</p>
                <p className="text-sm text-red-600 mt-1">Manager Remarks: {appraisal.lastReturnRemarks}</p>
                {appraisal.resubmissionCount > 0 && (
                  <p className="text-xs text-red-400 mt-1">Previous resubmissions: {appraisal.resubmissionCount}</p>
                )}
                <p className="text-xs text-red-500 mt-2">Please review the feedback, update your self-assessment, scores, and comments as needed, then use the "Resubmit" action.</p>
              </div>
            </div>
          )}

          {canEdit ? (
            <>
              {NARRATIVE_SECTIONS.map((section, i) => {
                const key = sectionKeys[i];
                const hasContent = sections[key]?.trim().length > 0;
                return (
                  <div key={i} className="border rounded-lg overflow-hidden">
                    <div className={`flex items-center gap-2 px-4 py-2.5 ${hasContent ? "bg-green-50 border-b border-green-100" : "bg-gray-50 border-b"}`}>
                      <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${hasContent ? "bg-green-600 text-white" : "bg-gray-300 text-white"}`}>
                        {hasContent ? <CheckCircle className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className="font-medium text-sm">{section.title}</span>
                      {hasContent && <span className="text-xs text-green-600 ml-auto">{sections[key].trim().length} chars</span>}
                    </div>
                    <div className="p-3">
                      <Textarea
                        value={sections[key]}
                        onChange={e => updateSection(key, e.target.value)}
                        rows={3}
                        placeholder={`Type here: ${section.hint}`}
                        className="border-dashed text-sm resize-none focus:border-solid"
                      />
                    </div>
                  </div>
                );
              })}

              {!isValid && charCount > 0 && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Minimum {NARRATIVE_MIN_LENGTH} characters total required. You need {NARRATIVE_MIN_LENGTH - charCount} more.
                </p>
              )}

              <Separator />

              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={saveDraftMutation.isPending || !narrative.trim()}
                >
                  {saveDraftMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  <Edit className="h-4 w-4 mr-1" /> Save Draft
                </Button>
                {["open", "draft"].includes(appraisal.status) && (
                  <Button
                    size="sm"
                    onClick={() => setShowSubmitConfirm(true)}
                    disabled={!isValid || submitMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Send className="h-4 w-4 mr-1" /> Submit Self-Assessment
                  </Button>
                )}
                {appraisal.status === "resubmission_required" && (
                  <span className="text-xs text-blue-600 font-medium">Save your draft, then use the "Resubmit" button in Available Actions.</span>
                )}
                {!isValid && ["open", "draft"].includes(appraisal.status) && (
                  <span className="text-xs text-muted-foreground">Fill in all sections to enable submission</span>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {appraisal.selfAssessmentNarrative ? (
                <>
                  {(() => {
                    const parsed = parseSections(appraisal.selfAssessmentNarrative);
                    const hasStructured = Object.values(parsed).some(v => v.trim().length > 0);
                    if (hasStructured) {
                      return NARRATIVE_SECTIONS.map((section, i) => {
                        const key = ["achievements", "challenges", "skills", "contributions", "goals"][i];
                        const content = parsed[key];
                        if (!content) return null;
                        return (
                          <div key={i} className="border rounded-lg overflow-hidden">
                            <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b">
                              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold">{i + 1}</span>
                              <span className="font-medium text-sm">{section.title}</span>
                            </div>
                            <div className="p-3">
                              <p className="text-sm whitespace-pre-wrap leading-relaxed">{content}</p>
                            </div>
                          </div>
                        );
                      });
                    }
                    return (
                      <div className="p-4 bg-gray-50 rounded-lg border">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{appraisal.selfAssessmentNarrative}</p>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No self-assessment narrative provided yet.</p>
                </div>
              )}
              {appraisal.selfSubmittedAt && (
                <p className="text-xs text-muted-foreground">Submitted on: {new Date(appraisal.selfSubmittedAt).toLocaleString()}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {(appraisal.l1Comments || appraisal.l2Comments || appraisal.l3Comments || appraisal.l2Score) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Reviewer Remarks</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {appraisal.l1Comments && (
              <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-xs font-medium text-orange-700 mb-1 flex items-center gap-1"><UserCheck className="h-3.5 w-3.5" /> L1 Manager Comments</p>
                <p className="text-sm">{appraisal.l1Comments}</p>
                {appraisal.l1ReviewedAt && <p className="text-xs text-orange-400 mt-1">Reviewed: {new Date(appraisal.l1ReviewedAt).toLocaleString()}</p>}
              </div>
            )}
            {appraisal.l2Comments && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-xs font-medium text-purple-700 mb-1 flex items-center gap-1"><Shield className="h-3.5 w-3.5" /> L2 Reviewer Comments</p>
                <p className="text-sm">{appraisal.l2Comments}</p>
                {appraisal.l2ReviewedAt && <p className="text-xs text-purple-400 mt-1">Reviewed: {new Date(appraisal.l2ReviewedAt).toLocaleString()}</p>}
              </div>
            )}
            {appraisal.l2Score && (
              <div className="p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <p className="text-xs font-medium text-yellow-700 mb-1 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> L2 Score Override: {appraisal.l2Score}</p>
                <p className="text-sm text-yellow-600">Reason: {appraisal.l2OverrideReason}</p>
              </div>
            )}
            {appraisal.l3Comments && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <p className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> L3 Approver Comments</p>
                <p className="text-sm">{appraisal.l3Comments}</p>
                {appraisal.l3ApprovedAt && <p className="text-xs text-green-400 mt-1">Approved: {new Date(appraisal.l3ApprovedAt).toLocaleString()}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(appraisal.l3IncrementValue !== null || appraisal.l3PromotionApproved !== null || appraisal.l3FinalRemarks) && ['approved', 'closed'].includes(appraisal.status) && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4 text-green-600" /> L3 Decision Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Increment</p>
                <p className={`font-medium text-sm ${Number(appraisal.l3IncrementValue) < 0 ? 'text-red-600' : Number(appraisal.l3IncrementValue) > 0 ? 'text-green-600' : ''}`}>
                  {appraisal.l3IncrementValue !== null && appraisal.l3IncrementValue !== undefined ? `${appraisal.l3IncrementValue}%` : 'None'}
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Promotion</p>
                <p className={`font-medium text-sm ${appraisal.l3PromotionApproved ? 'text-green-600' : ''}`}>
                  {appraisal.l3PromotionApproved ? 'Approved' : 'Not Approved'}
                </p>
              </div>
              {appraisal.l3NewDesignation && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">New Designation</p>
                  <p className="font-medium text-sm">{appraisal.l3NewDesignation}</p>
                </div>
              )}
              {appraisal.l3EffectiveDate && (
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Effective Date</p>
                  <p className="font-medium text-sm">{new Date(appraisal.l3EffectiveDate).toLocaleDateString()}</p>
                </div>
              )}
              {appraisal.l3FinalRemarks && (
                <div className="rounded-lg border p-3 col-span-2 md:col-span-3">
                  <p className="text-xs text-muted-foreground">Final Remarks</p>
                  <p className="text-sm">{appraisal.l3FinalRemarks}</p>
                </div>
              )}
            </div>
            {appraisal.systemRecommendation && (
              <div className="mt-3 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                <p className="text-xs font-medium text-indigo-700 mb-2">System Recommendation (at time of approval)</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Score:</span> <span className="font-medium">{(appraisal.systemRecommendation as any).finalScore?.toFixed(2)}</span></div>
                  <div><span className="text-muted-foreground">Band:</span> <span className="font-medium capitalize">{(appraisal.systemRecommendation as any).ratingBand?.replace('_', ' ')}</span></div>
                  <div><span className="text-muted-foreground">Suggested %:</span> <span className="font-medium">{(appraisal.systemRecommendation as any).incrementRange?.min}–{(appraisal.systemRecommendation as any).incrementRange?.max}%</span></div>
                  <div><span className="text-muted-foreground">Promotion:</span> <span className="font-medium">{(appraisal.systemRecommendation as any).promotionSuitability}</span></div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Self-Assessment?</DialogTitle>
            <DialogDescription>
              Once submitted, your self-assessment narrative and KPI/competency self-scores will be locked for editing.
              Your L1 manager ({appraisal.l1ReviewerName}) will be notified to begin their review.
              This action cannot be undone unless an admin reopens the appraisal.
            </DialogDescription>
          </DialogHeader>
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs font-medium text-blue-700 mb-1">Narrative Preview ({charCount} characters)</p>
            <p className="text-xs text-blue-600 line-clamp-4">{narrative}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitConfirm(false)}>Cancel</Button>
            <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending} className="bg-green-600 hover:bg-green-700">
              {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Confirm & Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiSection({ appraisalId, appraisal, kpis, isEmployee, isL1, isL2, isAdmin }: any) {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const emptyForm = { kpiTitle: "", kpiDescription: "", weightage: "", targetValue: "", achievedValue: "", selfScore: "", selfComments: "", managerScore: "", managerComments: "", l2Score: "", l2Comments: "" };
  const [form, setForm] = useState(emptyForm);
  const [selectedTemplateKpi, setSelectedTemplateKpi] = useState("");
  const [showTemplateSwitch, setShowTemplateSwitch] = useState(false);
  const [switchTemplateId, setSwitchTemplateId] = useState<number | null>(null);
  const [switchMode, setSwitchMode] = useState<"replace" | "merge">("replace");
  const [confirmReset, setConfirmReset] = useState(false);

  const canSwitchTemplate = ["open", "draft"].includes(appraisal.status) && !appraisal.isLocked;

  const canAddKpi = (isEmployee && ["open", "draft"].includes(appraisal.status)) || (isL1 && appraisal.status === "self_submitted") || isAdmin;
  const canEditSelf = isEmployee && ["open", "draft", "resubmission_required"].includes(appraisal.status);
  const canEditL1 = isL1 && appraisal.status === "self_submitted";
  const canEditL2 = isL2 && appraisal.status === "l1_reviewed";
  const isResubmission = appraisal.status === "resubmission_required";
  const canEditDefinition = (canEditSelf && !isResubmission) || canEditL1;

  const { data: templateData } = useQuery<any>({
    queryKey: ["/api/appraisals", appraisalId, "template-kpis"],
    queryFn: async () => {
      const res = await fetch(`/api/appraisals/${appraisalId}/template-kpis`, { credentials: "include" });
      if (!res.ok) return { items: [] };
      return res.json();
    },
    enabled: showAdd && !editId && canEditDefinition,
  });
  const templateItems = templateData?.items || [];
  const existingTitles = new Set(kpis.map((k: any) => k.kpiTitle?.toLowerCase()));

  const existingWeight = kpis.reduce((s: number, k: any) => s + (parseFloat(k.weightage) || 0), 0);
  const editingKpiWeight = editId ? (parseFloat(kpis.find((k: any) => k.id === editId)?.weightage) || 0) : 0;
  const otherWeight = existingWeight - editingKpiWeight;
  const currentFormWeight = parseFloat(form.weightage) || 0;
  const liveTotal = otherWeight + currentFormWeight;
  const weightExceeds = liveTotal > 100.01;

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!form.kpiTitle.trim()) throw new Error("KPI Title is required");
      if (!currentFormWeight || currentFormWeight <= 0) throw new Error("Weight must be greater than 0");
      if (weightExceeds) throw new Error(`Total weight would be ${liveTotal.toFixed(1)}% — cannot exceed 100%`);
      return await apiRequest("POST", `/api/appraisals/${appraisalId}/kpis`, {
        kpiTitle: form.kpiTitle, kpiDescription: form.kpiDescription,
        weightage: parseFloat(form.weightage), targetValue: form.targetValue,
        achievedValue: form.achievedValue || undefined,
        selfScore: form.selfScore ? parseFloat(form.selfScore) : undefined,
        selfComments: form.selfComments,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "score"] });
      setShowAdd(false);
      setForm(emptyForm);
      toast({ title: "KPI added" });
    },
    onError: (e: any) => toast({ title: "Error", description: getErrorMessage(e), variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (kpiId: number) => {
      if (canEditDefinition && weightExceeds) throw new Error(`Total weight would be ${liveTotal.toFixed(1)}% — cannot exceed 100%`);
      if (canEditDefinition && (!currentFormWeight || currentFormWeight <= 0)) throw new Error("Weight must be greater than 0");
      const body: any = {};
      if (canEditDefinition) { body.kpiTitle = form.kpiTitle; body.kpiDescription = form.kpiDescription; body.weightage = parseFloat(form.weightage); body.targetValue = form.targetValue; body.achievedValue = form.achievedValue || undefined; }
      if (canEditSelf) { body.selfScore = form.selfScore ? parseFloat(form.selfScore) : undefined; body.selfComments = form.selfComments; }
      if (canEditL1) { body.managerScore = form.managerScore ? parseFloat(form.managerScore) : undefined; body.managerComments = form.managerComments; }
      if (canEditL2) { body.l2Score = form.l2Score ? parseFloat(form.l2Score) : undefined; body.l2Comments = form.l2Comments; }
      return await apiRequest("PUT", `/api/appraisals/${appraisalId}/kpis/${kpiId}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "score"] });
      setEditId(null);
      toast({ title: "KPI updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: getErrorMessage(e), variant: "destructive" }),
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
    onError: (e: any) => toast({ title: "Error", description: getErrorMessage(e), variant: "destructive" }),
  });

  const { data: availableTemplates } = useQuery<any>({
    queryKey: ["/api/appraisals", appraisalId, "available-templates"],
    queryFn: async () => {
      const res = await fetch(`/api/appraisals/${appraisalId}/available-templates`, { credentials: "include" });
      if (!res.ok) return { templates: [] };
      return res.json();
    },
    enabled: showTemplateSwitch,
  });

  const switchTemplateMutation = useMutation({
    mutationFn: async () => {
      if (!switchTemplateId) throw new Error("Please select a template");
      return await apiRequest("POST", `/api/appraisals/${appraisalId}/switch-template`, {
        templateId: switchTemplateId,
        mode: switchMode,
        confirmReset,
      });
    },
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "kpis"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "score"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId] });
      setShowTemplateSwitch(false);
      setSwitchTemplateId(null);
      setSwitchMode("replace");
      setConfirmReset(false);
      toast({ title: "Template Switched", description: data.message });
    },
    onError: (e: any) => {
      if (e.message?.includes("confirmReset")) {
        setConfirmReset(false);
        toast({ title: "Scoring Detected", description: "Some KPIs have scores. Please confirm the reset to proceed.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: getErrorMessage(e), variant: "destructive" });
      }
    },
  });

  const startEdit = (kpi: any) => {
    setForm({ kpiTitle: kpi.kpiTitle || "", kpiDescription: kpi.kpiDescription || "", weightage: kpi.weightage || "", targetValue: kpi.targetValue || "", achievedValue: kpi.achievedValue || "", selfScore: kpi.selfScore || "", selfComments: kpi.selfComments || "", managerScore: kpi.managerScore || "", managerComments: kpi.managerComments || "", l2Score: kpi.l2Score || "", l2Comments: kpi.l2Comments || "" });
    setEditId(kpi.id);
  };

  const weightValid = Math.abs(existingWeight - 100) < 0.01;
  const remainingWeight = Math.max(0, 100 - otherWeight);
  const hasScoring = kpis.some((k: any) => k.selfScore || k.managerScore || k.l2Score);
  const selectedSwitchTemplate = availableTemplates?.templates?.find((t: any) => t.id === switchTemplateId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            Key Performance Indicators
            {appraisal.templateChangeCount > 0 && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-medium">
                <RotateCcw className="h-3 w-3 mr-1" /> Template Changed
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <div className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${weightValid ? "bg-green-100 text-green-700" : existingWeight > 100 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
              <span>Total Weight: {existingWeight.toFixed(1)}%</span>
              {weightValid ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            </div>
            {!weightValid && <span className="text-xs text-muted-foreground">{existingWeight < 100 ? `${(100 - existingWeight).toFixed(1)}% remaining` : "Exceeds 100%"}</span>}
            {appraisal.appliedTemplateName && (
              <span className="text-xs text-muted-foreground">Template: {appraisal.appliedTemplateName}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {canSwitchTemplate && (
            <Button size="sm" variant="outline" disabled onClick={() => { setShowTemplateSwitch(true); setSwitchTemplateId(null); setSwitchMode("replace"); setConfirmReset(false); }}>
              <Library className="h-4 w-4 mr-1" /> Switch Template
            </Button>
          )}
          {canAddKpi && !appraisal.isLocked && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => { setShowAdd(true); setForm(emptyForm); setSelectedTemplateKpi(""); }} disabled={existingWeight >= 100}>
                <Plus className="h-4 w-4 mr-1" /> Add KPI
              </Button>
              {existingWeight >= 100 && (
                <span className="text-xs text-muted-foreground">Weight is 100% — edit existing KPIs to free up weight before adding new ones</span>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {kpis.length === 0 ? (
          <p className="text-center py-4 text-muted-foreground">No KPIs added yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px] max-w-[200px]">KPI</TableHead>
                <TableHead className="w-16">Weight</TableHead>
                <TableHead className="w-24">Target (Expected)</TableHead>
                <TableHead className="w-24">Actual (Achieved)</TableHead>
                <TableHead className="w-20">Self</TableHead>
                {["self_submitted", "l1_reviewed", "l2_reviewed", "approved", "closed"].includes(appraisal.status) && <TableHead className="w-20">L1</TableHead>}
                {["l1_reviewed", "l2_reviewed", "approved", "closed"].includes(appraisal.status) && <TableHead className="w-20">L2</TableHead>}
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kpis.map((kpi: any) => (
                <TableRow key={kpi.id}>
                  <TableCell className="max-w-[200px]">
                    <p className="font-medium text-sm truncate" title={kpi.kpiTitle}>{kpi.kpiTitle}</p>
                    {kpi.kpiDescription && <p className="text-xs text-muted-foreground line-clamp-2" title={kpi.kpiDescription}>{kpi.kpiDescription}</p>}
                  </TableCell>
                  <TableCell><span className="font-medium">{kpi.weightage}%</span></TableCell>
                  <TableCell>{kpi.targetValue || "-"}</TableCell>
                  <TableCell>{kpi.achievedValue || "-"}</TableCell>
                  <TableCell>
                    {kpi.selfScore ? <Badge variant="outline" className="bg-blue-50">{kpi.selfScore}</Badge> : "-"}
                  </TableCell>
                  {["self_submitted", "l1_reviewed", "l2_reviewed", "approved", "closed"].includes(appraisal.status) && (
                    <TableCell>
                      {kpi.managerScore ? <Badge variant="outline" className="bg-orange-50">{kpi.managerScore}</Badge> : "-"}
                    </TableCell>
                  )}
                  {["l1_reviewed", "l2_reviewed", "approved", "closed"].includes(appraisal.status) && (
                    <TableCell>
                      {kpi.l2Score ? <Badge variant="outline" className="bg-purple-50">{kpi.l2Score}</Badge> : "-"}
                    </TableCell>
                  )}
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
          <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{editId ? `Edit KPI — ${form.kpiTitle}` : "Add KPI"}</DialogTitle>
              <DialogDescription>{canEditL1 && editId ? "Review and adjust the KPI definition, then provide your manager score." : "Define the KPI with a clear, measurable target."}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              {canEditDefinition && (
                <div className={`p-2 rounded-lg text-xs font-medium flex items-center justify-between ${weightExceeds ? "bg-red-100 text-red-700" : liveTotal > 99.99 && liveTotal < 100.01 ? "bg-green-100 text-green-700" : "bg-blue-50 text-blue-700"}`}>
                  <span>Weight Budget: {liveTotal.toFixed(1)}% / 100%</span>
                  <span>{weightExceeds ? "Exceeds limit!" : `${Math.max(0, 100 - liveTotal).toFixed(1)}% remaining`}</span>
                </div>
              )}
              {canEditDefinition && (
                <div className="space-y-3 p-3 bg-gray-50 rounded-lg border">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">KPI Definition {canEditL1 ? "(Editable by L1)" : ""}</p>
                  {!editId && templateItems.length > 0 && (
                    <div>
                      <Label>Pick from Template <span className="text-xs text-muted-foreground font-normal">({templateData?.templateName} — {templateData?.department}/{templateData?.level})</span></Label>
                      <Select value={selectedTemplateKpi} onValueChange={v => {
                        setSelectedTemplateKpi(v);
                        if (v) {
                          const item = templateItems.find((i: any) => String(i.id) === v);
                          if (item) {
                            setForm({ ...form, kpiTitle: item.kpiTitle, kpiDescription: item.kpiDescription || "", weightage: item.defaultWeightage || "", targetValue: item.targetGuidance || "" });
                          }
                        }
                      }}>
                        <SelectTrigger><SelectValue placeholder="Select a KPI from template..." /></SelectTrigger>
                        <SelectContent>
                          {templateItems.map((item: any) => {
                            const alreadyAdded = existingTitles.has(item.kpiTitle?.toLowerCase());
                            return (
                              <SelectItem key={item.id} value={String(item.id)} disabled={alreadyAdded}>
                                {item.kpiTitle} ({item.defaultWeightage}%){alreadyAdded ? " — Already added" : ""}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      <Separator className="my-2" />
                    </div>
                  )}
                  <div><Label>KPI Title <span className="text-red-500">*</span></Label><Input value={form.kpiTitle} onChange={e => setForm({ ...form, kpiTitle: e.target.value })} placeholder="Enter a clear, specific KPI title" /></div>
                  <div><Label>Description</Label><Textarea value={form.kpiDescription} onChange={e => setForm({ ...form, kpiDescription: e.target.value })} rows={2} placeholder="Describe how this KPI will be measured" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>Weight (%) <span className="text-red-500">*</span></Label>
                      <Input type="number" min="1" max={remainingWeight + (editId ? editingKpiWeight : 0)} value={form.weightage} onChange={e => setForm({ ...form, weightage: e.target.value })} className={weightExceeds || (!currentFormWeight && form.weightage !== "") ? "border-red-400" : ""} />
                      {currentFormWeight <= 0 && form.weightage !== "" && <p className="text-xs text-red-500 mt-0.5">Must be greater than 0</p>}
                    </div>
                    <div>
                      <Label>Target (Expected Outcome) <span className="text-red-500">*</span></Label>
                      <Input value={form.targetValue} onChange={e => setForm({ ...form, targetValue: e.target.value })} placeholder="e.g. 95% uptime, 10 units/month" />
                    </div>
                  </div>
                  <div>
                    <Label>Actual (Achieved Result)</Label>
                    <Input value={form.achievedValue} onChange={e => setForm({ ...form, achievedValue: e.target.value })} placeholder="e.g. 92% uptime, 8 units delivered" />
                  </div>
                </div>
              )}
              {canEditSelf && (
                <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Self Assessment</p>
                  <div>
                    <Label>Self Score <span className="text-red-500">*</span></Label>
                    <Select value={form.selfScore} onValueChange={v => setForm({ ...form, selfScore: v })}>
                      <SelectTrigger><SelectValue placeholder="Select score (1-5)" /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={String(n)}>{n} — {["Poor", "Fair", "Good", "Very Good", "Excellent"][n - 1]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-blue-600 mt-0.5">Required before submission</p>
                  </div>
                  <div><Label>Self Comments</Label><Textarea value={form.selfComments} onChange={e => setForm({ ...form, selfComments: e.target.value })} rows={2} placeholder="Justify your self-score with specific examples" /></div>
                </div>
              )}
              {canEditL1 && editId && !canEditSelf && (
                <div className="space-y-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide">L1 Manager Review</p>
                  <div className="flex gap-4 text-xs text-orange-700 bg-orange-100 p-2 rounded">
                    <span>Target: <strong>{form.targetValue || "—"}</strong></span>
                    <span>Actual: <strong>{form.achievedValue || "Not entered"}</strong></span>
                    <span>Self Score: <strong>{form.selfScore || "—"}</strong></span>
                  </div>
                  <div>
                    <Label>Manager Score <span className="text-red-500">*</span></Label>
                    <Select value={form.managerScore} onValueChange={v => setForm({ ...form, managerScore: v })}>
                      <SelectTrigger><SelectValue placeholder="Select score (1-5)" /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={String(n)}>{n} — {["Poor", "Fair", "Good", "Very Good", "Excellent"][n - 1]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Manager Comments</Label><Textarea value={form.managerComments} onChange={e => setForm({ ...form, managerComments: e.target.value })} rows={2} placeholder="Provide specific feedback on this KPI performance" /></div>
                </div>
              )}
              {canEditL2 && editId && (
                <div className="space-y-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide">L2 Scoring (Optional Override)</p>
                  <div>
                    <Label>L2 Score</Label>
                    <Select value={form.l2Score} onValueChange={v => setForm({ ...form, l2Score: v })}>
                      <SelectTrigger><SelectValue placeholder="Select score (1-5)" /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={String(n)}>{n} — {["Poor", "Fair", "Good", "Very Good", "Excellent"][n - 1]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>L2 Comments</Label><Textarea value={form.l2Comments} onChange={e => setForm({ ...form, l2Comments: e.target.value })} rows={2} /></div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAdd(false); setEditId(null); }}>Cancel</Button>
              <Button onClick={() => editId ? updateMutation.mutate(editId) : addMutation.mutate()} disabled={addMutation.isPending || updateMutation.isPending || (canEditDefinition && (weightExceeds || currentFormWeight <= 0))}>
                {(addMutation.isPending || updateMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editId ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showTemplateSwitch} onOpenChange={() => { setShowTemplateSwitch(false); setSwitchTemplateId(null); setConfirmReset(false); }}>
          <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Library className="h-5 w-5" /> Switch KPI Template
              </DialogTitle>
              <DialogDescription>
                Select a different KPI template for this appraisal. Only templates from the employee's department ({appraisal.department}) are available.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              {!availableTemplates?.canSwitch && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 inline mr-1" />
                  Template change is only allowed when the appraisal status is <strong>Open</strong> or <strong>Draft</strong>. Current status: <strong>{STATUS_LABELS[appraisal.status] || appraisal.status}</strong>.
                </div>
              )}
              {availableTemplates?.canSwitch && (
                <>
                  {appraisal.appliedTemplateName && (
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                      Current template: <strong>{appraisal.appliedTemplateName}</strong>
                      {appraisal.templateChangeCount > 0 && <span className="ml-2">(Changed {appraisal.templateChangeCount} time{appraisal.templateChangeCount > 1 ? "s" : ""})</span>}
                    </div>
                  )}
                  <div>
                    <Label>Select Template</Label>
                    <Select value={switchTemplateId ? String(switchTemplateId) : ""} onValueChange={v => { setSwitchTemplateId(parseInt(v)); setConfirmReset(false); }}>
                      <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                      <SelectContent>
                        {(availableTemplates?.templates || []).map((t: any) => (
                          <SelectItem key={t.id} value={String(t.id)} disabled={t.id === appraisal.appliedTemplateId}>
                            {t.name} ({t.hierarchyLevel}) — {t.itemCount} KPIs
                            {t.id === appraisal.appliedTemplateId ? " (Current)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedSwitchTemplate && (
                    <div className="p-3 bg-gray-50 rounded-lg border text-xs space-y-2">
                      <p className="font-semibold text-gray-700">{selectedSwitchTemplate.name}</p>
                      <p className="text-gray-500">{selectedSwitchTemplate.itemCount} KPIs • Total Weight: {selectedSwitchTemplate.totalWeight}%</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {selectedSwitchTemplate.items?.map((item: any) => (
                          <div key={item.id} className="flex justify-between text-gray-600">
                            <span>{item.kpiTitle}</span>
                            <span className="font-medium">{item.defaultWeightage}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <Label>Apply Mode</Label>
                    <Select value={switchMode} onValueChange={(v: any) => { setSwitchMode(v); setConfirmReset(false); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="replace">Replace All KPIs (removes existing, adds template KPIs)</SelectItem>
                        <SelectItem value="merge">Keep Existing + Add Missing KPIs</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {switchMode === "replace" && kpis.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                      <AlertTriangle className="h-4 w-4 inline mr-1" />
                      This will remove all <strong>{kpis.length} existing KPI{kpis.length > 1 ? "s" : ""}</strong> and replace them with the template KPIs.
                      {hasScoring && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                          <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                          <strong>Warning:</strong> Some KPIs already have scores. Replacing will delete all scored data.
                          <label className="flex items-center gap-2 mt-2 cursor-pointer">
                            <input type="checkbox" checked={confirmReset} onChange={e => setConfirmReset(e.target.checked)} className="rounded" />
                            <span>I confirm: reset all scores and replace KPIs</span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowTemplateSwitch(false); setSwitchTemplateId(null); setConfirmReset(false); }}>Cancel</Button>
              <Button
                onClick={() => switchTemplateMutation.mutate()}
                disabled={!switchTemplateId || !availableTemplates?.canSwitch || switchTemplateMutation.isPending || (switchMode === "replace" && hasScoring && !confirmReset)}
              >
                {switchTemplateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {switchMode === "replace" ? "Replace KPIs" : "Merge KPIs"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

const SCORE_OPTIONS = [
  { value: "1", label: "1 - Poor" },
  { value: "2", label: "2 - Fair" },
  { value: "3", label: "3 - Good" },
  { value: "4", label: "4 - Very Good" },
  { value: "5", label: "5 - Excellent" },
];

function CompetencySection({ appraisalId, appraisal, competencies, isEmployee, isL1, isL2, isAdmin }: any) {
  const { toast } = useToast();
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ selfScore: "", selfComments: "", managerScore: "", managerComments: "", l2Score: "", l2Comments: "" });

  const canEditSelf = isEmployee && ["open", "draft", "resubmission_required"].includes(appraisal.status);
  const canEditL1 = isL1 && appraisal.status === "self_submitted";
  const canEditL2 = isL2 && appraisal.status === "l1_reviewed";
  const equalWeight = competencies.length > 0 ? (100 / competencies.length).toFixed(1) : "20.0";

  const updateMutation = useMutation({
    mutationFn: async (compId: number) => {
      const body: any = {};
      if (canEditSelf) { body.selfScore = form.selfScore ? parseFloat(form.selfScore) : undefined; body.selfComments = form.selfComments; }
      if (canEditL1) { body.managerScore = form.managerScore ? parseFloat(form.managerScore) : undefined; body.managerComments = form.managerComments; }
      if (canEditL2) { body.l2Score = form.l2Score ? parseFloat(form.l2Score) : undefined; body.l2Comments = form.l2Comments; }
      return await apiRequest("PUT", `/api/appraisals/${appraisalId}/competencies/${compId}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "competencies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "score"] });
      setEditId(null);
      toast({ title: "Competency score saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: getErrorMessage(e), variant: "destructive" }),
  });

  const startEdit = (comp: any) => {
    setForm({ selfScore: comp.selfScore || "", selfComments: comp.selfComments || "", managerScore: comp.managerScore || "", managerComments: comp.managerComments || "", l2Score: comp.l2Score || "", l2Comments: comp.l2Comments || "" });
    setEditId(comp.id);
  };

  const editingComp = competencies.find((c: any) => c.id === editId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Company Competencies</CardTitle>
            <CardDescription className="text-xs mt-1">5 fixed competencies evaluated equally ({equalWeight}% each). These are the same across all departments.</CardDescription>
          </div>
          <Badge variant="outline" className="text-xs">Equal Weight: {equalWeight}% each</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {competencies.length === 0 ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-muted-foreground text-sm">Loading competencies...</span>
          </div>
        ) : (
          <div className="space-y-3">
            {competencies.map((c: any, idx: number) => (
              <div key={c.id} className="border rounded-lg p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground w-5">{idx + 1}.</span>
                      <span className="font-medium text-sm">{c.competencyName}</span>
                      <Badge variant="outline" className="text-[10px]">{equalWeight}%</Badge>
                    </div>
                    {c.competencyDescription && <p className="text-xs text-muted-foreground ml-7 mt-0.5">{c.competencyDescription}</p>}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="text-center">
                      <p className="text-muted-foreground mb-0.5">Self</p>
                      <Badge className={c.selfScore ? "bg-blue-100 text-blue-800 border-0" : "bg-gray-100 text-gray-500 border-0"}>
                        {c.selfScore || "-"}
                      </Badge>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground mb-0.5">L1</p>
                      <Badge className={c.managerScore ? "bg-orange-100 text-orange-800 border-0" : "bg-gray-100 text-gray-500 border-0"}>
                        {c.managerScore || "-"}
                      </Badge>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground mb-0.5">L2</p>
                      <Badge className={c.l2Score ? "bg-purple-100 text-purple-800 border-0" : "bg-gray-100 text-gray-500 border-0"}>
                        {c.l2Score || "-"}
                      </Badge>
                    </div>
                    {(canEditSelf || canEditL1 || canEditL2) && !appraisal.isLocked && (
                      <Button variant="ghost" size="sm" onClick={() => startEdit(c)} className="ml-1">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {c.selfComments && <div className="ml-7 mt-2 text-xs bg-blue-50 p-2 rounded"><span className="font-medium text-blue-700">Self:</span> {c.selfComments}</div>}
                {c.managerComments && <div className="ml-7 mt-1 text-xs bg-orange-50 p-2 rounded"><span className="font-medium text-orange-700">L1:</span> {c.managerComments}</div>}
                {c.l2Comments && <div className="ml-7 mt-1 text-xs bg-purple-50 p-2 rounded"><span className="font-medium text-purple-700">L2:</span> {c.l2Comments}</div>}
              </div>
            ))}
          </div>
        )}

        <Dialog open={editId !== null} onOpenChange={() => setEditId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Score: {editingComp?.competencyName}</DialogTitle>
              <DialogDescription>{editingComp?.competencyDescription}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {canEditSelf && (
                <div className="space-y-2 p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs font-medium text-blue-700">Self Assessment</p>
                  <div>
                    <Label>Self Score (1-5)</Label>
                    <Select value={form.selfScore} onValueChange={v => setForm({ ...form, selfScore: v })}>
                      <SelectTrigger><SelectValue placeholder="Select score" /></SelectTrigger>
                      <SelectContent>
                        {SCORE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Self Comments</Label><Textarea value={form.selfComments} onChange={e => setForm({ ...form, selfComments: e.target.value })} rows={2} placeholder="Optional comments..." /></div>
                </div>
              )}
              {canEditL1 && (
                <div className="space-y-2 p-3 bg-orange-50 rounded-lg">
                  <p className="text-xs font-medium text-orange-700">L1 Manager Scoring</p>
                  {editingComp?.selfScore && <p className="text-xs text-muted-foreground">Employee self-score: {editingComp.selfScore}</p>}
                  <div>
                    <Label>Manager Score (1-5)</Label>
                    <Select value={form.managerScore} onValueChange={v => setForm({ ...form, managerScore: v })}>
                      <SelectTrigger><SelectValue placeholder="Select score" /></SelectTrigger>
                      <SelectContent>
                        {SCORE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Manager Comments</Label><Textarea value={form.managerComments} onChange={e => setForm({ ...form, managerComments: e.target.value })} rows={2} placeholder="Optional comments..." /></div>
                </div>
              )}
              {canEditL2 && (
                <div className="space-y-2 p-3 bg-purple-50 rounded-lg">
                  <p className="text-xs font-medium text-purple-700">L2 Scoring</p>
                  {editingComp?.managerScore && <p className="text-xs text-muted-foreground">L1 Manager score: {editingComp.managerScore}</p>}
                  <div>
                    <Label>L2 Score (1-5)</Label>
                    <Select value={form.l2Score} onValueChange={v => setForm({ ...form, l2Score: v })}>
                      <SelectTrigger><SelectValue placeholder="Select score" /></SelectTrigger>
                      <SelectContent>
                        {SCORE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>L2 Comments</Label><Textarea value={form.l2Comments} onChange={e => setForm({ ...form, l2Comments: e.target.value })} rows={2} placeholder="Optional comments..." /></div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditId(null)}>Cancel</Button>
              <Button onClick={() => editId && updateMutation.mutate(editId)} disabled={updateMutation.isPending}>
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Save Score
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
      return await apiRequest("POST", `/api/appraisals/${appraisalId}/comments`, { section, comment: newComment });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "comments"] });
      setNewComment("");
      toast({ title: "Comment added" });
    },
    onError: (e: any) => toast({ title: "Error", description: getErrorMessage(e), variant: "destructive" }),
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
            {approvals.map((a: any) => {
              const isReturn = a.newStatus === "resubmission_required";
              const isResubmit = a.previousStatus === "resubmission_required" && a.newStatus === "self_submitted";
              return (
                <div key={a.id} className={`flex items-start gap-3 p-3 border rounded-lg ${isReturn ? "border-orange-200 bg-orange-50" : isResubmit ? "border-blue-200 bg-blue-50" : ""}`}>
                  {isReturn ? <RotateCcw className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" /> : isResubmit ? <Send className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" /> : <ChevronRight className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />}
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={a.previousStatus} />
                      <span className="text-xs">→</span>
                      <StatusBadge status={a.newStatus} />
                      <span className="text-xs text-muted-foreground ml-2">by {a.performedByName}</span>
                    </div>
                    {isReturn && <p className="text-sm font-medium text-orange-700 mt-1">Returned for resubmission</p>}
                    {isResubmit && <p className="text-sm font-medium text-blue-700 mt-1">Self-assessment resubmitted</p>}
                    {a.remarks && <p className="text-sm text-muted-foreground mt-1">{a.remarks}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{new Date(a.createdAt).toLocaleString()}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionsSection({ appraisalId, appraisal, isEmployee, isL1, isL2, isL3, isAdmin, score }: any) {
  const { toast } = useToast();
  const [actionDialog, setActionDialog] = useState<string | null>(null);
  const [actionForm, setActionForm] = useState({ remarks: "", l1Comments: "", l2Comments: "", l2Score: "", l2OverrideReason: "", l3Comments: "", reopenReason: "", reopenTargetStage: "open", l1IncrementRecommendation: "", l1PromotionRecommendation: "", l1TrainingRecommendation: "", l2IncrementRecommendation: "", l2PromotionRecommendation: "", l2TrainingRecommendation: "", l3IncrementValue: "0", l3PromotionApproved: false, l3NewDesignation: "", l3EffectiveDate: "", l3FinalRemarks: "", returnRemarks: "" });

  const { data: sysRec } = useQuery<any>({
    queryKey: ["/api/appraisals", appraisalId, "system-recommendation"],
    queryFn: async () => {
      const res = await fetch(`/api/appraisals/${appraisalId}/system-recommendation`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isL3 && appraisal.status === "l2_reviewed",
  });

  const actionMutation = useMutation({
    mutationFn: async ({ action, body }: { action: string; body: any }) => {
      return await apiRequest("POST", `/api/appraisals/${appraisalId}/${action}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals", appraisalId, "score"] });
      setActionDialog(null);
      toast({ title: "Action completed successfully" });
    },
    onError: (e: any) => toast({ title: "Action failed", description: getErrorMessage(e), variant: "destructive" }),
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
    if (action === "l3-approve") {
      body.l3Comments = actionForm.l3Comments;
      body.l3IncrementType = "percentage";
      body.l3IncrementValue = actionForm.l3IncrementValue;
      body.l3PromotionApproved = actionForm.l3PromotionApproved;
      body.l3NewDesignation = actionForm.l3NewDesignation || null;
      body.l3EffectiveDate = actionForm.l3EffectiveDate || null;
      body.l3FinalRemarks = actionForm.l3FinalRemarks || null;
      if (sysRec) body.systemRecommendation = sysRec;
    }
    if (action === "reopen") { body.reopenReason = actionForm.reopenReason; body.reopenTargetStage = actionForm.reopenTargetStage; }
    if (action === "return-for-resubmission") { body.returnRemarks = actionForm.returnRemarks; }
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
        {isL1 && appraisal.status === "self_submitted" && (
          <Button className="w-full justify-start" variant="outline" onClick={() => setActionDialog("return-for-resubmission")}>
            <RotateCcw className="h-4 w-4 mr-2 text-orange-600" /> Return for Resubmission
          </Button>
        )}
        {isEmployee && appraisal.status === "resubmission_required" && (
          <Button className="w-full justify-start" onClick={() => setActionDialog("resubmit")}>
            <Send className="h-4 w-4 mr-2" /> Resubmit Self-Assessment
          </Button>
        )}
        {isL2 && appraisal.status === "l1_reviewed" && (
          <Button className="w-full justify-start" variant="outline" onClick={() => {
            if (score?.effectiveScore) {
              setActionForm(prev => ({ ...prev, l2Score: score.effectiveScore.toFixed(1) }));
            }
            setActionDialog("l2-review");
          }}>
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
        {["approved", "closed"].includes(appraisal.status) && (
          <Button className="w-full justify-start" variant="outline" onClick={async () => {
            try {
              toast({ title: "Generating report..." });
              const resp = await fetch(`/api/appraisals/${appraisalId}/report`, { credentials: "include" });
              if (!resp.ok) {
                const err = await resp.json().catch(() => ({ error: "Download failed" }));
                throw new Error(err.error || "Download failed");
              }
              const blob = await resp.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              const cd = resp.headers.get("content-disposition");
              a.download = cd?.match(/filename="(.+)"/)?.[1] || "appraisal_report.pdf";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              toast({ title: "Report downloaded successfully" });
            } catch (e: any) {
              toast({ title: "Report download failed", description: getErrorMessage(e), variant: "destructive" });
            }
          }}>
            <Download className="h-4 w-4 mr-2" /> Download Report
          </Button>
        )}
        {!isEmployee && !isL1 && !isL2 && !isL3 && !isAdmin && !["approved", "closed"].includes(appraisal.status) && (
          <p className="text-muted-foreground text-sm">No actions available for your role at this stage.</p>
        )}

        <Dialog open={actionDialog !== null} onOpenChange={() => setActionDialog(null)}>
          <DialogContent className={actionDialog === "l3-approve" ? "max-w-2xl max-h-[85vh] overflow-y-auto" : "max-w-lg"}>
            <DialogHeader>
              <DialogTitle>
                {actionDialog === "self-submit" && "Submit Self-Assessment"}
                {actionDialog === "l1-review" && "Complete L1 Review"}
                {actionDialog === "l2-review" && "Complete L2 Review"}
                {actionDialog === "l3-approve" && "Final Approval"}
                {actionDialog === "reopen" && "Reopen Appraisal"}
                {actionDialog === "return-for-resubmission" && "Return for Resubmission"}
                {actionDialog === "resubmit" && "Resubmit Self-Assessment"}
              </DialogTitle>
              <DialogDescription>
                {actionDialog === "self-submit" && "This will submit your self-assessment for L1 review. Ensure all KPIs have weightages summing to 100%."}
                {actionDialog === "l1-review" && "Complete your review with manager scores for all KPIs and competencies."}
                {actionDialog === "l2-review" && "Review and optionally override the L1 score."}
                {actionDialog === "l3-approve" && "This will finalize the appraisal and lock the record."}
                {actionDialog === "reopen" && "This will unlock the appraisal and reset it to the selected stage."}
                {actionDialog === "return-for-resubmission" && "Return this appraisal to the employee with feedback. They will be able to revise their self-assessment and resubmit."}
                {actionDialog === "resubmit" && "Resubmit your updated self-assessment for L1 review. Ensure all KPI scores, competency scores, and narrative are complete."}
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
                <>
                  {sysRec && (
                    <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200 space-y-3">
                      <p className="text-xs font-semibold text-indigo-700 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> System Recommendation (Decision Support)</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white rounded p-2 border">
                          <p className="text-muted-foreground">Final Score</p>
                          <p className="font-bold text-base">{sysRec.finalScore?.toFixed(2)}</p>
                        </div>
                        <div className="bg-white rounded p-2 border">
                          <p className="text-muted-foreground">Rating Band</p>
                          <p className="font-bold text-base capitalize">{sysRec.ratingBand?.replace('_', ' ')}</p>
                        </div>
                        <div className="bg-white rounded p-2 border">
                          <p className="text-muted-foreground">Increment Range</p>
                          <p className="font-bold">{sysRec.incrementRange?.min}% — {sysRec.incrementRange?.max}%</p>
                        </div>
                        <div className="bg-white rounded p-2 border">
                          <p className="text-muted-foreground">Promotion Suitability</p>
                          <p className={`font-bold ${sysRec.promotionSuitability === 'High' ? 'text-green-600' : sysRec.promotionSuitability === 'Medium' ? 'text-yellow-600' : 'text-gray-600'}`}>{sysRec.promotionSuitability}</p>
                        </div>
                        {sysRec.suggestedNextRole && (
                          <div className="bg-white rounded p-2 border col-span-2">
                            <p className="text-muted-foreground">Suggested Next Role</p>
                            <p className="font-bold">{sysRec.suggestedNextRole}</p>
                          </div>
                        )}
                        {sysRec.tenureMonths > 0 && (
                          <div className="bg-white rounded p-2 border">
                            <p className="text-muted-foreground">Tenure</p>
                            <p className="font-bold">{Math.floor(sysRec.tenureMonths / 12)}y {sysRec.tenureMonths % 12}m</p>
                          </div>
                        )}
                        {sysRec.trainingRecommendation && (
                          <div className="bg-white rounded p-2 border col-span-2">
                            <p className="text-muted-foreground">Training Recommendation</p>
                            <p className="font-medium">{sysRec.trainingRecommendation}</p>
                          </div>
                        )}
                      </div>
                      {(sysRec.l1Recommendations?.increment || sysRec.l2Recommendations?.increment) && (
                        <div className="text-xs space-y-1 pt-1 border-t border-indigo-200">
                          <p className="font-medium text-indigo-700">Reviewer Recommendations:</p>
                          {sysRec.l1Recommendations?.increment && <p>L1 Increment: {sysRec.l1Recommendations.increment} | Promotion: {sysRec.l1Recommendations.promotion || '-'}</p>}
                          {sysRec.l2Recommendations?.increment && <p>L2 Increment: {sysRec.l2Recommendations.increment} | Promotion: {sysRec.l2Recommendations.promotion || '-'}</p>}
                        </div>
                      )}
                      <p className="text-[10px] text-indigo-400 italic">Source: {sysRec.policySource === 'policy_matrix' ? 'Company Policy Matrix' : 'Default Rules'}</p>
                    </div>
                  )}

                  <Separator />
                  <p className="text-xs font-semibold text-gray-700">L3 Decision</p>

                  <div><Label>L3 Comments</Label><Textarea value={actionForm.l3Comments} onChange={e => setActionForm({ ...actionForm, l3Comments: e.target.value })} rows={2} /></div>

                  <div>
                    <Label>Increment %<span className="text-red-500 ml-0.5">*</span></Label>
                    <Select value={actionForm.l3IncrementValue} onValueChange={v => setActionForm({ ...actionForm, l3IncrementValue: v })}>
                      <SelectTrigger><SelectValue placeholder="Select increment %" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-10">-10%</SelectItem>
                        <SelectItem value="-5">-5%</SelectItem>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="5">5%</SelectItem>
                        <SelectItem value="10">10%</SelectItem>
                        <SelectItem value="15">15%</SelectItem>
                        <SelectItem value="20">20%</SelectItem>
                        <SelectItem value="25">25%</SelectItem>
                        <SelectItem value="30">30%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Promotion Approved?</Label>
                      <Select value={actionForm.l3PromotionApproved ? "yes" : "no"} onValueChange={v => setActionForm({ ...actionForm, l3PromotionApproved: v === "yes", l3NewDesignation: v === "no" ? "" : actionForm.l3NewDesignation })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="no">No</SelectItem>
                          <SelectItem value="yes">Yes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {actionForm.l3PromotionApproved && (
                      <div>
                        <Label>New Designation / Role</Label>
                        <Input value={actionForm.l3NewDesignation} onChange={e => setActionForm({ ...actionForm, l3NewDesignation: e.target.value })} placeholder={sysRec?.suggestedNextRole || "Enter designation"} />
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Effective Date</Label>
                    <Input type="date" value={actionForm.l3EffectiveDate} onChange={e => setActionForm({ ...actionForm, l3EffectiveDate: e.target.value })} />
                  </div>

                  <div>
                    <Label>Final Remarks</Label>
                    <Textarea value={actionForm.l3FinalRemarks} onChange={e => setActionForm({ ...actionForm, l3FinalRemarks: e.target.value })} rows={2} placeholder="Final remarks on increment, promotion, and development..." />
                  </div>
                </>
              )}
              {actionDialog === "return-for-resubmission" && (
                <>
                  <div>
                    <Label>Return Remarks (Required — minimum 10 characters)</Label>
                    <Textarea
                      value={actionForm.returnRemarks}
                      onChange={e => setActionForm({ ...actionForm, returnRemarks: e.target.value })}
                      rows={4}
                      placeholder="Explain what needs to be revised — e.g., KPI scores seem too high without supporting data, narrative is incomplete, etc."
                    />
                    <p className={`text-xs mt-1 ${actionForm.returnRemarks.trim().length >= 10 ? "text-green-600" : "text-red-500"}`}>
                      {actionForm.returnRemarks.trim().length} / 10 min characters
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                    The employee will see your remarks and can edit their self scores, comments, and narrative. KPI definitions and weightages will remain locked.
                  </div>
                </>
              )}
              {actionDialog === "resubmit" && (
                <>
                  {appraisal.lastReturnRemarks && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                      <p className="font-medium text-red-700">Manager's Feedback:</p>
                      <p className="text-red-600 mt-1">{appraisal.lastReturnRemarks}</p>
                    </div>
                  )}
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                    This will lock your self-assessment and send it back to your manager for review. Ensure all scores and narrative are updated.
                  </div>
                </>
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
              <Button
                onClick={() => actionDialog && handleAction(actionDialog)}
                disabled={actionMutation.isPending || (actionDialog === "return-for-resubmission" && actionForm.returnRemarks.trim().length < 10)}
              >
                {actionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                {actionDialog === "return-for-resubmission" ? "Return to Employee" : actionDialog === "resubmit" ? "Resubmit" : "Confirm"}
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
      return await apiRequest("POST", "/api/appraisals/cycles", createForm);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals/cycles"] });
      setShowCreate(false);
      toast({ title: "Cycle created" });
    },
    onError: (e: any) => toast({ title: "Error", description: getErrorMessage(e), variant: "destructive" }),
  });

  const activateMutation = useMutation({
    mutationFn: async (cycleId: number) => {
      return await apiRequest("POST", `/api/appraisals/cycles/${cycleId}/activate`, {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals/cycles"] });
      toast({ title: "Cycle activated", description: `${data.created?.length || 0} appraisals created.` });
    },
    onError: (e: any) => toast({ title: "Error", description: getErrorMessage(e), variant: "destructive" }),
  });

  const pauseMutation = useMutation({
    mutationFn: async (cycleId: number) => {
      return await apiRequest("POST", `/api/appraisals/cycles/${cycleId}/pause`, { pauseReason: "Paused by administrator" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals/cycles"] });
      toast({ title: "Cycle paused" });
    },
    onError: (e: any) => toast({ title: "Error", description: getErrorMessage(e), variant: "destructive" }),
  });

  const resumeMutation = useMutation({
    mutationFn: async (cycleId: number) => {
      return await apiRequest("POST", `/api/appraisals/cycles/${cycleId}/resume`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals/cycles"] });
      toast({ title: "Cycle resumed" });
    },
    onError: (e: any) => toast({ title: "Error", description: getErrorMessage(e), variant: "destructive" }),
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
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Cycle Dashboard: {progress.cycle?.name}</CardTitle>
              <StatusBadge status={progress.cycle?.status} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium w-36">Completion: {progress.completionRate}%</span>
              <Progress value={progress.completionRate} className="flex-1" />
              <span className="text-sm text-muted-foreground">{progress.totalAppraisals} total</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(progress.statusCounts || {}).map(([status, count]) => (
                <div key={status} className="rounded-lg border p-3">
                  <StatusBadge status={status} />
                  <p className="text-lg font-bold mt-1">{count as number}</p>
                </div>
              ))}
            </div>
            {progress.deadlines && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs font-semibold text-blue-700 mb-2 uppercase tracking-wide">Deadline Timeline</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                  {[
                    { label: "Self Assessment", date: progress.deadlines.selfAssessment },
                    { label: "Manager Review", date: progress.deadlines.managerReview },
                    { label: "L2 Review", date: progress.deadlines.l2Review },
                    { label: "Approval", date: progress.deadlines.approval },
                    { label: "Closure", date: progress.deadlines.closure },
                  ].map(d => {
                    const isPast = d.date < new Date().toISOString().split("T")[0];
                    return (
                      <div key={d.label} className={`p-2 rounded border text-center ${isPast ? "bg-red-50 border-red-200" : "bg-white border-gray-200"}`}>
                        <p className="font-medium text-gray-600">{d.label}</p>
                        <p className={`font-bold mt-0.5 ${isPast ? "text-red-600" : "text-gray-900"}`}>{d.date}</p>
                        {isPast && <p className="text-red-500 text-[10px] mt-0.5">Past due</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {progress.overdueBreakdown && Object.values(progress.overdueBreakdown).some((v: any) => v > 0) && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <p className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">Overdue Items</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Self Assessment", count: progress.overdueBreakdown.selfAssessmentOverdue },
                    { label: "L1 Manager Review", count: progress.overdueBreakdown.managerReviewOverdue },
                    { label: "L2 Review", count: progress.overdueBreakdown.l2ReviewOverdue },
                    { label: "Final Approval", count: progress.overdueBreakdown.approvalOverdue },
                  ].filter(i => i.count > 0).map(i => (
                    <div key={i.label} className="flex items-center gap-2 p-2 bg-white rounded border border-red-100">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <div>
                        <p className="text-xs text-red-600">{i.label}</p>
                        <p className="text-sm font-bold text-red-700">{i.count} overdue</p>
                      </div>
                    </div>
                  ))}
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
      return await apiRequest("POST", `/api/appraisals/jobs/${endpoint}`, {});
    },
    onSuccess: (data: any, endpoint: string) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appraisals/jobs/status"] });
      toast({ title: `Job completed`, description: `${endpoint.includes("dry-run") ? "Dry run" : "Execution"} finished.` });
    },
    onError: (e: any) => toast({ title: "Error", description: getErrorMessage(e), variant: "destructive" }),
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

const HIERARCHY_LEVELS = [
  { value: 'L1', label: 'L1 - Individual Contributor', desc: 'No direct reports' },
  { value: 'L2', label: 'L2 - Manager', desc: 'Manages employees' },
  { value: 'L3', label: 'L3 - Senior Manager', desc: 'Manages managers' },
];

function KpiTemplateLibraryTab() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState<number | null>(null);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [itemTemplateId, setItemTemplateId] = useState<number | null>(null);
  const [filterDept, setFilterDept] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const [tplForm, setTplForm] = useState({ name: '', department: '', hierarchyLevel: 'L1', description: '' });
  const [itemForm, setItemForm] = useState({ kpiTitle: '', kpiDescription: '', defaultWeightage: '', targetGuidance: '', sortOrder: 0 });

  const { data: templates = [], isLoading } = useQuery<any[]>({ queryKey: ['/api/appraisals/kpi-templates'] });

  const { data: allUsers = [] } = useQuery<any[]>({ queryKey: ['/api/appraisals/all-appraisals'] });

  const departments = useMemo(() => {
    const deptSet = new Set<string>();
    (templates || []).forEach((t: any) => { if (t.department) deptSet.add(t.department); });
    (allUsers || []).forEach((a: any) => { if (a.department) deptSet.add(a.department); });
    return Array.from(deptSet).sort();
  }, [templates, allUsers]);

  const filteredTemplates = useMemo(() => {
    return (templates || []).filter((t: any) => {
      if (filterDept !== 'all' && t.department !== filterDept) return false;
      if (filterLevel !== 'all' && t.hierarchyLevel !== filterLevel) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      return true;
    });
  }, [templates, filterDept, filterLevel, filterStatus]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/appraisals/kpi-templates", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/appraisals/kpi-templates'] }); setShowCreateDialog(false); toast({ title: 'Template created' }); },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/appraisals/kpi-templates/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/appraisals/kpi-templates'] }); setEditingTemplate(null); toast({ title: 'Template updated' }); },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/appraisals/kpi-templates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/appraisals/kpi-templates'] }); toast({ title: 'Template deleted' }); },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const activateMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/appraisals/kpi-templates/${id}/activate`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/appraisals/kpi-templates'] }); toast({ title: 'Template activated' }); },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/appraisals/kpi-templates/${id}/archive`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/appraisals/kpi-templates'] }); toast({ title: 'Template archived' }); },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const addItemMutation = useMutation({
    mutationFn: async ({ templateId, data }: { templateId: number; data: any }) => apiRequest("POST", `/api/appraisals/kpi-templates/${templateId}/items`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/appraisals/kpi-templates'] }); setShowItemDialog(false); toast({ title: 'KPI added' }); },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const updateItemMutation = useMutation({
    mutationFn: async ({ templateId, itemId, data }: { templateId: number; itemId: number; data: any }) => apiRequest("PUT", `/api/appraisals/kpi-templates/${templateId}/items/${itemId}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/appraisals/kpi-templates'] }); setShowItemDialog(false); setEditingItem(null); toast({ title: 'KPI updated' }); },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async ({ templateId, itemId }: { templateId: number; itemId: number }) => apiRequest("DELETE", `/api/appraisals/kpi-templates/${templateId}/items/${itemId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/appraisals/kpi-templates'] }); toast({ title: 'KPI removed' }); },
    onError: (e: any) => toast({ title: 'Error', description: getErrorMessage(e), variant: 'destructive' }),
  });

  const openCreateDialog = () => {
    setTplForm({ name: '', department: '', hierarchyLevel: 'L1', description: '' });
    setShowCreateDialog(true);
  };

  const openEditDialog = (t: any) => {
    setTplForm({ name: t.name, department: t.department, hierarchyLevel: t.hierarchyLevel, description: t.description || '' });
    setEditingTemplate(t);
  };

  const openAddItemDialog = (templateId: number) => {
    setItemForm({ kpiTitle: '', kpiDescription: '', defaultWeightage: '', targetGuidance: '', sortOrder: 0 });
    setItemTemplateId(templateId);
    setEditingItem(null);
    setShowItemDialog(true);
  };

  const openEditItemDialog = (templateId: number, item: any) => {
    setItemForm({
      kpiTitle: item.kpiTitle, kpiDescription: item.kpiDescription || '',
      defaultWeightage: item.defaultWeightage, targetGuidance: item.targetGuidance || '',
      sortOrder: item.sortOrder || 0,
    });
    setItemTemplateId(templateId);
    setEditingItem(item);
    setShowItemDialog(true);
  };

  const handleSubmitTemplate = () => {
    if (!tplForm.name || !tplForm.department || !tplForm.hierarchyLevel) {
      toast({ title: 'Missing fields', description: 'Name, department, and level are required', variant: 'destructive' });
      return;
    }
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: tplForm });
    } else {
      createMutation.mutate(tplForm);
    }
  };

  const handleSubmitItem = () => {
    if (!itemForm.kpiTitle || !itemForm.defaultWeightage) {
      toast({ title: 'Missing fields', description: 'KPI title and weight are required', variant: 'destructive' });
      return;
    }
    const weight = parseFloat(itemForm.defaultWeightage);
    if (isNaN(weight) || weight <= 0 || weight > 100) {
      toast({ title: 'Invalid weight', description: 'Weight must be between 0.01 and 100', variant: 'destructive' });
      return;
    }
    if (editingItem) {
      updateItemMutation.mutate({ templateId: itemTemplateId!, itemId: editingItem.id, data: { ...itemForm, defaultWeightage: weight } });
    } else {
      addItemMutation.mutate({ templateId: itemTemplateId!, data: { ...itemForm, defaultWeightage: weight } });
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = { draft: 'bg-gray-100 text-gray-800', active: 'bg-green-100 text-green-800', archived: 'bg-orange-100 text-orange-800' };
    return <Badge className={`${colors[status] || 'bg-gray-100'} border-0`}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
  };

  const getLevelBadge = (level: string) => {
    const colors: Record<string, string> = { L1: 'bg-blue-100 text-blue-800', L2: 'bg-purple-100 text-purple-800', L3: 'bg-indigo-100 text-indigo-800' };
    return <Badge className={`${colors[level] || 'bg-gray-100'} border-0`}>{level}</Badge>;
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><Library className="h-5 w-5 text-blue-600" /> KPI Template Library</CardTitle>
              <CardDescription>Define standard KPIs per department and hierarchy level. Active templates auto-populate KPIs when new appraisal cycles are activated.</CardDescription>
            </div>
            <Button onClick={openCreateDialog} size="sm"><Plus className="h-4 w-4 mr-1" /> New Template</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 mb-4 flex-wrap">
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterLevel} onValueChange={setFilterLevel}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {HIERARCHY_LEVELS.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Library className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No KPI templates found. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTemplates.map((tpl: any) => (
                <Card key={tpl.id} className={`border ${tpl.status === 'active' ? 'border-green-300 bg-green-50/30' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">{tpl.name}</span>
                          {getStatusBadge(tpl.status)}
                          {getLevelBadge(tpl.hierarchyLevel)}
                          <Badge variant="outline" className="text-xs">{tpl.department}</Badge>
                        </div>
                        {tpl.description && <p className="text-xs text-muted-foreground mb-2">{tpl.description}</p>}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{tpl.itemCount} KPI{tpl.itemCount !== 1 ? 's' : ''}</span>
                          <span className={tpl.totalWeight === 100 ? 'text-green-600 font-medium' : tpl.totalWeight > 100 ? 'text-red-600 font-medium' : 'text-amber-600'}>
                            Weight: {tpl.totalWeight?.toFixed(1)}%{tpl.totalWeight === 100 ? ' ✓' : ''}
                          </span>
                          <span>Updated {new Date(tpl.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setExpandedTemplateId(expandedTemplateId === tpl.id ? null : tpl.id)} title="View KPIs">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {tpl.status !== 'archived' && (
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(tpl)} title="Edit"><Edit className="h-4 w-4" /></Button>
                        )}
                        {tpl.status === 'draft' && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => activateMutation.mutate(tpl.id)} disabled={activateMutation.isPending} title="Activate">
                              <Power className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => { if (confirm('Delete this template?')) deleteMutation.mutate(tpl.id); }} disabled={deleteMutation.isPending} title="Delete">
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </>
                        )}
                        {tpl.status === 'active' && (
                          <Button variant="ghost" size="sm" onClick={() => archiveMutation.mutate(tpl.id)} disabled={archiveMutation.isPending} title="Archive">
                            <Archive className="h-4 w-4 text-orange-500" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {expandedTemplateId === tpl.id && (
                      <div className="mt-4 pt-3 border-t">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium">KPI Items</h4>
                          {tpl.status !== 'archived' && (
                            <Button variant="outline" size="sm" onClick={() => openAddItemDialog(tpl.id)}>
                              <Plus className="h-3 w-3 mr-1" /> Add KPI
                            </Button>
                          )}
                        </div>
                        {(!tpl.items || tpl.items.length === 0) ? (
                          <p className="text-xs text-muted-foreground py-3 text-center">No KPI items yet. Add KPIs to this template.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-[30px]">#</TableHead>
                                <TableHead>KPI Title</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="w-[80px]">Weight</TableHead>
                                <TableHead>Target Guidance</TableHead>
                                {tpl.status !== 'archived' && <TableHead className="w-[80px]">Actions</TableHead>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {tpl.items.map((item: any, idx: number) => (
                                <TableRow key={item.id}>
                                  <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                                  <TableCell className="font-medium text-sm">{item.kpiTitle}</TableCell>
                                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{item.kpiDescription || '-'}</TableCell>
                                  <TableCell><Badge variant="outline">{parseFloat(item.defaultWeightage).toFixed(1)}%</Badge></TableCell>
                                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{item.targetGuidance || '-'}</TableCell>
                                  {tpl.status !== 'archived' && (
                                    <TableCell>
                                      <div className="flex gap-1">
                                        <Button variant="ghost" size="sm" onClick={() => openEditItemDialog(tpl.id, item)} className="h-7 w-7 p-0"><Edit className="h-3 w-3" /></Button>
                                        <Button variant="ghost" size="sm" onClick={() => { if (confirm('Remove this KPI?')) deleteItemMutation.mutate({ templateId: tpl.id, itemId: item.id }); }} className="h-7 w-7 p-0"><Trash2 className="h-3 w-3 text-red-500" /></Button>
                                      </div>
                                    </TableCell>
                                  )}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog || !!editingTemplate} onOpenChange={(open) => { if (!open) { setShowCreateDialog(false); setEditingTemplate(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit KPI Template' : 'Create KPI Template'}</DialogTitle>
            <DialogDescription>Define a KPI template for a specific department and hierarchy level.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Template Name</Label>
              <Input value={tplForm.name} onChange={e => setTplForm({ ...tplForm, name: e.target.value })} placeholder="e.g., Production L2 KPIs 2026" />
            </div>
            <div>
              <Label>Department</Label>
              {departments.length > 0 ? (
                <Select value={tplForm.department} onValueChange={v => setTplForm({ ...tplForm, department: v })}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={tplForm.department} onChange={e => setTplForm({ ...tplForm, department: e.target.value })} placeholder="e.g., Production" />
              )}
            </div>
            <div>
              <Label>Hierarchy Level</Label>
              <Select value={tplForm.hierarchyLevel} onValueChange={v => setTplForm({ ...tplForm, hierarchyLevel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HIERARCHY_LEVELS.map(l => <SelectItem key={l.value} value={l.value}><span className="font-medium">{l.value}</span> — {l.desc}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={tplForm.description} onChange={e => setTplForm({ ...tplForm, description: e.target.value })} placeholder="Brief description of this template..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setEditingTemplate(null); }}>Cancel</Button>
            <Button onClick={handleSubmitTemplate} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingTemplate ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showItemDialog} onOpenChange={(open) => { if (!open) { setShowItemDialog(false); setEditingItem(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit KPI Item' : 'Add KPI Item'}</DialogTitle>
            <DialogDescription>Define a KPI that will be auto-populated into appraisals.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>KPI Title</Label>
              <Input value={itemForm.kpiTitle} onChange={e => setItemForm({ ...itemForm, kpiTitle: e.target.value })} placeholder="e.g., Revenue Growth" />
            </div>
            <div>
              <Label>Description (optional)</Label>
              <Textarea value={itemForm.kpiDescription} onChange={e => setItemForm({ ...itemForm, kpiDescription: e.target.value })} placeholder="Detailed description..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Weight (%)</Label>
                <Input type="number" min="0.01" max="100" step="0.1" value={itemForm.defaultWeightage} onChange={e => setItemForm({ ...itemForm, defaultWeightage: e.target.value })} placeholder="e.g., 25" />
              </div>
              <div>
                <Label>Sort Order</Label>
                <Input type="number" min="0" value={itemForm.sortOrder} onChange={e => setItemForm({ ...itemForm, sortOrder: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div>
              <Label>Target Guidance (optional)</Label>
              <Textarea value={itemForm.targetGuidance} onChange={e => setItemForm({ ...itemForm, targetGuidance: e.target.value })} placeholder="Sample target/expected outcome..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowItemDialog(false); setEditingItem(null); }}>Cancel</Button>
            <Button onClick={handleSubmitItem} disabled={addItemMutation.isPending || updateItemMutation.isPending}>
              {(addItemMutation.isPending || updateItemMutation.isPending) && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editingItem ? 'Update' : 'Add KPI'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

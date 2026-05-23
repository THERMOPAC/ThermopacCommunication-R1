import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { fmtDate } from "@/lib/date-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import {
  BookMarked, Plus, Search, Filter, X, ExternalLink, Globe,
  AlertTriangle, ChevronDown, RefreshCw, Tag, Layers,
} from "lucide-react";
import {
  LESSON_STATUSES, LESSON_STATUS_LABELS, LESSON_STATUS_COLORS,
  LESSON_CATEGORIES, LESSON_CATEGORY_LABELS, LESSON_CATEGORY_COLORS,
  LESSON_TYPES, LESSON_TYPE_LABELS,
  LESSON_SCOPES, LESSON_SCOPE_LABELS,
  LESSON_PRIORITIES, LESSON_PRIORITY_LABELS, LESSON_PRIORITY_COLORS,
  LESSON_REC_RISKS, LESSON_REC_RISK_LABELS,
  OI_DEPARTMENTS,
} from "./oi-lesson-constants";

const createLessonSchema = z.object({
  title:                       z.string().min(5, "Minimum 5 characters"),
  description:                 z.string().min(20, "Minimum 20 characters"),
  lessonCategory:              z.enum(LESSON_CATEGORIES),
  lessonType:                  z.enum(LESSON_TYPES),
  applicabilityScope:          z.enum(LESSON_SCOPES).default("global"),
  scopeDepartment:             z.string().optional(),
  scopeProjectId:              z.string().optional(),
  scopeEquipmentType:          z.string().optional(),
  tagsRaw:                     z.string().optional(),
  processArea:                 z.string().optional(),
  rootCauseSummary:            z.string().optional(),
  recommendation:              z.string().min(20, "Minimum 20 characters"),
  implementationGuidance:      z.string().optional(),
  priority:                    z.enum(LESSON_PRIORITIES).default("normal"),
  recurrenceRisk:              z.enum(LESSON_REC_RISKS).optional(),
  crossProjectApplicable:      z.boolean().default(false),
  effectivenessReviewDueMonths: z.string().optional(),
});

type CreateLessonForm = z.infer<typeof createLessonSchema>;

function LessonStatusBadge({ status }: { status: string }) {
  const label = LESSON_STATUS_LABELS[status as keyof typeof LESSON_STATUS_LABELS] ?? status;
  const cls   = LESSON_STATUS_COLORS[status as keyof typeof LESSON_STATUS_COLORS] ?? "bg-slate-100 text-slate-700";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function LessonCategoryBadge({ category }: { category: string }) {
  const label = LESSON_CATEGORY_LABELS[category as keyof typeof LESSON_CATEGORY_LABELS] ?? category;
  const cls   = LESSON_CATEGORY_COLORS[category as keyof typeof LESSON_CATEGORY_COLORS] ?? "bg-slate-100 text-slate-700";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const label = LESSON_PRIORITY_LABELS[priority as keyof typeof LESSON_PRIORITY_LABELS] ?? priority;
  const cls   = LESSON_PRIORITY_COLORS[priority as keyof typeof LESSON_PRIORITY_COLORS] ?? "bg-slate-100 text-slate-600";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function TagChips({ tags }: { tags?: string[] | null }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          <Tag className="h-2.5 w-2.5" />{t}
        </span>
      ))}
    </div>
  );
}

function CreateLessonDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const form = useForm<CreateLessonForm>({
    resolver: zodResolver(createLessonSchema),
    defaultValues: {
      applicabilityScope: "global",
      priority: "normal",
      crossProjectApplicable: false,
    },
  });

  const scope = form.watch("applicabilityScope");

  const mutation = useMutation({
    mutationFn: async (data: CreateLessonForm) => {
      const tags = data.tagsRaw
        ? data.tagsRaw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean)
        : null;
      const payload: any = {
        title: data.title,
        description: data.description,
        lessonCategory: data.lessonCategory,
        lessonType: data.lessonType,
        applicabilityScope: data.applicabilityScope,
        recommendation: data.recommendation,
        priority: data.priority,
        crossProjectApplicable: data.crossProjectApplicable,
      };
      if (data.scopeDepartment) payload.scopeDepartment = data.scopeDepartment;
      if (data.scopeProjectId) payload.scopeProjectId = parseInt(data.scopeProjectId);
      if (data.scopeEquipmentType) payload.scopeEquipmentType = data.scopeEquipmentType;
      if (tags?.length) payload.tags = tags;
      if (data.processArea) payload.processArea = data.processArea;
      if (data.rootCauseSummary) payload.rootCauseSummary = data.rootCauseSummary;
      if (data.implementationGuidance) payload.implementationGuidance = data.implementationGuidance;
      if (data.recurrenceRisk) payload.recurrenceRisk = data.recurrenceRisk;
      if (data.effectivenessReviewDueMonths) payload.effectivenessReviewDueMonths = parseInt(data.effectivenessReviewDueMonths);
      return apiRequest("POST", "/api/oi/lessons", payload);
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["/api/oi/lessons"] });
      toast({
        title: "Lesson created",
        description: `${res.lesson_number} — ${res.title}${res.duplicate_warning ? ` (Possible duplicate of ${res.duplicate_warning})` : ""}`,
      });
      form.reset();
      setOpen(false);
      onCreated();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message ?? "Failed to create lesson", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> New Lesson
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookMarked className="h-5 w-5 text-emerald-600" /> Create Lessons Learned Record
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem>
                <FormLabel>Title <span className="text-red-500">*</span></FormLabel>
                <FormControl><Input placeholder="Concise title (min 5 chars)" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="lessonCategory" render={({ field }) => (
                <FormItem>
                  <FormLabel>Category <span className="text-red-500">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {LESSON_CATEGORIES.map(c => <SelectItem key={c} value={c}>{LESSON_CATEGORY_LABELS[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lessonType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Type <span className="text-red-500">*</span></FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {LESSON_TYPES.map(t => <SelectItem key={t} value={t}>{LESSON_TYPE_LABELS[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description <span className="text-red-500">*</span></FormLabel>
                <FormControl><Textarea rows={3} placeholder="What happened? (min 20 chars)" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="recommendation" render={({ field }) => (
              <FormItem>
                <FormLabel>Recommendation <span className="text-red-500">*</span></FormLabel>
                <FormControl><Textarea rows={3} placeholder="What should be done differently? (min 20 chars)" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="priority" render={({ field }) => (
                <FormItem>
                  <FormLabel>Priority</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {LESSON_PRIORITIES.map(p => <SelectItem key={p} value={p}>{LESSON_PRIORITY_LABELS[p]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="recurrenceRisk" render={({ field }) => (
                <FormItem>
                  <FormLabel>Recurrence Risk</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""}>
                    <FormControl><SelectTrigger><SelectValue placeholder="None" /></SelectTrigger></FormControl>
                    <SelectContent>
                      {LESSON_REC_RISKS.map(r => <SelectItem key={r} value={r}>{LESSON_REC_RISK_LABELS[r]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="applicabilityScope" render={({ field }) => (
                <FormItem>
                  <FormLabel>Scope</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {LESSON_SCOPES.map(s => <SelectItem key={s} value={s}>{LESSON_SCOPE_LABELS[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              {scope === "department" && (
                <FormField control={form.control} name="scopeDepartment" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value ?? ""}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Select dept" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {OI_DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              {scope === "project" && (
                <FormField control={form.control} name="scopeProjectId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project ID</FormLabel>
                    <FormControl><Input type="number" placeholder="Project ID" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              {scope === "equipment_type" && (
                <FormField control={form.control} name="scopeEquipmentType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Equipment Type</FormLabel>
                    <FormControl><Input placeholder="e.g. Centrifugal Pump" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>
            <FormField control={form.control} name="rootCauseSummary" render={({ field }) => (
              <FormItem>
                <FormLabel>Root Cause Summary</FormLabel>
                <FormControl><Textarea rows={2} placeholder="Brief root cause (optional)" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="implementationGuidance" render={({ field }) => (
              <FormItem>
                <FormLabel>Implementation Guidance</FormLabel>
                <FormControl><Textarea rows={2} placeholder="Step-by-step guidance (optional)" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="processArea" render={({ field }) => (
                <FormItem>
                  <FormLabel>Process Area</FormLabel>
                  <FormControl><Input placeholder="e.g. Engineering Design" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="effectivenessReviewDueMonths" render={({ field }) => (
                <FormItem>
                  <FormLabel>Effectiveness Review (months)</FormLabel>
                  <FormControl><Input type="number" placeholder="6" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="tagsRaw" render={({ field }) => (
              <FormItem>
                <FormLabel>Tags</FormLabel>
                <FormControl><Input placeholder="comma-separated, e.g. pump, cooling, inspection" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="crossProjectApplicable" render={({ field }) => (
              <FormItem className="flex items-center gap-3">
                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                <FormLabel className="!mt-0">Cross-Project Applicable</FormLabel>
                <FormMessage />
              </FormItem>
            )} />
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Creating…" : "Create Lesson"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function LessonCard({ lesson, onClick }: { lesson: any; onClick: () => void }) {
  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-xs text-slate-500">{lesson.lesson_number}</span>
              <LessonStatusBadge status={lesson.status} />
              <PriorityBadge priority={lesson.priority} />
              {lesson.cross_project_applicable && lesson.cross_project_approved_at && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-xs font-medium">
                  <Globe className="h-3 w-3" />Cross-Project
                </span>
              )}
              {lesson.revision_number > 1 && (
                <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-600 px-2 py-0.5 text-xs font-medium">
                  Rev {lesson.revision_number}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-900 line-clamp-2">{lesson.title}</p>
          </div>
          <ExternalLink className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
        </div>
        <div className="flex flex-wrap gap-2 items-center mt-2">
          <LessonCategoryBadge category={lesson.lesson_category} />
          {lesson.lesson_type && (
            <span className="text-xs text-slate-500">{LESSON_TYPE_LABELS[lesson.lesson_type as keyof typeof LESSON_TYPE_LABELS] ?? lesson.lesson_type}</span>
          )}
          {lesson.tags?.length > 0 && (
            <span className="text-xs text-slate-400 flex items-center gap-0.5">
              <Tag className="h-3 w-3" />{lesson.tags.slice(0, 3).join(", ")}{lesson.tags.length > 3 ? ` +${lesson.tags.length - 3}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
          <span>{lesson.author_name ?? "—"}</span>
          <span>{fmtDate(lesson.created_at)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OiLessonRegisterPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("all");
  const [searchQ, setSearchQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [crossProjectOnly, setCrossProjectOnly] = useState(false);

  const handleSearchChange = useCallback((v: string) => {
    setSearchQ(v);
    clearTimeout((window as any).__llsearchTimer);
    (window as any).__llsearchTimer = setTimeout(() => setDebouncedQ(v), 400);
  }, []);

  const params = new URLSearchParams();
  if (statusFilter) params.set("status", statusFilter);
  if (categoryFilter) params.set("category", categoryFilter);
  if (typeFilter) params.set("lesson_type", typeFilter);
  if (priorityFilter) params.set("priority", priorityFilter);
  if (crossProjectOnly) params.set("cross_project_applicable", "true");
  if (debouncedQ.length >= 2) params.set("q", debouncedQ);
  params.set("limit", "100");

  const { data: lessons = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/oi/lessons", params.toString()],
    queryFn: () => apiRequest("GET", `/api/oi/lessons?${params.toString()}`),
    enabled: activeTab === "all",
  });

  const { data: crossProject, isLoading: cpLoading } = useQuery<Record<string, any[]>>({
    queryKey: ["/api/oi/lessons/cross-project"],
    queryFn: () => apiRequest("GET", "/api/oi/lessons/cross-project"),
    enabled: activeTab === "cross-project",
  });

  const hasFilters = !!(statusFilter || categoryFilter || typeFilter || priorityFilter || crossProjectOnly || debouncedQ);

  function clearFilters() {
    setStatusFilter(""); setCategoryFilter(""); setTypeFilter(""); setPriorityFilter(""); setCrossProjectOnly(false); setSearchQ(""); setDebouncedQ("");
  }

  return (
    <Layout>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BookMarked className="h-6 w-6 text-emerald-600" /> Lessons Learned Register
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Capture, review, publish and track lessons learned across projects</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <CreateLessonDialog onCreated={() => refetch()} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All Lessons</TabsTrigger>
          <TabsTrigger value="cross-project" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Cross-Project Register
          </TabsTrigger>
        </TabsList>

        {/* ── All Lessons Tab ── */}
        <TabsContent value="all" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Search title, description…"
                value={searchQ}
                onChange={e => handleSearchChange(e.target.value)}
              />
              {searchQ && (
                <button onClick={() => { setSearchQ(""); setDebouncedQ(""); }} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-slate-400" />
                </button>
              )}
            </div>

            <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[160px] text-sm">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {LESSON_STATUSES.map(s => <SelectItem key={s} value={s}>{LESSON_STATUS_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={categoryFilter || "all"} onValueChange={v => setCategoryFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[190px] text-sm">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {LESSON_CATEGORIES.map(c => <SelectItem key={c} value={c}>{LESSON_CATEGORY_LABELS[c]}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={typeFilter || "all"} onValueChange={v => setTypeFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[150px] text-sm">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {LESSON_TYPES.map(t => <SelectItem key={t} value={t}>{LESSON_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={priorityFilter || "all"} onValueChange={v => setPriorityFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[140px] text-sm">
                <SelectValue placeholder="All priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {LESSON_PRIORITIES.map(p => <SelectItem key={p} value={p}>{LESSON_PRIORITY_LABELS[p]}</SelectItem>)}
              </SelectContent>
            </Select>

            <label className="flex items-center gap-1.5 text-sm text-slate-600 cursor-pointer select-none">
              <Switch checked={crossProjectOnly} onCheckedChange={setCrossProjectOnly} />
              Cross-Project Only
            </label>

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 h-9">
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>

          {/* Results */}
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-36 rounded-lg bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : lessons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookMarked className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">No lessons found</p>
              <p className="text-xs text-slate-400 mt-1">{hasFilters ? "Try adjusting filters" : "Create the first lesson above"}</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">{lessons.length} lesson{lessons.length !== 1 ? "s" : ""}</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lessons.map(lesson => (
                  <LessonCard
                    key={lesson.id}
                    lesson={lesson}
                    onClick={() => navigate(`/oi/lessons/${lesson.id}`)}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Cross-Project Tab ── */}
        <TabsContent value="cross-project" className="mt-4 space-y-6">
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 flex items-start gap-2">
            <Globe className="h-4 w-4 text-violet-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-violet-700">
              Cross-project lessons are published lessons approved by Senior Management for application across all projects.
              They require acknowledgment from the target departments or project teams.
            </p>
          </div>

          {cpLoading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <div key={i} className="h-24 rounded-lg bg-slate-100 animate-pulse" />)}
            </div>
          ) : !crossProject || Object.keys(crossProject).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Globe className="h-12 w-12 text-slate-300 mb-3" />
              <p className="text-slate-500 font-medium">No cross-project lessons</p>
              <p className="text-xs text-slate-400 mt-1">Publish a lesson and approve it for cross-project use</p>
            </div>
          ) : (
            Object.entries(crossProject).map(([category, catLessons]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <LessonCategoryBadge category={category} />
                  <span className="text-xs text-slate-400">{catLessons.length} lesson{catLessons.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {catLessons.map((lesson: any) => (
                    <Card
                      key={lesson.id}
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => navigate(`/oi/lessons/${lesson.id}`)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <span className="font-mono text-xs text-slate-400">{lesson.lesson_number}</span>
                          <PriorityBadge priority={lesson.priority} />
                        </div>
                        <p className="text-sm font-medium text-slate-900 line-clamp-2 mb-2">{lesson.title}</p>
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <span>Ack: {lesson.ack_completion_rate !== null ? `${lesson.ack_completion_rate}%` : "N/A"}</span>
                          <span>{fmtDate(lesson.published_at)}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
    </Layout>
  );
}

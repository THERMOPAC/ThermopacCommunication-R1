import { useState } from "react";
import Layout from "@/components/layout";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Plus, Search, AlertCircle, Clock, CheckCircle, Eye, Download } from "lucide-react";
import { downloadSopPdf } from "@/lib/sop-pdf";
import { fmtDate } from "@/lib/date-format";
import {
  SOP_STATUS_LABELS, SOP_STATUS_COLORS, SOP_TYPE_LABELS, SOP_TYPE_COLORS,
  SOP_TYPES, SOP_STATUSES, VALID_SOP_ROLES, SOP_ROLE_LABELS,
} from "./oi-sop-constants";
import { useDepartments } from "@/hooks/use-departments";

const MANAGER_ROLES = ["Manager", "Senior Manager", "General Manager", "Superuser"];

const createSopSchema = z.object({
  title:             z.string().min(5, "Min 5 chars").max(300),
  description:       z.string().min(10, "Min 10 chars"),
  sopType:           z.enum(["procedure","work_instruction","policy","guideline","checklist"]),
  department:        z.string().min(1, "Required"),
  applicableRole:    z.enum(VALID_SOP_ROLES, { required_error: "Required" }),
  processArea:       z.string().min(2, "Min 2 chars").max(200),
  documentReference: z.string().max(200).optional(),
});

type CreateSopData = z.infer<typeof createSopSchema>;

export default function OiSopRegister() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDept, setFilterDept] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const { departments, isLoading: deptsLoading, isError: deptsError } = useDepartments();

  const isSuperuser = user?.role === "Superuser";
  const isManager   = MANAGER_ROLES.includes(user?.role ?? "");

  const params = new URLSearchParams();
  if (search)                  params.set("search", search);
  if (filterStatus !== "all")  params.set("status", filterStatus);
  if (filterDept   !== "all" && isSuperuser) params.set("department", filterDept);
  if (filterType   !== "all")  params.set("sopType", filterType);
  if (filterRole   !== "all")  params.set("applicableRole", filterRole);

  const { data: sops = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/sop", filterStatus, filterDept, filterType, filterRole, search],
    queryFn: async () => {
      const res = await fetch(`/api/oi/sop?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch SOPs");
      return res.json();
    },
  });

  const form = useForm<CreateSopData>({
    resolver: zodResolver(createSopSchema),
    defaultValues: {
      title:             "",
      description:       "",
      sopType:           "procedure",
      department:        isSuperuser ? "Quality Control" : (user?.department ?? ""),
      applicableRole:    "Employee",
      processArea:       "",
      documentReference: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateSopData) => apiRequest("POST", "/api/oi/sop", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/oi/sop"] });
      toast({ title: "SOP created" });
      setOpen(false);
      form.reset();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const stats = {
    total:       sops.length,
    active:      sops.filter((s: any) => s.status === "active").length,
    overdue:     sops.filter((s: any) => s.isReviewOverdue).length,
    pendingAcks: sops.reduce((acc: number, s: any) => acc + (s.ackSummary?.pending ?? 0), 0),
  };

  return (
    <Layout>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg"><BookOpen className="h-6 w-6 text-blue-700" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">SOP Register</h1>
            <p className="text-sm text-gray-500">Standard Operating Procedures</p>
          </div>
        </div>
        {isManager && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" />New SOP</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>Create SOP</DialogTitle></DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(d => createMutation.mutate(d))} className="space-y-4">
                  <FormField control={form.control} name="title" render={({ field }) => (
                    <FormItem><FormLabel>Title *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="description" render={({ field }) => (
                    <FormItem><FormLabel>Description *</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="sopType" render={({ field }) => (
                      <FormItem><FormLabel>Type *</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>{SOP_TYPES.map(t => <SelectItem key={t} value={t}>{SOP_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
                        </Select><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="department" render={({ field }) => (
                      <FormItem><FormLabel>Department *</FormLabel>
                        {isSuperuser ? (
                          <Select value={field.value} onValueChange={field.onChange} disabled={deptsLoading || deptsError}>
                            <FormControl><SelectTrigger><SelectValue placeholder={deptsLoading ? "Loading…" : deptsError ? "Unavailable" : undefined} /></SelectTrigger></FormControl>
                            <SelectContent>
                              {deptsLoading && <SelectItem value="__loading__" disabled>Loading departments…</SelectItem>}
                              {!deptsLoading && !deptsError && departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <FormControl>
                            <Input value={field.value} disabled className="bg-gray-50 text-gray-600" />
                          </FormControl>
                        )}
                        {deptsError && isSuperuser && <p className="text-xs text-red-600 mt-1">Department list unavailable — cannot submit</p>}
                        <FormMessage /></FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="applicableRole" render={({ field }) => (
                    <FormItem><FormLabel>Accessible To *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {VALID_SOP_ROLES.map(r => (
                            <SelectItem key={r} value={r}>{SOP_ROLE_LABELS[r]} {r === "Employee" ? "(all staff)" : "and above"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-400 mt-0.5">All users at this level and above within the department can view this SOP.</p>
                      <FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="processArea" render={({ field }) => (
                    <FormItem><FormLabel>Process Area *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={form.control} name="documentReference" render={({ field }) => (
                    <FormItem><FormLabel>Document Reference</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button type="submit" disabled={createMutation.isPending || (isSuperuser && (deptsLoading || deptsError))}>
                      {createMutation.isPending ? "Creating…" : "Create SOP"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total SOPs",     value: stats.total,       icon: BookOpen,      color: "text-blue-600",   bg: "bg-blue-50" },
          { label: "Active",         value: stats.active,      icon: CheckCircle,   color: "text-green-600",  bg: "bg-green-50" },
          { label: "Review Overdue", value: stats.overdue,     icon: AlertCircle,   color: "text-red-600",    bg: "bg-red-50" },
          { label: "Pending Acks",   value: stats.pendingAcks, icon: Clock,         color: "text-orange-600", bg: "bg-orange-50" },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-2xl font-bold">{s.value}</p><p className="text-xs text-gray-500">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input placeholder="Search SOPs…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {SOP_STATUSES.map(s => <SelectItem key={s} value={s}>{SOP_STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        {isSuperuser && (
          <div>
            <Select value={filterDept} onValueChange={setFilterDept}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Depts</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            {deptsError && <p className="text-xs text-amber-600 mt-0.5">Using cached list</p>}
          </div>
        )}
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {SOP_TYPES.map(t => <SelectItem key={t} value={t}>{SOP_TYPE_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Accessible To" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {VALID_SOP_ROLES.map(r => <SelectItem key={r} value={r}>{SOP_ROLE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : sops.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-30" />
          <p>No SOPs found</p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">SOP #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Accessible To</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rev</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Owner</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Review Due</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Acks</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sops.map((sop: any) => (
                <tr key={sop.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-700">{sop.sopNumber}</td>
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-medium truncate">{sop.title}</p>
                    <p className="text-xs text-gray-400 truncate">{sop.processArea}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`text-xs ${SOP_TYPE_COLORS[sop.sopType] ?? ""}`}>
                      {SOP_TYPE_LABELS[sop.sopType] ?? sop.sopType}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{sop.department}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded text-xs font-medium">
                      {SOP_ROLE_LABELS[sop.applicableRole] ?? sop.applicableRole ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`text-xs ${SOP_STATUS_COLORS[sop.status] ?? ""}`}>
                      {SOP_STATUS_LABELS[sop.status] ?? sop.status}
                    </Badge>
                    {sop.isReviewOverdue && <p className="text-xs text-red-500 mt-0.5">Review overdue</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">v{sop.revisionNumber}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{sop.ownerName ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {sop.reviewDueDate ? fmtDate(sop.reviewDueDate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {sop.ackSummary?.total > 0 ? (
                      <span className={sop.ackSummary.pending > 0 ? "text-orange-600 font-medium" : "text-green-600"}>
                        {sop.ackSummary.acknowledged}/{sop.ackSummary.total}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link href={`/oi/sop/${sop.id}`}>
                        <Button size="sm" variant="ghost" className="gap-1 text-xs">
                          <Eye className="h-3 w-3" /> View
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-xs text-gray-500 hover:text-blue-700"
                        title="Download PDF"
                        onClick={async (e) => {
                          e.preventDefault();
                          try { await downloadSopPdf(sop); }
                          catch { /* silent — browser will show no download */ }
                        }}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </Layout>
  );
}

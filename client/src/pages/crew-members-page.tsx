import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Edit, ToggleLeft, ToggleRight, Users, Search } from "lucide-react";
import { Loader2 } from "lucide-react";

const ROLE_OPTIONS = [
  { value: "team_leader", label: "Team Leader" },
  { value: "fitter",      label: "Fitter" },
  { value: "welder",      label: "Welder" },
  { value: "helper",      label: "Helper" },
  { value: "qc_person",   label: "QC Person" },
];

const ROLE_COLORS: Record<string, string> = {
  team_leader: "bg-purple-100 text-purple-700 border-purple-200",
  fitter:      "bg-blue-100 text-blue-700 border-blue-200",
  welder:      "bg-orange-100 text-orange-700 border-orange-200",
  helper:      "bg-gray-100 text-gray-700 border-gray-200",
  qc_person:   "bg-green-100 text-green-700 border-green-200",
};

const roleLabel = (r: string) => ROLE_OPTIONS.find(o => o.value === r)?.label ?? r;

const emptyForm = { name: "", role_types: [] as string[], employee_code: "" };

export default function CrewMembersPage() {
  const { toast } = useToast();

  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: members = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/crew-members"],
    queryFn: () => fetch("/api/crew-members").then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/crew-members", body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/crew-members"] }); closeDialog(); toast({ title: "Crew member added" }); },
    onError: (e: any) => toast({ title: e?.message || "Failed to add", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: any) => apiRequest("PUT", `/api/crew-members/${id}`, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/crew-members"] }); closeDialog(); toast({ title: "Crew member updated" }); },
    onError: (e: any) => toast({ title: e?.message || "Failed to update", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `/api/crew-members/${id}/toggle-status`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/crew-members"] }); toast({ title: "Status updated" }); },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  function openAdd() { setEditId(null); setForm(emptyForm); setDialogOpen(true); }
  function openEdit(m: any) {
    setEditId(m.id);
    setForm({ name: m.name, role_types: m.role_types ?? [], employee_code: m.employee_code ?? "" });
    setDialogOpen(true);
  }
  function closeDialog() { setDialogOpen(false); setEditId(null); setForm(emptyForm); }

  function toggleRole(r: string) {
    setForm(f => ({
      ...f,
      role_types: f.role_types.includes(r) ? f.role_types.filter(x => x !== r) : [...f.role_types, r],
    }));
  }

  function handleSubmit() {
    if (!form.name.trim()) return toast({ title: "Name is required", variant: "destructive" });
    const body = { name: form.name.trim(), role_types: form.role_types, employee_code: form.employee_code };
    if (editId) updateMutation.mutate({ id: editId, body });
    else createMutation.mutate(body);
  }

  const filtered = members.filter(m => {
    if (!showInactive && !m.is_active) return false;
    if (showInactive && m.is_active) return false;
    if (roleFilter !== "all" && !(m.role_types ?? []).includes(roleFilter)) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Layout>
      <div className="p-4 max-w-5xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Crew Members</h1>
            <Badge variant="outline" className="text-xs">{members.filter(m => m.is_active).length} active</Badge>
          </div>
          <Button size="sm" onClick={openAdd}><Plus className="h-3.5 w-3.5 mr-1" />Add Member</Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="h-8 text-xs pl-7"
                  placeholder="Search by name…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="All roles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Roles</SelectItem>
                  {ROLE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={showInactive ? "secondary" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setShowInactive(!showInactive)}
                >
                  {showInactive ? "Showing Inactive" : "Show Inactive"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-xs text-muted-foreground">
                {search || roleFilter !== "all" ? "No crew members match the current filter." : showInactive ? "No inactive crew members." : "No crew members yet. Add one to get started."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs py-2">Name</TableHead>
                    <TableHead className="text-xs py-2">Roles</TableHead>
                    <TableHead className="text-xs py-2">Employee Code</TableHead>
                    <TableHead className="text-xs py-2">Status</TableHead>
                    <TableHead className="text-xs py-2 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs font-medium py-2">{m.name}</TableCell>
                      <TableCell className="py-2">
                        <div className="flex flex-wrap gap-1">
                          {(m.role_types ?? []).length === 0
                            ? <span className="text-[10px] text-muted-foreground italic">No roles</span>
                            : (m.role_types as string[]).map(r => (
                              <span key={r} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${ROLE_COLORS[r] ?? ""}`}>
                                {roleLabel(r)}
                              </span>
                            ))
                          }
                        </div>
                      </TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{m.employee_code ?? "—"}</TableCell>
                      <TableCell className="py-2">
                        <Badge variant={m.is_active ? "default" : "secondary"} className="text-[10px]">
                          {m.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => openEdit(m)}>
                            <Edit className="h-3 w-3 mr-1" />Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={`h-6 px-2 text-[10px] ${m.is_active ? "text-amber-600 hover:text-amber-700" : "text-green-600 hover:text-green-700"}`}
                            onClick={() => toggleMutation.mutate(m.id)}
                            disabled={toggleMutation.isPending}
                          >
                            {m.is_active ? <ToggleRight className="h-3 w-3 mr-1" /> : <ToggleLeft className="h-3 w-3 mr-1" />}
                            {m.is_active ? "Deactivate" : "Activate"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) closeDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{editId ? "Edit Crew Member" : "Add Crew Member"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
              <Input
                className="h-8 text-xs"
                placeholder="Full name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Roles</Label>
              <div className="grid grid-cols-2 gap-2">
                {ROLE_OPTIONS.map(o => (
                  <div key={o.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`role-${o.value}`}
                      checked={form.role_types.includes(o.value)}
                      onCheckedChange={() => toggleRole(o.value)}
                      className="h-3.5 w-3.5"
                    />
                    <label htmlFor={`role-${o.value}`} className="text-xs cursor-pointer">{o.label}</label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Employee Code <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                className="h-8 text-xs"
                placeholder="Badge / employee no."
                value={form.employee_code}
                onChange={e => setForm(f => ({ ...f, employee_code: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={closeDialog}>Cancel</Button>
            <Button size="sm" onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {editId ? "Save Changes" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

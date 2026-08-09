// ── Reference Papers — controlled literature library (GLOBAL) ────────────────
// Shown on the LLX main page (/design-software/liquid-liquid-extraction).
// The single governed source for all LLX literature references. Papers are
// never deleted; they are superseded/withdrawn so citations stay resolvable.
import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Info, Plus, Pencil, Library, Upload, FileText } from "lucide-react";

type RefPaper = {
  id: number; ref_code: string; authors: string; organization: string | null;
  title: string; publication: string; year: number; used_for: string;
  notes: string | null; status: string; created_by_name?: string;
  file_path: string | null; file_name: string | null; file_uploaded_at: string | null;
};

const BLANK_PAPER = { refCode: "", authors: "", organization: "", title: "", publication: "", year: "", usedFor: "", notes: "" };

export default function ReferencePapersSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const papersQ = useQuery<RefPaper[]>({
    queryKey: ["/api/design-software/reference-papers"],
    queryFn: () => apiRequest("GET", "/api/design-software/reference-papers") as Promise<RefPaper[]>,
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RefPaper | null>(null);
  const [form, setForm] = useState<typeof BLANK_PAPER>(BLANK_PAPER);
  const set = (k: keyof typeof BLANK_PAPER) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setEditing(null); setForm(BLANK_PAPER); setDialogOpen(true); };
  const openEdit = (p: RefPaper) => {
    setEditing(p);
    setForm({ refCode: p.ref_code, authors: p.authors, organization: p.organization ?? "", title: p.title, publication: p.publication, year: String(p.year), usedFor: p.used_for, notes: p.notes ?? "" });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        authors: form.authors, organization: form.organization || null, title: form.title,
        publication: form.publication, year: Number(form.year), usedFor: form.usedFor,
        notes: form.notes || null,
      };
      if (editing) return apiRequest("PATCH", `/api/design-software/reference-papers/${editing.id}`, payload);
      return apiRequest("POST", "/api/design-software/reference-papers", { ...payload, refCode: form.refCode });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/design-software/reference-papers"] });
      setDialogOpen(false);
      toast({ title: editing ? "Reference updated" : "Reference registered" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message ?? String(e), variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: (p: { id: number; status: string }) =>
      apiRequest("PATCH", `/api/design-software/reference-papers/${p.id}`, { status: p.status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/design-software/reference-papers"] }),
    onError: (e: any) => toast({ title: "Status change failed", description: e?.message ?? String(e), variant: "destructive" }),
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTargetId, setUploadTargetId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  const startUpload = (paperId: number) => {
    setUploadTargetId(paperId);
    fileInputRef.current?.click();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file || uploadTargetId === null) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Only PDF files are accepted", variant: "destructive" });
      return;
    }
    const paperId = uploadTargetId;
    setUploadingId(paperId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch(`/api/design-software/reference-papers/${paperId}/document`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.message ?? `Upload failed (${resp.status})`);
      }
      qc.invalidateQueries({ queryKey: ["/api/design-software/reference-papers"] });
      toast({ title: "Paper uploaded", description: file.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setUploadingId(null);
      setUploadTargetId(null);
    }
  };

  const papers = papersQ.data ?? [];
  const statusBadge = (s: string) =>
    s === "active" ? "bg-green-100 text-green-800 border-green-200"
    : s === "superseded" ? "bg-orange-100 text-orange-800 border-orange-200"
    : "bg-gray-100 text-gray-500 border-gray-200";

  return (
    <div className="border rounded-xl bg-white">
      <div className="px-5 py-3 border-b bg-gray-50 rounded-t-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Library className="h-4 w-4 text-gray-500" />
          <p className="text-sm font-semibold text-gray-700">Reference Papers — Controlled Literature Library</p>
        </div>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Register Paper</Button>
      </div>
      <div className="p-5 space-y-3">
        <div className="flex items-start gap-2 text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-lg p-3">
          <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <p>
            This register is the <span className="font-semibold">single governed source</span> for all LLX literature
            references. Every equation, correlation, assumption and report must cite a paper by its reference code
            (e.g. <span className="font-mono">REF-001</span>). Reference codes are immutable and papers are never
            deleted — they are marked superseded or withdrawn so existing citations remain resolvable.
          </p>
        </div>

        {papersQ.isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : papers.length === 0 ? (
          <p className="text-sm text-gray-400">No reference papers registered yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-3">Ref</th>
                  <th className="py-2 pr-3">Author(s) / Organization</th>
                  <th className="py-2 pr-3">Title & Publication</th>
                  <th className="py-2 pr-3">Used for</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {papers.map(p => (
                  <tr key={p.id} className="border-b last:border-0 align-top">
                    <td className="py-2.5 pr-3 font-mono font-semibold text-gray-800 whitespace-nowrap">{p.ref_code}</td>
                    <td className="py-2.5 pr-3">
                      <p className="text-gray-800">{p.authors}</p>
                      {p.organization && <p className="text-xs text-gray-500">{p.organization}</p>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <p className="italic text-gray-800">{p.title}</p>
                      <p className="text-xs text-gray-500">{p.publication}, {p.year}</p>
                      {p.notes && <p className="text-xs text-gray-400 mt-0.5">{p.notes}</p>}
                      {p.file_path && (
                        <a
                          href={`/api/design-software/reference-papers/${p.id}/document`}
                          target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                        >
                          <FileText className="h-3 w-3" />{p.file_name ?? "View PDF"}
                        </a>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600">{p.used_for}</td>
                    <td className="py-2.5 pr-3">
                      <Badge variant="outline" className={`text-[10px] ${statusBadge(p.status)}`}>{p.status}</Badge>
                    </td>
                    <td className="py-2.5 whitespace-nowrap">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(p)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-7 px-2 text-blue-600"
                        title={p.file_path ? "Replace PDF" : "Upload PDF"}
                        disabled={uploadingId === p.id}
                        onClick={() => startUpload(p.id)}
                      >
                        {uploadingId === p.id ? "Uploading…" : <Upload className="h-3.5 w-3.5" />}
                      </Button>
                      {p.status === "active" && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-orange-600" onClick={() => statusMutation.mutate({ id: p.id, status: "superseded" })}>
                          Supersede
                        </Button>
                      )}
                      {p.status === "superseded" && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-green-700" onClick={() => statusMutation.mutate({ id: p.id, status: "active" })}>
                          Reactivate
                        </Button>
                      )}
                      {p.status !== "withdrawn" && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-gray-500" onClick={() => statusMutation.mutate({ id: p.id, status: "withdrawn" })}>
                          Withdraw
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

      <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={onFileChosen} />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.ref_code}` : "Register Reference Paper"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editing && (
              <div>
                <Label className="text-xs">Reference code (REF-NNN)</Label>
                <Input value={form.refCode} onChange={e => set("refCode")(e.target.value)} placeholder="REF-003" className="font-mono" />
              </div>
            )}
            <div>
              <Label className="text-xs">Author(s)</Label>
              <Input value={form.authors} onChange={e => set("authors")(e.target.value)} placeholder="Johannes Duss" />
            </div>
            <div>
              <Label className="text-xs">Organization</Label>
              <Input value={form.organization} onChange={e => set("organization")(e.target.value)} placeholder="Sulzer Chemtech" />
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={form.title} onChange={e => set("title")(e.target.value)} />
            </div>
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <div>
                <Label className="text-xs">Publication / venue</Label>
                <Input value={form.publication} onChange={e => set("publication")(e.target.value)} placeholder="AIChE Spring Meeting" />
              </div>
              <div>
                <Label className="text-xs">Year</Label>
                <Input value={form.year} onChange={e => set("year")(e.target.value)} placeholder="2013" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Used for</Label>
              <Textarea rows={2} value={form.usedFor} onChange={e => set("usedFor")(e.target.value)} placeholder="Which LLX equations / correlations / reports cite this paper" />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea rows={2} value={form.notes} onChange={e => set("notes")(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : editing ? "Save Changes" : "Register"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

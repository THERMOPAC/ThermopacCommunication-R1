// ── CPS Sizing Tool — Existing Sizing Cases (View / Edit / Delete) ──────────
// Input capture only — NO sizing calculations. Editing uses the shared
// single-column form; deletion asks for explicit confirmation.
import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, Pencil, Plus, Eye, Trash2 } from "lucide-react";
import { SizingCase, scopeLabel, fmtNum } from "./cps-sizing-shared";

function ViewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value || "—"}</span>
    </div>
  );
}

export default function CpsSizingCasesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const casesQ = useQuery<SizingCase[]>({
    queryKey: ["/api/design-software/cps/sizing-cases"],
    queryFn: () => apiRequest("GET", "/api/design-software/cps/sizing-cases") as Promise<SizingCase[]>,
  });
  const cases = casesQ.data ?? [];

  const [viewing, setViewing] = useState<SizingCase | null>(null);
  const [deleting, setDeleting] = useState<SizingCase | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/design-software/cps/sizing-cases/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/design-software/cps/sizing-cases"] });
      setDeleting(null);
      toast({ title: "Sizing case deleted" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e?.message ?? "Error", variant: "destructive" }),
  });

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
              <FolderOpen className="w-6 h-6" /> CPS Sizing Tool — Existing Sizing Cases
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              View, edit or delete recorded customer sizing cases.
            </p>
          </div>
          <Link href="/design-software/cps-sizing/new">
            <Button data-testid="button-add-case">
              <Plus className="w-4 h-4 mr-1" /> New Sizing Case
            </Button>
          </Link>
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Plant Location</th>
                <th className="px-3 py-2 font-medium text-right">Capacity (L/h)</th>
                <th className="px-3 py-2 font-medium">RRBO Grade</th>
                <th className="px-3 py-2 font-medium text-right">Visc @ 40°C (cSt)</th>
                <th className="px-3 py-2 font-medium">Treatment</th>
                <th className="px-3 py-2 font-medium text-right">Colour In → Out (ASTM)</th>
                <th className="px-3 py-2 font-medium text-right">Sulphur In → Out (ppm)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {casesQ.isLoading && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!casesQ.isLoading && cases.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground" data-testid="text-empty">
                  No sizing cases yet. Create the first one with “New Sizing Case”.
                </td></tr>
              )}
              {cases.map(c => (
                <tr key={c.id} className="border-t" data-testid={`row-case-${c.id}`}>
                  <td className="px-3 py-2 font-medium">{c.customer_name}</td>
                  <td className="px-3 py-2">{c.plant_location}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(c.cps_feed_capacity)}</td>
                  <td className="px-3 py-2">{c.rrbo_grade}</td>
                  <td className="px-3 py-2 text-right">{fmtNum(c.feed_oil_visc_40c)}</td>
                  <td className="px-3 py-2">
                    <Badge variant="secondary" className={c.treatment_scope === "COLOUR_ODOR_SULPHUR" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}>
                      {scopeLabel(c.treatment_scope)}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">{fmtNum(c.inlet_colour)} → {fmtNum(c.target_colour)}</td>
                  <td className="px-3 py-2 text-right">
                    {c.treatment_scope === "COLOUR_ODOR_SULPHUR"
                      ? `${fmtNum(c.inlet_sulphur)} → ${fmtNum(c.target_sulphur)}`
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => setViewing(c)} data-testid={`button-view-${c.id}`}>
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Link href={`/design-software/cps-sizing/case/${c.id}`}>
                      <Button size="sm" variant="ghost" data-testid={`button-edit-${c.id}`}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </Link>
                    <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => setDeleting(c)} data-testid={`button-delete-${c.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* View dialog (read-only) */}
        <Dialog open={viewing !== null} onOpenChange={o => !o && setViewing(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Sizing Case — {viewing?.customer_name}</DialogTitle>
            </DialogHeader>
            {viewing && (
              <div className="text-sm">
                <ViewRow label="Customer" value={viewing.customer_name} />
                <ViewRow label="Project / Plant Location" value={viewing.plant_location} />
                <ViewRow label="Required CPS Capacity (L/h)" value={fmtNum(viewing.cps_feed_capacity)} />
                <ViewRow label="RRBO Grade" value={viewing.rrbo_grade} />
                <ViewRow label="Feed Oil Viscosity @ 40°C (cSt)" value={fmtNum(viewing.feed_oil_visc_40c)} />
                <ViewRow label="Required Treatment" value={scopeLabel(viewing.treatment_scope)} />
                <ViewRow label="Inlet ASTM Colour" value={fmtNum(viewing.inlet_colour)} />
                <ViewRow label="Expected Outlet ASTM Colour" value={fmtNum(viewing.target_colour)} />
                {viewing.treatment_scope === "COLOUR_ODOR_SULPHUR" && (
                  <>
                    <ViewRow label="Inlet Sulphur (ppm)" value={fmtNum(viewing.inlet_sulphur)} />
                    <ViewRow label="Expected Outlet Sulphur (ppm)" value={fmtNum(viewing.target_sulphur)} />
                  </>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewing(null)} data-testid="button-close-view">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog open={deleting !== null} onOpenChange={o => !o && setDeleting(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Sizing Case</DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              Permanently delete the sizing case for <b>{deleting?.customer_name}</b> ({deleting?.plant_location})?
              This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(null)} data-testid="button-cancel-delete">Cancel</Button>
              <Button variant="destructive" onClick={() => deleting && deleteMutation.mutate(deleting.id)}
                disabled={deleteMutation.isPending} data-testid="button-confirm-delete">
                {deleteMutation.isPending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

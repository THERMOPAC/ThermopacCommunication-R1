import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, ShieldAlert, GitBranch, Layers } from "lucide-react";
import { fmtDate } from "@/lib/date-format";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Study {
  id: number;
  study_number: string;
  title: string;
  status: string;
  study_mode: string;
}

interface HazopNode {
  id: number;
  node_number: number;
  node_name: string;
  node_reference: string;
  node_description: string | null;
  design_intent: string | null;
  p_and_id_ref: string | null;
  deviation_count: number;
  action_count: number;
  generated_at: string | null;
  step_count: string;
  loop_id: number;
  loop_number: number;
  loop_name: string;
}

interface Loop {
  id: number;
  loop_number: number;
  loop_name: string;
}

// ── Count badge ────────────────────────────────────────────────────────────────

function CountBadge({ count, label }: { count: number | string; label: string }) {
  const n = Number(count);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${n > 0 ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
      {n} {label}
    </span>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HazopNodesPage() {
  const params = useParams<{ id: string }>();
  const studyId = parseInt(params.id);
  const [, navigate] = useLocation();
  const [loopFilter, setLoopFilter] = useState<string>("all");

  const { data: study, isLoading: studyLoading } = useQuery<Study>({
    queryKey: ["/api/hazop/studies", studyId],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}`).then(r => r.json()),
  });

  const { data: nodes = [], isLoading: nodesLoading } = useQuery<HazopNode[]>({
    queryKey: ["/api/hazop/studies", studyId, "nodes"],
    queryFn: () => fetch(`/api/hazop/studies/${studyId}/nodes`).then(r => r.json()),
    enabled: !isNaN(studyId),
  });

  const loops: Loop[] = Array.from(
    new Map(nodes.map(n => [n.loop_id, { id: n.loop_id, loop_number: n.loop_number, loop_name: n.loop_name }])).values()
  );

  const filtered = loopFilter === "all" ? nodes : nodes.filter(n => String(n.loop_id) === loopFilter);

  if (studyLoading) {
    return <Layout><div className="flex justify-center items-center h-64"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div></Layout>;
  }

  if (!study) {
    return <Layout><div className="p-8 text-center text-gray-500">Study not found.</div></Layout>;
  }

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/hazop/dashboard")} className="gap-1 text-gray-500">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-50 border border-red-100">
                <ShieldAlert className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Node Register</h1>
                <p className="text-xs text-gray-500">{study.study_number} — {study.title}</p>
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${study.study_mode === "concept_expected_project" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
              {study.study_mode === "concept_expected_project" ? "Concept" : "Project"}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/hazop/studies/${studyId}/process-builder`)} className="gap-1">
            <GitBranch className="h-4 w-4" /> Process Builder
          </Button>
        </div>

        {/* Filter bar */}
        {loops.length > 1 && (
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm text-gray-500">Filter by loop:</span>
            <Select value={loopFilter} onValueChange={setLoopFilter}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Loops</SelectItem>
                {loops.map(l => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    Loop #{l.loop_number} — {l.loop_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Summary */}
        <div className="flex gap-4 mb-4 text-sm text-gray-500">
          <span><strong className="text-gray-800">{filtered.length}</strong> nodes</span>
          <span><strong className="text-gray-800">{filtered.reduce((acc, n) => acc + Number(n.step_count ?? 0), 0)}</strong> steps</span>
          <span><strong className="text-gray-800">{filtered.filter(n => n.deviation_count > 0).length}</strong> with deviations</span>
          <span><strong className="text-gray-800">{filtered.filter(n => n.action_count > 0).length}</strong> with open actions</span>
        </div>

        {/* Table */}
        {nodesLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 border rounded-lg">
            <Layers className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No nodes yet.</p>
            <p className="text-sm mt-1">Add loops and nodes in the Process Builder first.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate(`/hazop/studies/${studyId}/process-builder`)}>
              <GitBranch className="h-4 w-4 mr-1" /> Go to Process Builder
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-3 font-medium text-gray-600">Ref</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Node Name</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Loop</th>
                  <th className="px-4 py-3 font-medium text-gray-600">P&ID Ref</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Design Intent</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center">Steps</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center">Deviations</th>
                  <th className="px-4 py-3 font-medium text-gray-600 text-center">Actions</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Generated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(n => (
                  <tr key={n.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-800 font-medium whitespace-nowrap">{n.node_reference}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{n.node_name}</div>
                      {n.node_description && <div className="text-xs text-gray-400">{n.node_description}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">#{n.loop_number} {n.loop_name}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{n.p_and_id_ref ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">
                      <span className="line-clamp-2">{n.design_intent ?? "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <CountBadge count={n.step_count ?? 0} label="steps" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <CountBadge count={n.deviation_count} label="dev" />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <CountBadge count={n.action_count} label="act" />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {n.generated_at ? fmtDate(n.generated_at) : <span className="italic">Not generated</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          Read-only. Nodes are created manually in the Process Builder. Deviation and action counts update after HAZOP generation (Phase 3).
        </p>
      </div>
    </Layout>
  );
}

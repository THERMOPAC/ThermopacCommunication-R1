import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Plus, Search, AlertTriangle, CheckCircle, Clock, Shield, Filter } from "lucide-react";
import { fmtDate } from "@/lib/date-format";
import {
  CONTROL_STATUS_LABELS, CONTROL_STATUS_COLORS, HOLD_STATUS_LABELS, HOLD_STATUS_COLORS,
  ENFORCEMENT_LEVEL_LABELS, ENFORCEMENT_LEVEL_COLORS, CONTROL_TYPE_LABELS,
  ERP_ENTITY_TYPE_LABELS, DEPARTMENTS,
} from "./oi-enforcement-constants";

function StatusBadge({ value, map, colorMap }: { value: string; map: Record<string, string>; colorMap: Record<string, string> }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colorMap[value] ?? "bg-gray-100 text-gray-700"}`}>{map[value] ?? value}</span>;
}

function SummaryPanel() {
  const { data } = useQuery<any>({
    queryKey: ["/api/oi/dashboard/enforcement-summary"],
    queryFn: async () => { const r = await fetch("/api/oi/dashboard/enforcement-summary"); if (!r.ok) return null; return r.json(); },
  });
  if (!data) return null;
  const c = data.controls;
  const h = data.holds;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <Card className="border-l-4 border-l-green-400">
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-gray-800">{c?.active ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">Active Controls</p>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-red-400">
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{h?.open ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">Open Holds</p>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-orange-400">
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-orange-700">{h?.mandatory ?? 0}</p>
          <p className="text-xs text-gray-500 mt-1">Mandatory Open</p>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-purple-400">
        <CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-purple-700">{(h?.overridden ?? 0) + (h?.emergencyBypassed ?? 0)}</p>
          <p className="text-xs text-gray-500 mt-1">Overrides / Bypasses</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function OiEnforcementRegisterPage() {
  const [activeTab, setActiveTab] = useState<"controls" | "holds">("controls");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: controls, isLoading: ctrlLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/enforcement/controls"],
    queryFn: async () => { const r = await fetch("/api/oi/enforcement/controls"); if (!r.ok) return []; return r.json(); },
  });

  const { data: holds, isLoading: holdsLoading } = useQuery<any[]>({
    queryKey: ["/api/oi/enforcement/holds"],
    queryFn: async () => { const r = await fetch("/api/oi/enforcement/holds"); if (!r.ok) return []; return r.json(); },
  });

  const filteredControls = (controls ?? []).filter(c => {
    const matchSearch = !search || c.controlNumber?.toLowerCase().includes(search.toLowerCase()) || c.title?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    const matchLevel  = levelFilter === "all"  || c.enforcementLevel === levelFilter;
    const matchDept   = deptFilter  === "all"  || c.department === deptFilter;
    const matchType   = typeFilter  === "all"  || c.controlType === typeFilter;
    return matchSearch && matchStatus && matchLevel && matchDept && matchType;
  });

  const filteredHolds = (holds ?? []).filter(h => {
    const matchSearch = !search || h.holdNumber?.toLowerCase().includes(search.toLowerCase()) || h.erpEntityRef?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || h.status === statusFilter;
    const matchLevel  = levelFilter === "all"  || h.enforcementLevel === levelFilter;
    const matchDept   = deptFilter  === "all"  || h.responsibleDepartment === deptFilter;
    return matchSearch && matchStatus && matchLevel && matchDept;
  });

  return (
    <Layout>
      <div className="space-y-4 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-600" />
            <div>
              <h1 className="text-lg font-bold text-gray-900">Enforcement Controls</h1>
              <p className="text-xs text-gray-500">ERP Enforcement Framework — Phase 2B</p>
            </div>
          </div>
          <Link href="/oi/enforcement/new">
            <Button size="sm" className="gap-2"><Plus className="h-3 w-3" /> New Control</Button>
          </Link>
        </div>

        {/* Summary */}
        <SummaryPanel />

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "controls" ? "border-b-2 border-blue-600 text-blue-700" : "text-gray-500 hover:text-gray-700"}`}
            onClick={() => setActiveTab("controls")}
          >
            Controls ({(controls ?? []).length})
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "holds" ? "border-b-2 border-blue-600 text-blue-700" : "text-gray-500 hover:text-gray-700"}`}
            onClick={() => setActiveTab("holds")}
          >
            Holds ({(holds ?? []).filter(h => h.status === "open").length} open)
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
            <Input className="pl-8 h-8 text-sm" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {activeTab === "controls"
                ? Object.entries(CONTROL_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)
                : Object.entries(HOLD_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)
              }
            </SelectContent>
          </Select>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="advisory">Advisory</SelectItem>
              <SelectItem value="mandatory">Mandatory</SelectItem>
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          {activeTab === "controls" && (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 text-xs w-48"><SelectValue placeholder="Control Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(CONTROL_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Controls Table */}
        {activeTab === "controls" && (
          <div className="space-y-2">
            {ctrlLoading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
              : filteredControls.length === 0
              ? <div className="text-center py-12 text-gray-400"><Shield className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No controls found</p></div>
              : filteredControls.map(ctrl => (
                <Link key={ctrl.id} href={`/oi/enforcement/${ctrl.id}`}>
                  <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-blue-300">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-mono text-gray-500">{ctrl.controlNumber}</span>
                            <StatusBadge value={ctrl.status} map={CONTROL_STATUS_LABELS} colorMap={CONTROL_STATUS_COLORS} />
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ENFORCEMENT_LEVEL_COLORS[ctrl.enforcementLevel] ?? "bg-gray-100 text-gray-700"}`}>{ENFORCEMENT_LEVEL_LABELS[ctrl.enforcementLevel] ?? ctrl.enforcementLevel}</span>
                          </div>
                          <p className="font-medium text-gray-900 text-sm mt-1 truncate">{ctrl.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                            <span>{CONTROL_TYPE_LABELS[ctrl.controlType] ?? ctrl.controlType}</span>
                            <span>•</span>
                            <span>{ERP_ENTITY_TYPE_LABELS[ctrl.erpEntityType] ?? ctrl.erpEntityType}</span>
                            <span>•</span>
                            <span>{ctrl.department}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {ctrl.openHoldCount > 0 && (
                            <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded">{ctrl.openHoldCount} open hold{ctrl.openHoldCount > 1 ? "s" : ""}</span>
                          )}
                          <p className="text-xs text-gray-400 mt-1">{fmtDate(ctrl.createdAt)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))
            }
          </div>
        )}

        {/* Holds Table */}
        {activeTab === "holds" && (
          <div className="space-y-2">
            {holdsLoading
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
              : filteredHolds.length === 0
              ? <div className="text-center py-12 text-gray-400"><AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">No holds found</p></div>
              : filteredHolds.map(hold => (
                <Card key={hold.id} className={`border-l-4 ${hold.status === "open" ? (hold.enforcementLevel === "mandatory" ? "border-l-red-500" : "border-l-orange-400") : "border-l-gray-300"}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-gray-500">{hold.holdNumber}</span>
                          <StatusBadge value={hold.status} map={HOLD_STATUS_LABELS} colorMap={HOLD_STATUS_COLORS} />
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ENFORCEMENT_LEVEL_COLORS[hold.enforcementLevel] ?? "bg-gray-100 text-gray-700"}`}>{ENFORCEMENT_LEVEL_LABELS[hold.enforcementLevel] ?? hold.enforcementLevel}</span>
                          {hold.status === "emergency_bypassed" && <span className="text-xs font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded animate-pulse">⚠ EMERGENCY BYPASS</span>}
                        </div>
                        <p className="text-sm text-gray-700 mt-1 line-clamp-1">{hold.reason}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                          <span>{ERP_ENTITY_TYPE_LABELS[hold.erpEntityType] ?? hold.erpEntityType}:{hold.erpEntityRef ?? hold.erpEntityId}</span>
                          <span>•</span>
                          <span>{hold.responsibleDepartment}</span>
                          <span>•</span>
                          <span>{fmtDate(hold.raisedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            }
          </div>
        )}
      </div>
    </Layout>
  );
}

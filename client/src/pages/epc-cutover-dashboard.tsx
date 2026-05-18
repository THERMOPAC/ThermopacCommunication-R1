import { useQuery } from "@tanstack/react-query";
import { getProjectDisplayName } from "@/lib/project-utils";
import { fmtDate, fmtDateTime } from "@/lib/date-format";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileWarning, Activity, TrendingDown, Shield, CheckCircle2, XCircle, Clock, AlertTriangle, Package, Lock, Unlock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function StatusBadge({ enabled }: { enabled: boolean }) {
  return enabled ? (
    <Badge className="bg-green-100 text-green-800">ON</Badge>
  ) : (
    <Badge variant="outline" className="text-gray-500">OFF</Badge>
  );
}

function MetricCard({ title, value, subtitle, icon: Icon, color }: {
  title: string; value: string | number; subtitle?: string; icon: any; color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <Icon className={`h-8 w-8 ${color} opacity-50`} />
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono">{pct}%</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function EpcCutoverDashboard() {
  const { data: readiness, isLoading: readinessLoading } = useQuery<any>({
    queryKey: ["/api/epc-monitoring/cutover-readiness"],
    refetchInterval: 60000,
  });

  const { data: pendingUploads, isLoading: pendingLoading } = useQuery<any>({
    queryKey: ["/api/epc-monitoring/pending-uploads"],
  });

  const { data: dspUsage, isLoading: dspLoading } = useQuery<any>({
    queryKey: ["/api/epc-monitoring/dsp-usage"],
  });

  const { data: legacyAccess, isLoading: legacyLoading } = useQuery<any>({
    queryKey: ["/api/epc-monitoring/legacy-access"],
  });

  const { data: bomReadiness, isLoading: bomLoading } = useQuery<any>({
    queryKey: ["/api/epc-monitoring/bom-readiness"],
    refetchInterval: 60000,
  });

  if (readinessLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const ins = readiness?.ins || {};
  const dwg = readiness?.dwg || {};
  const dsp = readiness?.dsp || {};

  return (
    <Layout>
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">EPC Cutover Readiness Dashboard</h1>
          <p className="text-muted-foreground text-sm">Controlled Adoption & Monitoring — observation only, no forced migrations</p>
        </div>
        <Badge variant="outline" className="text-blue-600 border-blue-300 px-3 py-1">
          <Shield className="h-3 w-3 mr-1" /> Read-Only Phase
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Feature Flags</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {readiness?.featureFlags?.map((f: any) => (
              <div key={f.flag_name} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-mono text-sm">{f.flag_name}</p>
                  {f.description && <p className="text-xs text-muted-foreground mt-1">{f.description}</p>}
                </div>
                <StatusBadge enabled={f.enabled} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard
          title="INS — EPC Served"
          value={`${ins.epcPercent || 0}%`}
          subtitle={`${ins.epcServed || 0} of ${ins.total || 0} inspections`}
          icon={CheckCircle2}
          color="text-green-600"
        />
        <MetricCard
          title="DWG — With Files"
          value={dwg.epcWithFiles || 0}
          subtitle={`of ${dwg.total || 0} migrated records`}
          icon={Activity}
          color="text-blue-600"
        />
        <MetricCard
          title="DWG — Pending Upload"
          value={dwg.pendingUpload || 0}
          subtitle="awaiting business file upload"
          icon={FileWarning}
          color={dwg.pendingUpload > 0 ? "text-amber-600" : "text-green-600"}
        />
        <MetricCard
          title="DSP — EPC Usage"
          value={dsp.totalEpcDispatches || 0}
          subtitle={dsp.status === 'active' ? 'Active — dispatches in EPC' : 'Inactive — no EPC dispatches yet'}
          icon={dsp.status === 'active' ? CheckCircle2 : Clock}
          color={dsp.status === 'active' ? "text-green-600" : "text-gray-500"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" /> INS — Inspection Documents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <ProgressBar value={ins.epcServed || 0} max={ins.total || 0} label="EPC-Served Inspections" />
              <div className="grid grid-cols-2 gap-4 text-center pt-2">
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-700">{ins.epcServed || 0}</p>
                  <p className="text-xs text-green-600">EPC Path</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-700">{ins.legacyServed || 0}</p>
                  <p className="text-xs text-gray-600">Legacy Path</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileWarning className="h-5 w-5" /> DWG — Drawing Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-2 rounded bg-green-50">
                <span className="text-sm">With EPC Files</span>
                <span className="font-bold text-green-700">{dwg.epcWithFiles || 0}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-amber-50">
                <span className="text-sm flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-600" /> Pending Upload
                </span>
                <span className="font-bold text-amber-700">{dwg.pendingUpload || 0}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-gray-50">
                <span className="text-sm flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-gray-500" /> File Not Available
                </span>
                <span className="font-bold text-gray-600">{dwg.fileNotAvailable || 0}</span>
              </div>
              <div className="flex justify-between items-center p-2 rounded bg-gray-50">
                <span className="text-sm">Superseded</span>
                <span className="font-bold text-gray-500">{dwg.superseded || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileWarning className="h-5 w-5 text-amber-600" /> Pending Upload Drawings — Action Required
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (pendingUploads?.count || 0) === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p>No pending uploads — all drawing files accounted for</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Control Number</TableHead>
                  <TableHead>Drawing Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Rev</TableHead>
                  <TableHead>Age (Days)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUploads?.records?.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.dwg_control_number}</TableCell>
                    <TableCell>{r.drawing_number}</TableCell>
                    <TableCell>{r.drawing_title}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{r.project_code}</span>
                      <span className="text-xs text-muted-foreground ml-1">— {r.project_name}</span>
                    </TableCell>
                    <TableCell><Badge variant="outline">{r.revision_code}</Badge></TableCell>
                    <TableCell>
                      <span className={`font-mono ${r.age_days > 30 ? 'text-red-600 font-bold' : r.age_days > 7 ? 'text-amber-600' : ''}`}>
                        {r.age_days}d
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" /> DSP — Dispatch EPC Adoption
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dspLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (dspUsage?.totalEpcDispatches || 0) === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-2 text-gray-400" />
              <p className="font-medium">No EPC dispatches created yet</p>
              <p className="text-sm mt-1">DSP wiring is ready. Awaiting first dispatch through EPC workflow.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-700">{dspUsage.totalEpcDispatches}</p>
                  <p className="text-xs text-green-600">Total EPC Dispatches</p>
                </div>
                {dspUsage.firstCreated && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm font-mono text-blue-700">{fmtDate(dspUsage.firstCreated)}</p>
                    <p className="text-xs text-blue-600">First Created</p>
                  </div>
                )}
              </div>
              {dspUsage.byProject?.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Dispatches</TableHead>
                      <TableHead>First</TableHead>
                      <TableHead>Latest</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dspUsage.byProject.map((p: any) => (
                      <TableRow key={p.project_code}>
                        <TableCell>{getProjectDisplayName(p)}</TableCell>
                        <TableCell className="font-bold">{p.dispatch_count}</TableCell>
                        <TableCell className="text-sm">{fmtDate(p.first_dispatch)}</TableCell>
                        <TableCell className="text-sm">{fmtDate(p.last_dispatch)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingDown className="h-5 w-5" /> Legacy Access — 7-Day Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {legacyLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {readiness?.legacyTrend7Day?.length > 0 ? (
                <div className="grid grid-cols-7 gap-2">
                  {readiness.legacyTrend7Day.map((d: any) => (
                    <div key={d.day} className="text-center p-2 bg-gray-50 rounded">
                      <p className="text-xs text-muted-foreground">{fmtDate(d.day)}</p>
                      <p className="text-lg font-bold">{d.accesses}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <p>No legacy file access recorded in the last 7 days</p>
                </div>
              )}

              {legacyAccess?.summary?.length > 0 && (
                <>
                  <h4 className="font-semibold text-sm mt-4">Access by Path Family (last 30 days)</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Path Family</TableHead>
                        <TableHead>Total Accesses</TableHead>
                        <TableHead>Unique Users</TableHead>
                        <TableHead>Last Access</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {legacyAccess.summary.map((s: any) => (
                        <TableRow key={s.path_family}>
                          <TableCell className="font-mono text-sm">{s.path_family}</TableCell>
                          <TableCell className="font-bold">{s.total_accesses}</TableCell>
                          <TableCell>{s.unique_users}</TableCell>
                          <TableCell className="text-sm">{fmtDate(s.last_access)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}

              {legacyAccess?.zeroUsage7Days?.length > 0 && (
                <div className="p-3 bg-green-50 rounded-lg mt-2">
                  <p className="text-sm font-medium text-green-800">Zero-Usage Candidates (no access in 7 days):</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {legacyAccess.zeroUsage7Days.map((pf: string) => (
                      <Badge key={pf} variant="outline" className="text-green-700 border-green-300">{pf}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" /> BOM Gating — Cutover Readiness
          </CardTitle>
          {bomReadiness && (
            <div className="flex items-center gap-2 mt-1">
              {bomReadiness.strictEnabled ? (
                <Badge className="bg-red-100 text-red-800"><Lock className="h-3 w-3 mr-1" /> Strict EPC Mode</Badge>
              ) : (
                <Badge variant="outline" className="text-amber-600 border-amber-300"><Unlock className="h-3 w-3 mr-1" /> Transitional Mode</Badge>
              )}
              {bomReadiness.canEnableStrict ? (
                <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" /> Ready for Strict</Badge>
              ) : (
                <Badge variant="outline" className="text-red-600 border-red-300"><XCircle className="h-3 w-3 mr-1" /> Not Ready</Badge>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {bomLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : bomReadiness ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-700">{bomReadiness.summary.totalActiveProjectItems}</p>
                  <p className="text-xs text-blue-600">Active Project Items</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-700">{bomReadiness.summary.bomCoveragePercent}%</p>
                  <p className="text-xs text-green-600">BOM Coverage</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-emerald-700">{bomReadiness.summary.bomReadyPercent}%</p>
                  <p className="text-xs text-emerald-600">Released/Locked</p>
                </div>
                <div className={`p-3 rounded-lg text-center ${bomReadiness.summary.recentBypasses14d > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
                  <p className={`text-2xl font-bold ${bomReadiness.summary.recentBypasses14d > 0 ? 'text-amber-700' : 'text-gray-500'}`}>{bomReadiness.summary.recentBypasses14d}</p>
                  <p className={`text-xs ${bomReadiness.summary.recentBypasses14d > 0 ? 'text-amber-600' : 'text-gray-500'}`}>Bypasses (14d)</p>
                </div>
              </div>

              <ProgressBar value={bomReadiness.summary.withBom} max={bomReadiness.summary.totalActiveProjectItems} label="BOM Coverage (Items with BOM)" />
              <ProgressBar value={bomReadiness.summary.withReleasedLockedBom} max={bomReadiness.summary.totalActiveProjectItems} label="BOM Ready (Released/Locked)" />

              {bomReadiness.cutoverBlockers?.length > 0 && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4" /> Cutover Blockers
                  </p>
                  <ul className="space-y-1">
                    {bomReadiness.cutoverBlockers.map((b: string, i: number) => (
                      <li key={i} className="text-sm text-red-700 flex items-center gap-1">
                        <XCircle className="h-3 w-3 flex-shrink-0" /> {b}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Tabs defaultValue="without-bom" className="mt-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="without-bom">
                    Without BOM ({bomReadiness.itemsWithoutBom?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="not-ready">
                    Not Released ({bomReadiness.bomsNotReady?.length || 0})
                  </TabsTrigger>
                  <TabsTrigger value="bypass-log">
                    Bypass Log ({bomReadiness.bypassLog?.length || 0})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="without-bom">
                  {bomReadiness.itemsWithoutBom?.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p>All active project items have BOMs</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>Item #</TableHead>
                          <TableHead>Item Code</TableHead>
                          <TableHead>Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bomReadiness.itemsWithoutBom?.map((r: any) => (
                          <TableRow key={r.id}>
                            <TableCell><span className="font-mono text-xs">{r.project_code}</span></TableCell>
                            <TableCell className="font-mono text-sm">{r.item_number}</TableCell>
                            <TableCell>{r.item_code || '—'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{r.description || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="not-ready">
                  {bomReadiness.bomsNotReady?.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p>All current BOMs are Released or Locked</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead>BOM Number</TableHead>
                          <TableHead>Rev</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Item</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bomReadiness.bomsNotReady?.map((r: any) => (
                          <TableRow key={r.id}>
                            <TableCell><span className="font-mono text-xs">{r.project_code}</span></TableCell>
                            <TableCell className="font-mono text-sm">{r.bom_number}</TableCell>
                            <TableCell><Badge variant="outline">{r.revision_code}</Badge></TableCell>
                            <TableCell>
                              <Badge className={
                                r.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                                r.status === 'under_review' ? 'bg-blue-100 text-blue-800' :
                                r.status === 'approved' ? 'bg-amber-100 text-amber-800' :
                                'bg-gray-100 text-gray-800'
                              }>{r.status}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{r.item_code || r.item_number}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                <TabsContent value="bypass-log">
                  {bomReadiness.bypassLog?.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                      <p>No PO/WO created without BOM backing</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Document</TableHead>
                          <TableHead>Project</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Created By</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bomReadiness.bypassLog?.map((r: any) => (
                          <TableRow key={r.id}>
                            <TableCell>
                              <Badge variant="outline" className={r.document_type === 'PO' ? 'text-blue-600' : 'text-purple-600'}>
                                {r.document_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{r.document_number}</TableCell>
                            <TableCell><span className="font-mono text-xs">{r.project_code}</span></TableCell>
                            <TableCell className="text-sm">{r.item_code || r.item_number}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{r.reason}</TableCell>
                            <TableCell className="text-sm">{r.created_by_name}</TableCell>
                            <TableCell className="text-sm">{fmtDate(r.created_at)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
    </Layout>
  );
}

import Layout from "@/components/layout";
import { fmtDate } from "@/lib/date-format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import {
  FileText, Download, Printer, RefreshCw, Calendar,
  Users, Clock, TrendingUp, AlertTriangle, CheckCircle2,
  ClipboardList, Activity, PauseCircle, Info
} from "lucide-react";

interface DprRow {
  id: number;
  wo_number: string;
  item_code: string | null;
  item_description: string | null;
  quantity: string;
  uom: string | null;
  status: string;
  quality_status: string | null;
  project_code: string | null;
  customer_name: string | null;
  log_id: number | null;
  log_date: string | null;
  log_status: string | null;
  progress_percent: number | null;
  work_done_today: string | null;
  manpower_count: number | null;
  manpower_breakdown: Record<string, number> | null;
  hours_worked: string | null;
  issues_encountered: string | null;
  next_day_plan: string | null;
  crew_note: string | null;
  reported_by: number | null;
  reported_by_name: string | null;
  active_holds: number;
  latest_progress: number | null;
}

function progressBadge(pct: number | null) {
  if (pct === null || pct === undefined) return <Badge variant="secondary">—</Badge>;
  const n = Number(pct);
  if (n >= 100) return <Badge className="bg-green-100 text-green-800">{n}%</Badge>;
  if (n >= 75) return <Badge className="bg-blue-100 text-blue-800">{n}%</Badge>;
  if (n >= 40) return <Badge className="bg-yellow-100 text-yellow-800">{n}%</Badge>;
  return <Badge className="bg-red-100 text-red-800">{n}%</Badge>;
}

function logStatusBadge(status: string | null) {
  if (!status) return <Badge variant="outline" className="text-muted-foreground">Not Logged</Badge>;
  if (status === 'submitted') return <Badge className="bg-green-100 text-green-800">Submitted</Badge>;
  if (status === 'draft') return <Badge className="bg-yellow-100 text-yellow-800">Draft</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function manpowerLabel(breakdown: Record<string, number> | null): string {
  if (!breakdown) return '—';
  const parts: string[] = [];
  if (breakdown.team_leaders) parts.push(`${breakdown.team_leaders} TL`);
  if (breakdown.fitters) parts.push(`${breakdown.fitters} Fit`);
  if (breakdown.welders) parts.push(`${breakdown.welders} Wld`);
  if (breakdown.helpers) parts.push(`${breakdown.helpers} Hlp`);
  if (breakdown.qc_persons) parts.push(`${breakdown.qc_persons} QC`);
  return parts.length ? parts.join(' · ') : '—';
}

export default function EpcDprPage() {
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [committedDate, setCommittedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: rows = [], isLoading, refetch } = useQuery<DprRow[]>({
    queryKey: ['/api/epc/work-orders/daily-report', committedDate],
    queryFn: async () => {
      const res = await fetch(`/api/epc/work-orders/daily-report?date=${committedDate}`);
      if (!res.ok) throw new Error('Failed to load report');
      return res.json();
    },
  });

  const logged = rows.filter(r => r.log_id !== null);
  const notLogged = rows.filter(r => r.log_id === null);
  const submitted = logged.filter(r => r.log_status === 'submitted');

  const totalManpower = submitted.reduce((s, r) => s + (r.manpower_count || 0), 0);
  const totalHours = submitted.reduce((s, r) => s + parseFloat(r.hours_worked || '0'), 0);
  const avgProgress = submitted.length
    ? Math.round(submitted.reduce((s, r) => s + (Number(r.progress_percent) || 0), 0) / submitted.length)
    : 0;
  const totalHolds = rows.reduce((s, r) => s + (r.active_holds || 0), 0);

  const handleGenerate = () => {
    setCommittedDate(selectedDate);
  };

  const exportCsv = () => {
    const headers = [
      'WO Number', 'Item Code', 'Item Description', 'Project', 'Customer',
      'Log Status', 'Progress %', 'Manpower', 'Hours Worked',
      'Work Done Today', 'Issues Encountered', 'Next Day Plan',
      'Crew Note', 'Reported By', 'Active Holds'
    ];
    const csvRows = rows.map(r => [
      r.wo_number,
      r.item_code || '',
      `"${(r.item_description || '').replace(/"/g, '""')}"`,
      r.project_code || '',
      r.customer_name || '',
      r.log_status || 'Not Logged',
      r.progress_percent ?? '',
      r.manpower_count ?? '',
      r.hours_worked || '',
      `"${(r.work_done_today || '').replace(/"/g, '""')}"`,
      `"${(r.issues_encountered || '').replace(/"/g, '""')}"`,
      `"${(r.next_day_plan || '').replace(/"/g, '""')}"`,
      `"${(r.crew_note || '').replace(/"/g, '""')}"`,
      r.reported_by_name || '',
      r.active_holds
    ].join(','));
    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DPR_${committedDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <TooltipProvider>
        <div className="space-y-6">

          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold pl-4">Daily Production Report</h1>
              <p className="text-muted-foreground pl-4">EPC Work Orders — real production data from daily logs</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </div>

          {/* Date filter */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4" />
                Report Date
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1 max-w-xs">
                  <Label htmlFor="date">Select Date</Label>
                  <Input
                    id="date"
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <Button onClick={handleGenerate} disabled={isLoading}>
                  {isLoading
                    ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Loading…</>
                    : <><FileText className="h-4 w-4 mr-2" />Generate Report</>
                  }
                </Button>
                {committedDate && (
                  <p className="text-sm text-muted-foreground pb-1">
                    Showing: <span className="font-medium">{fmtDate(committedDate)}</span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* KPI Summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Released WOs</p>
                <p className="text-2xl font-bold mt-1">{rows.length}</p>
                <ClipboardList className="h-5 w-5 text-blue-400 mt-1" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Logs Submitted</p>
                <p className="text-2xl font-bold mt-1 text-green-600">{submitted.length}</p>
                <CheckCircle2 className="h-5 w-5 text-green-400 mt-1" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Draft Logs</p>
                <p className="text-2xl font-bold mt-1 text-yellow-600">
                  {logged.filter(r => r.log_status === 'draft').length}
                </p>
                <Activity className="h-5 w-5 text-yellow-400 mt-1" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Not Logged</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{notLogged.length}</p>
                <AlertTriangle className="h-5 w-5 text-red-400 mt-1" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Manpower</p>
                <p className="text-2xl font-bold mt-1">{totalManpower}</p>
                <Users className="h-5 w-5 text-purple-400 mt-1" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Avg Progress</p>
                <p className="text-2xl font-bold mt-1 text-blue-600">{avgProgress}%</p>
                <TrendingUp className="h-5 w-5 text-blue-400 mt-1" />
              </CardContent>
            </Card>
          </div>

          {/* Secondary KPIs */}
          {submitted.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <Clock className="h-6 w-6 text-slate-400 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Hours Worked</p>
                    <p className="text-lg font-semibold">{totalHours.toFixed(1)} h</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <PauseCircle className="h-6 w-6 text-orange-400 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Active Holds (all WOs)</p>
                    <p className="text-lg font-semibold">{totalHolds}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <Users className="h-6 w-6 text-purple-400 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Coverage Rate</p>
                    <p className="text-lg font-semibold">
                      {rows.length > 0 ? Math.round((submitted.length / rows.length) * 100) : 0}%
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 flex items-center gap-3">
                  <Activity className="h-6 w-6 text-blue-400 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Man-Hours</p>
                    <p className="text-lg font-semibold">
                      {(totalManpower > 0 && totalHours > 0)
                        ? (totalManpower * totalHours / (submitted.length || 1)).toFixed(1)
                        : '—'} h/WO
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Logged WOs table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Production Log — {fmtDate(committedDate)}
              </CardTitle>
              <CardDescription>
                {logged.length} work order{logged.length !== 1 ? 's' : ''} with log entries for this date
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                  Loading report…
                </div>
              ) : logged.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="font-medium">No daily logs found for {fmtDate(committedDate)}</p>
                  <p className="text-sm mt-1">
                    Team leaders submit logs from the Work Order → Manage → Daily Log tab.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>WO No.</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-center">Log</TableHead>
                        <TableHead className="text-center">Progress</TableHead>
                        <TableHead className="text-center">Latest %</TableHead>
                        <TableHead className="text-center">Manpower</TableHead>
                        <TableHead className="text-center">Hours</TableHead>
                        <TableHead>Breakdown</TableHead>
                        <TableHead>Work Done Today</TableHead>
                        <TableHead>Issues</TableHead>
                        <TableHead>Tomorrow Plan</TableHead>
                        <TableHead className="text-center">Holds</TableHead>
                        <TableHead>Reported By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logged.map(r => (
                        <TableRow key={r.id} className={r.active_holds > 0 ? 'bg-orange-50' : ''}>
                          <TableCell className="font-mono font-medium whitespace-nowrap">{r.wo_number}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{r.item_code || '—'}</TableCell>
                          <TableCell className="max-w-[180px]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="line-clamp-2 text-sm cursor-default">
                                  {r.item_description || '—'}
                                </span>
                              </TooltipTrigger>
                              {r.item_description && (
                                <TooltipContent className="max-w-xs">{r.item_description}</TooltipContent>
                              )}
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            <span className="font-medium">{r.project_code || '—'}</span>
                            {r.customer_name && (
                              <span className="text-muted-foreground block text-xs">{r.customer_name}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{logStatusBadge(r.log_status)}</TableCell>
                          <TableCell className="text-center">{progressBadge(r.progress_percent)}</TableCell>
                          <TableCell className="text-center">
                            {r.latest_progress !== null
                              ? <span className="text-sm text-muted-foreground">{Number(r.latest_progress)}%</span>
                              : <span className="text-muted-foreground text-sm">—</span>
                            }
                          </TableCell>
                          <TableCell className="text-center font-medium">{r.manpower_count ?? '—'}</TableCell>
                          <TableCell className="text-center">{r.hours_worked ? `${r.hours_worked}h` : '—'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                            {manpowerLabel(r.manpower_breakdown)}
                          </TableCell>
                          <TableCell className="max-w-[160px]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="line-clamp-2 text-sm cursor-default">
                                  {r.work_done_today || '—'}
                                </span>
                              </TooltipTrigger>
                              {r.work_done_today && (
                                <TooltipContent className="max-w-xs">{r.work_done_today}</TooltipContent>
                              )}
                            </Tooltip>
                          </TableCell>
                          <TableCell className="max-w-[140px]">
                            {r.issues_encountered ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="flex items-center gap-1 text-sm text-orange-600 cursor-default">
                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                    <span className="line-clamp-1">{r.issues_encountered}</span>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">{r.issues_encountered}</TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[140px]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="line-clamp-2 text-sm cursor-default">
                                  {r.next_day_plan || '—'}
                                </span>
                              </TooltipTrigger>
                              {r.next_day_plan && (
                                <TooltipContent className="max-w-xs">{r.next_day_plan}</TooltipContent>
                              )}
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-center">
                            {r.active_holds > 0 ? (
                              <Badge className="bg-orange-100 text-orange-800">
                                <PauseCircle className="h-3 w-3 mr-1" />
                                {r.active_holds}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{r.reported_by_name || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* WOs not logged today */}
          {notLogged.length > 0 && (
            <Card className="border-dashed border-muted-foreground/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
                  <Info className="h-4 w-4" />
                  WOs Without a Log for {fmtDate(committedDate)}
                  <Badge variant="outline" className="ml-2">{notLogged.length}</Badge>
                </CardTitle>
                <CardDescription>
                  These released work orders have no daily log entry for this date.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>WO No.</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-center">Latest Progress</TableHead>
                        <TableHead className="text-center">Active Holds</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notLogged.map(r => (
                        <TableRow key={r.id} className="text-muted-foreground">
                          <TableCell className="font-mono font-medium">{r.wo_number}</TableCell>
                          <TableCell className="text-sm">{r.item_code || '—'}</TableCell>
                          <TableCell className="text-sm max-w-[200px]">
                            <span className="line-clamp-1">{r.item_description || '—'}</span>
                          </TableCell>
                          <TableCell className="text-sm">{r.project_code || '—'}</TableCell>
                          <TableCell className="text-center">{progressBadge(r.latest_progress)}</TableCell>
                          <TableCell className="text-center">
                            {r.active_holds > 0 ? (
                              <Badge className="bg-orange-100 text-orange-800">
                                <PauseCircle className="h-3 w-3 mr-1" />
                                {r.active_holds}
                              </Badge>
                            ) : (
                              <span className="text-sm">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </TooltipProvider>
    </Layout>
  );
}

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, TrendingUp, Shield, DollarSign, Calendar, Save, Info, Zap, ArrowRight, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface UsageSummary {
  monthlyTotal: number;
  monthlyLimit: number;
  monthlyPercent: number;
  dailyTotal: number;
  dailyLimit: number;
  dailyPercent: number;
  remainingDaily: number;
  lastCumulativeTotal: number;
  warningLevel: string;
  softBlockEnabled: boolean;
  daysInMonth: number;
  dayOfMonth: number;
}

interface UsageLimits {
  id: number;
  monthlyLimitUnits: string;
  dailyLimitUnits: string;
  softBlockEnabled: boolean;
}

interface DailyLog {
  id: number;
  logDate: string;
  estimatedUnits: string;
  estimatedCost: string;
  cumulativeTotal: string;
  notes: string | null;
}

const warningColors: Record<string, { bg: string; text: string; border: string }> = {
  none: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  caution: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' },
  warning: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
  limit_reached: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
};

export default function UsageTrackerPage() {
  const { toast } = useToast();
  const [currentTotal, setCurrentTotal] = useState('');
  const [sessionNote, setSessionNote] = useState('');
  const [quickLogSuccess, setQuickLogSuccess] = useState(false);

  const { data: summary } = useQuery<UsageSummary>({ queryKey: ['/api/usage-tracker/summary'] });
  const { data: limits } = useQuery<UsageLimits>({ queryKey: ['/api/usage-tracker/limits'] });
  const { data: dailyLogs = [] } = useQuery<DailyLog[]>({ queryKey: ['/api/usage-tracker/daily-log'] });

  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [dailyLimit, setDailyLimit] = useState('');
  const [softBlock, setSoftBlock] = useState(true);
  const [limitsInitialized, setLimitsInitialized] = useState(false);

  useEffect(() => {
    if (limits && !limitsInitialized) {
      setMonthlyLimit(limits.monthlyLimitUnits);
      setDailyLimit(limits.dailyLimitUnits);
      setSoftBlock(limits.softBlockEnabled);
      setLimitsInitialized(true);
    }
  }, [limits, limitsInitialized]);

  const computedDelta = currentTotal && summary
    ? Math.max(0, parseFloat(currentTotal) - summary.lastCumulativeTotal)
    : 0;

  const quickLogMutation = useMutation({
    mutationFn: async (data: { currentTotal: number; notes: string }) => {
      return apiRequest('POST', '/api/usage-tracker/quick-log', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/usage-tracker'] });
      setCurrentTotal('');
      setSessionNote('');
      setQuickLogSuccess(true);
      setTimeout(() => setQuickLogSuccess(false), 3000);
      toast({ title: "Logged", description: `Today's usage recorded (${computedDelta.toFixed(1)} units delta).` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateLimitsMutation = useMutation({
    mutationFn: async (data: { monthlyLimitUnits: number; dailyLimitUnits: number; softBlockEnabled: boolean }) => {
      return apiRequest('PUT', '/api/usage-tracker/limits', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/usage-tracker'] });
      toast({ title: "Limits updated", description: "Usage limits saved successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const wc = warningColors[summary?.warningLevel || 'none'];

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Agent Usage Tracker</h1>
          <p className="text-muted-foreground">Monitor Replit Agent usage with budget alerts (advisory only)</p>
        </div>

        {summary?.warningLevel === 'limit_reached' && summary.softBlockEnabled && (
          <Alert variant="destructive">
            <Shield className="h-4 w-4" />
            <AlertTitle>Budget Limit Reached</AlertTitle>
            <AlertDescription>
              Monthly or daily usage has reached the configured limit. This is advisory only — you can continue working, but be aware of the cost.
            </AlertDescription>
          </Alert>
        )}

        {summary?.warningLevel === 'critical' && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-700">90% of Budget Used</AlertTitle>
            <AlertDescription className="text-red-600">
              Usage is at {Math.max(summary.monthlyPercent, summary.dailyPercent).toFixed(1)}%. Consider pausing for the remainder of this period.
            </AlertDescription>
          </Alert>
        )}

        <Card className="border-2 border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="h-5 w-5 text-blue-600" />
              Quick Log — Update Today's Usage
            </CardTitle>
            <CardDescription>
              Copy the "Resource usage" number from Replit Settings → Workspace usage and paste it below. The system auto-calculates today's delta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 min-w-[180px]">
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Current total from Replit (e.g., $273.11)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={summary ? String(summary.lastCumulativeTotal) : '0.00'}
                    value={currentTotal}
                    onChange={(e) => {
                      setCurrentTotal(e.target.value);
                      setQuickLogSuccess(false);
                    }}
                    className="pl-7 bg-white"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && currentTotal) {
                        quickLogMutation.mutate({ currentTotal: parseFloat(currentTotal), notes: sessionNote });
                      }
                    }}
                  />
                </div>
              </div>
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs text-muted-foreground mb-1 block">Session note (optional)</Label>
                <Input
                  placeholder="What work was done today..."
                  value={sessionNote}
                  onChange={(e) => setSessionNote(e.target.value)}
                  className="bg-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && currentTotal) {
                      quickLogMutation.mutate({ currentTotal: parseFloat(currentTotal), notes: sessionNote });
                    }
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                {currentTotal && parseFloat(currentTotal) > 0 && (
                  <div className="text-sm text-muted-foreground whitespace-nowrap">
                    <ArrowRight className="h-3.5 w-3.5 inline mr-1" />
                    Delta: <span className="font-semibold text-foreground">{computedDelta.toFixed(2)}</span> units
                  </div>
                )}
                <Button
                  disabled={!currentTotal || quickLogMutation.isPending}
                  onClick={() => quickLogMutation.mutate({ currentTotal: parseFloat(currentTotal), notes: sessionNote })}
                  className={quickLogSuccess ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  {quickLogSuccess ? (
                    <><CheckCircle2 className="h-4 w-4 mr-1" />Saved</>
                  ) : quickLogMutation.isPending ? (
                    'Saving...'
                  ) : (
                    'Log'
                  )}
                </Button>
              </div>
            </div>
            {summary && (
              <p className="text-xs text-muted-foreground mt-2">
                Last recorded total: <span className="font-medium">${summary.lastCumulativeTotal}</span>
                {dailyLogs.length > 0 && (
                  <> — logged {new Date(dailyLogs[0].logDate).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}</>
                )}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className={`${wc?.border} border-2`}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Today's Delta
              </CardDescription>
              <CardTitle className="text-2xl">
                {summary?.dailyTotal ?? 0}
                <span className="text-sm font-normal text-muted-foreground"> units</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${summary?.dailyPercent && summary.dailyPercent >= 90 ? 'bg-red-500' : summary?.dailyPercent && summary.dailyPercent >= 75 ? 'bg-orange-500' : summary?.dailyPercent && summary.dailyPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(summary?.dailyPercent ?? 0, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{summary?.dailyPercent?.toFixed(1)}% of {summary?.dailyLimit} daily limit</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Monthly Total
              </CardDescription>
              <CardTitle className="text-2xl">
                {summary?.monthlyTotal ?? 0}
                <span className="text-sm font-normal text-muted-foreground"> / {summary?.monthlyLimit ?? 500}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${summary?.monthlyPercent && summary.monthlyPercent >= 90 ? 'bg-red-500' : summary?.monthlyPercent && summary.monthlyPercent >= 75 ? 'bg-orange-500' : summary?.monthlyPercent && summary.monthlyPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(summary?.monthlyPercent ?? 0, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">Day {summary?.dayOfMonth} of {summary?.daysInMonth} — {summary?.monthlyPercent?.toFixed(1)}%</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Shield className="h-4 w-4" /> Remaining Today
              </CardDescription>
              <CardTitle className="text-2xl">
                {summary?.remainingDaily ?? 0}
                <span className="text-sm font-normal text-muted-foreground"> units left</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Budget headroom before daily limit
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Projected Monthly
              </CardDescription>
              <CardTitle className="text-2xl">
                ${summary && summary.dayOfMonth > 0
                  ? ((summary.monthlyTotal / summary.dayOfMonth) * summary.daysInMonth).toFixed(0)
                  : '0'}
                <span className="text-sm font-normal text-muted-foreground"> est.</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                + 18% GST = ${summary && summary.dayOfMonth > 0
                  ? (((summary.monthlyTotal / summary.dayOfMonth) * summary.daysInMonth) * 1.18).toFixed(0)
                  : '0'}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Daily Usage History</CardTitle>
              <CardDescription>Last 30 days — each row shows the daily delta and running total</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No usage entries yet</p>
                  <p className="text-xs">Use the Quick Log above to add your first entry</p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
                  <div className="grid grid-cols-[1fr_80px_80px] gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
                    <span>Date</span>
                    <span className="text-right">Delta</span>
                    <span className="text-right">Total</span>
                  </div>
                  {dailyLogs.map((log) => {
                    const units = parseFloat(log.estimatedUnits);
                    const cumTotal = parseFloat(log.cumulativeTotal || '0');
                    const dailyLim = parseFloat(limits?.dailyLimitUnits || '50');
                    const pct = dailyLim > 0 ? (units / dailyLim) * 100 : 0;
                    return (
                      <div key={log.id} className={`grid grid-cols-[1fr_80px_80px] gap-2 items-center p-3 rounded-lg border ${pct >= 100 ? 'bg-red-50 border-red-200' : pct >= 75 ? 'bg-orange-50 border-orange-200' : 'bg-white'}`}>
                        <div>
                          <p className="text-sm font-medium">
                            {new Date(log.logDate).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
                          </p>
                          {log.notes && <p className="text-xs text-muted-foreground truncate max-w-[250px]">{log.notes}</p>}
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${pct >= 100 ? 'text-red-600' : pct >= 75 ? 'text-orange-600' : ''}`}>
                            +{units}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">${cumTotal.toFixed(0)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Budget Limits</CardTitle>
              <CardDescription>Set thresholds for usage alerts. Warnings at 50%, 75%, 90%, 100%.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Monthly Limit (units)</Label>
                <Input
                  type="number"
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(e.target.value)}
                  placeholder="500"
                />
                <p className="text-xs text-muted-foreground mt-1">1 unit ≈ $1.00 before GST</p>
              </div>
              <div>
                <Label>Daily Limit (units)</Label>
                <Input
                  type="number"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  placeholder="50"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Soft Block on Limit</Label>
                  <p className="text-xs text-muted-foreground">Show warning banner when limit reached</p>
                </div>
                <Switch checked={softBlock} onCheckedChange={setSoftBlock} />
              </div>
              <Button
                className="w-full"
                disabled={updateLimitsMutation.isPending}
                onClick={() => updateLimitsMutation.mutate({
                  monthlyLimitUnits: parseFloat(monthlyLimit || '500'),
                  dailyLimitUnits: parseFloat(dailyLimit || '50'),
                  softBlockEnabled: softBlock,
                })}
              >
                <Save className="h-4 w-4 mr-2" />
                {updateLimitsMutation.isPending ? 'Saving...' : 'Save Limits'}
              </Button>

              <Alert className="mt-4">
                <Info className="h-4 w-4" />
                <AlertTitle>How to use</AlertTitle>
                <AlertDescription className="text-xs space-y-1">
                  <p>1. Go to Replit Settings → Workspace usage</p>
                  <p>2. Copy the "Resource usage" dollar amount</p>
                  <p>3. Paste it into the Quick Log field above</p>
                  <p>4. The delta is auto-calculated from the previous entry</p>
                  <span className="pt-1 block">Thresholds: <Badge variant="outline" className="text-yellow-600">50%</Badge> <Badge variant="outline" className="text-orange-600">75%</Badge> <Badge variant="outline" className="text-red-600">90%</Badge> <Badge variant="outline" className="text-red-700">100%</Badge></span>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

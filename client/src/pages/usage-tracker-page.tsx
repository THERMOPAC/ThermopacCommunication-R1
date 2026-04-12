import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, TrendingUp, Shield, DollarSign, Calendar, Plus, Save, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface UsageSummary {
  monthlyTotal: number;
  monthlyLimit: number;
  monthlyPercent: number;
  dailyTotal: number;
  dailyLimit: number;
  dailyPercent: number;
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
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [logUnits, setLogUnits] = useState('');
  const [logCost, setLogCost] = useState('');
  const [logNotes, setLogNotes] = useState('');

  const { data: summary } = useQuery<UsageSummary>({ queryKey: ['/api/usage-tracker/summary'] });
  const { data: limits } = useQuery<UsageLimits>({ queryKey: ['/api/usage-tracker/limits'] });
  const { data: dailyLogs = [] } = useQuery<DailyLog[]>({ queryKey: ['/api/usage-tracker/daily-log'] });

  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [dailyLimit, setDailyLimit] = useState('');
  const [softBlock, setSoftBlock] = useState(true);

  const limitsLoaded = limits && monthlyLimit === '';
  if (limitsLoaded) {
    setMonthlyLimit(limits.monthlyLimitUnits);
    setDailyLimit(limits.dailyLimitUnits);
    setSoftBlock(limits.softBlockEnabled);
  }

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

  const addLogMutation = useMutation({
    mutationFn: async (data: { logDate: string; estimatedUnits: number; estimatedCost: number; notes: string }) => {
      return apiRequest('POST', '/api/usage-tracker/daily-log', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/usage-tracker'] });
      setLogDialogOpen(false);
      setLogUnits('');
      setLogCost('');
      setLogNotes('');
      toast({ title: "Log added", description: "Daily usage entry saved." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const wc = warningColors[summary?.warningLevel || 'none'];

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Agent Usage Tracker</h1>
            <p className="text-muted-foreground">Monitor and manage Replit Agent usage with budget alerts</p>
          </div>
          <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Log Daily Usage</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log Daily Usage</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
                </div>
                <div>
                  <Label>Estimated Units</Label>
                  <Input type="number" step="0.01" placeholder="e.g., 45.5" value={logUnits} onChange={(e) => setLogUnits(e.target.value)} />
                </div>
                <div>
                  <Label>Estimated Cost ($)</Label>
                  <Input type="number" step="0.01" placeholder="e.g., 45.50" value={logCost} onChange={(e) => setLogCost(e.target.value)} />
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea placeholder="What work was done..." value={logNotes} onChange={(e) => setLogNotes(e.target.value)} />
                </div>
                <Button
                  className="w-full"
                  disabled={!logUnits || addLogMutation.isPending}
                  onClick={() => addLogMutation.mutate({
                    logDate,
                    estimatedUnits: parseFloat(logUnits),
                    estimatedCost: parseFloat(logCost || logUnits),
                    notes: logNotes,
                  })}
                >
                  {addLogMutation.isPending ? 'Saving...' : 'Save Entry'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {summary?.warningLevel === 'limit_reached' && summary.softBlockEnabled && (
          <Alert variant="destructive">
            <Shield className="h-4 w-4" />
            <AlertTitle>Budget Limit Reached</AlertTitle>
            <AlertDescription>
              Monthly or daily usage has reached the configured limit. This is a soft block for visibility only — you can continue using the agent by manually overriding, but be aware of the cost implications.
            </AlertDescription>
          </Alert>
        )}

        {summary?.warningLevel === 'critical' && (
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-700">90% of Budget Used</AlertTitle>
            <AlertDescription className="text-red-600">
              Usage is at {Math.max(summary.monthlyPercent, summary.dailyPercent).toFixed(1)}% of the configured limit. Consider reducing usage for the remainder of this period.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className={`${wc?.border} border-2`}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Monthly Usage
              </CardDescription>
              <CardTitle className="text-2xl">{summary?.monthlyTotal ?? 0} <span className="text-sm font-normal text-muted-foreground">/ {summary?.monthlyLimit ?? 500} units</span></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${summary?.monthlyPercent && summary.monthlyPercent >= 90 ? 'bg-red-500' : summary?.monthlyPercent && summary.monthlyPercent >= 75 ? 'bg-orange-500' : summary?.monthlyPercent && summary.monthlyPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(summary?.monthlyPercent ?? 0, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Day {summary?.dayOfMonth} of {summary?.daysInMonth} — {summary?.monthlyPercent?.toFixed(1)}% used
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Today's Usage
              </CardDescription>
              <CardTitle className="text-2xl">{summary?.dailyTotal ?? 0} <span className="text-sm font-normal text-muted-foreground">/ {summary?.dailyLimit ?? 50} units</span></CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${summary?.dailyPercent && summary.dailyPercent >= 90 ? 'bg-red-500' : summary?.dailyPercent && summary.dailyPercent >= 75 ? 'bg-orange-500' : summary?.dailyPercent && summary.dailyPercent >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(summary?.dailyPercent ?? 0, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{summary?.dailyPercent?.toFixed(1)}% of daily limit</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Projected Monthly Cost
              </CardDescription>
              <CardTitle className="text-2xl">
                ${summary && summary.dayOfMonth > 0
                  ? ((summary.monthlyTotal / summary.dayOfMonth) * summary.daysInMonth).toFixed(0)
                  : '0'}
                <span className="text-sm font-normal text-muted-foreground"> estimated</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Based on ${summary?.monthlyTotal ?? 0} units over {summary?.dayOfMonth ?? 0} days
              </p>
              <p className="text-xs text-muted-foreground mt-1">+ 18% GST on top</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Budget Limits</CardTitle>
              <CardDescription>Set thresholds for usage alerts. Warnings appear at 50%, 75%, 90%, and 100%.</CardDescription>
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
                  <p className="text-xs text-muted-foreground">Show warning banner when limit reached (manual override allowed)</p>
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
                <AlertTitle>How it works</AlertTitle>
                <AlertDescription className="text-xs space-y-1">
                  <p>This tracker is for your own visibility. It does not connect to Replit billing.</p>
                  <p>Log your daily usage manually from the Replit usage dashboard, and the tracker will show warnings as you approach your budget.</p>
                  <p>Thresholds: <Badge variant="outline" className="text-yellow-600">50%</Badge> <Badge variant="outline" className="text-orange-600">75%</Badge> <Badge variant="outline" className="text-red-600">90%</Badge> <Badge variant="outline" className="text-red-700">100%</Badge></p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Daily Usage Log</CardTitle>
              <CardDescription>Manual entries from Replit usage dashboard (last 30 days)</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No usage entries yet</p>
                  <p className="text-xs">Click "Log Daily Usage" to add your first entry</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {dailyLogs.map((log) => {
                    const units = parseFloat(log.estimatedUnits);
                    const dailyLim = parseFloat(limits?.dailyLimitUnits || '50');
                    const pct = dailyLim > 0 ? (units / dailyLim) * 100 : 0;
                    return (
                      <div key={log.id} className="flex items-center justify-between p-3 rounded-lg border bg-white">
                        <div>
                          <p className="text-sm font-medium">{new Date(log.logDate).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                          {log.notes && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{log.notes}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{units} units</p>
                          <p className="text-xs text-muted-foreground">${parseFloat(log.estimatedCost).toFixed(2)}</p>
                          {pct >= 90 && <Badge variant="destructive" className="text-[10px] mt-1">Over limit</Badge>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingUp, Shield, XCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";

interface UsageSummary {
  monthlyTotal: number;
  monthlyLimit: number;
  monthlyPercent: number;
  dailyTotal: number;
  dailyLimit: number;
  dailyPercent: number;
  remainingDaily: number;
  lastCumulativeTotal: number;
  warningLevel: 'none' | 'caution' | 'warning' | 'critical' | 'limit_reached';
  softBlockEnabled: boolean;
  daysInMonth: number;
  dayOfMonth: number;
}

const levelConfig = {
  none: { color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', progressColor: 'bg-green-500', icon: TrendingUp },
  caution: { color: 'text-yellow-600', bg: 'bg-yellow-50', border: 'border-yellow-200', progressColor: 'bg-yellow-500', icon: AlertTriangle },
  warning: { color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200', progressColor: 'bg-orange-500', icon: AlertTriangle },
  critical: { color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', progressColor: 'bg-red-500', icon: XCircle },
  limit_reached: { color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-300', progressColor: 'bg-red-600', icon: Shield },
};

export default function UsageTrackerIndicator() {
  const { data: summary } = useQuery<UsageSummary>({
    queryKey: ['/api/usage-tracker/summary'],
    refetchInterval: 60000,
  });

  if (!summary) return null;

  const config = levelConfig[summary.warningLevel];
  const Icon = config.icon;
  const maxPercent = Math.max(summary.monthlyPercent, summary.dailyPercent);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href="/usage-tracker">
            <div className={`mx-3 mb-3 p-2.5 rounded-lg border ${config.bg} ${config.border} cursor-pointer transition-all hover:shadow-sm`}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                  <span className={`text-xs font-medium ${config.color}`}>{Math.round(maxPercent)}%</span>
                </div>
                <span className="text-[10px] text-muted-foreground">${summary.monthlyTotal} / ${summary.monthlyLimit}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${config.progressColor}`}
                  style={{ width: `${Math.min(maxPercent, 100)}%` }}
                />
              </div>
              {summary.warningLevel === 'limit_reached' && summary.softBlockEnabled && (
                <p className="text-[10px] text-red-600 mt-1 font-medium">Budget limit reached</p>
              )}
            </div>
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[230px]">
          <div className="space-y-1.5 text-xs">
            <p className="font-semibold">Agent Usage Tracker</p>
            <div>
              <span className="text-muted-foreground">Today: </span>
              <span className="font-medium">+{summary.dailyTotal} units</span>
              <span className="text-muted-foreground"> ({summary.remainingDaily} remaining)</span>
            </div>
            <div>
              <span className="text-muted-foreground">Monthly: </span>
              <span className="font-medium">{summary.monthlyTotal} / {summary.monthlyLimit}</span>
              <span className="text-muted-foreground"> ({summary.monthlyPercent}%)</span>
            </div>
            <div>
              <span className="text-muted-foreground">Cumulative: </span>
              <span className="font-medium">${summary.lastCumulativeTotal}</span>
            </div>
            <p className="text-muted-foreground pt-0.5">Click to open tracker</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

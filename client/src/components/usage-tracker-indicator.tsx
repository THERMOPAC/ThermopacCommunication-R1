import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, TrendingUp, Shield, XCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";

interface UsageSummary {
  monthlyTotal: number;
  monthlyLimit: number;
  monthlyPercent: number;
  dailyTotal: number;
  dailyLimit: number;
  dailyPercent: number;
  warningLevel: 'none' | 'caution' | 'warning' | 'critical' | 'limit_reached';
  softBlockEnabled: boolean;
  daysInMonth: number;
  dayOfMonth: number;
}

const levelConfig = {
  none: { color: 'text-green-600', bg: 'bg-green-50', progressColor: 'bg-green-500', icon: TrendingUp, label: 'Normal' },
  caution: { color: 'text-yellow-600', bg: 'bg-yellow-50', progressColor: 'bg-yellow-500', icon: AlertTriangle, label: '50% used' },
  warning: { color: 'text-orange-600', bg: 'bg-orange-50', progressColor: 'bg-orange-500', icon: AlertTriangle, label: '75% used' },
  critical: { color: 'text-red-600', bg: 'bg-red-50', progressColor: 'bg-red-500', icon: XCircle, label: '90% used' },
  limit_reached: { color: 'text-red-700', bg: 'bg-red-100', progressColor: 'bg-red-600', icon: Shield, label: 'Limit reached' },
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
          <div className={`mx-3 mb-3 p-2 rounded-lg border ${config.bg} cursor-pointer transition-all hover:shadow-sm`}>
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className={`h-3.5 w-3.5 ${config.color}`} />
              <span className={`text-xs font-medium ${config.color}`}>Usage: {Math.round(maxPercent)}%</span>
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
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[220px]">
          <div className="space-y-1.5 text-xs">
            <p className="font-semibold">Agent Usage Tracker</p>
            <div>
              <span className="text-muted-foreground">Monthly: </span>
              <span className="font-medium">{summary.monthlyTotal} / {summary.monthlyLimit} units</span>
              <span className="text-muted-foreground ml-1">({summary.monthlyPercent}%)</span>
            </div>
            <div>
              <span className="text-muted-foreground">Today: </span>
              <span className="font-medium">{summary.dailyTotal} / {summary.dailyLimit} units</span>
              <span className="text-muted-foreground ml-1">({summary.dailyPercent}%)</span>
            </div>
            <div>
              <span className="text-muted-foreground">Day {summary.dayOfMonth} of {summary.daysInMonth}</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

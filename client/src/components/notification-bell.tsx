import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  BellRing, CheckCheck, ExternalLink, Clock, CheckCircle, XCircle,
  ListChecks, UserPlus, Bot, AlertTriangle, Shield, ChevronRight,
  FileText, CalendarDays, ClipboardList, Zap
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { useLocation } from "wouter";

const TYPE_ICONS: Record<string, any> = {
  approval_request: Clock,
  approval_decision: CheckCircle,
  task_completed: ListChecks,
  task_assigned: UserPlus,
};

const CATEGORY_ICONS: Record<string, any> = {
  approval: Shield,
  task: ClipboardList,
  leave: CalendarDays,
  attendance: Clock,
  general: BellRing,
};

const PRIORITY_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  high: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', label: 'High' },
  medium: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Medium' },
  low: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Low' },
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  new: { color: 'bg-red-500', label: 'New' },
  seen: { color: 'bg-amber-500', label: 'Seen' },
  acknowledged: { color: 'bg-green-500', label: 'Done' },
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['/api/notifications/unread-count'],
    queryFn: async () => {
      const res = await fetch('/api/notifications/unread-count');
      if (!res.ok) return 0;
      const data = await res.json();
      return data.count || 0;
    },
    refetchInterval: 15000,
  });

  const { data: summary } = useQuery<any>({
    queryKey: ['/api/notifications/summary'],
    queryFn: async () => {
      const res = await fetch('/api/notifications/summary');
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open,
  });

  const { data: alerts = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/notifications', 'panel'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?limit=20&status=active');
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('PATCH', `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/summary'] });
    },
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('PATCH', `/api/notifications/${id}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/summary'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('PATCH', '/api/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/summary'] });
    },
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAlertClick = (notif: any) => {
    if (!notif.isRead) {
      markReadMutation.mutate(notif.id);
    }
    if (notif.link) {
      navigate(notif.link);
      setOpen(false);
    }
  };

  const getAlertIcon = (notif: any) => {
    if (notif.title?.toLowerCase().includes('rejected')) return XCircle;
    if (notif.title?.toLowerCase().includes('agent')) return Bot;
    return TYPE_ICONS[notif.type] || CATEGORY_ICONS[notif.category] || BellRing;
  };

  const getAlertIconColor = (notif: any) => {
    if (notif.title?.toLowerCase().includes('rejected')) return 'text-red-600 bg-red-100';
    if (notif.priority === 'high') return 'text-red-600 bg-red-100';
    if (notif.priority === 'medium') return 'text-amber-600 bg-amber-100';
    return 'text-blue-600 bg-blue-100';
  };

  const highPriorityCount = summary?.highPriority || 0;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`relative p-2 rounded-lg transition-all ${
          unreadCount > 0
            ? 'bg-orange-50 hover:bg-orange-100 border border-orange-200'
            : 'hover:bg-gray-100 border border-transparent'
        }`}
        title="System Alerts"
      >
        {highPriorityCount > 0 ? (
          <AlertTriangle className="h-5 w-5 text-red-500" />
        ) : (
          <BellRing className={`h-5 w-5 ${unreadCount > 0 ? 'text-orange-600' : 'text-gray-500'}`} />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full h-[18px] min-w-[18px] px-1 flex items-center justify-center font-bold leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[420px] bg-white rounded-lg shadow-2xl border z-50 max-h-[560px] flex flex-col">
          <div className="px-4 py-3 border-b bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="p-1 bg-orange-100 rounded">
                  <Zap className="h-4 w-4 text-orange-600" />
                </div>
                <h3 className="font-bold text-sm tracking-tight">Alert Management</h3>
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7 gap-1 text-muted-foreground"
                    onClick={() => markAllReadMutation.mutate()}
                  >
                    <CheckCheck className="h-3 w-3" /> Mark Read
                  </Button>
                )}
              </div>
            </div>

            {summary && (
              <div className="flex gap-2">
                {summary.highPriority > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-red-50 border border-red-200 rounded text-[11px] font-medium text-red-700">
                    <AlertTriangle className="h-3 w-3" /> {summary.highPriority} High
                  </div>
                )}
                {summary.mediumPriority > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded text-[11px] font-medium text-amber-700">
                    {summary.mediumPriority} Medium
                  </div>
                )}
                {summary.lowPriority > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-[11px] font-medium text-blue-700">
                    {summary.lowPriority} Low
                  </div>
                )}
                {summary.newCount > 0 && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 rounded text-[11px] font-medium text-green-700">
                    {summary.newCount} New
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Loading alerts...</div>
            ) : alerts.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-400" />
                <p className="text-sm font-medium text-gray-600">No Active Alerts</p>
                <p className="text-xs text-muted-foreground mt-1">All caught up!</p>
              </div>
            ) : (
              alerts.map((notif: any) => {
                const Icon = getAlertIcon(notif);
                const iconColor = getAlertIconColor(notif);
                const priorityConf = PRIORITY_CONFIG[notif.priority] || PRIORITY_CONFIG.medium;
                const statusConf = STATUS_CONFIG[notif.status] || STATUS_CONFIG.new;

                return (
                  <div
                    key={notif.id}
                    className={`group px-4 py-3 border-b last:border-b-0 cursor-pointer hover:bg-slate-50 transition-all ${
                      notif.status === 'new' ? 'bg-orange-50/30 border-l-[3px] border-l-orange-400' : 'border-l-[3px] border-l-transparent'
                    }`}
                  >
                    <div className="flex gap-3">
                      <div className={`p-1.5 rounded-lg h-8 w-8 flex items-center justify-center flex-shrink-0 mt-0.5 ${iconColor}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0" onClick={() => handleAlertClick(notif)}>
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm leading-tight ${notif.status === 'new' ? 'font-bold' : 'font-medium'}`}>
                            {notif.title}
                          </p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {notif.status === 'new' && (
                              <span className={`h-2 w-2 rounded-full ${statusConf.color} animate-pulse`} />
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priorityConf.bg} ${priorityConf.color} ${priorityConf.border} border`}>
                            {priorityConf.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground capitalize px-1.5 py-0.5 bg-gray-50 rounded border">
                            {notif.category}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {format(new Date(notif.createdAt), 'dd MMM, hh:mm a')}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {notif.status !== 'acknowledged' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); acknowledgeMutation.mutate(notif.id); }}
                            className="p-1 rounded hover:bg-green-100 text-green-600"
                            title="Acknowledge"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {notif.link && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleAlertClick(notif); }}
                            className="p-1 rounded hover:bg-blue-100 text-blue-600"
                            title="Navigate"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div
            className="px-4 py-2.5 border-t bg-slate-50 flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 transition-colors"
            onClick={() => { navigate('/alerts'); setOpen(false); }}
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Open Alert Management</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
      )}
    </div>
  );
}

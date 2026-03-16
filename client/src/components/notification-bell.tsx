import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { BellRing, Check, CheckCheck, ExternalLink, Clock, CheckCircle, XCircle, ListChecks, UserPlus, Bot, Bell } from "lucide-react";
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

const TYPE_COLORS: Record<string, string> = {
  approval_request: 'text-yellow-600 bg-yellow-50',
  approval_decision: 'text-green-600 bg-green-50',
  task_completed: 'text-blue-600 bg-blue-50',
  task_assigned: 'text-purple-600 bg-purple-50',
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

  const { data: notifications = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications?limit=30');
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
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('PATCH', '/api/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
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

  const handleNotificationClick = (notif: any) => {
    if (!notif.isRead) {
      markReadMutation.mutate(notif.id);
    }
    if (notif.link) {
      navigate(notif.link);
      setOpen(false);
    }
  };

  const getNotificationIcon = (notif: any) => {
    if (notif.title?.toLowerCase().includes('rejected')) return XCircle;
    if (notif.title?.toLowerCase().includes('agent')) return Bot;
    return TYPE_ICONS[notif.type] || BellRing;
  };

  const getNotificationColor = (notif: any) => {
    if (notif.title?.toLowerCase().includes('rejected')) return 'text-red-600 bg-red-50';
    if (notif.title?.toLowerCase().includes('agent')) return 'text-indigo-600 bg-indigo-50';
    return TYPE_COLORS[notif.type] || 'text-gray-600 bg-gray-50';
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(!open);
        }}
        className="relative p-2 rounded-full hover:bg-gray-100 transition-colors"
        title="Alerts & Notifications"
      >
        <BellRing className={`h-5 w-5 ${unreadCount > 0 ? 'text-orange-500' : 'text-gray-600'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-lg shadow-xl border z-50 max-h-[500px] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-orange-50 to-white">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-orange-500" />
              <h3 className="font-semibold text-sm">Alerts</h3>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="text-xs h-5 px-1.5">{unreadCount} new</Badge>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 gap-1"
                onClick={() => markAllReadMutation.mutate()}
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </Button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                <BellRing className="h-8 w-8 mx-auto mb-2 opacity-30" />
                No alerts yet
              </div>
            ) : (
              notifications.map((notif: any) => {
                const Icon = getNotificationIcon(notif);
                const colorClass = getNotificationColor(notif);

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`px-4 py-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 transition-colors ${!notif.isRead ? 'bg-blue-50/40' : ''}`}
                  >
                    <div className="flex gap-3">
                      <div className={`p-1.5 rounded-full h-8 w-8 flex items-center justify-center flex-shrink-0 mt-0.5 ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm leading-tight ${!notif.isRead ? 'font-semibold' : 'font-medium'}`}>
                            {notif.title}
                          </p>
                          {!notif.isRead && (
                            <span className="h-2 w-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(notif.createdAt), 'dd MMM, hh:mm a')}
                          </span>
                          {notif.createdByName && (
                            <span className="text-xs text-muted-foreground">by {notif.createdByName}</span>
                          )}
                          {notif.link && (
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

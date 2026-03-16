import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle, CheckCircle, XCircle, Clock, ListChecks,
  UserPlus, Bot, BellRing, X, ExternalLink, ChevronRight
} from "lucide-react";

const TYPE_ICONS: Record<string, any> = {
  approval_request: Clock,
  approval_decision: CheckCircle,
  task_completed: ListChecks,
  task_assigned: UserPlus,
};

const PRIORITY_STYLES: Record<string, { border: string; accent: string; iconBg: string }> = {
  high: { border: 'border-l-red-500', accent: 'bg-red-50', iconBg: 'bg-red-100 text-red-600' },
  medium: { border: 'border-l-amber-500', accent: 'bg-amber-50', iconBg: 'bg-amber-100 text-amber-600' },
  low: { border: 'border-l-blue-500', accent: 'bg-blue-50', iconBg: 'bg-blue-100 text-blue-600' },
};

interface PopupAlert {
  id: number;
  title: string;
  message: string;
  type: string;
  priority: string;
  category: string;
  link?: string;
  createdAt: string;
  dismissedAt?: number;
}

export default function AlertPopup() {
  const [popups, setPopups] = useState<PopupAlert[]>([]);
  const lastCheckRef = useRef<string | null>(null);
  const seenIdsRef = useRef<Set<number>>(new Set());
  const [, navigate] = useLocation();

  const fetchNewAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=5&status=new');
      if (!res.ok) return;
      const alerts: any[] = await res.json();

      const newAlerts = alerts.filter(a => !seenIdsRef.current.has(a.id));

      if (newAlerts.length > 0) {
        for (const a of newAlerts) {
          seenIdsRef.current.add(a.id);
        }

        setPopups(prev => {
          const combined = [...newAlerts.map(a => ({ ...a, dismissedAt: undefined })), ...prev];
          return combined.slice(0, 5);
        });

        newAlerts.forEach(alert => {
          setTimeout(() => {
            setPopups(prev => prev.filter(p => p.id !== alert.id));
          }, 8000);
        });
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    fetchNewAlerts();
    const interval = setInterval(fetchNewAlerts, 15000);
    return () => clearInterval(interval);
  }, [fetchNewAlerts]);

  const dismissPopup = (id: number) => {
    setPopups(prev => prev.filter(p => p.id !== id));
  };

  const handleClick = (alert: PopupAlert) => {
    if (alert.link) {
      navigate(alert.link);
    } else {
      navigate('/alerts');
    }
    dismissPopup(alert.id);

    fetch(`/api/notifications/${alert.id}/read`, { method: 'PATCH' }).catch(() => {});
  };

  const getIcon = (alert: PopupAlert) => {
    if (alert.title?.toLowerCase().includes('rejected')) return XCircle;
    if (alert.title?.toLowerCase().includes('agent')) return Bot;
    return TYPE_ICONS[alert.type] || BellRing;
  };

  if (popups.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none" style={{ maxWidth: '400px' }}>
      {popups.map((alert, index) => {
        const Icon = getIcon(alert);
        const style = PRIORITY_STYLES[alert.priority] || PRIORITY_STYLES.medium;

        return (
          <div
            key={alert.id}
            className={`pointer-events-auto border-l-4 ${style.border} bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-right-full duration-300`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className={`px-4 py-3 ${style.accent}`}>
              <div className="flex items-start gap-3">
                <div className={`p-1.5 rounded-lg flex-shrink-0 ${style.iconBg}`}>
                  {alert.priority === 'high' ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Icon className="h-4 w-4" />
                  )}
                </div>

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleClick(alert)}>
                  <p className="text-sm font-semibold text-gray-900 leading-tight">{alert.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{alert.message}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${
                      alert.priority === 'high' ? 'bg-red-100 text-red-700' :
                      alert.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {alert.priority}
                    </span>
                    <span className="text-[10px] text-gray-500 capitalize">{alert.category}</span>
                    {alert.link && (
                      <span className="text-[10px] text-blue-600 flex items-center gap-0.5 ml-auto">
                        View <ChevronRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); dismissPopup(alert.id); }}
                  className="flex-shrink-0 p-1 rounded hover:bg-gray-200 transition-colors"
                >
                  <X className="h-3.5 w-3.5 text-gray-400" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

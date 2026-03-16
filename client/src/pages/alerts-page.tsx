import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  Zap, AlertTriangle, CheckCircle, XCircle, Clock, Search,
  Filter, ListChecks, UserPlus, Bot, BellRing, Shield, ClipboardList,
  CalendarDays, ExternalLink, CheckCheck, Trash2, ChevronRight, FileText, Eye
} from "lucide-react";

const PRIORITY_CONFIG: Record<string, { color: string; bg: string; border: string; icon: any; label: string }> = {
  high: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', icon: AlertTriangle, label: 'High Priority' },
  medium: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Clock, label: 'Medium Priority' },
  low: { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', icon: BellRing, label: 'Low Priority' },
};

const CATEGORY_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  approval: { icon: Shield, label: 'Approvals', color: 'text-purple-600 bg-purple-50' },
  task: { icon: ClipboardList, label: 'Tasks', color: 'text-blue-600 bg-blue-50' },
  leave: { icon: CalendarDays, label: 'Leave', color: 'text-green-600 bg-green-50' },
  attendance: { icon: Clock, label: 'Attendance', color: 'text-orange-600 bg-orange-50' },
  general: { icon: BellRing, label: 'General', color: 'text-gray-600 bg-gray-50' },
};

const TYPE_ICONS: Record<string, any> = {
  approval_request: Clock,
  approval_decision: CheckCircle,
  task_completed: ListChecks,
  task_assigned: UserPlus,
};

export default function AlertsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('active');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const statusFilter = activeTab === 'active' ? 'active' : activeTab === 'acknowledged' ? 'acknowledged' : 'all';

  const { data: alerts = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/notifications', statusFilter, filterCategory, filterPriority, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (filterCategory !== 'all') params.set('category', filterCategory);
      if (filterPriority !== 'all') params.set('priority', filterPriority);
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/notifications?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: summary } = useQuery<any>({
    queryKey: ['/api/notifications/summary'],
    queryFn: async () => {
      const res = await fetch('/api/notifications/summary');
      if (!res.ok) return null;
      return res.json();
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => apiRequest('PATCH', `/api/notifications/${id}/read`),
    onSuccess: () => invalidateAll(),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async (id: number) => apiRequest('PATCH', `/api/notifications/${id}/acknowledge`),
    onSuccess: () => { invalidateAll(); toast({ title: 'Alert acknowledged' }); },
  });

  const acknowledgeAllMutation = useMutation({
    mutationFn: async () => apiRequest('PATCH', '/api/notifications/acknowledge-all', { category: filterCategory }),
    onSuccess: () => { invalidateAll(); toast({ title: 'All alerts acknowledged' }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest('DELETE', `/api/notifications/${id}`),
    onSuccess: () => { invalidateAll(); toast({ title: 'Alert removed' }); },
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['/api/notifications/summary'] });
  }

  const getAlertIcon = (notif: any) => {
    if (notif.title?.toLowerCase().includes('rejected')) return XCircle;
    if (notif.title?.toLowerCase().includes('agent')) return Bot;
    return TYPE_ICONS[notif.type] || CATEGORY_CONFIG[notif.category]?.icon || BellRing;
  };

  const getAlertIconColor = (notif: any) => {
    if (notif.title?.toLowerCase().includes('rejected')) return 'text-red-600 bg-red-100';
    if (notif.priority === 'high') return 'text-red-600 bg-red-100';
    if (notif.priority === 'medium') return 'text-amber-600 bg-amber-100';
    return 'text-blue-600 bg-blue-100';
  };

  const highAlerts = alerts.filter(a => a.priority === 'high');
  const mediumAlerts = alerts.filter(a => a.priority === 'medium');
  const lowAlerts = alerts.filter(a => a.priority === 'low');

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Zap className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Alert Management</h1>
              <p className="text-sm text-muted-foreground">SAP B1-style system alerts and notifications</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'active' && alerts.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => acknowledgeAllMutation.mutate()}
                disabled={acknowledgeAllMutation.isPending}
                className="gap-1"
              >
                <CheckCheck className="h-4 w-4" />
                Acknowledge All{filterCategory !== 'all' ? ` (${CATEGORY_CONFIG[filterCategory]?.label})` : ''}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="border-l-4 border-l-slate-400">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Active</p>
                  <p className="text-2xl font-bold">{(summary?.newCount || 0) + (summary?.mediumPriority || 0) + (summary?.lowPriority || 0)}</p>
                </div>
                <BellRing className="h-5 w-5 text-slate-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-400">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">High Priority</p>
                  <p className="text-2xl font-bold text-red-600">{summary?.highPriority || 0}</p>
                </div>
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-400">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Medium</p>
                  <p className="text-2xl font-bold text-amber-600">{summary?.mediumPriority || 0}</p>
                </div>
                <Clock className="h-5 w-5 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-400">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Low</p>
                  <p className="text-2xl font-bold text-blue-600">{summary?.lowPriority || 0}</p>
                </div>
                <BellRing className="h-5 w-5 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-400">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">New / Unread</p>
                  <p className="text-2xl font-bold text-green-600">{summary?.unread || 0}</p>
                </div>
                <Zap className="h-5 w-5 text-green-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {summary?.byCategory && summary.byCategory.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {summary.byCategory.map((cat: any) => {
              const conf = CATEGORY_CONFIG[cat.category] || CATEGORY_CONFIG.general;
              const CatIcon = conf.icon;
              return (
                <button
                  key={cat.category}
                  onClick={() => setFilterCategory(cat.category === filterCategory ? 'all' : cat.category)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                    filterCategory === cat.category
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-white hover:bg-gray-50 border-gray-200'
                  }`}
                >
                  <CatIcon className="h-3.5 w-3.5" />
                  <span className="font-medium capitalize">{conf.label}</span>
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">{cat.count}</Badge>
                  {cat.unread > 0 && (
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search alerts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="active" className="gap-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Active
            </TabsTrigger>
            <TabsTrigger value="acknowledged" className="gap-1">
              <CheckCircle className="h-3.5 w-3.5" /> Acknowledged
            </TabsTrigger>
            <TabsTrigger value="all" className="gap-1">
              <ListChecks className="h-3.5 w-3.5" /> All
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {isLoading ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">Loading alerts...</CardContent>
              </Card>
            ) : alerts.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-400" />
                  <h3 className="text-lg font-semibold mb-1">No Alerts</h3>
                  <p className="text-sm text-muted-foreground">
                    {activeTab === 'active' ? 'No active alerts requiring attention.' :
                     activeTab === 'acknowledged' ? 'No acknowledged alerts found.' :
                     'No alerts match the current filters.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {activeTab === 'active' && highAlerts.length > 0 && (
                  <AlertGroup
                    title="High Priority"
                    alerts={highAlerts}
                    priorityConf={PRIORITY_CONFIG.high}
                    getAlertIcon={getAlertIcon}
                    getAlertIconColor={getAlertIconColor}
                    onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onNavigate={(notif) => { if (!notif.isRead) markReadMutation.mutate(notif.id); if (notif.link) navigate(notif.link); }}
                  />
                )}
                {activeTab === 'active' && mediumAlerts.length > 0 && (
                  <AlertGroup
                    title="Medium Priority"
                    alerts={mediumAlerts}
                    priorityConf={PRIORITY_CONFIG.medium}
                    getAlertIcon={getAlertIcon}
                    getAlertIconColor={getAlertIconColor}
                    onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onNavigate={(notif) => { if (!notif.isRead) markReadMutation.mutate(notif.id); if (notif.link) navigate(notif.link); }}
                  />
                )}
                {activeTab === 'active' && lowAlerts.length > 0 && (
                  <AlertGroup
                    title="Low Priority"
                    alerts={lowAlerts}
                    priorityConf={PRIORITY_CONFIG.low}
                    getAlertIcon={getAlertIcon}
                    getAlertIconColor={getAlertIconColor}
                    onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onNavigate={(notif) => { if (!notif.isRead) markReadMutation.mutate(notif.id); if (notif.link) navigate(notif.link); }}
                  />
                )}
                {activeTab !== 'active' && (
                  <AlertGroup
                    title={activeTab === 'acknowledged' ? 'Acknowledged Alerts' : 'All Alerts'}
                    alerts={alerts}
                    getAlertIcon={getAlertIcon}
                    getAlertIconColor={getAlertIconColor}
                    onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onNavigate={(notif) => { if (!notif.isRead) markReadMutation.mutate(notif.id); if (notif.link) navigate(notif.link); }}
                    showStatus
                  />
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function AlertGroup({
  title,
  alerts,
  priorityConf,
  getAlertIcon,
  getAlertIconColor,
  onAcknowledge,
  onDelete,
  onNavigate,
  showStatus = false,
}: {
  title: string;
  alerts: any[];
  priorityConf?: typeof PRIORITY_CONFIG[string];
  getAlertIcon: (n: any) => any;
  getAlertIconColor: (n: any) => string;
  onAcknowledge: (id: number) => void;
  onDelete: (id: number) => void;
  onNavigate: (notif: any) => void;
  showStatus?: boolean;
}) {
  const PriorityIcon = priorityConf?.icon || BellRing;

  return (
    <Card className={priorityConf ? `border-l-4 ${priorityConf.border}` : ''}>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <PriorityIcon className={`h-4 w-4 ${priorityConf?.color || 'text-gray-600'}`} />
          {title}
          <Badge variant="secondary" className="text-xs ml-1">{alerts.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {alerts.map((notif) => {
            const Icon = getAlertIcon(notif);
            const iconColor = getAlertIconColor(notif);
            const catConf = CATEGORY_CONFIG[notif.category] || CATEGORY_CONFIG.general;
            const priConf = PRIORITY_CONFIG[notif.priority] || PRIORITY_CONFIG.medium;

            return (
              <div
                key={notif.id}
                className={`group px-4 py-3 hover:bg-slate-50 transition-all flex gap-3 ${
                  notif.status === 'new' ? 'bg-orange-50/40' : ''
                }`}
              >
                <div className={`p-2 rounded-lg h-9 w-9 flex items-center justify-center flex-shrink-0 mt-0.5 ${iconColor}`}>
                  <Icon className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onNavigate(notif)}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${notif.status === 'new' ? 'font-bold' : 'font-medium'}`}>
                        {notif.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                    </div>
                    {notif.status === 'new' && (
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse mt-1 flex-shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {showStatus && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${priConf.bg} ${priConf.color} border ${priConf.border}`}>
                        {priConf.label}
                      </span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${catConf.color}`}>
                      {catConf.label}
                    </span>
                    {showStatus && (
                      <Badge variant={notif.status === 'acknowledged' ? 'default' : 'secondary'} className="text-[10px] h-4">
                        {notif.status === 'new' ? 'New' : notif.status === 'seen' ? 'Seen' : 'Acknowledged'}
                      </Badge>
                    )}
                    {notif.createdByName && (
                      <span className="text-[10px] text-muted-foreground">from {notif.createdByName}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
                      {format(new Date(notif.createdAt), 'dd MMM yyyy, hh:mm a')}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {notif.link && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onNavigate(notif)} title="Navigate">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {notif.status !== 'acknowledged' && (
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => onAcknowledge(notif.id)} title="Acknowledge">
                      <CheckCircle className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(notif.id)} title="Remove">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { fmtDate } from "@/lib/date-format";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { format } from "date-fns";
import {
  Search, CheckCheck, Trash2, ExternalLink, CheckCircle, BellRing,
  AlertTriangle, Clock, Filter, Eye
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default function AlertsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('active');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const statusFilter = activeTab === 'active' ? 'active' : activeTab === 'acknowledged' ? 'acknowledged' : 'all';

  const { data: alerts = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/notifications', statusFilter, filterCategory, filterPriority, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '200');
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
    onSuccess: () => { invalidateAll(); setSelectedIds(new Set()); toast({ title: 'All alerts acknowledged' }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest('DELETE', `/api/notifications/${id}`),
    onSuccess: () => { invalidateAll(); toast({ title: 'Alert removed' }); },
  });

  const deleteSelectedMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id => apiRequest('DELETE', `/api/notifications/${id}`)));
    },
    onSuccess: () => { invalidateAll(); setSelectedIds(new Set()); toast({ title: `${selectedIds.size} alert(s) deleted` }); },
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['/api/notifications/summary'] });
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === alerts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(alerts.map(a => a.id)));
    }
  };

  const handleRowClick = (notif: any) => {
    if (!notif.isRead) markReadMutation.mutate(notif.id);
    if (notif.link) navigate(notif.link);
  };

  const priorityDot = (priority: string) => {
    if (priority === 'high') return 'bg-red-500';
    if (priority === 'medium') return 'bg-amber-500';
    return 'bg-blue-400';
  };

  const unreadCount = summary?.unread || 0;
  const totalActive = (summary?.newCount || 0) + (summary?.mediumPriority || 0) + (summary?.lowPriority || 0);

  return (
    <Layout>
      <div className="p-4 space-y-3 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BellRing className="h-5 w-5 text-amber-600" />
            <h1 className="text-xl font-bold">Messages / Alerts Overview</h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs">{unreadCount} Unread</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Total: <strong>{alerts.length}</strong></span>
            {totalActive > 0 && <span>| Active: <strong>{totalActive}</strong></span>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedIds(new Set()); }} className="flex-shrink-0">
            <TabsList className="h-8">
              <TabsTrigger value="active" className="text-xs h-7 px-3">
                Active {summary?.newCount ? `(${totalActive})` : ''}
              </TabsTrigger>
              <TabsTrigger value="acknowledged" className="text-xs h-7 px-3">Acknowledged</TabsTrigger>
              <TabsTrigger value="all" className="text-xs h-7 px-3">All</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search alerts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="approval">Approvals</SelectItem>
              <SelectItem value="task">Tasks</SelectItem>
              <SelectItem value="leave">Leave</SelectItem>
              <SelectItem value="attendance">Attendance</SelectItem>
              <SelectItem value="general">General</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              className="h-8 text-xs"
              disabled={deleteSelectedMutation.isPending}
              onClick={() => deleteSelectedMutation.mutate(Array.from(selectedIds))}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {deleteSelectedMutation.isPending ? 'Deleting...' : `Delete Selected (${selectedIds.size})`}
            </Button>
          )}
        </div>

        <Card className="border">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Loading alerts...</div>
            ) : alerts.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle className="h-10 w-10 mx-auto mb-3 text-green-400" />
                <p className="text-sm font-medium">No Alerts</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeTab === 'active' ? 'No active alerts requiring attention.' :
                   activeTab === 'acknowledged' ? 'No acknowledged alerts found.' :
                   'No alerts match the current filters.'}
                </p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[calc(100vh-280px)]">
                <Table>
                  <TableHeader className="sticky top-0 bg-amber-50 z-10">
                    <TableRow className="border-b-2 border-amber-200">
                      <TableHead className="w-8 px-2">
                        <Checkbox
                          checked={selectedIds.size === alerts.length && alerts.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="text-xs font-bold text-amber-900 w-5 px-1"></TableHead>
                      <TableHead className="text-xs font-bold text-amber-900">Subject</TableHead>
                      <TableHead className="text-xs font-bold text-amber-900 w-28">Category</TableHead>
                      <TableHead className="text-xs font-bold text-amber-900 w-28">Date</TableHead>
                      <TableHead className="text-xs font-bold text-amber-900 w-20">Time</TableHead>
                      <TableHead className="text-xs font-bold text-amber-900 w-40">From</TableHead>
                      <TableHead className="text-xs font-bold text-amber-900 w-20 text-center">Priority</TableHead>
                      <TableHead className="text-xs font-bold text-amber-900 w-16 text-right pr-3"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerts.map((notif, idx) => {
                      const isUnread = notif.status === 'new';
                      const isSelected = selectedIds.has(notif.id);
                      const rowBg = isSelected
                        ? 'bg-amber-100'
                        : isUnread
                        ? 'bg-amber-50/60'
                        : idx % 2 === 0
                        ? 'bg-white'
                        : 'bg-gray-50/50';

                      return (
                        <TableRow
                          key={notif.id}
                          className={`${rowBg} hover:bg-amber-100/50 cursor-pointer border-b border-gray-100 transition-colors`}
                        >
                          <TableCell className="px-2 py-1.5">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(notif.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableCell>
                          <TableCell className="px-1 py-1.5">
                            {isUnread && (
                              <span className={`inline-block h-2 w-2 rounded-full ${priorityDot(notif.priority)}`} />
                            )}
                          </TableCell>
                          <TableCell
                            className="py-1.5 max-w-[400px]"
                            onClick={() => handleRowClick(notif)}
                          >
                            <p className={`text-xs leading-tight truncate ${isUnread ? 'font-bold text-gray-900' : 'font-normal text-gray-700'}`}>
                              {notif.title}
                            </p>
                            {notif.message && notif.message !== notif.title && (
                              <p className={`text-[11px] leading-tight truncate mt-0.5 ${isUnread ? 'text-gray-600 font-medium' : 'text-gray-400'}`}>
                                {notif.message}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="py-1.5" onClick={() => handleRowClick(notif)}>
                            <span className={`text-[11px] capitalize ${isUnread ? 'font-semibold' : 'font-normal text-gray-500'}`}>
                              {notif.category || 'general'}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5" onClick={() => handleRowClick(notif)}>
                            <span className={`text-xs ${isUnread ? 'font-bold' : 'font-normal text-gray-500'}`}>
                              {fmtDate(notif.createdAt)}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5" onClick={() => handleRowClick(notif)}>
                            <span className={`text-xs ${isUnread ? 'font-bold' : 'font-normal text-gray-500'}`}>
                              {format(new Date(notif.createdAt), 'HH:mm')}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5" onClick={() => handleRowClick(notif)}>
                            <span className={`text-xs ${isUnread ? 'font-bold' : 'font-normal text-gray-500'}`}>
                              {notif.createdByName || 'System'}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5 text-center" onClick={() => handleRowClick(notif)}>
                            <span className={`inline-flex items-center justify-center h-5 w-5 rounded text-[10px] font-bold ${
                              notif.priority === 'high'
                                ? 'bg-red-100 text-red-700'
                                : notif.priority === 'medium'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {notif.priority === 'high' ? 'H' : notif.priority === 'medium' ? 'M' : 'L'}
                            </span>
                          </TableCell>
                          <TableCell className="py-1.5 text-right pr-2">
                            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 hover:opacity-100"
                                 style={{ opacity: isSelected ? 1 : undefined }}
                                 onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
                                 onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.opacity = '0'; }}
                            >
                              {notif.link && (
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); handleRowClick(notif); }} title="Open">
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              )}
                              {notif.status !== 'acknowledged' && (
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-600" onClick={(e) => { e.stopPropagation(); acknowledgeMutation.mutate(notif.id); }} title="Acknowledge">
                                  <CheckCircle className="h-3 w-3" />
                                </Button>
                              )}
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(notif.id); }} title="Delete">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between border-t pt-2">
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <span className="text-xs text-muted-foreground">{selectedIds.size} selected</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => acknowledgeAllMutation.mutate()}
                  disabled={acknowledgeAllMutation.isPending}
                >
                  <CheckCheck className="h-3 w-3" /> Acknowledge All
                </Button>
              </>
            )}
            {activeTab === 'active' && alerts.length > 0 && selectedIds.size === 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => acknowledgeAllMutation.mutate()}
                disabled={acknowledgeAllMutation.isPending}
              >
                <CheckCheck className="h-3 w-3" /> Acknowledge All
              </Button>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Record: {alerts.length > 0 ? '1' : '0'} / {alerts.length} | Rows: {alerts.length}
          </div>
        </div>
      </div>
    </Layout>
  );
}

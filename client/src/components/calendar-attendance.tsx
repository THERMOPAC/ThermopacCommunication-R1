import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Calendar, Check, Clock, AlertTriangle, ChevronLeft, ChevronRight, Save, CheckSquare } from 'lucide-react';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

interface CalendarDay {
  date: string;
  dayOfWeek: number;
  dayType: string;
  editable: boolean;
  status: string | null;
  holiday: { name: string; isOptional: boolean } | null;
  leave: { status: string; leaveTypeName: string; leaveTypeCode: string; isPaid: boolean; isHalfDay: boolean } | null;
}

interface CalendarData {
  employee: { id: number; name: string; userType: string; dateOfJoining: string | null };
  policyName: string;
  workingDaysConfig: number[];
  year: number;
  month: number;
  isLocked: boolean;
  calendarDays: CalendarDay[];
  summary: {
    totalCalendarDays: number;
    weeklyHolidays: number;
    companyHolidays: number;
    approvedLeaves: number;
    pendingLeaves: number;
    netWorkingDays: number;
    presentDays: number;
    halfDays: number;
    absentDays: number;
    effectiveWorking: number;
  };
}

export function CalendarAttendanceTab() {
  const { toast } = useToast();
  const now = new Date();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['/api/calendar-attendance/non-system-users'],
  });

  const { data: calendarData, isLoading, refetch } = useQuery<CalendarData>({
    queryKey: ['/api/calendar-attendance/calendar-data', selectedUserId, year, month],
    queryFn: () => fetch(`/api/calendar-attendance/calendar-data/${selectedUserId}/${year}/${month}`, { credentials: 'include' }).then(r => r.json()),
    enabled: !!selectedUserId,
  });

  useEffect(() => {
    if (calendarData?.calendarDays) {
      const existing: Record<string, string> = {};
      calendarData.calendarDays.forEach(d => {
        if (d.status) existing[d.date] = d.status;
      });
      setLocalStatuses(existing);
      setHasChanges(false);
    }
  }, [calendarData]);

  const toggleDay = useCallback((date: string) => {
    setLocalStatuses(prev => {
      const current = prev[date];
      const next = !current ? 'present' : current === 'present' ? 'half_day' : undefined;
      const updated = { ...prev };
      if (next) updated[date] = next;
      else delete updated[date];
      return updated;
    });
    setHasChanges(true);
  }, []);

  const markAllPresent = useCallback(() => {
    if (!calendarData) return;
    const updated: Record<string, string> = { ...localStatuses };
    calendarData.calendarDays.forEach(d => {
      if (d.dayType === 'working_day' && d.editable && !updated[d.date]) {
        updated[d.date] = 'present';
      }
    });
    setLocalStatuses(updated);
    setHasChanges(true);
  }, [calendarData, localStatuses]);

  const clearAll = useCallback(() => {
    setLocalStatuses({});
    setHasChanges(true);
  }, []);

  const saveAttendance = async () => {
    if (!selectedUserId || !calendarData) return;
    setSaving(true);
    try {
      const attendance = Object.entries(localStatuses).map(([date, status]) => ({ date, status }));
      const resp = await fetch('/api/calendar-attendance/save-attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: parseInt(selectedUserId), year, month, attendance }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to save');
      toast({ title: 'Attendance Saved', description: data.message });
      setHasChanges(false);
      refetch();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const navigateMonth = (delta: number) => {
    let newMonth = month + delta;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear--; }
    if (newMonth > 12) { newMonth = 1; newYear++; }
    setMonth(newMonth);
    setYear(newYear);
  };

  const computedSummary = useCallback(() => {
    if (!calendarData) return null;
    const days = calendarData.calendarDays;
    const workingDays = days.filter(d => d.dayType === 'working_day');
    const present = workingDays.filter(d => localStatuses[d.date] === 'present').length;
    const halfDay = workingDays.filter(d => localStatuses[d.date] === 'half_day').length;
    const unmarked = workingDays.filter(d => !localStatuses[d.date]).length;
    return {
      ...calendarData.summary,
      presentDays: present,
      halfDays: halfDay,
      absentDays: unmarked,
      effectiveWorking: present + (halfDay * 0.5),
    };
  }, [calendarData, localStatuses]);

  const summary = computedSummary();

  function getDayCellStyle(day: CalendarDay) {
    const status = localStatuses[day.date];
    if (day.dayType === 'weekly_holiday') return 'bg-gray-100 text-gray-400 cursor-not-allowed';
    if (day.dayType === 'company_holiday') return 'bg-gray-200 text-gray-500 cursor-not-allowed border-gray-300';
    if (day.dayType === 'approved_leave') return 'bg-purple-100 text-purple-700 cursor-not-allowed border-purple-300';
    if (day.dayType === 'pending_leave') return 'bg-orange-100 text-orange-700 cursor-not-allowed border-orange-300';
    if (status === 'present') return 'bg-blue-100 text-blue-800 border-blue-400 hover:bg-blue-200 cursor-pointer ring-2 ring-blue-400';
    if (status === 'half_day') return 'bg-yellow-100 text-yellow-800 border-yellow-400 hover:bg-yellow-200 cursor-pointer ring-2 ring-yellow-400';
    if (day.editable) return 'bg-white hover:bg-gray-50 cursor-pointer border-gray-200 text-gray-700';
    return 'bg-gray-50 text-gray-400 cursor-not-allowed';
  }

  function getDayLabel(day: CalendarDay) {
    const status = localStatuses[day.date];
    if (day.dayType === 'weekly_holiday') return 'Off';
    if (day.dayType === 'company_holiday') return day.holiday?.name || 'Holiday';
    if (day.dayType === 'approved_leave') return day.leave?.leaveTypeCode || 'Leave';
    if (day.dayType === 'pending_leave') return 'Pending';
    if (status === 'present') return 'Present';
    if (status === 'half_day') return 'Half Day';
    return '';
  }

  const calendarWeeks = useCallback(() => {
    if (!calendarData) return [];
    const days = calendarData.calendarDays;
    const weeks: (CalendarDay | null)[][] = [];
    let currentWeek: (CalendarDay | null)[] = [];

    const firstDayOfWeek = days[0]?.dayOfWeek || 0;
    for (let i = 0; i < firstDayOfWeek; i++) currentWeek.push(null);

    days.forEach(day => {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }

    return weeks;
  }, [calendarData]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Non-System User Attendance Calendar
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-72">
              <Select value={selectedUserId} onValueChange={v => { setSelectedUserId(v); setHasChanges(false); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Employee" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u: any) => (
                    <SelectItem key={u.id} value={u.id.toString()}>
                      {u.name} {u.employeeCode ? `(${u.employeeCode})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedUserId && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => navigateMonth(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="font-semibold min-w-[160px] text-center">
                  {MONTH_NAMES[month - 1]} {year}
                </span>
                <Button variant="outline" size="icon" onClick={() => navigateMonth(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {!selectedUserId && (
            <div className="text-center py-12 text-gray-400">
              Select an employee to view and mark attendance
            </div>
          )}

          {selectedUserId && isLoading && (
            <div className="text-center py-12">Loading calendar...</div>
          )}

          {calendarData && !isLoading && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-sm">
                    {calendarData.policyName}
                  </Badge>
                  {calendarData.isLocked && (
                    <Badge variant="destructive" className="text-xs">
                      Locked (Payroll Processed)
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  {!calendarData.isLocked && (
                    <>
                      <Button variant="outline" size="sm" onClick={markAllPresent}>
                        <CheckSquare className="h-4 w-4 mr-1" /> Mark All Present
                      </Button>
                      <Button variant="outline" size="sm" onClick={clearAll}>
                        Clear All
                      </Button>
                      <Button size="sm" onClick={saveAttendance} disabled={saving || !hasChanges}>
                        <Save className="h-4 w-4 mr-1" /> {saving ? 'Saving...' : 'Save Attendance'}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-3 flex-wrap text-xs">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-200 border border-blue-400 inline-block"></span> Present</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-400 inline-block"></span> Half Day</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-300 inline-block"></span> Weekly Off</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 border border-gray-400 inline-block"></span> Holiday</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-200 border border-purple-400 inline-block"></span> Approved Leave</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-200 border border-orange-400 inline-block"></span> Pending Leave</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border border-gray-200 inline-block"></span> Unmarked (Absent)</span>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-7 bg-gray-50 border-b">
                  {DAY_NAMES.map(d => (
                    <div key={d} className="text-center text-xs font-semibold py-2 text-gray-600">{d}</div>
                  ))}
                </div>
                {calendarWeeks().map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
                    {week.map((day, di) => (
                      <div
                        key={di}
                        className={`min-h-[72px] border-r last:border-r-0 p-1 transition-colors ${day ? getDayCellStyle(day) : 'bg-gray-50'}`}
                        onClick={() => day?.editable && !calendarData.isLocked ? toggleDay(day.date) : undefined}
                      >
                        {day && (
                          <div className="flex flex-col h-full">
                            <span className="text-sm font-medium">{parseInt(day.date.split('-')[2])}</span>
                            <span className="text-[10px] mt-auto leading-tight">{getDayLabel(day)}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  <SummaryCard label="Net Working Days" value={summary.netWorkingDays} color="blue" />
                  <SummaryCard label="Present" value={summary.presentDays} color="green" />
                  <SummaryCard label="Half Days" value={summary.halfDays} color="yellow" />
                  <SummaryCard label="Absent / LOP" value={summary.absentDays} color="red" />
                  <SummaryCard label="Approved Leave" value={summary.approvedLeaves} color="purple" />
                  <SummaryCard label="Effective Working" value={summary.effectiveWorking} color="blue" />
                  <SummaryCard label="Weekly Holidays" value={summary.weeklyHolidays} color="gray" />
                  <SummaryCard label="Company Holidays" value={summary.companyHolidays} color="gray" />
                  {summary.pendingLeaves > 0 && (
                    <SummaryCard label="Pending Leave" value={summary.pendingLeaves} color="orange" />
                  )}
                </div>
              )}

              {hasChanges && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm text-amber-700">You have unsaved changes. Click "Save Attendance" to save.</span>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
  };
  return (
    <div className={`rounded-md border p-3 ${colorMap[color] || colorMap.gray}`}>
      <div className="text-xs font-medium">{label}</div>
      <div className="text-xl font-bold mt-1">{value}</div>
    </div>
  );
}

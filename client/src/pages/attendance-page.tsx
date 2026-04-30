import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { fmtDate } from "@/lib/date-utils";
import {
  Clock,
  MapPin,
  Calendar,
  CheckCircle,
  XCircle,
  AlertCircle,
  Timer,
  Users,
  TrendingUp,
  LogIn,
  LogOut,
  Wifi,
  WifiOff,
  ClipboardList,
  Filter,
  User
} from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, subWeeks, subMonths } from "date-fns";

interface AttendanceStatus {
  hasRecord: boolean;
  record: any;
  canCheckIn: boolean;
  canCheckOut: boolean;
}

interface WorkLocation {
  id: number;
  name: string;
  city: string;
}

interface DailyQuote {
  id: number;
  dayOfYear: number;
  quoteText: string;
  attribution: string;
  source: string;
}

interface AttendanceRecord {
  id: number;
  date: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  workingHours: number | null;
  overtimeHours: number | null;
  status: string;
  isLocationVerified: boolean;
  isIpVerified: boolean;
  employeeNotes: string | null;
  adminNotes: string | null;
  workLocation: { id: number; name: string; city: string } | null;
}

export default function AttendancePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [currentLocation, setCurrentLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  
  // State for attendance records filtering
  const [selectedDateRange, setSelectedDateRange] = useState('thisMonth');

  // Function to get greeting based on current time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  // Get current attendance status
  const { data: attendanceStatus, isLoading: statusLoading } = useQuery<AttendanceStatus>({
    queryKey: ["/api/attendance/status"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Get work locations
  const { data: workLocations = [] } = useQuery<WorkLocation[]>({
    queryKey: ["/api/work-locations/active"],
  });

  // Get daily Buddha quote
  const { data: dailyQuote } = useQuery<DailyQuote>({
    queryKey: ["/api/attendance/daily-quote"],
    staleTime: 24 * 60 * 60 * 1000, // Cache for 24 hours
  });

  // Check if DWAR is completed for today
  const { data: todayDwar } = useQuery({
    queryKey: ["/api/dwar/today"],
    refetchInterval: 10000, // Refresh every 10 seconds to catch DWAR updates
  });

  // Get attendance summary for current month
  const { data: summary } = useQuery({
    queryKey: ["/api/attendance/my-summary"],
  });

  // Calculate date range based on selected filter
  const dateRange = useMemo(() => {
    const today = new Date();
    let startDate: Date;
    let endDate: Date = today;

    switch (selectedDateRange) {
      case 'today':
        startDate = today;
        break;
      case 'yesterday':
        startDate = subDays(today, 1);
        endDate = subDays(today, 1);
        break;
      case 'thisWeek':
        startDate = startOfWeek(today, { weekStartsOn: 1 });
        endDate = endOfWeek(today, { weekStartsOn: 1 });
        break;
      case 'lastWeek':
        const lastWeekStart = subWeeks(today, 1);
        startDate = startOfWeek(lastWeekStart, { weekStartsOn: 1 });
        endDate = endOfWeek(lastWeekStart, { weekStartsOn: 1 });
        break;
      case 'thisMonth':
        startDate = startOfMonth(today);
        endDate = endOfMonth(today);
        break;
      case 'lastMonth':
        const lastMonth = subMonths(today, 1);
        startDate = startOfMonth(lastMonth);
        endDate = endOfMonth(lastMonth);
        break;
      default:
        startDate = startOfMonth(today);
        endDate = endOfMonth(today);
    }

    return {
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd')
    };
  }, [selectedDateRange]);

  // Get attendance records for selected date range
  const { data: attendanceRecords = [], isLoading: recordsLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["/api/attendance/my-records", selectedDateRange],
    queryFn: async () => {
      const res = await fetch(`/api/attendance/my-records?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&limit=100`);
      if (!res.ok) throw new Error('Failed to fetch records');
      return res.json();
    }
  });

  const getEffectiveStatus = (r: any) => {
    const status = (r.status?.toLowerCase() || '').replace(/_/g, ' ');
    if (status === 'present' && r.checkInTime && !r.checkOutTime) {
      const today = new Date().toISOString().split('T')[0];
      const recordDate = r.date ? new Date(r.date).toISOString().split('T')[0] : '';
      if (recordDate !== today) return 'absent';
    }
    return status;
  };

  const attendanceStats = useMemo(() => {
    const presentCount = attendanceRecords.filter(r => getEffectiveStatus(r) === 'present').length;
    const absentCount = attendanceRecords.filter(r => getEffectiveStatus(r) === 'absent').length;
    const lateCount = attendanceRecords.filter(r => getEffectiveStatus(r) === 'late').length;
    const halfDayCount = attendanceRecords.filter(r => getEffectiveStatus(r) === 'half day').length;
    const totalHours = attendanceRecords.reduce((sum, r) => sum + (Number(r.workingHours) || 0), 0);
    
    return {
      totalDays: attendanceRecords.length,
      presentDays: presentCount,
      absentDays: absentCount,
      lateDays: lateCount,
      halfDays: halfDayCount,
      totalHours: totalHours.toFixed(1)
    };
  }, [attendanceRecords]);

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/attendance/check-in", data);
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/my-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/my-summary"] });
      
      toast({
        title: "Check-in Successful",
        description: response.locationVerified 
          ? "Location verified successfully" 
          : "Check-in completed (location not verified)",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Check-in Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Check-out mutation
  const checkOutMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/attendance/check-out", data);
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/my-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/my-summary"] });
      
      toast({
        title: "Check-out Successful",
        description: response.gratitudeMessage || `Work completed: ${response.workingHours} hours${response.overtimeHours > 0 ? ` (${response.overtimeHours} overtime)` : ''}`,
        duration: 5000, // Show gratitude message longer
      });
    },
    onError: (error: any) => {
      toast({
        title: "Check-out Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get user's current location
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          setLocationError(null);
        },
        (error) => {
          setLocationError("Location access denied or unavailable");
          console.error("Geolocation error:", error);
        }
      );
    } else {
      setLocationError("Geolocation not supported by this browser");
    }
  };

  // Auto-get location on component mount
  useEffect(() => {
    getCurrentLocation();
  }, []);

  const handleCheckIn = () => {
    const deviceInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      timestamp: new Date().toISOString()
    };

    const checkInData = {
      workLocationId: selectedLocationId,
      latitude: currentLocation?.latitude,
      longitude: currentLocation?.longitude,
      address: "Location detected via GPS", // Could be enhanced with reverse geocoding
      deviceInfo
    };

    checkInMutation.mutate(checkInData);
  };

  const handleCheckOut = () => {
    // Check if DWAR is completed for today
    if (!todayDwar || todayDwar.status !== 'submitted') {
      // Redirect to DWAR page with checkout=true parameter
      setLocation('/dwar?checkout=true');
      toast({
        title: "Complete Daily Work Report",
        description: "Please complete your Daily Work Activity Report before checking out.",
        variant: "default",
      });
      return;
    }

    // Proceed with normal checkout if DWAR is completed
    const deviceInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      timestamp: new Date().toISOString()
    };

    const checkOutData = {
      latitude: currentLocation?.latitude,
      longitude: currentLocation?.longitude,
      address: "Location detected via GPS",
      deviceInfo,
      employeeNotes: ""
    };

    checkOutMutation.mutate(checkOutData);
  };

  if (statusLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const todayRecord = attendanceStatus?.record;
  const canCheckIn = attendanceStatus?.canCheckIn;
  const canCheckOut = attendanceStatus?.canCheckOut;

  // Helper function to format time
  const formatTime = (timeString: string | null) => {
    if (!timeString) return '-';
    try {
      return format(new Date(timeString), 'hh:mm a');
    } catch {
      return timeString;
    }
  };

  const getStatusBadge = (status: string, record?: any) => {
    const statusLower = (status?.toLowerCase() || '').replace(/_/g, ' ');
    if (record && record.checkInTime && !record.checkOutTime) {
      const today = new Date().toISOString().split('T')[0];
      const recordDate = record.date ? new Date(record.date).toISOString().split('T')[0] : '';
      if (recordDate === today) {
        return <Badge className="bg-blue-100 text-blue-800">Checked In</Badge>;
      }
      return <Badge className="bg-orange-100 text-orange-800">No Check-Out</Badge>;
    }
    if (statusLower === 'absent' && record && !record.checkInTime && !record.checkOutTime) {
      return <Badge className="bg-red-100 text-red-800">No Check-In & Out</Badge>;
    }
    switch (statusLower) {
      case 'present':
        return <Badge className="bg-green-100 text-green-800">Present</Badge>;
      case 'late':
        return <Badge className="bg-yellow-100 text-yellow-800">Late</Badge>;
      case 'absent':
        return <Badge className="bg-red-100 text-red-800">Absent</Badge>;
      case 'half day':
        return <Badge className="bg-orange-100 text-orange-800">Half Day</Badge>;
      case 'weekly off':
        return <Badge className="bg-blue-100 text-blue-800">Weekly Off</Badge>;
      case 'holiday':
        return <Badge className="bg-purple-100 text-purple-800">Holiday</Badge>;
      case 'on leave':
        return <Badge className="bg-indigo-100 text-indigo-800">On Leave</Badge>;
      case 'incomplete':
        return <Badge className="bg-yellow-100 text-yellow-800">Incomplete</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Get date range label for display
  const getDateRangeLabel = () => {
    switch (selectedDateRange) {
      case 'today': return 'Today';
      case 'yesterday': return 'Yesterday';
      case 'thisWeek': return 'This Week';
      case 'lastWeek': return 'Last Week';
      case 'thisMonth': return 'This Month';
      case 'lastMonth': return 'Last Month';
      default: return 'This Month';
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Message */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {getGreeting()}, {user?.username}!
            </h1>
            <p className="text-gray-600">
              Great to see you — let's achieve today's goals together!
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Daily Buddha Quote */}
      {dailyQuote && (
        <Card className="bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200">
          <CardContent className="pt-6">
            <div className="text-center max-w-3xl mx-auto">
              <div className="text-4xl text-amber-600 mb-4">"</div>
              <blockquote className="text-lg italic text-gray-800 leading-relaxed mb-4">
                {dailyQuote.quoteText}
              </blockquote>
              <footer className="text-sm text-gray-600">
                — {dailyQuote.attribution}
                {dailyQuote.source && (
                  <span className="text-amber-600 ml-2">({dailyQuote.source})</span>
                )}
              </footer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Today's Attendance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Check-in/Check-out Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status:</span>
                {todayRecord ? (
                  <Badge variant={todayRecord.checkOutTime ? "secondary" : "default"}>
                    {todayRecord.checkOutTime ? "Completed" : "Checked In"}
                  </Badge>
                ) : (
                  <Badge variant="outline">Not Started</Badge>
                )}
              </div>

              {todayRecord && (
                <div className="space-y-2">
                  {todayRecord.checkInTime && (
                    <div className="flex items-center gap-2 text-sm">
                      <LogIn className="h-4 w-4 text-green-600" />
                      <span>Check-in: {format(new Date(todayRecord.checkInTime), "HH:mm")}</span>
                    </div>
                  )}
                  {todayRecord.checkOutTime && (
                    <div className="flex items-center gap-2 text-sm">
                      <LogOut className="h-4 w-4 text-blue-600" />
                      <span>Check-out: {format(new Date(todayRecord.checkOutTime), "HH:mm")}</span>
                    </div>
                  )}
                  {todayRecord.workingHours && (
                    <div className="flex items-center gap-2 text-sm">
                      <Timer className="h-4 w-4 text-purple-600" />
                      <span>Working hours: {todayRecord.workingHours}h</span>
                    </div>
                  )}
                </div>
              )}

              {/* Location Status */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  {currentLocation ? (
                    <Wifi className="h-4 w-4 text-green-600" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-red-600" />
                  )}
                  <span>
                    {currentLocation ? "Location detected" : "Location not available"}
                  </span>
                </div>
                {locationError && (
                  <p className="text-xs text-muted-foreground text-red-600">{locationError}</p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-4">
              {canCheckIn && (
                <div className="space-y-3">
                  {workLocations.length > 0 && (
                    <select 
                      className="w-full p-2 border rounded-md"
                      value={selectedLocationId || ''}
                      onChange={(e) => setSelectedLocationId(e.target.value ? parseInt(e.target.value) : null)}
                    >
                      <option value="">Select work location (optional)</option>
                      {workLocations.map(location => (
                        <option key={location.id} value={location.id}>
                          {location.name} - {location.city}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button 
                    onClick={handleCheckIn}
                    disabled={checkInMutation.isPending}
                    className="w-full"
                    size="lg"
                  >
                    <LogIn className="h-4 w-4 mr-2" />
                    {checkInMutation.isPending ? "Checking In..." : "Check In"}
                  </Button>
                </div>
              )}

              {canCheckOut && (
                <Button 
                  onClick={handleCheckOut}
                  disabled={checkOutMutation.isPending}
                  variant="outline"
                  className="w-full"
                  size="lg"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  {checkOutMutation.isPending ? "Checking Out..." : "Check Out"}
                </Button>
              )}

              {!currentLocation && (
                <Button 
                  onClick={getCurrentLocation}
                  variant="outline"
                  className="w-full"
                  size="sm"
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  Enable Location
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="py-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <AlertCircle className="h-4 w-4" />
            <span>Missed a punch or worked outdoors? Submit a regularization request for corrections.</span>
          </div>
          <Button variant="outline" size="sm" className="whitespace-nowrap border-blue-300 text-blue-700 hover:bg-blue-100" onClick={() => setLocation('/attendance/regularization')}>
            <ClipboardList className="h-4 w-4 mr-1" /> Regularization
          </Button>
        </CardContent>
      </Card>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">{attendanceStats.totalDays}</div>
              <div className="text-sm text-blue-700">Total Days</div>
              <div className="text-xs text-gray-500 mt-1">{getDateRangeLabel()}</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{attendanceStats.presentDays}</div>
              <div className="text-sm text-green-700">Present</div>
              <div className="text-xs text-gray-500 mt-1">Days present</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200">
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-600">{attendanceStats.absentDays}</div>
              <div className="text-sm text-red-700">Absent</div>
              <div className="text-xs text-gray-500 mt-1">Days absent</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="pt-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-600">{attendanceStats.lateDays}</div>
              <div className="text-sm text-yellow-700">Late</div>
              <div className="text-xs text-gray-500 mt-1">Days late</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <Select value={selectedDateRange} onValueChange={setSelectedDateRange}>
                <SelectTrigger data-testid="select-date-range">
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="thisWeek">This Week</SelectItem>
                  <SelectItem value="lastWeek">Last Week</SelectItem>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                  <SelectItem value="lastMonth">Last Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => setSelectedDateRange('thisMonth')}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Attendance Records Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Attendance Records
          </CardTitle>
          <CardDescription>
            Detailed attendance records for {getDateRangeLabel().toLowerCase()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Time In</th>
                  <th className="text-left p-3 font-medium">Time Out</th>
                  <th className="text-left p-3 font-medium">Work Hours</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Location</th>
                </tr>
              </thead>
              <tbody>
                {recordsLoading ? (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-gray-500">
                      <div className="flex justify-center items-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <span className="ml-2">Loading records...</span>
                      </div>
                    </td>
                  </tr>
                ) : attendanceRecords.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-gray-500">
                      No attendance records found for {getDateRangeLabel().toLowerCase()}
                    </td>
                  </tr>
                ) : (
                  attendanceRecords.map((record) => (
                    <tr key={`${record.date}-${record.id}`} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        {fmtDate(record.date)}
                      </td>
                      <td className="p-3">{formatTime(record.checkInTime)}</td>
                      <td className="p-3">{formatTime(record.checkOutTime)}</td>
                      <td className="p-3">
                        {record.workingHours ? `${Number(record.workingHours).toFixed(1)}h` : '-'}
                        {record.overtimeHours && Number(record.overtimeHours) > 0 && (
                          <span className="text-purple-600 text-xs ml-1">
                            (+{Number(record.overtimeHours).toFixed(1)}h OT)
                          </span>
                        )}
                      </td>
                      <td className="p-3">{getStatusBadge(record.status, record)}</td>
                      <td className="p-3 text-gray-600">
                        {record.workLocation ? `${record.workLocation.name}` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
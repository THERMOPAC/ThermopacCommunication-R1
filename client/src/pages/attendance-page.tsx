import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  WifiOff
} from "lucide-react";
import { format } from "date-fns";

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

export default function AttendancePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [currentLocation, setCurrentLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);

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

  // Check if DWAR is completed for today
  const { data: todayDwar } = useQuery({
    queryKey: ["/api/dwar/today"],
    refetchInterval: 10000, // Refresh every 10 seconds to catch DWAR updates
  });

  // Get attendance summary for current month
  const { data: summary } = useQuery({
    queryKey: ["/api/attendance/my-summary"],
  });

  // Get recent attendance records
  const { data: recentRecords = [] } = useQuery({
    queryKey: ["/api/attendance/my-records"],
    queryParams: { limit: 5 }
  });

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
        description: `Work completed: ${response.workingHours} hours${response.overtimeHours > 0 ? ` (${response.overtimeHours} overtime)` : ''}`,
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
              Great to see you today — let's achieve today's targets together!
            </p>
          </div>
        </CardContent>
      </Card>

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

      {/* Monthly Summary */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              This Month Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{summary.presentDays}</div>
                <div className="text-sm text-muted-foreground">Present Days</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{summary.absentDays}</div>
                <div className="text-sm text-muted-foreground">Absent Days</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{summary.totalWorkingHours.toFixed(1)}h</div>
                <div className="text-sm text-muted-foreground">Total Hours</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{summary.totalOvertimeHours.toFixed(1)}h</div>
                <div className="text-sm text-muted-foreground">Overtime</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Records */}
      {recentRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Recent Attendance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentRecords.map((record: any) => (
                <div key={record.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="text-sm font-medium">
                      {format(new Date(record.date), "MMM dd, yyyy")}
                    </div>
                    <Badge variant={
                      record.status === 'present' ? 'default' :
                      record.status === 'late' ? 'secondary' :
                      record.status === 'absent' ? 'destructive' : 'outline'
                    }>
                      {record.status}
                    </Badge>
                  </div>
                  <div className="text-right text-sm">
                    {record.checkInTime && record.checkOutTime ? (
                      <div>
                        <div>{format(new Date(record.checkInTime), "HH:mm")} - {format(new Date(record.checkOutTime), "HH:mm")}</div>
                        {record.workingHours && (
                          <div className="text-muted-foreground">{record.workingHours}h worked</div>
                        )}
                      </div>
                    ) : record.checkInTime ? (
                      <div className="text-yellow-600">In progress</div>
                    ) : (
                      <div className="text-muted-foreground">No records</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
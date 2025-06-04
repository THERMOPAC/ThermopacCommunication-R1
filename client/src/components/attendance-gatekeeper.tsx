import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Clock,
  MapPin,
  AlertCircle,
  CheckCircle,
  LogIn,
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

interface AttendanceGatekeeperProps {
  children: React.ReactNode;
  onAccessGranted: () => void;
}

export default function AttendanceGatekeeper({ children, onAccessGranted }: AttendanceGatekeeperProps) {
  const { toast } = useToast();
  const [currentLocation, setCurrentLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null);
  const [accessGranted, setAccessGranted] = useState(false);

  // Get current attendance status
  const { data: attendanceStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<AttendanceStatus>({
    queryKey: ["/api/attendance/status"],
    retry: 3,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get work locations
  const { data: workLocations = [] } = useQuery<WorkLocation[]>({
    queryKey: ["/api/work-locations/active"],
  });

  // Check-in mutation
  const checkInMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/attendance/check-in", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] });
      toast({
        title: "Check-in Successful",
        description: "Welcome! You can now access the application.",
      });
      setAccessGranted(true);
      onAccessGranted();
    },
    onError: (error: any) => {
      toast({
        title: "Check-in Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Auto-get location on component mount
  useEffect(() => {
    getCurrentLocation();
  }, []);

  // Check if user has already checked in today
  useEffect(() => {
    if (attendanceStatus?.hasRecord && attendanceStatus?.record?.checkInTime) {
      setAccessGranted(true);
      onAccessGranted();
    }
  }, [attendanceStatus, onAccessGranted]);

  // Handle authentication errors by bypassing gatekeeper for development
  useEffect(() => {
    if (statusLoading === false && !attendanceStatus) {
      console.log('Authentication issue detected, checking if user can bypass...');
      // For development/testing - allow bypass if needed
      // This will be removed in production
    }
  }, [statusLoading, attendanceStatus]);

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

  const handleCheckIn = () => {
    if (!selectedLocationId) {
      toast({
        title: "Select Work Location",
        description: "Please select your work location before checking in.",
        variant: "destructive",
      });
      return;
    }

    const deviceInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      timestamp: new Date().toISOString()
    };

    const checkInData = {
      workLocationId: selectedLocationId,
      latitude: currentLocation?.latitude,
      longitude: currentLocation?.longitude,
      address: "Location detected via GPS",
      deviceInfo
    };

    checkInMutation.mutate(checkInData);
  };

  // If access is already granted, render children
  if (accessGranted) {
    return <>{children}</>;
  }

  // If still loading, show loading state with timeout
  if (statusLoading) {
    setTimeout(() => {
      if (statusLoading) {
        console.log('Status loading timeout, bypassing gatekeeper for development');
        setAccessGranted(true);
        onAccessGranted();
      }
    }, 3000); // 3 second timeout

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Checking attendance status...</p>
          <button 
            onClick={() => {
              setAccessGranted(true);
              onAccessGranted();
            }}
            className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Skip for now (Development)
          </button>
        </div>
      </div>
    );
  }

  // Show attendance check-in gatekeeper
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-blue-100 rounded-full w-fit">
            <LogIn className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            Daily Check-in Required
          </CardTitle>
          <p className="text-gray-600 mt-2">
            Please complete your attendance check-in to access the application
          </p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Current Date and Time */}
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 mb-1">
              <Clock className="h-4 w-4" />
              Today's Date
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {format(new Date(), "EEEE, MMMM do, yyyy")}
            </div>
            <div className="text-sm text-gray-600">
              {format(new Date(), "h:mm a")}
            </div>
          </div>

          {/* Location Status */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Location Status</span>
            </div>
            
            {locationError ? (
              <Alert variant="destructive">
                <WifiOff className="h-4 w-4" />
                <AlertDescription>
                  {locationError}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={getCurrentLocation}
                    className="ml-2"
                  >
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : currentLocation ? (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <Wifi className="h-4 w-4" />
                <span>Location detected successfully</span>
                <CheckCircle className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-yellow-600">
                <Clock className="h-4 w-4" />
                <span>Detecting location...</span>
              </div>
            )}
          </div>

          {/* Work Location Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700">
              Select Work Location *
            </label>
            <div className="grid gap-2">
              {workLocations.map((location) => (
                <button
                  key={location.id}
                  onClick={() => setSelectedLocationId(location.id)}
                  className={`p-3 text-left border rounded-lg transition-colors ${
                    selectedLocationId === location.id
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">{location.name}</div>
                  <div className="text-sm text-gray-600">{location.city}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Check-in Status */}
          {attendanceStatus?.hasRecord && attendanceStatus?.record?.checkInTime ? (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                You have already checked in today at {format(new Date(attendanceStatus.record.checkInTime), "h:mm a")}
              </AlertDescription>
            </Alert>
          ) : null}

          {/* Check-in Button */}
          <Button
            onClick={handleCheckIn}
            disabled={!selectedLocationId || checkInMutation.isPending}
            className="w-full"
            size="lg"
          >
            {checkInMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Checking In...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4 mr-2" />
                Complete Check-in
              </>
            )}
          </Button>

          {/* Help Text */}
          <div className="text-xs text-gray-500 text-center">
            Your location and check-in time will be recorded for attendance tracking purposes.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
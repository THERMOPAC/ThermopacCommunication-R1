import { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, AlertCircle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type UserProfileProps = {
  user: User;
};

export default function UserProfile({ user }: UserProfileProps) {
  const { logoutMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Get attendance status
  const { data: attendanceStatus } = useQuery({
    queryKey: ["/api/attendance/status"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Get today's DWAR status
  const { data: todayDwar } = useQuery({
    queryKey: ["/api/dwar/today"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleLogout = () => {
    // Check if user has checked in but not checked out
    const hasCheckedIn = attendanceStatus?.hasRecord && attendanceStatus?.record?.checkInTime;
    const hasCheckedOut = attendanceStatus?.record?.checkOutTime;
    const isDwarSubmitted = todayDwar?.status === 'submitted';

    if (hasCheckedIn && !hasCheckedOut) {
      // User has checked in but not checked out
      if (!isDwarSubmitted) {
        // DWAR not submitted - redirect to DWAR page first
        toast({
          title: "Complete Daily Work Report",
          description: "Please complete and submit your Daily Work Activity Report before checkout and logout.",
          variant: "destructive",
        });
        setLocation('/dwar?checkout=true');
        return;
      } else {
        // DWAR submitted but not checked out - redirect to attendance page
        toast({
          title: "Complete Checkout",
          description: "Please complete your attendance checkout before logout.",
          variant: "destructive",
        });
        setLocation('/attendance');
        return;
      }
    }

    // All requirements met, proceed with logout
    logoutMutation.mutate();
  };

  // Determine if logout should be disabled
  const hasCheckedIn = attendanceStatus?.hasRecord && attendanceStatus?.record?.checkInTime;
  const hasCheckedOut = attendanceStatus?.record?.checkOutTime;
  const isDwarSubmitted = todayDwar?.status === 'submitted';
  const canLogout = !hasCheckedIn || hasCheckedOut;
  const logoutButtonVariant = canLogout ? "outline" : "destructive";
  const logoutButtonText = canLogout ? "Logout" : "Complete Checkout First";

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{user.username}</h3>
        <p className="text-sm text-muted-foreground">{user.role}</p>
      </div>

      <Separator />

      <div className="space-y-2 text-sm">
        <div>
          <p className="text-muted-foreground">Email</p>
          <p className="font-medium">{user.email}</p>
        </div>

        <div>
          <p className="text-muted-foreground">Phone</p>
          <p className="font-medium">{user.countryCode} {user.mobileNumber}</p>
        </div>
      </div>

      {/* Show attendance status */}
      {hasCheckedIn && !hasCheckedOut && (
        <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded border">
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            <span>Checkout required before logout</span>
          </div>
          {!isDwarSubmitted && (
            <div className="mt-1 text-amber-700">
              • Submit DWAR first
            </div>
          )}
        </div>
      )}

      <Button 
        variant={logoutButtonVariant}
        className={`w-full ${canLogout ? 'text-red-600 hover:text-red-700' : 'text-white'}`}
        onClick={handleLogout}
        disabled={logoutMutation.isPending}
      >
        <LogOut className="h-4 w-4 mr-2" />
        {logoutButtonText}
      </Button>
    </div>
  );
}
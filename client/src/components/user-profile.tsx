import { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, AlertCircle, FileText } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

type UserProfileProps = {
  user: User;
};

export default function UserProfile({ user }: UserProfileProps) {
  const { logoutMutation } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);

  // Get attendance status
  const { data: attendanceStatus } = useQuery<any>({
    queryKey: ["/api/attendance/status"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Get today's DWAR status
  const { data: todayDwar } = useQuery<any>({
    queryKey: ["/api/dwar/today"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleLogoutClick = () => {
    // Check if user has checked in but not checked out
    const hasCheckedIn = attendanceStatus?.hasRecord && attendanceStatus?.record?.checkInTime;
    const hasCheckedOut = attendanceStatus?.record?.checkOutTime;
    const isDwarSubmitted = todayDwar?.status === 'submitted';

    if (hasCheckedIn && !hasCheckedOut) {
      // User has checked in but not checked out
      if (!isDwarSubmitted) {
        // DWAR not submitted - show confirmation dialog
        setIsLogoutDialogOpen(true);
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

  const handleSubmitDwar = () => {
    setIsLogoutDialogOpen(false);
    setLocation('/dwar?checkout=true');
    toast({
      title: "Complete DWAR",
      description: "Please submit your Daily Work Activity Report.",
    });
  };

  const handleLogoutAnyway = () => {
    setIsLogoutDialogOpen(false);
    logoutMutation.mutate();
  };

  // Determine logout button appearance
  const hasCheckedIn = attendanceStatus?.hasRecord && attendanceStatus?.record?.checkInTime;
  const hasCheckedOut = attendanceStatus?.record?.checkOutTime;
  const isDwarSubmitted = todayDwar?.status === 'submitted';
  const needsCheckout = hasCheckedIn && !hasCheckedOut;

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
      {needsCheckout && (
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

      {/* Logout button with confirmation dialog */}
      <AlertDialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
        <Button 
          variant="outline"
          className="w-full text-red-600 hover:text-red-700"
          onClick={handleLogoutClick}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-amber-500" />
              DWAR Submission Required
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <div>
                Daily Work Assessment Report (DWAR) is mandatory for attendance compliance. 
                Are you sure you want to log out without submitting your DWAR?
              </div>
              <div className="text-sm text-amber-700 bg-amber-50 p-2 rounded">
                <strong>Note:</strong> Incomplete DWAR may affect your attendance record and compliance status.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogAction
              onClick={handleSubmitDwar}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <FileText className="h-4 w-4 mr-2" />
              Submit DWAR
            </AlertDialogAction>
            <AlertDialogCancel
              onClick={handleLogoutAnyway}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Log Out Anyway
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
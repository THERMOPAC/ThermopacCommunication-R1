import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Clock } from 'lucide-react';

interface InactivityWarningDialogProps {
  isOpen: boolean;
  onStayLoggedIn: () => void;
  onLogout: () => void;
  countdownSeconds?: number;
}

export const InactivityWarningDialog = ({
  isOpen,
  onStayLoggedIn,
  onLogout,
  countdownSeconds = 30
}: InactivityWarningDialogProps) => {
  const [timeLeft, setTimeLeft] = useState(countdownSeconds);

  useEffect(() => {
    if (!isOpen) {
      setTimeLeft(countdownSeconds);
      return;
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, countdownSeconds, onLogout]);

  const handleStayLoggedIn = () => {
    setTimeLeft(countdownSeconds);
    onStayLoggedIn();
  };

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
            <Clock className="h-5 w-5" />
            Session Timeout Warning
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-600">
            You will be automatically logged out in{' '}
            <span className="font-semibold text-red-600">{timeLeft}</span>{' '}
            seconds due to inactivity.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={onLogout}
            className="flex-1"
          >
            Logout Now
          </Button>
          <AlertDialogAction
            onClick={handleStayLoggedIn}
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            Stay Logged In
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LogOut, Clock } from 'lucide-react';

export default function LogoutPage() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Auto-redirect to login after 3 seconds
    const timer = setTimeout(() => {
      setLocation('/auth');
    }, 3000);

    return () => clearTimeout(timer);
  }, [setLocation]);

  const handleGoToLogin = () => {
    setLocation('/auth');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/20 rounded-full flex items-center justify-center">
            <Clock className="w-8 h-8 text-orange-600" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Session Expired
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              You have been logged out due to inactivity for security reasons.
            </p>
          </div>

          <div className="space-y-3 w-full pt-4">
            <Button 
              onClick={handleGoToLogin}
              className="w-full bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Login Again
            </Button>
            
            <p className="text-sm text-gray-500 dark:text-gray-400">
              You will be redirected automatically in a few seconds...
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
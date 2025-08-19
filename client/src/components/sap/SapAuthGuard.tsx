import { useState, useEffect } from 'react';
import { SapLoginModal } from './SapLoginModal';
import { Loader2, Database, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SapAuthGuardProps {
  children: React.ReactNode;
  onSessionStatusChange?: (isActive: boolean) => void;
}

export function SapAuthGuard({ children, onSessionStatusChange }: SapAuthGuardProps) {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkSessionStatus = async () => {
    try {
      const response = await fetch('/api/sap/b1/session/status');
      const data = await response.json();

      if (response.ok && data.success) {
        setIsAuthenticated(true);
        setError(null);
        onSessionStatusChange?.(true);
      } else {
        setIsAuthenticated(false);
        setShowLoginModal(true);
        onSessionStatusChange?.(false);
        
        if (data.code === 'SAP_SESSION_EXPIRED') {
          setError('Your SAP session has expired. Please login again.');
        }
      }
    } catch (error) {
      console.error('Session status check failed:', error);
      setIsAuthenticated(false);
      setShowLoginModal(true);
      setError('Unable to verify SAP session. Please login.');
      onSessionStatusChange?.(false);
    } finally {
      setIsCheckingSession(false);
    }
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    setShowLoginModal(false);
    setError(null);
    onSessionStatusChange?.(true);
  };

  const handleSessionExpired = () => {
    setIsAuthenticated(false);
    setShowLoginModal(true);
    setError('Your SAP session has expired. Please login again.');
    onSessionStatusChange?.(false);
  };

  useEffect(() => {
    checkSessionStatus();
  }, []);

  if (isCheckingSession) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <span className="text-sm text-gray-600">Verifying SAP session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="p-6 space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <Database className="h-12 w-12 text-blue-600 mx-auto" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">SAP B1 Authentication Required</h3>
              <p className="text-sm text-gray-600">Please authenticate with SAP B1 to access purchase management features.</p>
            </div>
          </div>
        </div>

        <SapLoginModal
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSuccess={handleLoginSuccess}
        />
      </div>
    );
  }

  return (
    <>
      {children}
      <SapLoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
        onSuccess={handleLoginSuccess}
      />
    </>
  );
}
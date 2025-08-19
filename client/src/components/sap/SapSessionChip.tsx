import { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface SapSessionChipProps {
  onSessionExpired: () => void;
}

export function SapSessionChip({ onSessionExpired }: SapSessionChipProps) {
  const [sessionStatus, setSessionStatus] = useState<{
    isActive: boolean;
    ttlSeconds: number | null;
    expiresAt: string | null;
  }>({
    isActive: false,
    ttlSeconds: null,
    expiresAt: null
  });

  const checkSessionStatus = async () => {
    try {
      const response = await fetch('/api/sap/b1/session/status');
      const data = await response.json();

      if (response.ok && data.success) {
        setSessionStatus({
          isActive: true,
          ttlSeconds: data.ttlSeconds,
          expiresAt: data.expiresAt
        });
      } else {
        setSessionStatus({
          isActive: false,
          ttlSeconds: null,
          expiresAt: null
        });
        
        // Only call expired callback if this was an active session that expired
        if (sessionStatus.isActive) {
          onSessionExpired();
        }
      }
    } catch (error) {
      console.error('Session status check failed:', error);
      setSessionStatus({
        isActive: false,
        ttlSeconds: null,
        expiresAt: null
      });
    }
  };

  useEffect(() => {
    // Check session status immediately
    checkSessionStatus();

    // Set up interval to check session status every 30 seconds
    const interval = setInterval(checkSessionStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return '0:00';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getStatusVariant = (ttlSeconds: number | null) => {
    if (!ttlSeconds) return 'destructive';
    if (ttlSeconds <= 300) return 'destructive'; // 5 minutes or less
    if (ttlSeconds <= 600) return 'secondary'; // 10 minutes or less
    return 'default';
  };

  const getStatusIcon = (ttlSeconds: number | null) => {
    if (!ttlSeconds) return <AlertTriangle className="h-3 w-3" />;
    if (ttlSeconds <= 300) return <AlertTriangle className="h-3 w-3" />;
    return <CheckCircle className="h-3 w-3" />;
  };

  if (!sessionStatus.isActive || !sessionStatus.ttlSeconds) {
    return null;
  }

  return (
    <Badge 
      variant={getStatusVariant(sessionStatus.ttlSeconds)}
      className="flex items-center gap-1 text-xs"
    >
      {getStatusIcon(sessionStatus.ttlSeconds)}
      <Clock className="h-3 w-3" />
      SAP: {formatTimeRemaining(sessionStatus.ttlSeconds)}
    </Badge>
  );
}
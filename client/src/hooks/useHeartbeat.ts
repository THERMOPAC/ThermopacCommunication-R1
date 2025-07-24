import { useEffect, useRef } from 'react';

interface HeartbeatOptions {
  interval?: number; // Heartbeat interval in milliseconds
  endpoint?: string; // API endpoint for heartbeat
}

export const useHeartbeat = (options: HeartbeatOptions = {}) => {
  const { interval = 60000, endpoint = '/api/business-intelligence/heartbeat' } = options; // Default 1 minute
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isActiveRef = useRef(true);

  const sendHeartbeat = async () => {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include session cookies
      });

      if (!response.ok) {
        console.warn('Heartbeat failed:', response.status);
      }
    } catch (error) {
      console.warn('Heartbeat error:', error);
    }
  };

  const startHeartbeat = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    // Send initial heartbeat
    sendHeartbeat();
    
    // Set up recurring heartbeat
    intervalRef.current = setInterval(() => {
      if (isActiveRef.current) {
        sendHeartbeat();
      }
    }, interval);
  };

  const stopHeartbeat = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    isActiveRef.current = false;
  };

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        isActiveRef.current = false;
      } else {
        isActiveRef.current = true;
        // Send heartbeat when page becomes visible again
        sendHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Start heartbeat on mount, stop on unmount
  useEffect(() => {
    startHeartbeat();
    
    return () => {
      stopHeartbeat();
    };
  }, [interval, endpoint]);

  return {
    sendHeartbeat,
    startHeartbeat,
    stopHeartbeat
  };
};
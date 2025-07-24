import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const WARNING_TIME = 30 * 1000; // Show warning 30 seconds before logout

interface UseInactivityLogoutOptions {
  onWarning?: () => void;
  onLogout?: () => void;
  disabled?: boolean;
}

export const useInactivityLogout = (options: UseInactivityLogoutOptions = {}) => {
  const { onWarning, onLogout, disabled = false } = options;
  const [, setLocation] = useLocation();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
  }, []);

  const performLogout = useCallback(async () => {
    try {
      // Call the logout API
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      
      // Call custom logout handler if provided
      if (onLogout) {
        onLogout();
      }
      
      // Redirect to logout route
      setLocation('/logout');
    } catch (error) {
      console.error('Error during automatic logout:', error);
      // Still redirect even if API call fails
      setLocation('/logout');
    }
  }, [onLogout, setLocation]);

  const showWarning = useCallback(() => {
    if (onWarning) {
      onWarning();
    } else {
      // Default warning alert
      alert('You will be logged out in 30 seconds due to inactivity.');
    }
  }, [onWarning]);

  const resetTimer = useCallback(() => {
    if (disabled) return;

    const now = Date.now();
    lastActivityRef.current = now;
    
    clearTimers();

    // Set warning timer (4.5 minutes)
    warningTimeoutRef.current = setTimeout(() => {
      showWarning();
    }, INACTIVITY_TIMEOUT - WARNING_TIME);

    // Set logout timer (5 minutes)
    timeoutRef.current = setTimeout(() => {
      performLogout();
    }, INACTIVITY_TIMEOUT);
  }, [disabled, clearTimers, showWarning, performLogout]);

  const handleActivity = useCallback((event?: Event) => {
    // Ignore if disabled
    if (disabled) return;

    // Throttle activity detection to avoid excessive timer resets
    const now = Date.now();
    if (now - lastActivityRef.current < 1000) { // Throttle to 1 second
      return;
    }

    resetTimer();
  }, [disabled, resetTimer]);

  useEffect(() => {
    if (disabled) {
      clearTimers();
      return;
    }

    // Activity event types to track
    const events = [
      'mousedown',
      'mousemove', 
      'keypress',
      'scroll',
      'touchstart',
      'click',
      'wheel'
    ];

    // Add event listeners
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Initialize timer
    resetTimer();

    // Cleanup function
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
      clearTimers();
    };
  }, [disabled, handleActivity, resetTimer, clearTimers]);

  // Manual reset function for external use
  const manualReset = useCallback(() => {
    if (!disabled) {
      resetTimer();
    }
  }, [disabled, resetTimer]);

  return {
    resetTimer: manualReset,
    getRemainingTime: () => {
      const elapsed = Date.now() - lastActivityRef.current;
      return Math.max(0, INACTIVITY_TIMEOUT - elapsed);
    },
    isActive: () => !disabled
  };
};
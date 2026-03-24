import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './useAuth';
import { useNavigate } from 'react-router-dom';

export const useInactivityLogout = (timeoutMinutes: number = 5) => {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimeout = useCallback(() => {
    if (timeoutId.current) {
      clearTimeout(timeoutId.current);
    }

    if (user) {
      timeoutId.current = setTimeout(async () => {
        await signOut();
        navigate('/');
        alert('Sesión cerrada por inactividad de 5 minutos');
      }, timeoutMinutes * 60 * 1000);
    }
  }, [user, signOut, navigate, timeoutMinutes]);

  useEffect(() => {
    if (!user) return;

    // Activity events
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, resetTimeout, { passive: true });
    });

    resetTimeout(); // Initialize timer

    return () => {
      if (timeoutId.current) {
        clearTimeout(timeoutId.current);
      }
      events.forEach(event => {
        document.removeEventListener(event, resetTimeout);
      });
    };
  }, [user, resetTimeout]);
};

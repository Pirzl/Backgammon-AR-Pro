import { useState, useEffect, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../shared/api/supabase';
import { AuthContext, type Profile } from './AuthContext';

const HEARTBEAT_INTERVAL = 30 * 1000; // 30 seconds - update online status

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Global activity tracking - updates last_seen for all authenticated users
  useEffect(() => {
    if (!user) return;

    const updateOnlineStatus = async () => {
      try {
        await supabase
          .from('profiles')
          .update({ 
            status: 'online',
            last_seen: new Date().toISOString()
          })
          .eq('id', user.id);
      } catch (error) {
        console.error('Error updating online status:', error);
      }
    };

    // Update immediately on mount
    updateOnlineStatus();

    // Regular heartbeat for cross-browser tracking
    const heartbeat = setInterval(updateOnlineStatus, HEARTBEAT_INTERVAL);

    // Track user activity events
    const handleActivity = () => updateOnlineStatus();
    window.addEventListener('focus', handleActivity);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleActivity();
      }
    });

    // Mark offline on unmount/logout
    const markOffline = async () => {
      try {
        await supabase
          .from('profiles')
          .update({ status: 'offline', last_seen: new Date().toISOString() })
          .eq('id', user.id);
      } catch { /* Best effort */ }
    };

    window.addEventListener('beforeunload', markOffline);

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('focus', handleActivity);
      window.removeEventListener('beforeunload', markOffline);
      markOffline();
    };
  }, [user]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setLoading(true); // Ensure verify loading is true while fetching profile
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
      }
      
      if (data) {
        setProfile(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    // Mark offline before signing out
    if (user) {
      await supabase
        .from('profiles')
        .update({ status: 'offline', last_seen: new Date().toISOString() })
        .eq('id', user.id);
    }
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

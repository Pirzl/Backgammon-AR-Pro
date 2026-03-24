import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: string | null;
  training_mode_enabled?: boolean;
}

export interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

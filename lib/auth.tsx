import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

type AuthState = { session: Session | null; loading: boolean };
// While someone resets a forgotten password they are signed in (the emailed code
// signs them in) but should stay on the sign-in screen until they pick a new one.
type AuthContextValue = AuthState & { recovering: boolean; setRecovering: (on: boolean) => void };

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true, recovering: false, setRecovering: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState({ session, loading: false }));
    return () => data.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ ...state, recovering, setRecovering }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

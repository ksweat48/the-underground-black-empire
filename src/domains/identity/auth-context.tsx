import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/shared/supabase-client';
import type { AuthSession } from './types';
import { signUp, signIn, signOut } from './services';
import type { SignUpParams, SignInParams } from './services';

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  clearError: () => void;
  signUp: (params: SignUpParams) => Promise<AuthSession>;
  signIn: (params: SignInParams) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
      setSession(data.session ? { user: data.session.user } : null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        setSession(session ? { user: session.user } : null);
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const clearError = () => setError(null);

  const handleSignUp = async (params: SignUpParams) => {
    setError(null);
    try {
      const newSession = await signUp(params);
      setSession(newSession);
      return newSession;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
      throw err;
    }
  };

  const handleSignIn = async (params: SignInParams) => {
    setError(null);
    try {
      await signIn(params);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      throw err;
    }
  };

  const handleSignOut = async () => {
    setError(null);
    try {
      await signOut();
      setSession(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign out failed');
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        error,
        clearError,
        signUp: handleSignUp,
        signIn: handleSignIn,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

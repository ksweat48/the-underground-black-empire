import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/shared/supabase-client';
import type { AuthSession, MemberState } from './types';
import { signUp, signIn, signOut } from './services';
import type { SignUpParams, SignInParams } from './services';

interface AuthContextValue {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  sessionVersion: number;
  onboardingComplete: boolean | null;
  memberState: MemberState | null;
  clearError: () => void;
  refreshMemberState: () => Promise<void>;
  signUp: (params: SignUpParams) => Promise<AuthSession>;
  signIn: (params: SignInParams) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [memberState, setMemberState] = useState<MemberState | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(
      ({ data, error }: { data: { session: Session | null }; error: Error | null }) => {
        if (error) {
          setError('Unable to connect. Please refresh the page.');
        } else {
          setSession(data.session ? { user: data.session.user } : null);
        }
        setLoading(false);
      },
      () => {
        setError('Unable to connect. Please refresh the page.');
        setLoading(false);
      },
    );

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event: string, session: Session | null) => {
        setSession(session ? { user: session.user } : null);
        setSessionVersion((v) => v + 1);
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setOnboardingComplete(null);
      setMemberState(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('members')
        .select('onboarding_complete, city_id, founder_number, member_number')
        .eq('id', session.user.id)
        .maybeSingle();
      if (!cancelled) {
        if (error || !data) {
          setOnboardingComplete(false);
          setMemberState(null);
        } else {
          setOnboardingComplete(Boolean(data.onboarding_complete));
          setMemberState({
            hasMemberRecord: true,
            cityId: data.city_id ?? null,
            founderNumber: data.founder_number ?? null,
            memberNumber: data.member_number ?? null,
            onboardingComplete: Boolean(data.onboarding_complete),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, sessionVersion]);

  const refreshMemberState = async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('members')
      .select('onboarding_complete, city_id, founder_number, member_number')
      .eq('id', session.user.id)
      .maybeSingle();
    if (error || !data) {
      setOnboardingComplete(false);
      setMemberState(null);
    } else {
      setOnboardingComplete(Boolean(data.onboarding_complete));
      setMemberState({
        hasMemberRecord: true,
        cityId: data.city_id ?? null,
        founderNumber: data.founder_number ?? null,
        memberNumber: data.member_number ?? null,
        onboardingComplete: Boolean(data.onboarding_complete),
      });
    }
  };

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
      setOnboardingComplete(null);
      setMemberState(null);
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
        sessionVersion,
        onboardingComplete,
        memberState,
        clearError,
        refreshMemberState,
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

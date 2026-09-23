import { Navigate, useLocation } from 'react-router-dom';
import { type ReactNode, useEffect, useState } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { useAuth } from '@/domains/identity/auth-context';
import { supabase } from '@/shared/supabase-client';

function getResumePath(memberState: { cityId: string | null; founderNumber: number | null }): string {
  if (memberState.cityId && memberState.founderNumber) {
    return `/onboarding/identity?number=${memberState.founderNumber}&city=${memberState.cityId}`;
  }
  return '/onboarding/city';
}

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { session, loading, onboardingComplete, memberState } = useAuth();
  const location = useLocation();
  const userId = session?.user?.id ?? null;
  const [adminLoading, setAdminLoading] = useState(requireAdmin);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  useEffect(() => {
    if (!requireAdmin) {
      setAdminLoading(false);
      return;
    }
    if (loading) {
      return;
    }
    if (!userId) {
      setAdminLoading(false);
      setIsAdmin(false);
      return;
    }

    setAdminLoading(true);
    setAdminError(null);
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setAdminError('Admin check timed out. Please try again.');
        setIsAdmin(false);
        setAdminLoading(false);
      }
    }, 10000);
    Promise.resolve(supabase.rpc('is_current_user_admin'))
      .then(({ data, error }) => {
        if (!cancelled) {
          clearTimeout(timeout);
          if (error) {
            setAdminError(error.message);
            setIsAdmin(false);
          } else {
            setIsAdmin(Boolean(data));
          }
          setAdminLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          clearTimeout(timeout);
          setAdminError(err instanceof Error ? err.message : 'Unknown error');
          setAdminLoading(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [requireAdmin, loading, userId]);

  if (loading || adminLoading || (session && onboardingComplete === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-950">
        <Loader2 className="w-6 h-6 text-gold-400 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth/sign-in" state={{ from: location.pathname }} replace />;
  }

  if (!onboardingComplete) {
    if (!memberState) return <Loader2 className="w-6 h-6 text-gold-400 animate-spin" />;
    return <Navigate to={getResumePath(memberState)} replace />;
  }

  if (requireAdmin && adminError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-950 px-6">
        <div className="max-w-md text-center space-y-4">
          <Shield className="w-10 h-10 text-red-400 mx-auto" />
          <h1 className="text-xl font-display font-bold text-ink-100">Admin check failed</h1>
          <p className="text-sm text-red-300 font-mono break-words">{adminError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-lg bg-gold-500/20 border border-gold-500/40 text-gold-200 text-sm hover:bg-gold-500/30 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ink-950 px-6">
        <div className="max-w-md text-center space-y-4">
          <Shield className="w-10 h-10 text-ink-500 mx-auto" />
          <h1 className="text-xl font-display font-bold text-ink-100">Not an admin</h1>
          <p className="text-sm text-ink-400">
            Your account does not have admin privileges. If you believe this is an error,
            contact support.
          </p>
          <a
            href="/empire"
            className="inline-block px-4 py-2 rounded-lg bg-gold-500/20 border border-gold-500/40 text-gold-200 text-sm hover:bg-gold-500/30 transition-colors"
          >
            Back to Empire
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

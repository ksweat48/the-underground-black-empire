import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Loader2, User } from 'lucide-react';
import { APP_CONFIG } from '@/config/app';
import { useAuth } from '@/domains/identity/auth-context';
import { Layout } from '@/shared/components/layout';
import { EmpireEmblem } from '@/shared/components/empire-emblem';
import { EthnicIdentitySelector, type EthnicIdentityValue } from '@/shared/components/ethnic-identity-selector';
import { GenderSelector, type GenderValue } from '@/shared/components/gender-selector';
import { supabase } from '@/shared/supabase-client';
import { parseSupabaseError } from '@/shared/errors';

interface AuthPageProps {
  mode: 'sign-in' | 'sign-up';
}

export function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, error, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [ethnicSelected, setEthnicSelected] = useState<EthnicIdentityValue[]>([]);
  const [ethnicDetail, setEthnicDetail] = useState('');
  const [gender, setGender] = useState<GenderValue | null>(null);
  const [genderDetail, setGenderDetail] = useState('');
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isSignUp = mode === 'sign-up';
  const referralCode = searchParams.get('ref');

  const createMemberRecord = async (userEmail: string): Promise<void> => {
    const { error: rpcError } = await supabase.rpc('create_member', {
      p_email: userEmail,
      p_display_name: displayName || null,
      p_referred_by_code: referralCode || null,
    });
    if (rpcError) throw rpcError;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    clearError();
    try {
      if (isSignUp) {
        if (ethnicSelected.length === 0) {
          setIdentityError('Please select at least one option.');
          return;
        }
        if (ethnicSelected.includes('another') && !ethnicDetail.trim()) {
          setIdentityError('Please describe your race / ethnic identity.');
          return;
        }
        if (!gender) {
          setIdentityError('Please select your gender.');
          return;
        }
        await signUp({ email, password });
        await createMemberRecord(email);
        const { error: rpcError } = await supabase.rpc('update_ethnic_identity', {
          p_ethnic_identity: ethnicSelected,
          p_ethnic_identity_detail: ethnicSelected.includes('another') ? ethnicDetail.trim() : null,
        });
        if (rpcError) throw new Error(parseSupabaseError(rpcError));
        const { error: genderError } = await supabase.rpc('update_gender', {
          p_gender: gender,
          p_gender_detail: gender === 'other' ? genderDetail.trim() : null,
        });
        if (genderError) throw new Error(parseSupabaseError(genderError));
      } else {
        await signIn({ email, password });
      }
      navigate('/empire');
    } catch (err) {
      if (err instanceof Error) {
        // Auth errors are set via context; non-auth errors show inline
        const msg = err.message;
        if (msg && !msg.includes('already exists') && !msg.includes('Incorrect') && !msg.includes('password') && !msg.includes('rate limit')) {
          setIdentityError(msg);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto mt-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-display font-bold text-gradient-gold mb-2">
            {isSignUp ? 'Join the Empire' : 'Welcome Back'}
          </h1>
          <p className="text-ink-400">
            {isSignUp
              ? 'Create your account to join the Empire.'
              : 'Sign in to your dashboard.'}
          </p>
          {referralCode && isSignUp && (
            <div className="mt-3 inline-flex items-center gap-2 badge-gold">
              <EmpireEmblem variant="dark" className="w-3.5 h-3.5" />
              Referred by a member
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          {isSignUp && (
            <div className="pb-2 border-b border-ink-800/50">
              <EthnicIdentitySelector
                selected={ethnicSelected}
                detail={ethnicDetail}
                onToggle={(value) => {
                  setEthnicSelected((prev) =>
                    prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
                  );
                  setIdentityError(null);
                }}
                onDetailChange={setEthnicDetail}
                error={null}
              />
              <GenderSelector
                selected={gender}
                detail={genderDetail}
                onSelect={(value) => {
                  setGender(value);
                  setIdentityError(null);
                }}
                onDetailChange={setGenderDetail}
              />
              {identityError && (
                <p className="text-sm text-crimson-300 px-1">{identityError}</p>
              )}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-crimson-950/40 border border-crimson-700/40 text-crimson-200 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {isSignUp && (
            <div>
              <label htmlFor="display-name" className="label-field">
                Display Name <span className="text-ink-500">(optional)</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="input-field pl-10"
                  autoComplete="name"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="email" className="label-field">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@empire.app"
                className="input-field pl-10"
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="label-field">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
              <input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="input-field pl-10"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isSignUp ? 'Creating account...' : 'Signing in...'}
              </>
            ) : isSignUp ? (
              'Create Account'
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <p className="text-center text-sm text-ink-400 mt-4">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <Link
            to={isSignUp ? '/auth/sign-in' : '/onboarding/city'}
            className="text-gold-300 hover:text-gold-200 font-medium"
          >
            {isSignUp ? 'Sign in' : 'Join the Empire'}
          </Link>
        </p>

        <p className="text-center text-xs text-ink-500 mt-6">
          By continuing, you agree to the {APP_CONFIG.name} terms and privacy policy.
        </p>
      </div>
    </Layout>
  );
}

export default AuthPage;

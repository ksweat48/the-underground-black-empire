import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, User, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { OnboardingStep } from '@/shared/components/onboarding-step';
import { useAuth } from '@/domains/identity/auth-context';
import { supabase } from '@/shared/supabase-client';

export function OnboardingAccountPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cityId = searchParams.get('city');
  const referralCode = searchParams.get('ref');
  const { signUp, error, clearError, session, memberState } = useAuth();
  const isReturningMember = Boolean(session && memberState?.hasMemberRecord);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!cityId) {
    navigate('/onboarding/city');
    return null;
  }

  const createMemberRecord = async (userEmail: string): Promise<void> => {
    const { error: rpcError } = await supabase.rpc('create_member', {
      p_email: userEmail,
      p_display_name: displayName.trim(),
      p_referred_by_code: referralCode || null,
    });
    if (rpcError) throw rpcError;
  };

  const assignFounderNumber = async (): Promise<number> => {
    const { data, error: fnError } = await supabase.rpc('assign_founder_number', {
      p_city_id: cityId,
    });

    if (fnError) throw fnError;
    return data as number;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    clearError();
    try {
      if (!session) {
        await signUp({ email, password });
      }

      if (!memberState?.hasMemberRecord) {
        await createMemberRecord(session?.user.email ?? email);
      }

      const founderNumber = await assignFounderNumber();
      navigate(`/onboarding/identity?number=${founderNumber}&city=${cityId}`);
    } catch {
      // error is set in context
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingStep
      step={3}
      totalSteps={5}
      title={isReturningMember ? 'Continue Your Membership' : 'Create Account'}
      subtitle={isReturningMember ? 'Your account is ready. Claim your city number to continue.' : 'Just an email and password - that\'s all we need.'}
      onBack={() => navigate(`/onboarding/confirm?city=${cityId}${referralCode ? `&ref=${referralCode}` : ''}`)}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-crimson-950/40 border border-crimson-700/40 text-crimson-200 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!isReturningMember && (
          <>
            <div>
              <label htmlFor="display-name" className="label-field">
                Display Name <span className="text-crimson-400">*</span>
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
                  required
                  autoComplete="name"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="label-field">Email</label>
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
              <label htmlFor="password" className="label-field">Password</label>
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
                  autoComplete="new-password"
                />
              </div>
            </div>
          </>
        )}

        {isReturningMember && (
          <div className="rounded-xl border border-gold-700/30 bg-gold-950/20 p-4 text-sm text-ink-300">
            You are signed in. Continue to claim your city number for this account.
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {isReturningMember ? 'Claiming city number...' : 'Creating account...'}
            </>
          ) : (
            <>
              {isReturningMember ? 'Continue Setup' : 'Create Account'}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </OnboardingStep>
  );
}

export default OnboardingAccountPage;

import { useCallback, useEffect, useState } from 'react';
import {
  DollarSign,
  ExternalLink,
  Handshake,
  Loader2,
  Users,
  Wallet,
} from 'lucide-react';
import { cn } from '@/shared/cn';
import {
  joinPartnerProgram,
  fetchPartnerDashboard,
  startStripeConnectOnboarding,
  checkConnectStatus,
  requestPartnerPayout,
} from '@/domains/membership/services';
import type { PartnerDashboard } from '@/domains/membership/types';

function centsToUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PartnerDashboardSection({ referralCode }: { referralCode: string }) {
  const [dashboard, setDashboard] = useState<PartnerDashboard | null>(null);
  const [connectStatus, setConnectStatus] = useState<string>('not_connected');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      const data = await fetchPartnerDashboard();
      setDashboard(data);
      if (data.is_partner) {
        const status = await checkConnectStatus();
        setConnectStatus(status);
      }
    } catch {
      setDashboard({ is_partner: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const partnerParam = params.get('partner');
    if (partnerParam === 'complete' || partnerParam === 'refresh') {
      window.history.replaceState({}, '', '/profile');
      loadDashboard();
    }
  }, [loadDashboard]);

  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      await joinPartnerProgram();
      await loadDashboard();
    } catch {
      setError('Could not join the Partner program. Please try again.');
    } finally {
      setJoining(false);
    }
  };

  const handleOnboard = async () => {
    setOnboarding(true);
    setError(null);
    try {
      const url = await startStripeConnectOnboarding();
      if (url) {
        window.location.href = url;
      } else {
        setError('Could not start the payout setup. Please try again.');
      }
    } catch {
      setError('Could not start the payout setup. Please try again.');
    } finally {
      setOnboarding(false);
    }
  };

  const handlePayout = async () => {
    setRequestingPayout(true);
    setPayoutMessage(null);
    setError(null);
    try {
      const result = await requestPartnerPayout();
      if (result.success) {
        setPayoutMessage(`Payout of ${centsToUsd(result.net_cents ?? 0)} has been sent to your account.`);
        await loadDashboard();
      } else {
        setError(result.error ?? 'Payout failed. Please try again.');
      }
    } catch {
      setError('Payout failed. Please try again.');
    } finally {
      setRequestingPayout(false);
    }
  };

  if (loading) {
    return (
      <section className="glass-card p-4 animate-fade-up" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center gap-2 mb-3">
          <Handshake className="w-4 h-4 text-ink-400" />
          <h2 className="font-display text-sm font-semibold text-ink-100">Empire Partner</h2>
        </div>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-ink-400 animate-spin" />
        </div>
      </section>
    );
  }

  if (!dashboard?.is_partner) {
    return (
      <section className="glass-card p-4 animate-fade-up" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center gap-2 mb-3">
          <Handshake className="w-4 h-4 text-ink-400" />
          <h2 className="font-display text-sm font-semibold text-ink-100">Empire Partner</h2>
        </div>
        <p className="text-xs text-ink-400 leading-relaxed mb-3">
          Earn cash commissions when people you refer upgrade to a paid membership.
          Free to join, no paid membership required.
        </p>
        <div className="rounded-lg border border-ink-700/30 bg-ink-800/30 p-3 mb-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-2">Commission Per Referral</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-300">
            <span>Black Card</span><span className="text-right font-semibold text-ink-100">$1/mo</span>
            <span>Black Card+</span><span className="text-right font-semibold text-ink-100">$2/mo</span>
            <span>Black Pro</span><span className="text-right font-semibold text-ink-100">$4/mo</span>
            <span>Arch Member</span><span className="text-right font-semibold text-ink-100">$10/mo</span>
            <span>Arch Pro</span><span className="text-right font-semibold text-ink-100">$20/mo</span>
          </div>
        </div>
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
        <button
          onClick={handleJoin}
          disabled={joining}
          className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          {joining ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Join the Partner Program'}
        </button>
      </section>
    );
  }

  const availableCents = dashboard.available_cents ?? 0;
  const pendingCents = dashboard.pending_cents ?? 0;
  const paidCents = dashboard.paid_cents ?? 0;
  const lifetimeCents = dashboard.lifetime_cents ?? 0;
  const activeReferrals = dashboard.active_referrals ?? 0;
  const canRequestPayout = connectStatus === 'active' && availableCents >= 10000;

  return (
    <section className="glass-card p-4 animate-fade-up" style={{ animationDelay: '200ms' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Handshake className="w-4 h-4 text-emerald-500" />
          <h2 className="font-display text-sm font-semibold text-ink-100">Empire Partner</h2>
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Active</span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg border border-ink-700/30 bg-ink-800/30 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Users className="w-3.5 h-3.5 text-ink-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Referrals</span>
          </div>
          <p className="font-display text-lg font-bold text-ink-100 tabular-nums">{activeReferrals}</p>
          <p className="text-[10px] text-ink-500">paying members</p>
        </div>
        <div className="rounded-lg border border-ink-700/30 bg-ink-800/30 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign className="w-3.5 h-3.5 text-ink-500" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Lifetime</span>
          </div>
          <p className="font-display text-lg font-bold text-ink-100 tabular-nums">{centsToUsd(lifetimeCents)}</p>
          <p className="text-[10px] text-ink-500">total earned</p>
        </div>
      </div>

      {/* Balance Breakdown */}
      <div className="rounded-lg border border-ink-700/30 bg-ink-800/30 p-3 mb-4">
        <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-2">Balance</p>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-ink-400">Pending</span>
            <span className="font-semibold text-amber-400 tabular-nums">{centsToUsd(pendingCents)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-400">Available</span>
            <span className="font-semibold text-emerald-400 tabular-nums">{centsToUsd(availableCents)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-400">Paid Out</span>
            <span className="font-semibold text-ink-300 tabular-nums">{centsToUsd(paidCents)}</span>
          </div>
        </div>
      </div>

      {/* Connect / Payout Section */}
      {connectStatus !== 'active' ? (
        <div className="space-y-2">
          <p className="text-xs text-ink-400 leading-relaxed">
            Set up your payout account to receive commissions. You will verify your identity and tax information through Stripe.
          </p>
          <button
            onClick={handleOnboard}
            disabled={onboarding}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-stone-800 border border-stone-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:opacity-60"
          >
            {onboarding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Wallet className="h-4 w-4" />
                {connectStatus === 'pending' ? 'Continue Payout Setup' : 'Set Up Payouts'}
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {payoutMessage && (
            <div className="rounded-lg bg-emerald-950/40 border border-emerald-800/40 p-2.5">
              <p className="text-xs text-emerald-400">{payoutMessage}</p>
            </div>
          )}
          <button
            onClick={handlePayout}
            disabled={!canRequestPayout || requestingPayout}
            className={cn(
              'w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60',
              canRequestPayout
                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                : 'bg-stone-800 border border-stone-700 text-stone-400',
            )}
          >
            {requestingPayout ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <DollarSign className="h-4 w-4" />
                Request Payout
              </>
            )}
          </button>
          {!canRequestPayout && availableCents < 10000 && (
            <p className="text-[10px] text-ink-500 text-center">
              Minimum payout is $100. You need {centsToUsd(10000 - availableCents)} more.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      {/* Referral Code Reminder */}
      {referralCode && (
        <div className="mt-3 pt-3 border-t border-ink-700/30">
          <p className="text-[10px] text-ink-500">
            Your referral code <span className="font-mono font-semibold text-ink-300">{referralCode}</span> is your partner tracking link. Share it to earn commissions.
          </p>
        </div>
      )}
    </section>
  );
}

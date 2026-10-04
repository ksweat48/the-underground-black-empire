import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Landmark,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Scale,
  TrendingUp,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { ErrorBanner } from '@/shared/components/error-banner';
import { cn } from '@/shared/cn';
import { formatCents } from '@/domains/treasury/services';
import { PartnerPayoutQueue } from '@/domains/admin/components/partner-payout-queue';
import { FundReleaseQueue } from '@/domains/admin/components/fund-release-queue';
import { FamilyAssistanceReview } from '@/domains/admin/components/family-assistance-review';
import {
  fetchSplitPolicies,
  fetchReconciliationRuns,
  resolveReconciliationRun,
  type SplitPolicy,
  type ReconciliationRun,
} from '@/domains/admin/financial-services';

export function FinancialAdminPage() {
  const [policies, setPolicies] = useState<SplitPolicy[]>([]);
  const [reconciliationRuns, setReconciliationRuns] = useState<ReconciliationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [releaseRefresh, setReleaseRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [p, runs] = await Promise.all([
        fetchSplitPolicies(),
        fetchReconciliationRuns(30),
      ]);
      setPolicies(p);
      setReconciliationRuns(runs);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gold-400 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <ErrorBanner message="Unable to load financial data." onRetry={load} />
        </div>
      </Layout>
    );
  }

  const activePolicy = policies.find((p) => p.is_active) ?? policies[0];
  const discrepancyRuns = reconciliationRuns.filter((r) => r.status === 'discrepancy');

  return (
    <Layout>
      <div className="max-w-[960px] mx-auto w-full py-4 lg:py-8 flex flex-col gap-4 lg:gap-6">
        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 transition-colors w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Admin Console
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Landmark className="w-7 h-7 text-gold-400" />
          <h1 className="text-2xl lg:text-3xl font-display font-bold text-stone-900">Financial Admin</h1>
        </div>
        <p className="text-sm text-stone-500 -mt-4">
          Treasury split policies, reconciliation, and release approvals.
        </p>

        {discrepancyRuns.length > 0 && (
          <div className="frame-command p-4 border-amber-300 bg-amber-50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-sm font-semibold text-amber-900">
                {discrepancyRuns.length} reconciliation {discrepancyRuns.length === 1 ? 'run needs' : 'runs need'} review
              </p>
            </div>
          </div>
        )}

        <SplitPolicyCard policy={activePolicy} />

        <ReconciliationSection runs={reconciliationRuns} onResolved={load} />

        <PartnerPayoutQueue />

        <FundReleaseQueue refreshKey={releaseRefresh} />

        <FamilyAssistanceReview onDecided={() => setReleaseRefresh((n) => n + 1)} />
      </div>
    </Layout>
  );
}

function SplitPolicyCard({ policy }: { policy: SplitPolicy }) {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const rows = [
    { label: 'Metro Treasury', noRef: policy.city_treasury_pct, withRef: policy.city_treasury_pct_with_referral, color: 'text-emerald-700' },
    { label: 'Empire Treasury', noRef: policy.empire_treasury_pct, withRef: policy.empire_treasury_pct_with_referral, color: 'text-blue-700' },
    { label: 'Family & Legacy', noRef: policy.family_legacy_pct, withRef: policy.family_legacy_pct_with_referral, color: 'text-plum-700' },
    { label: 'Operations', noRef: policy.operations_pct, withRef: policy.operations_pct_with_referral, color: 'text-stone-700' },
    { label: 'Partner Commission', noRef: policy.partner_commission_pct, withRef: policy.partner_commission_pct_with_referral, color: 'text-gold-600' },
  ];

  return (
    <div className="frame-command p-4 lg:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Scale className="w-4 h-4 text-stone-500" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Active Split Policy</p>
      </div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-display font-bold text-stone-900">{policy.label}</h2>
        <span className="text-xs text-stone-500">
          Effective {new Date(policy.effective_from).toLocaleDateString()}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-stone-700 mb-2">Standard (no referral)</p>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-sm">
                <span className="text-stone-600">{r.label}</span>
                <span className={cn('font-semibold tabular-nums', r.color)}>{pct(r.noRef)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-stone-700 mb-2">With active referral</p>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-sm">
                <span className="text-stone-600">{r.label}</span>
                <span className={cn('font-semibold tabular-nums', r.color)}>{pct(r.withRef)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReconciliationSection({ runs, onResolved }: { runs: ReconciliationRun[]; onResolved: () => void }) {
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const submitResolve = async () => {
    if (!resolvingId) return;
    setSaving(true);
    setResolveError(null);
    try {
      await resolveReconciliationRun(resolvingId, notes.trim());
      setResolvingId(null);
      setNotes('');
      onResolved();
    } catch (e) {
      setResolveError(e instanceof Error ? e.message : 'Could not mark this run resolved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="frame-command p-4 lg:p-6">
      <div className="flex items-center gap-2 mb-1">
        <TrendingUp className="w-4 h-4 text-stone-500" />
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Daily Reconciliation</p>
      </div>
      <h2 className="text-lg font-display font-bold text-stone-900 mb-4">Stripe vs Ledger</h2>
      {runs.length === 0 ? (
        <p className="text-xs text-stone-500 py-4 text-center">No reconciliation runs yet.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {runs.map((run) => {
            const balanced = run.status !== 'discrepancy';
            return (
              <li key={run.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {balanced ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-stone-900">
                        {new Date(run.run_date).toLocaleDateString()}
                      </p>
                      <p className="text-[10px] text-stone-500">
                        Stripe: {formatCents(run.stripe_total_cents)} · Ledger: {formatCents(run.ledger_total_cents)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn(
                      'text-sm font-display font-bold tabular-nums',
                      run.difference_cents === 0 ? 'text-emerald-700' : 'text-amber-700',
                    )}>
                      {run.difference_cents === 0 ? 'Balanced' : formatCents(run.difference_cents)}
                    </p>
                    <span className={cn(
                      'text-[10px] font-semibold uppercase tracking-wider',
                      balanced ? 'text-emerald-600' : 'text-amber-600',
                    )}>
                      {run.status}
                    </span>
                  </div>
                </div>
                {run.status === 'resolved' && run.resolution_notes && (
                  <p className="mt-2 pl-6 text-[10px] text-stone-500">Resolved: {run.resolution_notes}</p>
                )}
                {run.status === 'discrepancy' && resolvingId !== run.id && (
                  <button
                    type="button"
                    onClick={() => { setResolvingId(run.id); setNotes(''); setResolveError(null); }}
                    className="mt-2 ml-6 text-xs font-semibold text-stone-700 underline-offset-2 hover:underline"
                  >
                    Mark Resolved
                  </button>
                )}
                {resolvingId === run.id && (
                  <div className="mt-2 ml-6 space-y-2">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      placeholder="What caused the difference and how it was handled"
                      className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 focus:border-stone-500 focus:outline-none"
                    />
                    {resolveError && <p className="text-[10px] text-red-700">{resolveError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={submitResolve} disabled={saving || notes.trim().length < 5} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Resolution'}
                      </button>
                      <button type="button" onClick={() => setResolvingId(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900">Cancel</button>
                    </div>
                  </div>
                )}
                {run.discrepancies.length > 0 && (
                  <div className="mt-2 pl-6 space-y-1">
                    {run.discrepancies.map((d) => (
                      <div key={d.id} className="text-[10px] text-stone-500">
                        {d.stripe_event_id}: {formatCents(d.stripe_amount_cents ?? 0)} vs {formatCents(d.ledger_amount_cents ?? 0)}
                        {d.notes && <span className="text-stone-400"> — {d.notes}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default FinancialAdminPage;

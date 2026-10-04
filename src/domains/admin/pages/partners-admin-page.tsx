import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Handshake, Loader2, Search, ShieldOff, ShieldCheck, X } from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { ErrorBanner } from '@/shared/components/error-banner';
import { cn } from '@/shared/cn';
import { formatCents } from '@/domains/treasury/services';
import { fetchPartnersAdmin, setPartnerStatus, type AdminPartner } from '@/domains/admin/moderation-services';

type Filter = 'all' | 'active' | 'suspended';

export function PartnersAdminPage() {
  const [partners, setPartners] = useState<AdminPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [suspending, setSuspending] = useState<AdminPartner | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setPartners(await fetchPartnersAdmin());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return partners.filter((p) => {
      if (filter === 'active' && !p.is_active) return false;
      if (filter === 'suspended' && p.is_active) return false;
      if (!q) return true;
      return (p.display_name ?? '').toLowerCase().includes(q) || String(p.member_number ?? '').includes(q);
    });
  }, [partners, query, filter]);

  async function reinstate(p: AdminPartner) {
    setBusyId(p.member_id);
    setActionError(null);
    try {
      await setPartnerStatus(p.member_id, true, null);
      await load();
    } catch {
      setActionError('Could not reinstate this Partner. Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  const suspendedCount = partners.filter((p) => !p.is_active).length;

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

        <div>
          <div className="flex items-center gap-3 mb-1">
            <Handshake className="w-7 h-7 text-gold-400" />
            <h1 className="text-2xl lg:text-3xl font-display font-bold text-stone-900">Empire Partners</h1>
          </div>
          <p className="text-sm text-stone-500">
            Review Partner accounts and earnings. Suspending a Partner stops new commissions and payout requests.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-gold-400 animate-spin" />
          </div>
        ) : error ? (
          <ErrorBanner message="Unable to load Partners." onRetry={load} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Partners" value={String(partners.length)} />
              <Stat label="Active" value={String(partners.length - suspendedCount)} />
              <Stat label="Suspended" value={String(suspendedCount)} tone={suspendedCount > 0 ? 'warn' : undefined} />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <label className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or member number"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-300 bg-white text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-gold-400"
                />
              </label>
              <div className="flex gap-1 p-1 rounded-lg bg-stone-100 w-fit">
                {(['all', 'active', 'suspended'] as Filter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      'px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors',
                      filter === f ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800',
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            {actionError && <ErrorBanner message={actionError} />}

            {visible.length === 0 ? (
              <div className="frame-command p-8 text-center text-sm text-stone-500">No Partners match this view.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {visible.map((p) => (
                  <PartnerRow
                    key={p.member_id}
                    partner={p}
                    busy={busyId === p.member_id}
                    onSuspend={() => setSuspending(p)}
                    onReinstate={() => reinstate(p)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {suspending && (
        <SuspendDialog
          partner={suspending}
          onClose={() => setSuspending(null)}
          onDone={async () => { setSuspending(null); await load(); }}
        />
      )}
    </Layout>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="frame-command p-4">
      <p className="text-[11px] uppercase tracking-wider font-semibold text-stone-500">{label}</p>
      <p className={cn('text-2xl font-display font-bold mt-1', tone === 'warn' ? 'text-amber-700' : 'text-stone-900')}>{value}</p>
    </div>
  );
}

function PartnerRow({ partner: p, busy, onSuspend, onReinstate }: {
  partner: AdminPartner;
  busy: boolean;
  onSuspend: () => void;
  onReinstate: () => void;
}) {
  return (
    <div className="frame-command p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-stone-900 truncate">{p.display_name ?? 'Unnamed member'}</p>
            {p.member_number != null && <span className="text-xs text-stone-500">#{p.member_number}</span>}
            <span className={cn(
              'text-[11px] font-semibold px-2 py-0.5 rounded-full',
              p.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200',
            )}>
              {p.is_active ? 'Active' : 'Suspended'}
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            {p.referral_count} referral{p.referral_count === 1 ? '' : 's'}
            {' · '}Payouts: {p.stripe_connect_status === 'active' ? 'connected' : 'not connected'}
            {p.joined_at && ` · Joined ${new Date(p.joined_at).toLocaleDateString()}`}
          </p>
        </div>
        {p.is_active ? (
          <button
            onClick={onSuspend}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 text-red-700 hover:bg-red-50 transition-colors"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            Suspend
          </button>
        ) : (
          <button
            onClick={onReinstate}
            disabled={busy}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
            Reinstate
          </button>
        )}
      </div>

      {!p.is_active && p.suspended_reason && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Reason: {p.suspended_reason}
          {p.suspended_at && ` (${new Date(p.suspended_at).toLocaleDateString()})`}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Earning label="Pending" cents={p.pending_cents} />
        <Earning label="Available" cents={p.available_cents} />
        <Earning label="Paid" cents={p.paid_cents} />
      </div>
    </div>
  );
}

function Earning({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="rounded-lg bg-stone-50 border border-stone-200 py-2">
      <p className="text-[11px] text-stone-500">{label}</p>
      <p className="text-sm font-semibold text-stone-900">{formatCents(cents)}</p>
    </div>
  );
}

function SuspendDialog({ partner, onClose, onDone }: {
  partner: AdminPartner;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = reason.trim().length >= 5;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    setErr(null);
    try {
      await setPartnerStatus(partner.member_id, false, reason.trim());
      await onDone();
    } catch {
      setErr('Could not suspend this Partner. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-display font-bold text-stone-900">Suspend Partner</h2>
            <p className="text-sm text-stone-500 mt-1">{partner.display_name ?? 'This member'} will stop earning commissions and cannot request payouts until reinstated.</p>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-stone-700">Reason (required)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2 rounded-lg border border-stone-300 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-gold-400"
            placeholder="Explain why this Partner is being suspended"
          />
        </label>
        {err && <p className="text-xs text-red-700">{err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-600 hover:bg-stone-100">Cancel</button>
          <button
            onClick={submit}
            disabled={!valid || saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Suspend
          </button>
        </div>
      </div>
    </div>
  );
}

export default PartnersAdminPage;

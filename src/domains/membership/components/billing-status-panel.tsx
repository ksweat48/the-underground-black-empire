import { useState } from 'react';
import { AlertTriangle, CalendarClock, CreditCard, Loader2, Undo2 } from 'lucide-react';
import {
  openCardUpdate,
  undoMembershipCancel,
  undoScheduledDowngrade,
} from '@/domains/membership/services';
import type { MemberMembership, MembershipTierId } from '@/domains/membership/types';

const GRACE_DAYS = 7;

function formatDate(value: string | null) {
  if (!value) return 'the end of your billing period';
  return new Date(value).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function BillingStatusPanel({
  membership,
  tierLabels,
  onChanged,
}: {
  membership: MemberMembership;
  tierLabels: Record<MembershipTierId, string>;
  onChanged: (message: string) => void;
}) {
  const [busy, setBusy] = useState<'card' | 'cancel' | 'downgrade' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: 'card' | 'cancel' | 'downgrade') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'card') {
        const url = await openCardUpdate();
        if (url) {
          window.location.href = url;
          return;
        }
        setError('Could not open billing settings. Please try again.');
      } else if (kind === 'cancel') {
        await undoMembershipCancel();
        onChanged('Your membership will continue. The cancellation was undone.');
      } else {
        await undoScheduledDowngrade();
        onChanged('Your scheduled change was undone. You will stay on your current membership.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const pastDue = !!membership.past_due_since && membership.membership_tier !== 'white';
  const graceEnds = pastDue
    ? new Date(new Date(membership.past_due_since!).getTime() + GRACE_DAYS * 86400000).toISOString()
    : null;
  const cancelling = membership.cancel_at_period_end && membership.membership_tier !== 'white';
  const downgrade = !cancelling && membership.scheduled_tier && membership.scheduled_tier !== membership.membership_tier
    ? membership.scheduled_tier
    : null;

  if (!pastDue && !cancelling && !downgrade) return null;

  return (
    <div className="mx-auto mb-6 max-w-[1180px] space-y-3 px-5">
      {pastDue && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:p-5">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">Past Due: update your card</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              We could not process your last payment. Your benefits stay active until {formatDate(graceEnds)}.
              After that, your membership moves to White.
            </p>
          </div>
          <button
            type="button"
            onClick={() => run('card')}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:opacity-60"
          >
            {busy === 'card' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Update Card
          </button>
        </div>
      )}
      {(cancelling || downgrade) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:flex-row sm:items-center sm:p-5">
          <CalendarClock className="h-5 w-5 shrink-0 text-stone-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-stone-900">
              {cancelling
                ? `Your membership ends on ${formatDate(membership.current_period_end)}`
                : `Switching to ${tierLabels[downgrade!]} at your next billing date`}
            </p>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              {cancelling
                ? 'You keep every benefit until then, and then move to White. Changed your mind? Undo below.'
                : 'You keep your current benefits until the switch. You can undo this any time before then.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => run(cancelling ? 'cancel' : 'downgrade')}
            disabled={busy !== null}
            className="btn-secondary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm"
          >
            {busy === 'cancel' || busy === 'downgrade' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            {cancelling ? 'Keep My Membership' : 'Undo Change'}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Loader2, ListOrdered, AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/cn';
import { parseSupabaseError } from '@/shared/errors';
import { formatCents } from '@/domains/treasury/services';
import { toggleInitiativeBacking, type InitiativeHub, type RankingItem } from '@/domains/initiatives/services';
import { EmptyState, OrgMark } from '@/domains/initiatives/components/initiative-ui';

function projectedTopFive(items: RankingItem[], availableCents: number): Set<string> {
  const picked = new Set<string>();
  const orgs = new Set<string>();
  for (const item of items) {
    if (picked.size >= 5) break;
    if (orgs.has(item.organization_id) || item.amount_requested_cents > availableCents) continue;
    picked.add(item.initiative_id);
    orgs.add(item.organization_id);
  }
  return picked;
}

export function RankingTab({ hub, onChange }: { hub: InitiativeHub; onChange: () => void }) {
  const [overrides, setOverrides] = useState<Record<string, { backed: boolean; count: number }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(
    () =>
      hub.ranking
        .map((r) => (overrides[r.initiative_id] ? { ...r, i_backed: overrides[r.initiative_id].backed, backer_count: overrides[r.initiative_id].count } : r))
        .sort((a, b) => b.backer_count - a.backer_count || a.created_at.localeCompare(b.created_at)),
    [hub.ranking, overrides],
  );
  const topFive = useMemo(() => projectedTopFive(items, hub.available_cents), [items, hub.available_cents]);
  const belowMinimum = hub.available_cents < hub.min_available_cents;

  const toggle = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await toggleInitiativeBacking(id);
      setOverrides((o) => ({ ...o, [id]: { backed: res.backed, count: res.backer_count } }));
    } catch (e) {
      setError(parseSupabaseError(e));
      onChange();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="frame-intel p-4 flex gap-3 items-start">
        <ListOrdered className="w-4 h-4 text-plum-600 mt-0.5 shrink-0" />
        <p className="text-xs text-stone-600 leading-relaxed">
          Backing is free and builds the live ranking. When voting opens, the Top 5 are frozen onto the ballot,
          with one initiative per organization, and only requests the Treasury can fully cover.
        </p>
      </div>

      {belowMinimum && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 flex gap-3 items-start">
          <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
          <p className="text-xs text-orange-800 leading-relaxed">
            Available Treasury is below {formatCents(hub.min_available_cents)}. If it stays there, the next cycle will be skipped.
          </p>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {items.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="No eligible initiatives yet"
          body="Organization owners can submit an initiative from their organization page. Approved initiatives appear here for backing."
        />
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item, i) => {
            const inTop = topFive.has(item.initiative_id);
            return (
              <li
                key={item.initiative_id}
                className={cn('frame-command p-4 flex items-center gap-3 sm:gap-4 animate-fade-in', inTop && 'ring-1 ring-plum-200')}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center font-display font-bold text-sm shrink-0 tabular-nums',
                  inTop ? 'bg-plum-700 text-white' : 'bg-stone-100 text-stone-500',
                )}>
                  {i + 1}
                </div>
                <OrgMark name={item.organization_name} imageUrl={item.organization_image_url} />
                <Link to={`/initiatives/${item.initiative_id}`} className="flex-1 min-w-0 group">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-stone-900 truncate group-hover:text-plum-700 transition-colors">{item.title}</p>
                    {inTop && (
                      <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-md bg-plum-50 text-plum-700 text-[9px] font-semibold uppercase tracking-wider shrink-0">
                        Top 5 pace
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 truncate">
                    {item.organization_name} · {formatCents(item.amount_requested_cents)}
                  </p>
                </Link>
                <button
                  onClick={() => toggle(item.initiative_id)}
                  disabled={!hub.me.in_metro || busyId === item.initiative_id}
                  title={hub.me.in_metro ? undefined : 'Only members in this Metro can back'}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 shrink-0',
                    item.i_backed
                      ? 'bg-plum-700 border-plum-700 text-white hover:bg-plum-800'
                      : 'bg-white border-stone-200 text-stone-700 hover:border-plum-300 hover:text-plum-700',
                  )}
                  aria-pressed={item.i_backed}
                >
                  {busyId === item.initiative_id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Heart className={cn('w-3.5 h-3.5', item.i_backed && 'fill-current')} />
                  )}
                  <span className="tabular-nums">{item.backer_count}</span>
                </button>
                <ChevronRight className="w-4 h-4 text-stone-300 hidden sm:block shrink-0" />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

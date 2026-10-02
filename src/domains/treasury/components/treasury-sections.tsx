import { Building2, ArrowUpRight, Flag, Unlock } from 'lucide-react';
import { TREASURY_CAPACITY_BANDS } from '@/config/progression-rules';
import {
  formatCents,
  type MetroTreasuryCity,
  type MetroTreasuryRelease,
  type MetroMilestoneEvent,
} from '@/domains/treasury/services';

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-base lg:text-lg font-display font-bold text-stone-900 leading-tight">{title}</h2>
      <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-xs text-stone-500 py-4 text-center">{text}</p>;
}

export function TreasuryCityList({ cities, totalRaisedCents }: { cities: MetroTreasuryCity[]; totalRaisedCents: number }) {
  return (
    <section className="frame-command p-4 lg:p-6">
      <SectionHeader title="Contributions by City" subtitle="Exactly what each city has put into the Metro pool." />
      {cities.length === 0 ? (
        <EmptyNote text="No cities have members here yet." />
      ) : (
        <ul className="divide-y divide-stone-100">
          {cities.map((city) => {
            const share = totalRaisedCents > 0 ? Math.max(0, Math.round((city.contributed_cents / totalRaisedCents) * 100)) : 0;
            return (
              <li key={city.city_id} className="py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-stone-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-stone-900 truncate">{city.name}</p>
                    <p className="text-sm font-display font-bold text-stone-900 tabular-nums shrink-0">
                      {formatCents(city.contributed_cents)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-[width] duration-700 ease-out"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-stone-500 tabular-nums w-24 text-right shrink-0">
                      {city.population.toLocaleString()} members
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function TreasuryReleases({ releases }: { releases: MetroTreasuryRelease[] }) {
  return (
    <section className="frame-command p-4 lg:p-6">
      <SectionHeader title="Releases" subtitle="Verified payments out to funded initiatives." />
      {releases.length === 0 ? (
        <EmptyNote text="No funds have been released yet." />
      ) : (
        <ul className="space-y-2">
          {releases.map((r, i) => (
            <li key={`${r.created_at}-${i}`} className="frame-intel p-3 flex items-center gap-3">
              <ArrowUpRight className="w-4 h-4 text-plum-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-stone-900 truncate">{r.notes ?? 'Initiative funding'}</p>
                <p className="text-[10px] text-stone-500">{new Date(r.created_at).toLocaleDateString()}</p>
              </div>
              <p className="text-sm font-display font-bold text-stone-900 tabular-nums">{formatCents(r.amount_cents)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function TreasuryMilestones({ milestones }: { milestones: MetroMilestoneEvent[] }) {
  return (
    <section className="frame-command p-4 lg:p-6">
      <SectionHeader title="Milestones" subtitle="Permanent unlocks this Metro has earned." />
      {milestones.length === 0 ? (
        <EmptyNote text="The first milestone unlocks at 100 active members." />
      ) : (
        <ol className="relative border-l border-stone-200 ml-2 space-y-4">
          {milestones.map((m, i) => {
            const isQualified = m.event_type === 'qualified';
            const cap = TREASURY_CAPACITY_BANDS[m.capacity_band]?.capacityCents;
            return (
              <li key={`${m.created_at}-${i}`} className="pl-5 relative">
                <span className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-white border-2 border-emerald-600 flex items-center justify-center">
                  {isQualified ? <Flag className="w-2 h-2 text-emerald-700" /> : <Unlock className="w-2 h-2 text-emerald-700" />}
                </span>
                <p className="text-sm font-semibold text-stone-900">
                  {isQualified
                    ? 'Became a Qualified Metro'
                    : `Unlocked ${cap == null ? 'full capacity' : `${formatCents(cap)} capacity`}`}
                </p>
                <p className="text-[11px] text-stone-500 tabular-nums">
                  {new Date(m.created_at).toLocaleDateString()} · {m.population.toLocaleString()} members
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

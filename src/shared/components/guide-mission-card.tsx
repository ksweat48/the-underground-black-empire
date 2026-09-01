import { Flag, Users, Building2 } from 'lucide-react';
import { cn } from '@/shared/cn';
import { GUIDE_MISSIONS, type GuideMissionConfig } from '@/config/guide-dialogue';
import type { EmpireCivilizationName } from '@/config/progression-rules';

export function GuideMissionCard({
  civLevel,
  population,
  tribeCityCount,
  collapsed = false,
  className,
}: {
  civLevel: EmpireCivilizationName;
  population: number;
  tribeCityCount: number;
  collapsed?: boolean;
  className?: string;
}) {
  const config: GuideMissionConfig | undefined = GUIDE_MISSIONS[civLevel];
  if (!config) return null;

  const populationPercent = Math.min(100, Math.round((population / config.progressTarget) * 100));
  const isPopulationComplete = population >= config.progressTarget;
  const tribeTarget = getTribeTarget(civLevel);
  const tribePercent = Math.min(100, Math.round((tribeCityCount / tribeTarget) * 100));
  const isTribeComplete = tribeCityCount >= tribeTarget;
  const isMissionComplete = isPopulationComplete && isTribeComplete;

  return (
    <div
      className={cn(
        'frame-command flex w-full h-full flex-col overflow-hidden transition-all duration-300 ease-out',
        collapsed && 'max-h-0 opacity-0 pointer-events-none mt-0!',
        isMissionComplete && 'border-emerald-600/30',
        className,
      )}
    >
      {/* Header row */}
      <div className="relative z-10 flex items-center gap-2.5 px-3.5 pt-1.5 pb-0 lg:items-center lg:gap-4 lg:px-6 lg:pt-6 lg:pb-2">
        <div className="flex flex-col flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-stone-500 tracking-wide leading-none lg:text-xs lg:tracking-widest lg:uppercase">
            Current Mission
          </p>
          <p className="text-sm font-display font-bold text-stone-900 leading-tight mt-0.5 lg:text-xl lg:mt-1">
            Our 1st Mission
          </p>
        </div>
      </div>

      {/* Mission statement — featured centerpiece */}
      <div className="relative z-10 px-3.5 pt-1.5 pb-1 lg:px-6 lg:pt-3 lg:pb-3">
        <div className="frame-intel border-plum-200/70 bg-plum-50/70 p-1.5 shadow-[0_6px_18px_rgba(74,31,74,0.08)] lg:!p-5">
          <div className="flex items-start gap-2 lg:gap-3">
            <Flag className="w-3.5 h-3.5 text-plum-600 shrink-0 mt-0.5 lg:w-5 lg:h-5 lg:mt-1" />
            <p className="text-[12px] font-display font-bold text-stone-900 leading-tight lg:text-lg lg:leading-snug">
              {config.mission}
            </p>
          </div>
          <p className="text-[10px] text-stone-600 leading-snug font-medium mt-1 lg:text-sm lg:leading-relaxed lg:mt-2.5">
            {config.missionDetail}
          </p>
        </div>
      </div>

      {/* Objective modules — stat box + progress bar paired per column */}
      <div className="relative z-10 grid grid-cols-2 gap-2 px-3.5 pb-1.5 lg:flex-1 lg:items-center lg:gap-4 lg:px-6 lg:pb-6">
        {/* Population column */}
        <div className="flex flex-col gap-1.5 lg:gap-2">
          <div className="frame-intel flex items-center gap-1.5 px-2 py-1.5 lg:flex-col lg:items-center lg:justify-center lg:gap-0.5 lg:px-0 lg:py-4">
            <Users className="w-3.5 h-3.5 shrink-0 text-stone-700 lg:w-5 lg:h-5" />
            <div className="flex flex-col min-w-0 lg:items-center">
              <p className="text-sm font-display font-bold text-stone-900 tabular-nums leading-none lg:text-3xl">
                {population.toLocaleString()}
              </p>
              <p className="text-[7px] text-stone-500 uppercase tracking-wider leading-none truncate lg:text-xs lg:leading-normal lg:truncate-none">
                of {config.progressTarget.toLocaleString()} {config.progressLabel}
              </p>
            </div>
          </div>
          <div className="space-y-0.5 lg:space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-semibold text-stone-700 uppercase tracking-wider lg:text-xs">
                Population
              </p>
              <p className="text-[10px] text-stone-600 tabular-nums lg:text-sm">
                {populationPercent}%
              </p>
            </div>
            <div className="progress-track lg:!h-3">
              <div
                className={cn('progress-fill', isPopulationComplete && 'progress-fill-complete')}
                style={{ width: `${populationPercent}%` }}
              >
                <span className="progress-shimmer" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>

        {/* Tribe Cities column */}
        <div className="flex flex-col gap-1.5 lg:gap-2">
          <div className="frame-intel flex items-center gap-1.5 px-2 py-1.5 lg:flex-col lg:items-center lg:justify-center lg:gap-0.5 lg:px-0 lg:py-4">
            <Building2 className="w-3.5 h-3.5 shrink-0 text-stone-700 lg:w-5 lg:h-5" />
            <div className="flex flex-col min-w-0 lg:items-center">
              <p className="text-sm font-display font-bold text-stone-900 tabular-nums leading-none lg:text-3xl">
                {tribeCityCount.toLocaleString()}
              </p>
              <p className="text-[7px] text-stone-500 uppercase tracking-wider leading-none truncate lg:text-xs lg:leading-normal lg:truncate-none">
                of {tribeTarget.toLocaleString()} Cities
              </p>
            </div>
          </div>
          <div className="space-y-0.5 lg:space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-semibold text-stone-700 uppercase tracking-wider lg:text-xs">
                Tribe Cities
              </p>
              <p className="text-[10px] text-stone-600 tabular-nums lg:text-sm">
                {tribePercent}%
              </p>
            </div>
            <div className="progress-track lg:!h-3">
              <div
                className={cn('progress-fill', isTribeComplete && 'progress-fill-complete')}
                style={{ width: `${tribePercent}%` }}
              >
                <span className="progress-shimmer" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {isMissionComplete && (
        <p className="relative z-10 text-[10px] text-emerald-700 font-semibold text-center pb-1.5 lg:text-sm lg:pb-6">
          Mission complete — reward unlocked!
        </p>
      )}
    </div>
  );
}

function getTribeTarget(level: EmpireCivilizationName): number {
  const targets: Record<EmpireCivilizationName, number> = {
    outpost: 10,
    settlement: 20,
    village: 30,
    province: 40,
    kingdom: 50,
    dominion: 100,
    empire: 200,
  };
  return targets[level] ?? 10;
}

import type { ReactNode } from 'react';
import { Flag, MapPinned, TrendingUp } from 'lucide-react';
import { cn } from '@/shared/cn';
import { GUIDE_MISSIONS } from '@/config/guide-dialogue';
import {
  EMPIRE_STAGES,
  QUALIFIED_METRO_MIN_MEMBERS,
  getNextEmpireStage,
  type EmpireStageName,
} from '@/config/progression-rules';

export interface LeadingMetro {
  name: string;
  population: number;
}

export function GuideMissionCard({
  stage,
  qualifiedMetroCount,
  leadingMetro,
  collapsed = false,
  className,
}: {
  stage: EmpireStageName;
  qualifiedMetroCount: number;
  leadingMetro: LeadingMetro | null;
  collapsed?: boolean;
  className?: string;
}) {
  const config = GUIDE_MISSIONS[stage];
  const nextStage = getNextEmpireStage(stage);
  const target = nextStage?.requiredQualifiedMetros ?? config.qualifiedMetroTarget;
  const metroPercent = Math.min(100, Math.round((qualifiedMetroCount / target) * 100));
  const isMissionComplete = qualifiedMetroCount >= target;

  const leadingPopulation = leadingMetro?.population ?? 0;
  const leadingPercent = Math.min(100, Math.round((leadingPopulation / QUALIFIED_METRO_MIN_MEMBERS) * 100));

  const progressLine = nextStage
    ? `Qualified Metros: ${qualifiedMetroCount} of ${target} toward ${EMPIRE_STAGES[nextStage.name].label}`
    : `Qualified Metros: ${qualifiedMetroCount}`;

  return (
    <div
      className={cn(
        'frame-command flex w-full h-full flex-col overflow-hidden transition-all duration-300 ease-out',
        collapsed && 'max-h-0 opacity-0 pointer-events-none mt-0!',
        isMissionComplete && 'border-emerald-600/30',
        className,
      )}
    >
      <div className="relative z-10 flex items-center gap-2.5 px-3.5 pt-1.5 pb-0 lg:items-center lg:gap-4 lg:px-6 lg:pt-6 lg:pb-2">
        <div className="flex flex-col flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-stone-500 tracking-wide leading-none lg:text-xs lg:tracking-widest lg:uppercase">
            Current Mission · {EMPIRE_STAGES[stage].label}
          </p>
          <p className="text-sm font-display font-bold text-stone-900 leading-tight mt-0.5 lg:text-xl lg:mt-1 tabular-nums">
            {progressLine}
          </p>
        </div>
      </div>

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

      <div className="relative z-10 grid grid-cols-2 gap-2 px-3.5 pb-1.5 lg:flex-1 lg:items-center lg:gap-4 lg:px-6 lg:pb-6">
        <ProgressColumn
          icon={<MapPinned className="w-3.5 h-3.5 shrink-0 text-stone-700 lg:w-5 lg:h-5" />}
          value={qualifiedMetroCount.toLocaleString()}
          caption={`of ${target} Metros`}
          label="Qualified Metros"
          percent={metroPercent}
          complete={isMissionComplete}
        />
        <ProgressColumn
          icon={<TrendingUp className="w-3.5 h-3.5 shrink-0 text-stone-700 lg:w-5 lg:h-5" />}
          value={leadingPopulation.toLocaleString()}
          caption={`of ${QUALIFIED_METRO_MIN_MEMBERS} members`}
          label={leadingMetro ? `Next: ${leadingMetro.name}` : 'Next Metro'}
          percent={leadingPercent}
          complete={false}
        />
      </div>

      {isMissionComplete && (
        <p className="relative z-10 text-[10px] text-emerald-700 font-semibold text-center pb-1.5 lg:text-sm lg:pb-6">
          Mission complete — the next stage has been reached.
        </p>
      )}
    </div>
  );
}

function ProgressColumn({
  icon,
  value,
  caption,
  label,
  percent,
  complete,
}: {
  icon: ReactNode;
  value: string;
  caption: string;
  label: string;
  percent: number;
  complete: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0 lg:gap-2">
      <div className="frame-intel flex items-center gap-1.5 px-2 py-1.5 lg:flex-col lg:items-center lg:justify-center lg:gap-0.5 lg:px-0 lg:py-4">
        {icon}
        <div className="flex flex-col min-w-0 lg:items-center">
          <p className="text-sm font-display font-bold text-stone-900 tabular-nums leading-none lg:text-3xl">
            {value}
          </p>
          <p className="text-[7px] text-stone-500 uppercase tracking-wider leading-none truncate lg:text-xs lg:leading-normal">
            {caption}
          </p>
        </div>
      </div>
      <div className="space-y-0.5 lg:space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] font-semibold text-stone-700 uppercase tracking-wider truncate lg:text-xs">
            {label}
          </p>
          <p className="text-[10px] text-stone-600 tabular-nums lg:text-sm">{percent}%</p>
        </div>
        <div className="progress-track lg:!h-3">
          <div
            className={cn('progress-fill', complete && 'progress-fill-complete')}
            style={{ width: `${percent}%` }}
          >
            <span className="progress-shimmer" aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}

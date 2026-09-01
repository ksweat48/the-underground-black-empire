import { cn } from '@/shared/cn';
import type { EmpireCivilizationName } from '@/config/progression-rules';
import { PROGRESSION_RULES } from '@/config/progression-rules';
import { LevelRibbonSvg } from '@/shared/components/empire-svg-frames';

const CIVILIZATION_ORDER: EmpireCivilizationName[] = [
  'outpost', 'settlement', 'village', 'province', 'kingdom', 'dominion', 'empire',
];

interface CivilizationRibbonProps {
  civLevel: EmpireCivilizationName;
  onClick?: () => void;
  className?: string;
}

export function CivilizationRibbon({ civLevel, onClick, className }: CivilizationRibbonProps) {
  const civIndex = CIVILIZATION_ORDER.indexOf(civLevel);
  const levelLabel = PROGRESSION_RULES.empire.civilization[civLevel]?.label ?? civLevel;

  return (
    <div className={cn('flex justify-center', className)}>
      <button
        onClick={onClick}
        className="civ-ribbon group cursor-pointer transition-transform hover:scale-[1.02] active:scale-100"
        aria-label={`Empire Level ${civIndex + 1}: ${levelLabel}. Click to view all empire levels.`}
      >
        {/* SVG ribbon overlay — decorative angular plate */}
        <LevelRibbonSvg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1 }}
        />
        <span className="civ-ribbon-emblem" aria-hidden="true" />
        <span className="civ-level-text text-[11px] font-display font-bold uppercase tracking-[0.15em] group-hover:opacity-90 transition-opacity relative z-10">
          Lvl {civIndex + 1} — {levelLabel}
        </span>
        <span className="civ-ribbon-emblem" aria-hidden="true" />
      </button>
    </div>
  );
}

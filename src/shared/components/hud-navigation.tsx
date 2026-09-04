import { useState, useEffect, type ComponentType } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  User,
  Users,
  Bell,
  Lock,
  CreditCard,
  Store,
  Vote as VoteIcon,
  Plus,
  Landmark,
} from 'lucide-react';
import { cn } from '@/shared/cn';
import { GlassModal } from '@/shared/components/glass-modal';
import { EmpireFrame } from '@/shared/components/empire-frame';
import { EmpireEmblem } from '@/shared/components/empire-emblem';
import { EmpireEmblemIcon } from '@/shared/components/empire-emblem-icon';
import type { EmpireProgressData } from '@/domains/founder-campaign/services';
import type { EmpireCivilizationName } from '@/config/progression-rules';
import { PROGRESSION_RULES } from '@/config/progression-rules';
import { useCreateSheet } from '@/shared/components/create-sheet';

interface HudNavigationProps {
  empire: EmpireProgressData;
  civLevel: EmpireCivilizationName;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const CIVILIZATION_ORDER: EmpireCivilizationName[] = [
  'outpost', 'settlement', 'village', 'province', 'kingdom', 'dominion', 'empire',
];

/* ===================== TOP HUD ===================== */

export function HudTopBar({ empire, civLevel }: HudNavigationProps) {
  const navigate = useNavigate();
  const [showPopulationModal, setShowPopulationModal] = useState(false);
  const [showCivModal, setShowCivModal] = useState(false);
  const [showTreasuryModal, setShowTreasuryModal] = useState(false);

  const civLabel = civLevel.charAt(0).toUpperCase() + civLevel.slice(1);

  return (
    <>
      <div className="hud-top animate-slide-down" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* ===== Command Bar — smooth black panel ===== */}
      <div className="px-2 sm:px-3 pt-2">
        <div className="command-bar relative max-w-empire mx-auto">
          <div className="relative z-10 flex flex-col px-2 pt-2 pb-1.5 gap-1.5">
            <div className="relative flex items-center justify-between min-h-10">
              {/* Left: Civilization levels */}
              <button
                onClick={() => setShowCivModal(true)}
                className="command-bar-slot group shrink-0"
                aria-label={`Empire Level: ${civLabel}. Click to view all empire levels.`}
              >
                <div className="icon-circle-sm">
                  <div className="icon-circle-inner">
                    <Landmark className="w-5 h-5 text-empire-text-muted group-hover:text-empire-gold transition-colors" />
                  </div>
                </div>
              </button>

              {/* Center: Empire logo */}
              <button
                onClick={() => navigate('/empire')}
                className="group absolute left-1/2 z-20 -translate-x-1/2 shrink-0"
                aria-label="Go to Empire dashboard"
              >
                <img
                  src="/the_underground_black_empire_logo.png"
                  alt="The Underground Empire"
                  className="h-10 w-auto object-contain transition-transform group-hover:scale-105"
                />
              </button>

              {/* Right: Notifications */}
              <div className="flex items-center gap-0.5 shrink-0 relative z-30 ml-auto">
                <button
                  className="command-bar-slot group relative shrink-0"
                  aria-label="Notifications"
                >
                  <div className="icon-circle-sm">
                    <div className="icon-circle-inner">
                      <Bell className="w-5 h-5 text-empire-text-muted group-hover:text-empire-gold transition-colors" />
                    </div>
                  </div>
                  <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-empire-accent z-20" style={{ boxShadow: '0 0 4px rgba(255,90,22,0.6)' }} />
                </button>
              </div>
            </div>

            {/* ===== Empire status row ===== */}
            <div className="flex items-center gap-1 min-w-0">
              <button
                onClick={() => setShowPopulationModal(true)}
                className="command-bar-slot group flex-1 justify-center min-w-0"
                aria-label="View population stats"
              >
                <div className="flex flex-col items-center leading-none">
                  <span className="text-[8px] font-semibold text-empire-text-muted uppercase tracking-wider">Population</span>
                  <span className="text-xs font-display font-bold text-empire-white group-hover:text-empire-gold transition-colors tabular-nums">
                    {formatCompact(empire.total_population)}
                  </span>
                </div>
              </button>

              <div className="command-bar-divider shrink-0" />

              <button
                onClick={() => navigate('/membership')}
                className="group flex-1 flex flex-col items-center justify-center gap-0.5 py-0.5 min-w-0"
                aria-label="View membership options"
              >
                <CreditCard className="w-4 h-4 text-[#B48A3C] transition-colors group-hover:text-empire-gold" strokeWidth={2} />
                <span className="text-[10px] font-display font-bold text-[#B48A3C] uppercase tracking-widest leading-none transition-colors group-hover:text-empire-gold">
                  Member
                </span>
              </button>

              <div className="command-bar-divider shrink-0" />

              {/* Treasury — locked at Outpost */}
              <button
                onClick={() => setShowTreasuryModal(true)}
                className="command-bar-slot group flex-1 justify-center min-w-0"
                aria-label="Treasury — locked"
              >
                <div className="flex flex-col items-center leading-none">
                  <span className="text-[8px] font-semibold text-empire-text-muted uppercase tracking-wider">Treasury</span>
                  <span className="text-[9px] text-empire-text-muted leading-none">Locked</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Modals rendered outside hud-top to avoid backdrop-filter containing block */}
      {/* Population breakdown modal */}
      <GlassModal open={showPopulationModal} onClose={() => setShowPopulationModal(false)} title="Empire Statistics">
        <div className="space-y-3">
          <StatRow icon={Users} label="Population" value={formatCompact(empire.total_population)} />
          <StatRow icon={EmpireEmblemIcon} label="Tribe Cities" value={empire.tribe_city_count} />
        </div>
      </GlassModal>

      {/* Treasury locked modal */}
      <GlassModal open={showTreasuryModal} onClose={() => setShowTreasuryModal(false)} title="Treasury">
        <div className="text-center py-6 space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-empire-gold/5 border border-empire-gold/15">
            <Lock className="w-6 h-6 text-empire-text-muted" />
          </div>
          <p className="text-sm text-sand">The Treasury unlocks when the Empire reaches the <span className="text-empire-gold font-semibold">Settlement</span> stage.</p>
          <p className="text-xs text-stone">Raise 10 Tribe Cities and a population of 1000 to advance the civilization to Settlement.</p>
        </div>
      </GlassModal>

      {/* Civilization levels modal */}
      <GlassModal open={showCivModal} onClose={() => setShowCivModal(false)} title="Empire Levels">
        <p className="text-sm text-stone mb-4">
          As more cities reach Tribe status, the Empire advances through seven stages.
        </p>
        <div className="space-y-2">
          {CIVILIZATION_ORDER.map((key, idx) => {
            const level = PROGRESSION_RULES.empire.civilization[key];
            const isCurrent = civLevel === key;
            const currentIdx = CIVILIZATION_ORDER.indexOf(civLevel);
            const isPast = idx < currentIdx;
            return (
              <div
                key={key}
                className={cn(
                  'p-3 border transition-all',
                  isCurrent
                    ? 'bg-empire-gold/10 border-empire-gold/20 glow-gold'
                    : isPast
                      ? 'bg-emerald-500/10 border-emerald-500/20 opacity-60'
                      : 'bg-ink-800/20 border-ink-700/20',
                )}
                style={{ borderRadius: 'var(--radius-card-sm)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div className={cn(
                    'w-8 h-8 rounded-lg border flex items-center justify-center shrink-0',
                    isCurrent
                      ? 'bg-empire-gold/10 border-empire-gold/30'
                      : isPast
                        ? 'bg-emerald-500/10 border-emerald-500/20'
                        : 'bg-ink-800/20 border-ink-700/20',
                  )}>
                    <EmpireEmblem variant="light" className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-medium text-ivory flex-1">{level.label}</p>
                  {isCurrent && <span className="badge-gold text-[10px] py-0.5 px-1.5 inline-block">Current</span>}
                  {isPast && <span className="badge-emerald text-[10px] py-0.5 px-1.5 inline-block">Done</span>}
                </div>
                <p className="text-xs text-stone mt-2">{level.description}</p>
                <p className="text-[10px] text-stone/70 mt-1 font-medium uppercase tracking-wide">{level.requirementShort}</p>
              </div>
            );
          })}
        </div>
      </GlassModal>
    </>
  );
}

/* ===================== STAT ROW ===================== */

function StatRow({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <EmpireFrame variant="utility" className="p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="icon-circle-sm !w-7 !h-7">
            <div className="icon-circle-inner">
              <Icon className="w-5 h-5 text-empire-gold" />
            </div>
          </div>
          <span className="text-sm font-medium text-sand">{label}</span>
        </div>
        <span className="text-xl font-display font-bold text-ivory tabular-nums">{value}</span>
      </div>
    </EmpireFrame>
  );
}

/* ===================== BOTTOM NAVIGATION ===================== */

export function HudBottomBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { openSheet } = useCreateSheet();

  const isEmpire = location.pathname === '/empire';
  const isMarket = location.pathname.startsWith('/market');
  const isVote = location.pathname === '/vote';
  const isProfile = location.pathname === '/profile';

  return (
    <div className="hud-bottom">
      <div className="hud-bottom-card relative z-10 flex items-center justify-between gap-0.5 py-1.5 px-2 max-w-empire w-full">
        {/* Empire */}
        <button
          onClick={() => navigate('/empire')}
          className={cn('hud-btn flex-1 max-w-[90px]', isEmpire && 'hud-btn-active')}
          aria-label="Empire dashboard"
          aria-current={isEmpire ? 'page' : undefined}
        >
          <EmpireEmblem variant="light" className={cn('w-4 h-4 transition-transform', isEmpire && 'scale-110')} />
          <span className="text-[10px] font-medium">Empire</span>
          {isEmpire && <span className="hud-btn-indicator" />}
        </button>

        {/* Market */}
        <button
          onClick={() => navigate('/market')}
          className={cn('hud-btn flex-1 max-w-[90px]', isMarket && 'hud-btn-active')}
          aria-label="Market"
          aria-current={isMarket ? 'page' : undefined}
        >
          <Store className={cn('w-4 h-4 transition-colors', isMarket ? 'text-empire-gold' : 'text-empire-text-muted')} />
          <span className="text-[10px] font-medium">Market</span>
          {isMarket && <span className="hud-btn-indicator" />}
        </button>

        {/* Create — prominent center button */}
        <button
          onClick={openSheet}
          className="relative flex flex-col items-center justify-center shrink-0"
          aria-label="Create"
          style={{ marginTop: '-18px' }}
        >
          <div
            className="flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #333333, #171717)',
              border: '2px solid rgba(255,255,255,0.85)',
              boxShadow: '0 4px 16px rgba(17,17,17,0.30), 0 2px 8px rgba(17,17,17,0.15), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <Plus className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[10px] font-medium text-empire-text-muted mt-0.5">Create</span>
        </button>

        {/* Vote */}
        <button
          onClick={() => navigate('/vote')}
          className={cn('hud-btn flex-1 max-w-[90px]', isVote && 'hud-btn-active')}
          aria-label="Vote"
          aria-current={isVote ? 'page' : undefined}
        >
          <VoteIcon className={cn('w-4 h-4 transition-colors', isVote ? 'text-empire-gold' : 'text-empire-text-muted')} />
          <span className="text-[10px] font-medium">Vote</span>
          {isVote && <span className="hud-btn-indicator" />}
        </button>

        {/* Profile */}
        <button
          onClick={() => navigate('/profile')}
          className={cn('hud-btn flex-1 max-w-[90px]', isProfile && 'hud-btn-active')}
          aria-label="Profile"
          aria-current={isProfile ? 'page' : undefined}
        >
          <User className={cn('w-4 h-4 transition-colors', isProfile ? 'text-empire-gold' : 'text-empire-text-muted')} />
          <span className="text-[10px] font-medium">Profile</span>
          {isProfile && <span className="hud-btn-indicator" />}
        </button>
      </div>
    </div>
  );
}

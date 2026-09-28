import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  User,
  Store,
  Vote as VoteIcon,
  Plus,
  Landmark,
} from 'lucide-react';
import { cn } from '@/shared/cn';
import { GlassModal } from '@/shared/components/glass-modal';
import { EmpireEmblem } from '@/shared/components/empire-emblem';
import { NotificationBell } from '@/shared/components/notification-bell';
import type { EmpireProgressData } from '@/domains/founder-campaign/services';
import type { EmpireCivilizationName } from '@/config/progression-rules';
import { PROGRESSION_RULES } from '@/config/progression-rules';
import { useCreateSheet } from '@/shared/components/create-sheet';

interface HudNavigationProps {
  empire: EmpireProgressData;
  civLevel: EmpireCivilizationName;
}

const CIVILIZATION_ORDER: EmpireCivilizationName[] = [
  'outpost', 'settlement', 'village', 'province', 'kingdom', 'dominion', 'empire',
];

/* ===================== TOP HUD ===================== */

export function HudTopBar({ civLevel }: HudNavigationProps) {
  const navigate = useNavigate();
  const [showCivModal, setShowCivModal] = useState(false);

  const civLabel = civLevel.charAt(0).toUpperCase() + civLevel.slice(1);

  return (
    <>
      <div className="hud-top animate-slide-down" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* ===== Command Bar — smooth black panel ===== */}
      <div className="px-2 sm:px-3 pt-2">
        <div className="command-bar relative max-w-empire mx-auto">
          <div className="relative z-10 flex flex-col px-2 pt-2 pb-1 gap-1">
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
                  src="/UBE_logo2.png"
                  alt="The Underground Empire"
                  className="h-10 w-auto object-contain transition-transform group-hover:scale-105"
                />
              </button>

              {/* Right: Notifications */}
              <div className="flex items-center gap-0.5 shrink-0 relative z-30 ml-auto">
                <NotificationBell />
              </div>
            </div>


          </div>
        </div>
      </div>
      </div>

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

/* ===================== BOTTOM NAVIGATION ===================== */

export function HudDesktopRail() {
  const location = useLocation();
  const navigate = useNavigate();
  const { openSheet } = useCreateSheet();

  const items = [
    { label: 'Empire', path: '/empire', active: location.pathname === '/empire', isEmpire: true },
    { label: 'Market', icon: Store, path: '/market', active: location.pathname.startsWith('/market'), isEmpire: false },
    { label: 'Vote', icon: VoteIcon, path: '/vote', active: location.pathname === '/vote', isEmpire: false },
    { label: 'Profile', icon: User, path: '/profile', active: location.pathname === '/profile', isEmpire: false },
  ];

  return (
    <aside className="desktop-nav-rail" aria-label="Primary navigation">
      <button onClick={() => navigate('/empire')} className="desktop-nav-brand" aria-label="Go to Empire dashboard">
        <EmpireEmblem variant="light" className="w-9 h-9 object-contain" />
        <span className="desktop-nav-brand-name">THE UNDERGROUND<br />BLACK EMPIRE</span>
      </button>

      <nav className="desktop-nav-links">
        {items.map(({ label, icon: Icon, path, active, isEmpire }) => (
          <button
            key={label}
            onClick={() => navigate(path)}
            className={cn('desktop-nav-link', active && 'desktop-nav-link-active')}
            aria-current={active ? 'page' : undefined}
          >
            {isEmpire ? (
              <EmpireEmblem variant="light" className="w-[18px] h-[18px] object-contain" />
            ) : (
              <Icon className="w-[18px] h-[18px]" />
            )}
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="desktop-nav-footer">
        <button onClick={openSheet} className="desktop-create-button">
          <Plus className="w-4 h-4" />
          <span>Create</span>
        </button>
        <p className="desktop-nav-caption">Build locally. Move collectively.</p>
      </div>
    </aside>
  );
}

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

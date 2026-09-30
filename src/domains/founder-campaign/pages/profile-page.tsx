import { useEffect, useState, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  Trophy,
  Copy,
  Check,
  CheckCircle2,
  Lock,
  Sparkles,
  Award,
  CreditCard,
  Shield,
  Mail,
  Loader2,
  Users,
  Star,
  Share2,
  Settings,
  TrendingUp,
  Camera,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { GlassModal } from '@/shared/components/glass-modal';
import { Avatar } from '@/shared/components/avatar';
import { EmpireEmblem } from '@/shared/components/empire-emblem';
import { ProfilePhotoUploader } from '@/shared/components/profile-photo-uploader';
import { MemberProfileModal } from '@/shared/components/member-profile-modal';
import { useAuth } from '@/domains/identity/auth-context';
import { supabase } from '@/shared/supabase-client';
import {
  getCityTier,
  getLevelFromInfluence,
  getLevelThreshold,
  getVotingPowerBreakdown,
  type CityTierName,
} from '@/config/progression-rules';
import {
  fetchLeaderboard,
  fetchCityWithMetro,
  fetchInfluence,
  type LeaderboardEntry,
} from '@/domains/founder-campaign/services';
import { fetchVotingPower } from '@/domains/market/services';
import { APP_CONFIG } from '@/config/app';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '@/shared/cn';
import { Store, Heart, ChevronRight, Pencil, MessageSquarePlus } from 'lucide-react';
import { fetchMyListings, fetchSavedListings, type MarketListing } from '@/domains/market/services';
import { fetchMyMembership, type MemberMembership } from '@/domains/membership/services';
import type { MembershipTierId, CardColor } from '@/domains/membership/types';
import {
  EthnicIdentitySelector,
  ETHNIC_IDENTITY_LABELS,
  type EthnicIdentityValue,
} from '@/shared/components/ethnic-identity-selector';
import {
  GenderSelector,
  GENDER_LABELS,
  type GenderValue,
} from '@/shared/components/gender-selector';
import {
  SupportRoleSelector,
  SUPPORT_ROLE_LABELS,
  type SupportRole,
} from '@/shared/components/support-role-selector';
import { ProfessionAutocomplete } from '@/shared/components/profession-autocomplete';
import { parseSupabaseError } from '@/shared/errors';
import { Scale, Lock as LockIcon, XCircle, Clock } from 'lucide-react';
import {
  fetchLeadershipEligibility,
  fetchMyNominationStatus,
  acceptLeadershipNomination,
  declineLeadershipNomination,
  type LeadershipEligibility,
  type MyNominationStatus,
} from '@/domains/leadership/services';

/* ---------- Status Titles ---------- */

const STATUS_TIERS = [
  { title: 'Advocate', minLevel: 1 },
  { title: 'Champion', minLevel: 6 },
  { title: 'Steward', minLevel: 11 },
  { title: 'Guardian', minLevel: 16 },
  { title: 'Vanguard', minLevel: 21 },
  { title: 'Luminary', minLevel: 26 },
] as const;

function getStatusTitle(level: number): string {
  let title = STATUS_TIERS[0].title;
  for (const tier of STATUS_TIERS) {
    if (level >= tier.minLevel) title = tier.title;
  }
  return title;
}

function getNextStatusMilestone(level: number): { title: string; level: number } | null {
  for (const tier of STATUS_TIERS) {
    if (level < tier.minLevel) return { title: tier.title, level: tier.minLevel };
  }
  return null;
}

/* ---------- Types ---------- */

interface MemberProfile {
  display_name: string | null;
  founder_number: number | null;
  member_number: number | null;
  city_name: string | null;
  city_population_count: number | null;
  city_tier: string | null;
  state: string | null;
  influence: number;
  referral_count: number;
  verified_referral_count: number;
  ethnic_identity: EthnicIdentityValue | null;
  ethnic_identity_detail: string | null;
  gender: GenderValue | null;
  gender_detail: string | null;
  date_of_birth: string | null;
  support_role: SupportRole | null;
  support_role_detail: string | null;
  occupation: string | null;
  avatar_url: string | null;
}

interface MetroData {
  name: string;
  rank: number;
  populationCount: number;
  cityCount: number;
  metroId: string | null;
}

type LeaderboardTab = 'local' | 'empire';

/* ---------- Main Component ---------- */

export function ProfilePage() {
  const { session, signOut, sessionVersion } = useAuth();
  const [member, setMember] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [influence, setInfluence] = useState(0);
  const [votingPower, setVotingPower] = useState(1.0);
  const [activeStatPill, setActiveStatPill] = useState<'level' | 'influence' | 'vp' | null>(null);
  const [metroData, setMetroData] = useState<MetroData | null>(null);

  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>('local');
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardPreview, setLeaderboardPreview] = useState<LeaderboardEntry[]>([]);
  const [leaderboardPreviewLoading, setLeaderboardPreviewLoading] = useState(false);
  const [viewingMemberId, setViewingMemberId] = useState<string | null>(null);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  const [referralCode, setReferralCode] = useState('');
  const [referralStats, setReferralStats] = useState({ total: 0, verified: 0, pending: 0 });
  const [copied, setCopied] = useState(false);
  const [myListings, setMyListings] = useState<MarketListing[]>([]);
  const [savedListings, setSavedListings] = useState<MarketListing[]>([]);
  const [myMembership, setMyMembership] = useState<MemberMembership | null>(null);
  const [showIdentityEdit, setShowIdentityEdit] = useState(false);
  const [editEthnicSelected, setEditEthnicSelected] = useState<EthnicIdentityValue | null>(null);
  const [editEthnicDetail, setEditEthnicDetail] = useState('');
  const [editGender, setEditGender] = useState<GenderValue | null>(null);
  const [editGenderDetail, setEditGenderDetail] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editSupportRole, setEditSupportRole] = useState<SupportRole | null>(null);
  const [editSupportRoleDetail, setEditSupportRoleDetail] = useState('');
  const [editOccupation, setEditOccupation] = useState('');
  const [editIdentityError, setEditIdentityError] = useState<string | null>(null);
  const [editIdentitySaving, setEditIdentitySaving] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [showPhotoEdit, setShowPhotoEdit] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [leadershipEligibility, setLeadershipEligibility] = useState<LeadershipEligibility | null>(null);
  const [myNominationStatus, setMyNominationStatus] = useState<MyNominationStatus | null>(null);
  const [acceptanceActionLoading, setAcceptanceActionLoading] = useState(false);
  const [acceptanceError, setAcceptanceError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const navigate = useNavigate();

  const memberId = session?.user.id ?? null;
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);

  // Fetch member profile
  useEffect(() => {
    if (!memberId) { setLoading(false); return; }
    fetchMemberProfile(memberId).then((m) => { setMember(m); setProfileError(null); }).catch((err: unknown) => { setProfileError(err instanceof Error ? err.message : 'Unknown error'); }).finally(() => setLoading(false));
  }, [memberId, sessionVersion]);

  // Fetch influence
  useEffect(() => {
    if (!memberId) return;
    fetchInfluence(memberId).then(setInfluence).catch(() => {});
  }, [memberId, sessionVersion]);

  // Fetch voting power and credits
  useEffect(() => {
    if (!memberId) return;
    fetchVotingPower(memberId).then(setVotingPower).catch(() => {});
  }, [memberId, sessionVersion]);

  // Fetch metro data
  useEffect(() => {
    if (!memberId || !member?.city_name) return;
    supabase
      .from('members')
      .select('city_id')
      .eq('id', memberId)
      .maybeSingle()
      .then(({ data: memberRow, error }) => {
        if (error || !memberRow?.city_id) return;
        supabase
          .from('cities')
          .select('id, metro_id')
          .eq('id', memberRow.city_id)
          .maybeSingle()
          .then(({ data: cityData, error: cityError }) => {
            if (cityError || !cityData?.id) return;
            fetchCityWithMetro(cityData.id).then((metro) => {
              if (metro) {
                setMetroData({
                  name: metro.metro_name ?? 'Unassigned',
                  rank: metro.metro_rank,
                  populationCount: metro.metro_population_count,
                  cityCount: metro.metro_city_count,
                  metroId: cityData.metro_id,
                });
              }
            });
          });
      });
  }, [memberId, member?.city_name, sessionVersion]);

  // Fetch referral data
  useEffect(() => {
    if (!memberId) return;
    Promise.all([
      supabase.from('members').select('referral_code').eq('id', memberId).maybeSingle(),
      supabase.from('referrals').select('status').eq('referring_member_id', memberId),
    ]).then(([memberRes, refRes]) => {
      if (memberRes.data) setReferralCode((memberRes.data as { referral_code: string }).referral_code ?? '');
      const refs = refRes.data ?? [];
      setReferralStats({
        total: refs.length,
        verified: refs.filter((r) => r.status === 'verified').length,
        pending: refs.filter((r) => r.status === 'pending').length,
      });
    }).catch(() => {});
  }, [memberId, sessionVersion]);

  // Check admin status
  useEffect(() => {
    if (!session) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    supabase
      .rpc('is_current_user_admin')
      .then(({ data, error }) => {
        if (!cancelled) setIsAdmin(!error && Boolean(data));
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Fetch market data (my listings + saved listings)
  useEffect(() => {
    if (!memberId) return;
    fetchMyListings(memberId).then(setMyListings).catch(() => {});
    fetchSavedListings(memberId).then(setSavedListings).catch(() => {});
    fetchMyMembership(memberId).then(setMyMembership).catch(() => {});
  }, [memberId, sessionVersion]);

  // Fetch leadership eligibility
  useEffect(() => {
    if (!memberId) return;
    fetchLeadershipEligibility(memberId).then(setLeadershipEligibility).catch(() => {});
  }, [memberId, sessionVersion]);

  // Fetch my nomination status (am I nominated? have I accepted/declined?)
  useEffect(() => {
    if (!memberId || !metroData?.metroId) return;
    fetchMyNominationStatus(memberId, metroData.metroId).then(setMyNominationStatus).catch(() => {});
  }, [memberId, metroData?.metroId, sessionVersion]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideMenu = menuRef.current?.contains(target);
      const insideDropdown = dropdownRef.current?.contains(target);
      if (!insideMenu && !insideDropdown) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  // Fetch leaderboard when modal opens
  useEffect(() => {
    if (!showLeaderboardModal) return;
    setLeaderboardLoading(true);
    const metroId = leaderboardTab === 'local' ? metroData?.metroId : null;
    fetchLeaderboard(50, metroId ?? null)
      .then(setLeaderboardEntries)
      .catch(() => setLeaderboardEntries([]))
      .finally(() => setLeaderboardLoading(false));
  }, [showLeaderboardModal, leaderboardTab, metroData?.metroId]);

  // Fetch leaderboard preview on page load
  useEffect(() => {
    if (!memberId) return;
    setLeaderboardPreviewLoading(true);
    const metroId = metroData?.metroId ?? null;
    fetchLeaderboard(12, metroId ?? null)
      .then(setLeaderboardPreview)
      .catch(() => setLeaderboardPreview([]))
      .finally(() => setLeaderboardPreviewLoading(false));
  }, [memberId, metroData?.metroId]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-ink-400 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!member) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <p className="text-ink-300">Unable to load profile.</p>
          {profileError && (
            <p className="text-xs text-crimson-300 font-mono break-all max-w-md text-center">{profileError}</p>
          )}
        </div>
      </Layout>
    );
  }

  const cityTier: CityTierName = member.city_population_count ? getCityTier(member.city_population_count) : 'group';
  const founderLevel = getLevelFromInfluence(influence);
  const initials = getInitials(member.display_name || 'Member');
  const referralLink = `${window.location.origin}/auth/sign-up?ref=${referralCode || 'PENDING'}`;

  const statusTitle = getStatusTitle(founderLevel.level);
  const nextMilestone = getNextStatusMilestone(founderLevel.level);
  const currentLevelStart = getLevelThreshold(founderLevel.level);
  const ringRadius = 52;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const levelSpan = founderLevel.nextThreshold !== null ? founderLevel.nextThreshold - currentLevelStart : 1;
  const levelProgress = founderLevel.nextThreshold !== null ? Math.min(1, Math.max(0, (influence - currentLevelStart) / levelSpan)) : 1;
  const ringDashOffset = ringCircumference * (1 - levelProgress);
  const influenceToGo = founderLevel.nextThreshold !== null ? Math.max(0, founderLevel.nextThreshold - influence) : 0;

  const membershipTier: MembershipTierId = myMembership?.membership_tier ?? 'white';
  const profileCardColor = MEMBERSHIP_CARD_COLOR[membershipTier];
  const profileCardConfig = PROFILE_CARD_STYLE[profileCardColor];
  const cardLabel = CARD_LABELS[membershipTier];

  const achievements = getAchievements(member, cityTier);
  const unlockedBadges = achievements.filter((a) => a.unlocked).length;

  const myRank = leaderboardEntries.findIndex((e) => e.member_id === memberId);
  const myEntry = myRank >= 0 ? leaderboardEntries[myRank] : null;

  const handleShareReferral = async () => {
    const shareData = {
      title: 'The Underground Black Empire',
      text: 'Join the Empire and earn Influence. Every verified referral earns you 25 Influence.',
      url: referralLink,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(referralLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch { /* clipboard unavailable */ }
    }
  };

  return (
    <Layout fullWidth>
      <div className="fixed inset-0 z-[1] pointer-events-none bg-radial-warm opacity-50" />

      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto scrollbar-none w-full max-w-[960px] lg:max-w-[1100px] mx-auto px-2 sm:px-3 pt-3 pb-24 lg:pb-10 space-y-4">
        {/* Two-column grid on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Left column: Profile + City */}
          <div className="space-y-4">
        {/* Empire Status Card — centered avatar in gold progress ring */}
        <section className="card-white-member p-6 animate-fade-up flex flex-col items-center" style={{ animationDelay: '50ms' }}>
          {/* Gear menu — top right */}
          <div className="absolute top-4 right-4 z-20" ref={menuRef}>
            <button
              ref={gearRef}
              onClick={() => {
                if (!showMenu && gearRef.current) {
                  const rect = gearRef.current.getBoundingClientRect();
                  setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                }
                setShowMenu(!showMenu);
              }}
              className="p-2 rounded-lg transition-colors text-stone-500 hover:text-stone-800 hover:bg-stone-200/60"
              aria-label="Menu"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Gold progress ring with avatar centered inside */}
          <button
            onClick={() => setShowProfileModal(true)}
            className="relative group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50 rounded-full"
            aria-label="View profile details"
          >
            <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
              <defs>
                <linearGradient id="goldRing" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#D4AF37" />
                  <stop offset="50%" stopColor="#F4D03F" />
                  <stop offset="100%" stopColor="#B8860B" />
                </linearGradient>
              </defs>
              <circle cx="64" cy="64" r={ringRadius} fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="4" />
              <circle
                cx="64" cy="64" r={ringRadius}
                fill="none"
                stroke="url(#goldRing)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringDashOffset}
                style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="w-20 h-20 rounded-full overflow-hidden transition-transform group-hover:scale-105 flex items-center justify-center"
                style={{
                  background: 'linear-gradient(160deg, #F0F0F0, #D8D8D8)',
                  border: '2px solid rgba(0,0,0,0.08)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 4px 12px rgba(0,0,0,0.10)',
                }}
              >
                <Avatar
                  src={member.avatar_url}
                  initials={initials}
                  initialsClassName="font-display font-bold text-xl"
                  initialsStyle={{ color: '#1a1815', textShadow: '0 1px 2px rgba(255,255,255,0.6)' }}
                />
              </div>
            </div>
          </button>

          {/* Status Title */}
          <h2 className="font-display text-lg font-bold tracking-[0.15em] text-stone-900 mt-4">{statusTitle.toUpperCase()}</h2>

          {/* Membership Card — clickable, separate from earned status */}
          <button
            type="button"
            onClick={() => navigate('/membership')}
            aria-label="View membership options"
            className="mt-3 w-full max-w-[260px] flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl border border-stone-200/80 bg-stone-50/80 hover:bg-stone-100/80 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50"
          >
            <div className="flex items-center gap-2 min-w-0">
              <CreditCard className="w-4 h-4 text-stone-600 shrink-0" />
              <span className="text-xs font-semibold text-stone-700 truncate">Member — {cardLabel}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
          </button>

          {/* Stats Row — Level | Influence | Voting Power */}
          <div className="mt-5 w-full max-w-[320px] grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1.5">
            <StatButton
              label="Level"
              value={String(founderLevel.level)}
              icon={Star}
              variant="white"
              isActive={activeStatPill === 'level'}
              onClick={() => setActiveStatPill(activeStatPill === 'level' ? null : 'level')}
            />
            <div className="stat-divider-white" aria-hidden="true" />
            <StatButton
              label="Influence"
              value={`${influence}/${founderLevel.nextThreshold ?? 'MAX'}`}
              icon={TrendingUp}
              variant="white"
              isActive={activeStatPill === 'influence'}
              onClick={() => setActiveStatPill(activeStatPill === 'influence' ? null : 'influence')}
            />
            <div className="stat-divider-white" aria-hidden="true" />
            <StatButton
              label="Voting Power"
              value={`${votingPower.toFixed(2)}×`}
              variant="white"
              accent
              isActive={activeStatPill === 'vp'}
              onClick={() => setActiveStatPill(activeStatPill === 'vp' ? null : 'vp')}
            />
          </div>

          {/* Dropdown explanation pill */}
          {activeStatPill && (
            <div className="mt-3 w-full max-w-[320px] animate-fade-up">
              <StatPill
                type={activeStatPill}
                level={founderLevel.level}
                influence={influence}
              />
            </div>
          )}
        </section>

        {/* Progress Section — Next Level + Next Status */}
        <section className="card-white-member p-5 animate-fade-up" style={{ animationDelay: '75ms' }}>
          {founderLevel.nextThreshold !== null ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider text-stone-500">Next Level: Level {founderLevel.level + 1}</span>
                <span className="text-xs tabular-nums font-semibold text-stone-900">{influence} / {founderLevel.nextThreshold} Influence</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill progress-fill-xp"
                  style={{ width: `${Math.min(100, (influence / founderLevel.nextThreshold) * 100)}%` }}
                >
                  <span className="progress-shimmer" aria-hidden="true" />
                </div>
              </div>
              <p className="text-[11px] text-stone-500 mt-2 text-center">
                {influenceToGo.toLocaleString()} Influence to go
              </p>
            </>
          ) : (
            <p className="text-xs text-stone-500 text-center">Maximum level reached</p>
          )}

          {nextMilestone && (
            <div className="mt-3 pt-3 border-t border-stone-200/60 text-center">
              <span className="text-[10px] uppercase tracking-wider text-stone-400">
                Next Status: {nextMilestone.title} — Level {nextMilestone.level}
              </span>
            </div>
          )}
        </section>

        {/* Referrals Card — solid green with matching card effects */}
        <section
          role="button"
          tabIndex={0}
          aria-label="Share your referral link"
          onClick={handleShareReferral}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleShareReferral();
            }
          }}
          className="rounded-[8px] bg-emerald-700 border border-emerald-500/60 p-4 animate-fade-up cursor-pointer transition-all duration-200 hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          style={{ animationDelay: '100ms', boxShadow: 'var(--shadow-card-sm), var(--shadow-inset-highlight), var(--shadow-inset-shadow)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="font-display text-sm font-semibold text-white truncate">Referrals</h2>
              <span className="text-[10px] text-white/80 italic shrink-0">Share to earn influence</span>
            </div>
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white shrink-0"
            >
              {copied ? <Check className="w-4 h-4 text-white" /> : <Share2 className="w-4 h-4" />}
            </span>
          </div>
          <div className="mt-3 flex items-center gap-2.5 text-xs text-white/90 pl-6">
            <span><strong className="tabular-nums text-white">{referralStats.total}</strong> Total</span>
            <span className="text-white/60">·</span>
            <span><strong className="tabular-nums text-white">{referralStats.verified}</strong> Verified</span>
            <span className="text-white/60">·</span>
            <span><strong className="tabular-nums text-white">{referralStats.pending}</strong> Pending</span>
          </div>
        </section>

        {/* Leaderboard Avatar Strip */}
        <section className="glass-card p-4 animate-fade-up" style={{ animationDelay: '100ms' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-ink-400" />
              <h2 className="font-display text-sm font-semibold text-ink-100">Leaderboard</h2>
            </div>
            <button
              onClick={() => { setLeaderboardTab(metroData?.metroId ? 'local' : 'empire'); setShowLeaderboardModal(true); }}
              className="text-xs text-ink-300 hover:text-ink-100 transition-colors"
            >
              View All
            </button>
          </div>
          {leaderboardPreviewLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-4 h-4 text-ink-400 animate-spin" />
            </div>
          ) : leaderboardPreview.length === 0 ? (
            <p className="text-xs text-ink-400 text-center py-4">No leaders yet</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
              {leaderboardPreview.map((entry, idx) => {
                const name = entry.display_name ?? 'Member';
                const initials = getInitials(name);
                return (
                  <button
                    key={entry.member_id}
                    onClick={() => setViewingMemberId(entry.member_id)}
                    className="flex flex-col items-center gap-1 shrink-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400 rounded-lg p-1"
                  >
                    <div className="relative">
                      <div
                        className="w-12 h-12 rounded-full overflow-hidden border-2 border-ink-700/30 transition-transform group-hover:scale-105"
                        style={{
                          background: 'linear-gradient(160deg, #2A2A2A, #0A0A0A)',
                          boxShadow: '0 0 0 2px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 12px rgba(0,0,0,0.40)',
                        }}
                      >
                        <Avatar
                          src={entry.avatar_url}
                          initials={initials}
                          initialsClassName="text-sm"
                          initialsStyle={{ color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.65)' }}
                        />
                      </div>
                      <span
                        className={`absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                          idx === 0
                            ? 'bg-amber-400 text-amber-950 border-amber-300'
                            : idx === 1
                            ? 'bg-gray-300 text-gray-800 border-gray-200'
                            : idx === 2
                            ? 'bg-orange-400 text-orange-950 border-orange-300'
                            : 'bg-ink-800 text-ink-200 border-ink-700/40'
                        }`}
                      >
                        {idx + 1}
                      </span>
                    </div>
                    <span className="text-[10px] text-ink-300 max-w-[56px] truncate text-center">
                      {name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Leadership Card */}
        <section className="glass-card p-4 animate-fade-up" style={{ animationDelay: '150ms' }}>
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-4 h-4 text-ink-400" />
            <h2 className="font-display text-sm font-semibold text-ink-100">Leadership</h2>
          </div>
          {leadershipEligibility === null ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-4 h-4 text-ink-400 animate-spin" />
            </div>
          ) : !leadershipEligibility.eligible ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <LockIcon className="w-4 h-4 text-ink-500" />
                <p className="text-sm font-medium text-ink-300">Locked</p>
              </div>
              <p className="text-xs text-ink-400">
                Reach the required Level, verification, membership status, and good standing to become eligible.
              </p>
              {leadershipEligibility.reasons.length > 0 && (
                <ul className="text-xs text-ink-500 space-y-1 mt-2">
                  {leadershipEligibility.reasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-1.5">
                      <span className="text-ink-600 mt-0.5">-</span>
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <p className="text-sm font-medium text-ink-100">Eligible for Leadership</p>
              </div>
              <p className="text-xs text-ink-400">
                Members in your Metro can nominate you for leadership. If nominated, you must accept the nomination before the nomination period closes to appear on the election ballot.
              </p>

              {myNominationStatus && myNominationStatus.nomination_count > 0 && (
                <div className="rounded-xl border border-ink-700/30 bg-ink-800/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-empire-gold" />
                    <p className="text-sm font-medium text-ink-100">
                      You have {myNominationStatus.nomination_count} nomination{myNominationStatus.nomination_count !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {myNominationStatus.acceptance_status === 'accepted' && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      You have accepted. You will appear on the ballot if you make the finalists.
                    </div>
                  )}

                  {myNominationStatus.acceptance_status === 'declined' && (
                    <div className="flex items-center gap-2 text-xs text-crimson-400">
                      <XCircle className="w-3.5 h-3.5" />
                      You have declined. You will not appear on the election ballot.
                    </div>
                  )}

                  {myNominationStatus.acceptance_status === null && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-amber-400">
                        <Clock className="w-3.5 h-3.5" />
                        Accept by the nomination deadline to appear on the ballot.
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            setAcceptanceActionLoading(true);
                            setAcceptanceError(null);
                            try {
                              await acceptLeadershipNomination(myNominationStatus.cycle_id);
                              setMyNominationStatus({ ...myNominationStatus, acceptance_status: 'accepted' });
                            } catch (err) {
                              setAcceptanceError(err instanceof Error ? err.message : 'Failed to accept');
                            } finally {
                              setAcceptanceActionLoading(false);
                            }
                          }}
                          disabled={acceptanceActionLoading}
                          className="btn-primary flex-1 text-xs py-2 disabled:opacity-50"
                        >
                          {acceptanceActionLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Accept
                            </>
                          )}
                        </button>
                        <button
                          onClick={async () => {
                            setAcceptanceActionLoading(true);
                            setAcceptanceError(null);
                            try {
                              await declineLeadershipNomination(myNominationStatus.cycle_id);
                              setMyNominationStatus({ ...myNominationStatus, acceptance_status: 'declined' });
                            } catch (err) {
                              setAcceptanceError(err instanceof Error ? err.message : 'Failed to decline');
                            } finally {
                              setAcceptanceActionLoading(false);
                            }
                          }}
                          disabled={acceptanceActionLoading}
                          className="btn-secondary flex-1 text-xs py-2 disabled:opacity-50"
                        >
                          {acceptanceActionLoading ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" />
                              Decline
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {acceptanceError && (
                    <p className="text-xs text-crimson-300">{acceptanceError}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

          </div>

          {/* Right column: Listings */}
          <div className="space-y-4">
        {/* My Listings */}
        <section className="glass-card p-4 animate-fade-up" style={{ animationDelay: '250ms' }}>
          <div className="flex items-center gap-2 mb-3">
            <Store className="w-4 h-4 text-ink-400" />
            <h2 className="font-display text-sm font-semibold text-ink-100">My Listings</h2>
          </div>
          {myListings.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-ink-400">No listings yet.</p>
              <button onClick={() => navigate('/market/create/listing')} className="btn-secondary text-xs mt-2">
                List a Business
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {myListings.map((listing) => (
                <div
                  key={listing.id}
                  className="w-full rounded-xl bg-ink-800/20 border border-ink-700/15 hover:border-ink-600/30 transition-all"
                >
                  <button
                    onClick={() => navigate(`/market/listing/${listing.id}`)}
                    className="w-full flex items-center justify-between gap-2 p-2.5 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-100 truncate">{listing.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-ink-500 capitalize">{listing.category}</span>
                        <span className="text-ink-600">·</span>
                        <span className={cn(
                          'text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-md',
                          listing.status === 'approved' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                          listing.status === 'in_review' && 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                          listing.status === 'needs_changes' && 'bg-crimson-500/10 text-crimson-400 border border-crimson-500/20',
                        )}>
                          {listing.status === 'in_review' ? 'In Review' : listing.status === 'needs_changes' ? 'Changes Needed' : listing.status === 'approved' ? 'Approved' : listing.status}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-500 shrink-0" />
                  </button>
                  <div className="flex gap-1.5 px-2.5 pb-2.5">
                    <button
                      onClick={() => navigate(`/market/edit-listing/${listing.id}`)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-ink-700/30 text-ink-200 hover:bg-ink-600/40 transition-all"
                    >
                      <Pencil className="w-3 h-3" />
                      Edit
                    </button>
                    {listing.status === 'approved' && (
                      <button
                        onClick={() => navigate(`/market/create/update?listing=${listing.id}`)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-empire-gold/10 text-empire-gold hover:bg-empire-gold/20 transition-all border border-empire-gold/20"
                      >
                        <MessageSquarePlus className="w-3 h-3" />
                        Share an Update
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Saved Listings */}
        <section className="glass-card p-4 animate-fade-up" style={{ animationDelay: '300ms' }}>
          <div className="flex items-center gap-2 mb-3">
            <Heart className="w-4 h-4 text-ink-400" />
            <h2 className="font-display text-sm font-semibold text-ink-100">Favorites</h2>
          </div>
          {savedListings.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-ink-400">No favorites yet.</p>
              <p className="text-xs text-ink-500 mt-1">Browse the Market and tap the heart to save listings.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {savedListings.map((listing) => (
                <button
                  key={listing.id}
                  onClick={() => navigate(`/market/listing/${listing.id}`)}
                  className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-ink-800/20 border border-ink-700/15 hover:border-ink-600/30 transition-all text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-100 truncate">{listing.name}</p>
                    <p className="text-xs text-ink-500 capitalize">{listing.category}{listing.city_name ? ` · ${listing.city_name}` : ''}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-500 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <div className="pt-2 pb-4 text-center">
          <p className="text-xs text-ink-500">&copy; {new Date().getFullYear()} {APP_CONFIG.name}</p>
        </div>
          </div>
        </div>
      </div>

      {/* Gear menu dropdown — fixed positioned to escape ancestor clipping */}
      {showMenu && menuPos && (
        <div
          ref={dropdownRef}
          className="fixed w-56 rounded-xl border border-white/20 p-2 space-y-0.5 shadow-2xl shadow-black/60 z-[100]"
          style={{ top: menuPos.top, right: menuPos.right, backgroundColor: '#082916' }}
        >
          <a
            href={`mailto:${APP_CONFIG.supportEmail}`}
            className="flex w-full items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-emerald-50 hover:text-white hover:bg-emerald-700/60 transition-colors"
            onClick={() => setShowMenu(false)}
          >
            <Mail className="w-3.5 h-3.5 flex-shrink-0 text-white" />
            Support
          </a>
          {isAdmin && (
            <Link
              to="/admin"
              className="flex w-full items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-emerald-50 hover:text-white hover:bg-emerald-700/60 transition-colors"
              onClick={() => setShowMenu(false)}
            >
              <Shield className="w-3.5 h-3.5 flex-shrink-0 text-white" />
              Admin Console
            </Link>
          )}
          <div className="border-t border-white/15 my-1" />
          <button
            onClick={() => { setShowMenu(false); signOut(); }}
            className="flex w-full items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-emerald-50 hover:text-crimson-300 hover:bg-crimson-900/40 transition-colors"
          >
            <Shield className="w-3.5 h-3.5 flex-shrink-0 text-white" />
            Sign Out
          </button>
        </div>
      )}

      {/* Leaderboard Modal */}
      <GlassModal
        open={showLeaderboardModal}
        onClose={() => setShowLeaderboardModal(false)}
        title="Leaderboard"
      >
        <div>
          {/* Tabs */}
          <div className="seg-control seg-control-wide mb-4">
            <button
              className={cn('seg-btn', leaderboardTab === 'local' && 'seg-btn-active', !metroData?.metroId && 'opacity-35 cursor-not-allowed pointer-events-none')}
              onClick={() => metroData?.metroId && setLeaderboardTab('local')}
              disabled={!metroData?.metroId}
            >
              Local Rank
            </button>
            <button
              className={cn('seg-btn', leaderboardTab === 'empire' && 'seg-btn-active')}
              onClick={() => setLeaderboardTab('empire')}
            >
              Empire Rank
            </button>
          </div>

          {leaderboardLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto scrollbar-thin">
              {myEntry && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-display font-bold text-emerald-300 text-lg">#{myRank + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-ink-100">{myEntry.display_name || `Member #${myEntry.member_number ?? myEntry.founder_number ?? '?'}`}</p>
                        <p className="text-xs text-ink-400">{myEntry.city_name ?? 'No city'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-300">{myEntry.influence} Inf</p>
                      <p className="text-xs text-ink-400">{myEntry.referral_count} referrals</p>
                    </div>
                  </div>
                </div>
              )}
              {leaderboardEntries.map((entry, i) => {
                const rank = i + 1;
                const isMe = entry.member_id === memberId;
                if (isMe) return null;
                return (
                  <div
                    key={entry.member_id}
                    className={cn(
                      'flex items-center gap-3 p-2.5 rounded-xl',
                      isMe ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-ink-800/20',
                    )}
                  >
                    <div className="flex items-center gap-2 w-8">
                      {rank === 1 && <EmpireEmblem variant="dark" className="w-4 h-4" />}
                      {rank === 2 && <Trophy className="w-4 h-4 text-teal-300" />}
                      {rank === 3 && <Trophy className="w-4 h-4 text-emerald-400" />}
                      {rank > 3 && <span className="text-sm text-ink-500 font-display font-bold">{rank}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink-100 truncate">
                        {entry.display_name || `Member #${entry.member_number ?? entry.founder_number ?? '?'}`}
                      </p>
                      <p className="text-xs text-ink-500 truncate">{entry.city_name ?? 'No city'}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-ink-200 tabular-nums">{entry.influence}</p>
                      <p className="text-xs text-ink-500">Inf</p>
                    </div>
                  </div>
                );
              })}
              {leaderboardEntries.length === 0 && (
                <p className="text-sm text-ink-400 text-center py-6">No members found.</p>
              )}
            </div>
          )}
        </div>
      </GlassModal>

      {/* Member Profile Modal (for leaderboard avatar clicks) */}
      <MemberProfileModal
        memberId={viewingMemberId}
        onClose={() => setViewingMemberId(null)}
        currentUserId={memberId}
      />

      {/* Profile Details Modal */}
      <GlassModal
        open={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        title="Profile"
      >
        <div className="space-y-5">
          {/* Identity */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setPhotoDataUrl(null);
                setPhotoError(null);
                setShowPhotoEdit(true);
              }}
              className="relative flex-shrink-0 group rounded-full"
              aria-label="Edit profile photo"
            >
              <div
                className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/25 shadow-lg shadow-black/40 flex items-center justify-center transition-transform group-hover:scale-105"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 8px 24px rgba(0,0,0,0.4)' }}
              >
                <Avatar
                  src={member.avatar_url}
                  initials={initials}
                  initialsClassName="bg-gradient-to-br from-empire-black-750 to-empire-black-900 font-display font-bold text-xl text-white"
                  initialsStyle={{ textShadow: '0 1px 3px rgba(0,0,0,0.65)' }}
                />
              </div>
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                <Camera className="w-5 h-5 text-white" />
              </div>
            </button>
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold text-ink-100 truncate">{member.display_name || 'Member'}</h3>
              <p className="text-xs text-ink-400 truncate">{session?.user.email ?? ''}</p>
            </div>
          </div>

          {/* Photo Editor */}
          {showPhotoEdit && (
            <div className="p-3 rounded-xl bg-ink-800/30 border border-ink-700/20 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-ink-500 uppercase tracking-wider">Profile Photo</p>
                <button
                  onClick={() => { setShowPhotoEdit(false); setPhotoDataUrl(null); setPhotoError(null); }}
                  className="text-[10px] text-gold-400 hover:text-gold-300 font-medium uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>
              <ProfilePhotoUploader onPhotoReady={setPhotoDataUrl} />
              {photoError && <p className="text-sm text-crimson-300 px-1">{photoError}</p>}
              <button
                onClick={async () => {
                  if (!photoDataUrl) {
                    setPhotoError('Please select a photo first.');
                    return;
                  }
                  setPhotoSaving(true);
                  setPhotoError(null);
                  try {
                    const { data: sessionData } = await supabase.auth.getSession();
                    if (!sessionData.session) {
                      setPhotoError('Your session has expired. Please sign in again.');
                      navigate('/auth/sign-in');
                      return;
                    }
                    const userId = sessionData.session.user.id;
                    const blob = await (await fetch(photoDataUrl)).blob();
                    const { error: uploadError } = await supabase.storage
                      .from('member-avatars')
                      .upload(`${userId}/avatar.jpg`, blob, {
                        contentType: 'image/jpeg',
                        upsert: true,
                      });
                    if (uploadError) throw uploadError;
                    const { data: urlData } = supabase.storage
                      .from('member-avatars')
                      .getPublicUrl(`${userId}/avatar.jpg`);
                    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
                    const { error: profileError } = await supabase.rpc('update_member_profile', {
                      p_date_of_birth: member.date_of_birth,
                      p_support_role: member.support_role,
                      p_support_role_detail: member.support_role_detail,
                      p_avatar_url: avatarUrl,
                      p_occupation: member.occupation,
                    });
                    if (profileError) throw profileError;
                    setMember((prev) => prev ? { ...prev, avatar_url: avatarUrl } : prev);
                    setShowPhotoEdit(false);
                    setPhotoDataUrl(null);
                  } catch (err) {
                    setPhotoError(parseSupabaseError(err));
                  } finally {
                    setPhotoSaving(false);
                  }
                }}
                disabled={photoSaving || !photoDataUrl}
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {photoSaving ? 'Saving...' : 'Save Photo'}
              </button>
            </div>
          )}

          {/* Location & Level */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-ink-800/30 border border-ink-700/20">
              <p className="text-[10px] text-ink-500 uppercase tracking-wider mb-1">Location</p>
              <p className="text-sm font-medium text-ink-100">
                {member.city_name ? `${member.city_name}${member.state ? `, ${member.state}` : ''}` : 'No city selected'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-ink-800/30 border border-ink-700/20">
              <p className="text-[10px] text-ink-500 uppercase tracking-wider mb-1">Level</p>
              <div className="text-sm font-medium text-ink-100 space-y-0.5">
                <p>Level {founderLevel.level}</p>
                {member.member_number && <p>Member #{member.member_number}</p>}
              </div>
            </div>
          </div>

          {/* Race / Ethnic Identity */}
          <div className="p-3 rounded-xl bg-ink-800/30 border border-ink-700/20">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-ink-500 uppercase tracking-wider">Race / Ethnic Identity</p>
              <button
                onClick={() => {
                  if (showIdentityEdit) {
                    setShowIdentityEdit(false);
                  } else {
                    setEditEthnicSelected(member.ethnic_identity ?? 'black_african_american');
                    setEditEthnicDetail(member.ethnic_identity_detail ?? '');
                    setEditGender(member.gender ?? null);
                    setEditGenderDetail(member.gender_detail ?? '');
                    setEditDob(member.date_of_birth ?? '');
                    setEditSupportRole(member.support_role ?? 'supporter');
                    setEditSupportRoleDetail(member.support_role_detail ?? '');
                    setEditOccupation(member.occupation ?? '');
                    setEditIdentityError(null);
                    setShowIdentityEdit(true);
                  }
                }}
                className="text-[10px] text-gold-400 hover:text-gold-300 font-medium uppercase tracking-wider"
              >
                {showIdentityEdit ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {showIdentityEdit ? (
              <div className="mt-2 space-y-4">
                <EthnicIdentitySelector
                  selected={editEthnicSelected}
                  detail={editEthnicDetail}
                  onSelect={(value) => {
                    setEditEthnicSelected(value);
                    setEditIdentityError(null);
                  }}
                  onDetailChange={setEditEthnicDetail}
                  error={null}
                />
                <GenderSelector
                  selected={editGender}
                  detail={editGenderDetail}
                  onSelect={(value) => {
                    setEditGender(value);
                    setEditIdentityError(null);
                  }}
                  onDetailChange={setEditGenderDetail}
                />
                <div>
                  <label htmlFor="edit-dob" className="label-field">
                    Date of Birth
                  </label>
                  <input
                    id="edit-dob"
                    type="date"
                    value={editDob}
                    onChange={(e) => {
                      setEditDob(e.target.value);
                      setEditIdentityError(null);
                    }}
                    max={new Date().toISOString().split('T')[0]}
                    className="input-field cursor-pointer"
                  />
                </div>
                <div>
                  <label htmlFor="edit-occupation" className="label-field">
                    Occupation <span className="text-ink-500">(optional)</span>
                  </label>
                  <ProfessionAutocomplete
                    value={editOccupation}
                    onChange={setEditOccupation}
                    placeholder="Start typing your occupation"
                  />
                </div>
                <SupportRoleSelector
                  selected={editSupportRole}
                  detail={editSupportRoleDetail}
                  onSelect={(value) => {
                    setEditSupportRole(value);
                    setEditSupportRoleDetail('');
                    setEditIdentityError(null);
                  }}
                  onDetailChange={setEditSupportRoleDetail}
                  error={null}
                />
                {editIdentityError && (
                  <p className="text-sm text-crimson-300 px-1">{editIdentityError}</p>
                )}
                <button
                  onClick={async () => {
                    if (!editEthnicSelected) {
                      setEditIdentityError('Please select at least one race / ethnic identity.');
                      return;
                    }
                    if (editEthnicSelected === 'another' && !editEthnicDetail.trim()) {
                      setEditIdentityError('Please describe your race / ethnic identity.');
                      return;
                    }
                    if (!editGender) {
                      setEditIdentityError('Please select your gender.');
                      return;
                    }
                    if (editSupportRole && editSupportRole !== 'supporter' && !editSupportRoleDetail.trim()) {
                      setEditIdentityError('Please provide the required detail for your role.');
                      return;
                    }
                    setEditIdentitySaving(true);
                    setEditIdentityError(null);
                    try {
                      const { data: sessionData } = await supabase.auth.getSession();
                      if (!sessionData.session) {
                        setEditIdentityError('Your session has expired. Please sign in again.');
                        navigate('/auth/sign-in');
                        return;
                      }
                      let avatarUrl: string | null = member.avatar_url;
                      if (photoDataUrl) {
                        const userId = sessionData.session.user.id;
                        const blob = await (await fetch(photoDataUrl)).blob();
                        const { error: uploadError } = await supabase.storage
                          .from('member-avatars')
                          .upload(`${userId}/avatar.jpg`, blob, {
                            contentType: 'image/jpeg',
                            upsert: true,
                          });
                        if (uploadError) throw uploadError;
                        const { data: urlData } = supabase.storage
                          .from('member-avatars')
                          .getPublicUrl(`${userId}/avatar.jpg`);
                        avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
                      }
                      const { error: rpcError } = await supabase.rpc('update_ethnic_identity', {
                        p_ethnic_identity: editEthnicSelected,
                        p_ethnic_identity_detail: editEthnicSelected === 'another' ? editEthnicDetail.trim() : null,
                      });
                      if (rpcError) throw rpcError;
                      const { error: genderError } = await supabase.rpc('update_gender', {
                        p_gender: editGender,
                        p_gender_detail: editGender === 'other' ? editGenderDetail.trim() : null,
                      });
                      if (genderError) throw genderError;
                      const { error: profileError } = await supabase.rpc('update_member_profile', {
                        p_date_of_birth: editDob || null,
                        p_support_role: editSupportRole,
                        p_support_role_detail: editSupportRole && editSupportRole !== 'supporter' ? editSupportRoleDetail.trim() : null,
                        p_avatar_url: avatarUrl,
                        p_occupation: editOccupation.trim() || null,
                      });
                      if (profileError) throw profileError;
                      setMember((prev) => prev ? {
                        ...prev,
                        ethnic_identity: editEthnicSelected,
                        ethnic_identity_detail: editEthnicSelected === 'another' ? editEthnicDetail.trim() : null,
                        gender: editGender,
                        gender_detail: editGender === 'other' ? editGenderDetail.trim() : null,
                        date_of_birth: editDob || null,
                        support_role: editSupportRole,
                        support_role_detail: editSupportRole && editSupportRole !== 'supporter' ? editSupportRoleDetail.trim() : null,
                        occupation: editOccupation.trim() || null,
                        avatar_url: avatarUrl,
                      } : prev);
                      setShowIdentityEdit(false);
                    } catch (err) {
                      setEditIdentityError(parseSupabaseError(err));
                    } finally {
                      setEditIdentitySaving(false);
                    }
                  }}
                  disabled={editIdentitySaving}
                  className="btn-primary w-full mt-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editIdentitySaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            ) : member.ethnic_identity || member.gender || member.date_of_birth || member.support_role ? (
              <div className="space-y-1.5 mt-1">
                {member.ethnic_identity && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-ink-700/40 border border-ink-600/30 text-xs text-ink-200">
                      {ETHNIC_IDENTITY_LABELS[member.ethnic_identity] ?? member.ethnic_identity}
                    </span>
                    {member.ethnic_identity_detail && (
                      <span className="px-2 py-0.5 rounded-md bg-ink-700/40 border border-ink-600/30 text-xs text-ink-200">
                        {member.ethnic_identity_detail}
                      </span>
                    )}
                  </div>
                )}
                {member.gender && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-ink-700/40 border border-ink-600/30 text-xs text-ink-200">
                      {GENDER_LABELS[member.gender] ?? member.gender}
                      {member.gender_detail ? ` — ${member.gender_detail}` : ''}
                    </span>
                  </div>
                )}
                {member.date_of_birth && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-ink-700/40 border border-ink-600/30 text-xs text-ink-200">
                      DOB — {new Date(member.date_of_birth).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>
                )}
                {member.support_role && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-ink-700/40 border border-ink-600/30 text-xs text-ink-200">
                      {SUPPORT_ROLE_LABELS[member.support_role] ?? member.support_role}
                      {member.support_role_detail ? ` — ${member.support_role_detail}` : ''}
                    </span>
                  </div>
                )}
                {member.occupation && (
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-ink-700/40 border border-ink-600/30 text-xs text-ink-200">
                      Occupation — {member.occupation}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-ink-500 mt-0.5">Not set</p>
            )}
          </div>

          {/* Badges */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-ink-400" />
                <h4 className="font-display text-sm font-semibold text-ink-100">Badges</h4>
              </div>
              <span className="text-xs text-ink-400">{unlockedBadges} of {achievements.length} unlocked</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {achievements.map((ach) => {
                const Icon = ach.icon;
                return (
                  <div
                    key={ach.id}
                    className={cn(
                      'p-3 rounded-xl border text-center transition-all',
                      ach.unlocked
                        ? 'bg-ink-200/10 border-ink-300/20'
                        : 'bg-ink-800/20 border-ink-700/20 opacity-50',
                    )}
                  >
                    <div className={cn(
                      'w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center border',
                      ach.unlocked
                        ? 'bg-ink-200/15 border-ink-300/30'
                        : 'bg-ink-800 border-ink-700/40',
                    )}>
                      {ach.unlocked ? (
                        <Icon className="w-5 h-5 text-ink-400" />
                      ) : (
                        <Lock className="w-4 h-4 text-ink-500" />
                      )}
                    </div>
                    <p className={cn('text-xs font-medium', ach.unlocked ? 'text-ink-100' : 'text-ink-500')}>
                      {ach.label}
                    </p>
                    <p className="text-[10px] text-ink-500 mt-0.5">{ach.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </GlassModal>

    </Layout>
  );
}

/* ---------- Stat Button (clickable) ---------- */

function StatButton({ label, value, icon: Icon, locked, variant, isActive, onClick, accent }: {
  label: string;
  value: string;
  icon?: typeof Star;
  locked?: boolean;
  variant?: 'default' | 'emerald' | 'white' | 'black' | 'plum';
  isActive?: boolean;
  onClick?: () => void;
  accent?: boolean;
}) {
  const textClass = accent
    ? variant === 'white' ? 'text-emerald-700' : 'text-emerald-300'
    : locked
    ? 'text-ink-500'
    : variant === 'emerald' ? 'text-emerald-50'
    : variant === 'white' ? 'text-stone-900'
    : variant === 'black' || variant === 'plum' ? 'text-white'
    : 'text-ink-100';
  const iconClass = locked
    ? 'text-ink-600'
    : variant === 'emerald' ? 'text-white'
    : variant === 'white' ? 'text-stone-600'
    : variant === 'black' || variant === 'plum' ? 'text-white/90'
    : 'text-ink-300';
  const labelClass = accent
    ? variant === 'white' ? 'text-emerald-700' : 'text-emerald-300'
    : locked
    ? 'text-ink-500'
    : variant === 'emerald' ? 'text-emerald-100/80'
    : variant === 'white' ? 'text-stone-500'
    : variant === 'black' ? 'text-neutral-400'
    : variant === 'plum' ? 'text-purple-200/70'
    : 'text-ink-500';
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-center rounded-lg transition-all px-0.5 py-0.5',
        isActive && 'ring-1 ring-white/20 bg-white/5',
      )}
    >
      <div className="flex items-center justify-center gap-0.5 mb-0.5">
        {Icon && <Icon className={cn('w-3 h-3 shrink-0', iconClass)} />}
        <p className={cn('text-sm sm:text-base font-display font-bold tabular-nums leading-tight', textClass)}>{value}</p>
      </div>
      <p className={cn('text-[9px] sm:text-[10px] leading-tight', labelClass)}>{label}</p>
    </button>
  );
}

/* ---------- Stat Pill (dropdown explanation) ---------- */

function StatPill({ type, level, influence }: {
  type: 'level' | 'influence' | 'vp';
  level: number;
  influence: number;
}) {
  const colorMap = {
    level: { bg: 'bg-stone-100/90 border-stone-300/50', title: 'text-stone-900', body: 'text-stone-700', muted: 'text-stone-500', value: 'text-stone-900' },
    influence: { bg: 'bg-purple-50/90 border-purple-300/50', title: 'text-purple-900', body: 'text-purple-800', muted: 'text-purple-700', value: 'text-purple-900' },
    vp: { bg: 'bg-emerald-50/90 border-emerald-300/50', title: 'text-emerald-900', body: 'text-emerald-800', muted: 'text-emerald-700', value: 'text-emerald-900' },
  } as const;
  const c = colorMap[type];

  if (type === 'level') {
    return (
      <div className={cn('rounded-xl border p-3 space-y-1.5', c.bg)}>
        <p className={cn('text-xs font-semibold', c.title)}>(LVL) Your Level</p>
        <p className={cn('text-[11px] leading-relaxed', c.body)}>
          Your Level increases as you earn Influence. Higher Levels strengthen your Voting Power and leadership eligibility.
        </p>
        <div className={cn('flex items-center justify-between text-[10px] pt-1', c.muted)}>
          <span>Current Your Level</span>
          <span className={cn('font-bold tabular-nums', c.value)}>{level}</span>
        </div>
      </div>
    );
  }

  if (type === 'influence') {
    return (
      <div className={cn('rounded-xl border p-3 space-y-1.5', c.bg)}>
        <p className={cn('text-xs font-semibold', c.title)}>Influence</p>
        <p className={cn('text-[11px] leading-relaxed', c.body)}>
          Influence measures your contribution to the Empire. Participate, support your community, attend events, complete missions, vote, and refer members to increase your Influence.
        </p>
        <div className={cn('flex items-center justify-between text-[10px] pt-1', c.muted)}>
          <span>Total Influence</span>
          <span className={cn('font-bold tabular-nums', c.value)}>{influence}</span>
        </div>
      </div>
    );
  }

  const vpBreakdown = getVotingPowerBreakdown(level);
  return (
    <div className={cn('rounded-xl border p-3 space-y-2', c.bg)}>
      <p className={cn('text-xs font-semibold', c.title)}>Voting Power (VP)</p>
      <p className={cn('text-[11px] leading-relaxed', c.body)}>
        The strength of your voice in the Empire. Your VP determines how strongly your Voting Credits count.
      </p>
      <div className={cn('space-y-1 text-[10px] pt-1', c.muted)}>
        <div className={cn('flex items-center justify-between pt-1 border-t', c.bg.includes('emerald') ? 'border-emerald-300/30' : 'border-stone-300/30')}>
          <span className="font-semibold">Current VP</span>
          <span className={cn('font-bold tabular-nums', c.value)}>{vpBreakdown.total.toFixed(2)}×</span>
        </div>
        <div className="flex items-center justify-between">
          <span>Maximum VP</span>
          <span className={cn('font-bold tabular-nums', c.muted)}>{vpBreakdown.maxVp.toFixed(2)}×</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Achievements ---------- */

interface Achievement {
  id: string;
  label: string;
  icon: typeof Trophy;
  unlocked: boolean;
  description: string;
}

function getAchievements(member: MemberProfile, cityTier: CityTierName): Achievement[] {
  return [
    { id: 'first_member', label: 'Pioneer', icon: Trophy, unlocked: !!member.founder_number, description: 'One of the first 1,000 members' },
    { id: 'first_referral', label: 'First Referral', icon: Share2, unlocked: member.referral_count > 0, description: 'Invited your first member' },
    { id: 'verified_referral', label: 'Verified Recruiter', icon: CheckCircle2, unlocked: member.verified_referral_count > 0, description: 'Got a verified referral' },
    { id: 'inf_100', label: '100 Influence', icon: TrendingUp, unlocked: member.influence >= 100, description: 'Earned 100 Influence' },
    { id: 'inf_500', label: '500 Influence', icon: TrendingUp, unlocked: member.influence >= 500, description: 'Earned 500 Influence' },
    { id: 'inf_1000', label: '1000 Influence', icon: Sparkles, unlocked: member.influence >= 1000, description: 'Earned 1000 Influence' },
    { id: 'tribe', label: 'Tribe Member', icon: Users, unlocked: cityTier !== 'group', description: 'City reached Tribe status' },
    { id: 'five_referrals', label: 'Recruiter', icon: Users, unlocked: member.referral_count >= 5, description: '5 referrals' },
  ];
}

/* ---------- Helpers ---------- */

function getInitials(name: string): string {
  const parts = name.split(/[\s@._-]/).filter(Boolean);
  if (parts.length === 0) return 'F';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

async function fetchMemberProfile(memberId: string): Promise<MemberProfile | null> {
  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, display_name, founder_number, member_number, city_id, ethnic_identity, ethnic_identity_detail, gender, gender_detail, date_of_birth, support_role, support_role_detail, occupation, avatar_url')
    .eq('id', memberId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) return null;

  const [{ data: influenceData, error: influenceError }, { data: refData, error: refError }, { data: cityData, error: cityError }] = await Promise.all([
    supabase.from('influence_ledger').select('amount').eq('member_id', memberId),
    supabase.from('referrals').select('status').eq('referring_member_id', memberId),
    member.city_id
      ? supabase.from('cities').select('name, tier, population_count, state').eq('id', member.city_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (influenceError) throw influenceError;
  if (refError) throw refError;
  if (cityError) throw cityError;

  const totalInfluence = (influenceData ?? []).reduce((sum, e) => sum + e.amount, 0);
  const refList = refData ?? [];

  return {
    display_name: member.display_name,
    founder_number: member.founder_number,
    member_number: (member as { member_number?: number | null }).member_number ?? null,
    city_name: cityData?.name ?? null,
    city_population_count: cityData?.population_count ?? null,
    city_tier: cityData?.tier ?? null,
    state: cityData?.state ?? null,
    influence: totalInfluence,
    gender: (member as { gender?: GenderValue | null }).gender ?? null,
    gender_detail: (member as { gender_detail?: string | null }).gender_detail ?? null,
    referral_count: refList.length,
    verified_referral_count: refList.filter((r) => r.status === 'verified').length,
    ethnic_identity: (Array.isArray((member as { ethnic_identity?: unknown }).ethnic_identity)
      ? ((member as { ethnic_identity: EthnicIdentityValue[] }).ethnic_identity[0] ?? null)
      : (member as { ethnic_identity?: EthnicIdentityValue | null }).ethnic_identity ?? null),
    ethnic_identity_detail: (member as { ethnic_identity_detail?: string | null }).ethnic_identity_detail ?? null,
    date_of_birth: (member as { date_of_birth?: string | null }).date_of_birth ?? null,
    support_role: (member as { support_role?: SupportRole | null }).support_role ?? null,
    support_role_detail: (member as { support_role_detail?: string | null }).support_role_detail ?? null,
    occupation: (member as { occupation?: string | null }).occupation ?? null,
    avatar_url: (member as { avatar_url?: string | null }).avatar_url ?? null,
  };
}

export default ProfilePage;

// ==================== Profile Membership Card ====================

const MEMBERSHIP_CARD_COLOR: Record<MembershipTierId, CardColor> = {
  white: 'white',
  black: 'black',
  black_plus: 'black',
  emerald: 'emerald',
  plum: 'plum',
};

const CARD_LABELS: Record<MembershipTierId, string> = {
  white: 'Free White Card',
  black: '$2 Black Card',
  black_plus: '$5 Black+ Card',
  emerald: '$10 Emerald Card',
  plum: '$20 Plum Card',
};

interface ProfileCardStyle {
  card: string;
  inset: string;
  textBold: string;
  textMuted: string;
  iconColor: string;
  gearButton: string;
  divider: string;
  statDivider: string;
  statVariant: 'emerald' | 'white' | 'black' | 'plum';
  progressTrack: string;
  avatarStyle: CSSProperties;
  initialsStyle: CSSProperties;
  badgeBg: string;
  badgeBorder: string;
  badgeIcon: string;
}

const PROFILE_CARD_STYLE: Record<CardColor, ProfileCardStyle> = {
  white: {
    card: 'card-white-member',
    inset: 'card-white-inset',
    textBold: 'text-stone-900',
    textMuted: 'text-stone-500',
    iconColor: 'text-stone-700',
    gearButton: 'text-stone-600 hover:text-stone-900 hover:bg-stone-200/60',
    divider: 'divider-gold-soft',
    statDivider: 'stat-divider-white',
    statVariant: 'white',
    progressTrack: 'progress-track',
    avatarStyle: {
      background: 'linear-gradient(160deg, #F0F0F0, #D8D8D8)',
      border: '2px solid rgba(26,24,21,0.15)',
      boxShadow: '0 0 0 3px rgba(26,24,21,0.06), inset 0 1px 0 rgba(255,255,255,0.8), 0 6px 18px rgba(26,24,21,0.12)',
    },
    initialsStyle: { color: '#1a1815', textShadow: '0 1px 2px rgba(255,255,255,0.6)' },
    badgeBg: 'bg-stone-100',
    badgeBorder: 'border-stone-300',
    badgeIcon: 'text-stone-700',
  },
  black: {
    card: 'card-black-member',
    inset: 'card-black-inset',
    textBold: 'text-white',
    textMuted: 'text-neutral-400',
    iconColor: 'text-white',
    gearButton: 'text-neutral-400 hover:text-white hover:bg-white/10',
    divider: 'divider-gold-soft',
    statDivider: 'stat-divider-black',
    statVariant: 'black',
    progressTrack: 'progress-track-dark',
    avatarStyle: {
      background: 'linear-gradient(160deg, #2A2A2A, #0A0A0A)',
      border: '2px solid rgba(255,255,255,0.10)',
      boxShadow: '0 0 0 3px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06), 0 6px 18px rgba(0,0,0,0.50)',
    },
    initialsStyle: { color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.65)' },
    badgeBg: 'bg-black',
    badgeBorder: 'border-white/30',
    badgeIcon: 'text-white',
  },
  emerald: {
    card: 'card-emerald',
    inset: 'card-emerald-inset',
    textBold: 'text-emerald-50',
    textMuted: 'text-emerald-100/80',
    iconColor: 'text-white',
    gearButton: 'text-emerald-50/80 hover:text-white hover:bg-emerald-900/40',
    divider: 'divider-gold-soft',
    statDivider: 'emerald-stat-divider',
    statVariant: 'emerald',
    progressTrack: 'progress-track-dark',
    avatarStyle: {
      background: 'linear-gradient(160deg, #174B36, #08291C)',
      border: '2px solid rgba(51,51,51,0.82)',
      boxShadow: '0 0 0 3px rgba(51,51,51,0.12), inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 18px rgba(0,0,0,0.40)',
    },
    initialsStyle: { color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.65)' },
    badgeBg: 'bg-emerald-950',
    badgeBorder: 'border-white/70',
    badgeIcon: 'text-white',
  },
  plum: {
    card: 'card-plum',
    inset: 'card-plum-inset',
    textBold: 'text-white',
    textMuted: 'text-purple-200/70',
    iconColor: 'text-white',
    gearButton: 'text-purple-200/70 hover:text-white hover:bg-purple-900/40',
    divider: 'divider-gold-soft',
    statDivider: 'stat-divider-plum',
    statVariant: 'plum',
    progressTrack: 'progress-track-dark',
    avatarStyle: {
      background: 'linear-gradient(160deg, #4A1F4A, #2A0F2A)',
      border: '2px solid rgba(255,255,255,0.08)',
      boxShadow: '0 0 0 3px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06), 0 6px 18px rgba(42,15,42,0.40)',
    },
    initialsStyle: { color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.65)' },
    badgeBg: 'bg-purple-950',
    badgeBorder: 'border-white/50',
    badgeIcon: 'text-white',
  },
};



import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import {
  Shield,
  Users,
  Map,
  TrendingUp,
  FileText,
  Settings,
  Loader2,
  BarChart3,
  Activity,
  Crown,
  MessageSquare,
  Store,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { ErrorBanner } from '@/shared/components/error-banner';
import { EmpireEmblemIcon } from '@/shared/components/empire-emblem-icon';
import { supabase } from '@/shared/supabase-client';
import { useAuth } from '@/domains/identity/auth-context';
import { PROGRESSION_RULES, getCityTier } from '@/config/progression-rules';
import { fetchListingsForReview, reviewListing, type ListingForReview, type ReviewAction } from '@/domains/market/services';

interface AdminStats {
  totalPopulation: number;
  activeCities: number;
  tribeCities: number;
  empireProgress: number;
}

interface ReportData {
  signupsLast7Days: number;
  verifiedReferralsLast7Days: number;
  influenceAwardedLast7Days: number;
  groupCities: number;
  tribeCities: number;
  organizationCities: number;
  congregationCities: number;
  coalitionCities: number;
  powerhouseCities: number;
  legacyCities: number;
}

interface FeatureFlagRow {
  key: string;
  label: string;
  status: string;
}

interface AuditLogEntry {
  id: string;
  actor_id: string;
  action: string;
  target_type: string | null;
  created_at: string;
}

interface BreakdownItem {
  gender?: string;
  ethnicity?: string;
  tier?: string;
  count: number;
  percentage: number;
  is_paid?: boolean;
}

interface CommentGroupItem {
  gender?: string;
  ethnicity?: string;
  comment_count: number;
  member_count: number;
  participation_rate: number;
}

interface ActiveUsers {
  daily: number;
  weekly: number;
  monthly: number;
}

interface HighestGroup {
  group_name: string;
  participation_rate: number;
  comment_count: number;
  member_count: number;
}

interface ParticipationStats {
  total_members: number;
  gender_breakdown: BreakdownItem[];
  ethnicity_breakdown: BreakdownItem[];
  membership_breakdown: BreakdownItem[];
  comments_by_gender: CommentGroupItem[];
  comments_by_ethnicity: CommentGroupItem[];
  active_users: ActiveUsers;
  highest_participating_group: HighestGroup;
}

const ETHNICITY_LABELS: Record<string, string> = {
  black_african_american: 'Black / African American',
  african: 'African',
  caribbean: 'Caribbean',
  afro_latino: 'Afro-Latino',
  mixed: 'Mixed / Multiracial',
  another: 'Another',
  unspecified: 'Unspecified',
};

const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  unspecified: 'Unspecified',
};

const TIER_LABELS: Record<string, string> = {
  white: 'White (Free)',
  black: 'Black',
  'black-plus': 'Black+',
  emerald: 'Emerald',
  plum: 'Plum',
};

export function AdminPage() {
  const { sessionVersion } = useAuth();
  const [stats, setStats] = useState<AdminStats>({
    totalPopulation: 0,
    activeCities: 0,
    tribeCities: 0,
    empireProgress: 0,
  });
  const [reports, setReports] = useState<ReportData>({
    signupsLast7Days: 0,
    verifiedReferralsLast7Days: 0,
    influenceAwardedLast7Days: 0,
    groupCities: 0,
    tribeCities: 0,
    organizationCities: 0,
    congregationCities: 0,
    coalitionCities: 0,
    powerhouseCities: 0,
    legacyCities: 0,
  });
  const [flags, setFlags] = useState<FeatureFlagRow[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [participation, setParticipation] = useState<ParticipationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [participationLoading, setParticipationLoading] = useState(true);
  const [reviewListings, setReviewListings] = useState<ListingForReview[]>([]);
  const [reviewLoading, setReviewLoading] = useState(true);
  const [reviewAction, setReviewAction] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewReasonFor, setReviewReasonFor] = useState<string | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [reviewError, setReviewError] = useState(false);
  const [participationError, setParticipationError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from('empire_progress').select('*').eq('id', 1).maybeSingle(),
      supabase.from('cities').select('id, population_count, canonical_status').eq('canonical_status', 'active').gt('population_count', 0),
      supabase
        .from('members')
        .select('created_at')
        .eq('is_founder', true)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase
        .from('referrals')
        .select('status, verified_at')
        .eq('status', 'verified')
        .gte('verified_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase
        .from('influence_ledger')
        .select('amount')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('feature_flags').select('key, label, status').order('status').order('key'),
      supabase
        .from('audit_log')
        .select('id, actor_id, action, target_type, created_at')
        .order('created_at', { ascending: false })
        .limit(20),
    ])
      .then(
        ([
          empireRes,
          citiesRes,
          signupsRes,
          referralsRes,
          influenceRes,
          flagsRes,
          auditRes,
        ]) => {
          const empire = empireRes.data;
          const cities = citiesRes.data ?? [];

          const tierOf = (c: { population_count: number }) => getCityTier(c.population_count);
          const groupCount = cities.filter((c) => tierOf(c) === 'group').length;
          const tribeCount = cities.filter((c) => tierOf(c) === 'tribe').length;
          const orgCount = cities.filter((c) => tierOf(c) === 'organization').length;
          const congCount = cities.filter((c) => tierOf(c) === 'congregation').length;
          const coalCount = cities.filter((c) => tierOf(c) === 'coalition').length;
          const powCount = cities.filter((c) => tierOf(c) === 'powerhouse').length;
          const legacyCount = cities.filter((c) => tierOf(c) === 'legacy_city').length;

          setStats({
            totalPopulation: empire?.total_population ?? 0,
            activeCities: cities.length,
            tribeCities: tribeCount,
            empireProgress: Math.min(
              100,
              Math.round(
                ((empire?.tribe_city_count ?? 0) /
                  PROGRESSION_RULES.empire.unlock.requiredTribeCities) *
                  100,
              ),
            ),
          });

          setReports({
            signupsLast7Days: signupsRes.data?.length ?? 0,
            verifiedReferralsLast7Days: referralsRes.data?.length ?? 0,
            influenceAwardedLast7Days: (influenceRes.data ?? []).reduce(
              (sum, entry) => sum + entry.amount,
              0,
            ),
            groupCities: groupCount,
            tribeCities: tribeCount,
            organizationCities: orgCount,
            congregationCities: congCount,
            coalitionCities: coalCount,
            powerhouseCities: powCount,
            legacyCities: legacyCount,
          });

          setFlags((flagsRes.data ?? []) as FeatureFlagRow[]);
          setAuditLog((auditRes.data ?? []) as AuditLogEntry[]);
        },
      )
      .catch(() => { setStatsError(true); })
      .finally(() => setLoading(false));

    Promise.resolve(supabase.rpc('get_admin_participation_stats'))
      .then(({ data, error }) => {
        if (!error && data) {
          setParticipation(data as ParticipationStats);
        }
      })
      .catch(() => { setParticipationError(true); })
      .finally(() => setParticipationLoading(false));

    Promise.resolve(fetchListingsForReview('in_review', 20))
      .then(setReviewListings)
      .catch(() => { setReviewError(true); })
      .finally(() => setReviewLoading(false));
  }, [sessionVersion]);

  const handleReviewAction = async (listingId: string, action: ReviewAction) => {
    const reason = action !== 'approve' ? reviewReason.trim() : '';
    if (action !== 'approve' && !reason) {
      setReviewReasonFor(listingId);
      return;
    }
    setReviewAction(listingId);
    try {
      await reviewListing(listingId, action, reason);
      setReviewListings((prev) => prev.filter((l) => l.id !== listingId));
      setReviewReason('');
      setReviewReasonFor(null);
    } catch (err) {
      console.error('Review action failed:', err);
      setActionError('Unable to process review. Please try again.');
    } finally {
      setReviewAction(null);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-gold-400 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (statsError) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <ErrorBanner message="Unable to load admin data. Please try again." onRetry={() => window.location.reload()} />
        </div>
      </Layout>
    );
  }

  const activeFlags = flags.filter((f) => f.status === 'active');
  const lockedFlags = flags.filter((f) => f.status === 'locked');

  return (
    <Layout>
      {actionError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-empire-danger/10 border border-empire-danger/20 animate-fade-up mb-4">
          <p className="text-xs text-empire-danger flex-1">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-empire-danger/60 hover:text-empire-danger">
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Shield className="w-7 h-7 text-gold-400" />
          <h1 className="text-3xl font-display font-bold text-ink-100">Admin Console</h1>
        </div>
        <p className="text-ink-400">Administrative controls and reporting for the Pioneer Campaign.</p>
      </div>

      {/* Listing Review Queue */}
      <ListingReviewQueue
        listings={reviewListings}
        loading={reviewLoading}
        hasError={reviewError}
        onRetry={() => { setReviewError(false); fetchListingsForReview('in_review', 20).then(setReviewListings).catch(() => setReviewError(true)).finally(() => setReviewLoading(false)); }}
        reviewAction={reviewAction}
        reviewReasonFor={reviewReasonFor}
        reviewReason={reviewReason}
        onReasonChange={setReviewReason}
        onAction={handleReviewAction}
      />

      {/* Participation Analytics */}
      <ParticipationAnalytics
        stats={participation}
        loading={participationLoading}
        hasError={participationError}
        onRetry={() => { setParticipationError(false); setParticipationLoading(true); supabase.rpc('get_admin_participation_stats').then(({ data, error }) => { if (!error && data) setParticipation(data as ParticipationStats); else setParticipationError(true); }).catch(() => setParticipationError(true)).finally(() => setParticipationLoading(false)); }}
      />

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Users} label="Total Population" value={stats.totalPopulation.toLocaleString()} />
        <StatCard icon={Map} label="Active Cities" value={String(stats.activeCities)} />
        <StatCard icon={EmpireEmblemIcon} label="Tribe Cities" value={String(stats.tribeCities)} />
        <StatCard icon={TrendingUp} label="Empire Progress" value={`${stats.empireProgress}%`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-5 h-5 text-gold-400" />
            <h2 className="font-display text-lg font-semibold text-ink-100">Reports</h2>
          </div>
          <div className="space-y-2">
            <ReportRow label="Member signups (last 7 days)" value={String(reports.signupsLast7Days)} />
            <ReportRow
              label="Verified referrals (last 7 days)"
              value={String(reports.verifiedReferralsLast7Days)}
            />
            <ReportRow
              label="Influence awarded (last 7 days)"
              value={String(reports.influenceAwardedLast7Days)}
            />
            <ReportRow label="Cities at Group status" value={String(reports.groupCities)} />
            <ReportRow label="Cities at Tribe status" value={String(reports.tribeCities)} />
            <ReportRow label="Cities at Organization status" value={String(reports.organizationCities)} />
            <ReportRow label="Cities at Congregation status" value={String(reports.congregationCities)} />
            <ReportRow label="Cities at Coalition status" value={String(reports.coalitionCities)} />
            <ReportRow label="Cities at Powerhouse status" value={String(reports.powerhouseCities)} />
            <ReportRow label="Cities at Legacy City status" value={String(reports.legacyCities)} />
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Settings className="w-5 h-5 text-gold-400" />
            <h2 className="font-display text-lg font-semibold text-ink-100">Feature Flags</h2>
          </div>
          <div className="space-y-2">
            {activeFlags.map((flag) => (
              <div key={flag.key} className="flex items-center justify-between text-sm">
                <span className="text-ink-300">{flag.label}</span>
                <span className="badge-emerald text-xs">Active</span>
              </div>
            ))}
            {lockedFlags.slice(0, 5).map((flag) => (
              <div key={flag.key} className="flex items-center justify-between text-sm">
                <span className="text-ink-400">{flag.label}</span>
                <span className="badge-steel text-xs">Locked</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="w-5 h-5 text-gold-400" />
          <h2 className="font-display text-lg font-semibold text-ink-100">Audit Log</h2>
        </div>
        {auditLog.length === 0 ? (
          <p className="text-sm text-ink-400">No admin actions recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {auditLog.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between text-sm py-2 border-b border-ink-800/50 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <span className="text-gold-300 font-mono text-xs">{entry.action}</span>
                  {entry.target_type && (
                    <span className="text-ink-500 text-xs">{'\u2192'} {entry.target_type}</span>
                  )}
                </div>
                <span className="text-ink-500 text-xs">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function ListingReviewQueue({
  listings,
  loading,
  hasError,
  onRetry,
  reviewAction,
  reviewReasonFor,
  reviewReason,
  onReasonChange,
  onAction,
}: {
  listings: ListingForReview[];
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
  reviewAction: string | null;
  reviewReasonFor: string | null;
  reviewReason: string;
  onReasonChange: (value: string) => void;
  onAction: (listingId: string, action: ReviewAction) => void;
}) {
  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Store className="w-5 h-5 text-gold-400" />
          <h2 className="font-display text-lg font-semibold text-ink-100">Listing Review Queue</h2>
        </div>
        <div className="card p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-gold-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Store className="w-5 h-5 text-gold-400" />
          <h2 className="font-display text-lg font-semibold text-ink-100">Listing Review Queue</h2>
        </div>
        <div className="card p-6">
          <ErrorBanner message="Unable to load listings for review." onRetry={onRetry} />
        </div>
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Store className="w-5 h-5 text-gold-400" />
          <h2 className="font-display text-lg font-semibold text-ink-100">Listing Review Queue</h2>
        </div>
        <div className="card p-6">
          <p className="text-sm text-ink-400">No listings awaiting review.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Store className="w-5 h-5 text-gold-400" />
        <h2 className="font-display text-lg font-semibold text-ink-100">Listing Review Queue</h2>
        <span className="badge-gold text-xs">{listings.length} awaiting</span>
      </div>
      <div className="space-y-3">
        {listings.map((listing) => (
          <div key={listing.id} className="card p-4 space-y-3">
            <div className="flex items-start gap-3">
              {listing.image_url ? (
                <img src={listing.image_url} alt={listing.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-ink-800/50 flex items-center justify-center shrink-0">
                  <Store className="w-6 h-6 text-ink-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-display text-sm font-semibold text-ink-100">{listing.name}</h3>
                <p className="text-xs text-ink-400 mt-0.5">
                  {listing.category} in {listing.city_name}
                </p>
                {listing.description && (
                  <p className="text-xs text-ink-400 mt-1 line-clamp-2">{listing.description}</p>
                )}
                {listing.products_services && (
                  <p className="text-xs text-ink-500 mt-1 line-clamp-1">{listing.products_services}</p>
                )}
                <p className="text-[10px] text-ink-500 mt-1">
                  by {listing.owner_email} on {new Date(listing.created_at).toLocaleDateString()}
                </p>
              </div>
              {listing.price_display && (
                <span className="text-sm font-semibold text-gold-300 shrink-0">{listing.price_display}</span>
              )}
            </div>

            {reviewReasonFor === listing.id && (
              <div className="animate-fade-up">
                <input
                  type="text"
                  value={reviewReason}
                  onChange={(e) => onReasonChange(e.target.value)}
                  placeholder="Reason for changes or removal..."
                  className="input-field text-sm"
                />
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => onAction(listing.id, 'approve')}
                disabled={reviewAction === listing.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
              >
                {reviewAction === listing.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approve
              </button>
              <button
                onClick={() => onAction(listing.id, 'needs_changes')}
                disabled={reviewAction === listing.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-all disabled:opacity-50"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Needs Changes
              </button>
              <button
                onClick={() => onAction(listing.id, 'remove')}
                disabled={reviewAction === listing.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all disabled:opacity-50 ml-auto"
              >
                <XCircle className="w-3.5 h-3.5" />
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ParticipationAnalytics({
  stats,
  loading,
  hasError,
  onRetry,
}: {
  stats: ParticipationStats | null;
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
}) {
  if (loading) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <BarChart3 className="w-5 h-5 text-gold-400" />
          <h2 className="font-display text-lg font-semibold text-ink-100">Participation Analytics</h2>
        </div>
        <div className="card p-8 flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-gold-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (hasError || !stats) {
    return (
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <BarChart3 className="w-5 h-5 text-gold-400" />
          <h2 className="font-display text-lg font-semibold text-ink-100">Participation Analytics</h2>
        </div>
        <div className="card p-6">
          <ErrorBanner message="Unable to load participation data." onRetry={onRetry} />
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <BarChart3 className="w-5 h-5 text-gold-400" />
        <h2 className="font-display text-lg font-semibold text-ink-100">Participation Analytics</h2>
      </div>

      {/* Highest Participating Group - Hero Card */}
      <div className="card p-6 border-gold-500/20 bg-gradient-to-br from-gold-500/5 to-transparent">
        <div className="flex items-center gap-2 mb-3">
          <Crown className="w-5 h-5 text-gold-400" />
          <span className="text-xs font-medium text-gold-300 uppercase tracking-wider">
            Highest Participating Group
          </span>
        </div>
        <div className="flex items-baseline gap-4 flex-wrap">
          <span className="text-2xl font-display font-bold text-ink-100">
            {stats.highest_participating_group.group_name}
          </span>
          <span className="text-3xl font-display font-bold text-gold-400">
            {stats.highest_participating_group.participation_rate}%
          </span>
          <span className="text-sm text-ink-400">
            {stats.highest_participating_group.comment_count} comments from {stats.highest_participating_group.member_count} members
          </span>
        </div>
      </div>

      {/* Active Users */}
      <div className="grid grid-cols-3 gap-4">
        <ActiveUserCard
          label="Daily Active"
          value={stats.active_users.daily}
          total={stats.total_members}
        />
        <ActiveUserCard
          label="Weekly Active"
          value={stats.active_users.weekly}
          total={stats.total_members}
        />
        <ActiveUserCard
          label="Monthly Active"
          value={stats.active_users.monthly}
          total={stats.total_members}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gender Breakdown */}
        <BreakdownCard
          icon={Users}
          title="Gender Breakdown"
          items={stats.gender_breakdown.map((g) => ({
            label: GENDER_LABELS[g.gender ?? 'unspecified'] ?? g.gender ?? 'Unspecified',
            count: g.count,
            percentage: g.percentage,
          }))}
          total={stats.total_members}
        />

        {/* Ethnicity Breakdown */}
        <BreakdownCard
          icon={Users}
          title="Ethnic Identity Breakdown"
          items={stats.ethnicity_breakdown.map((e) => ({
            label: ETHNICITY_LABELS[e.ethnicity ?? 'unspecified'] ?? e.ethnicity ?? 'Unspecified',
            count: e.count,
            percentage: e.percentage,
          }))}
          total={stats.total_members}
        />

        {/* Membership Breakdown */}
        <BreakdownCard
          icon={Crown}
          title="Membership Tiers"
          items={stats.membership_breakdown.map((m) => ({
            label: TIER_LABELS[m.tier ?? 'white'] ?? m.tier ?? 'White (Free)',
            count: m.count,
            percentage: m.percentage,
            accent: m.is_paid ? 'gold' : 'steel',
          }))}
          total={stats.total_members}
        />

        {/* Commenting by Gender */}
        <CommentBreakdownCard
          title="Commenting Activity by Gender"
          items={stats.comments_by_gender.map((c) => ({
            label: GENDER_LABELS[c.gender ?? 'unspecified'] ?? c.gender ?? 'Unspecified',
            commentCount: c.comment_count,
            memberCount: c.member_count,
            participationRate: c.participation_rate,
          }))}
        />
      </div>

      {/* Commenting by Ethnicity - full width */}
      <CommentBreakdownCard
        title="Commenting Activity by Ethnic Identity"
        items={stats.comments_by_ethnicity.map((c) => ({
          label: ETHNICITY_LABELS[c.ethnicity ?? 'unspecified'] ?? c.ethnicity ?? 'Unspecified',
          commentCount: c.comment_count,
          memberCount: c.member_count,
          participationRate: c.participation_rate,
        }))}
      />
    </div>
  );
}

function ActiveUserCard({
  label,
  value,
  total,
}: {
  label: string;
  value: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-4 h-4 text-gold-400" />
        <span className="text-xs font-medium text-ink-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-display font-bold text-ink-100">{value}</span>
        <span className="text-xs text-ink-500">({pct}% of {total})</span>
      </div>
    </div>
  );
}

function BreakdownCard({
  icon: Icon,
  title,
  items,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  items: { label: string; count: number; percentage: number; accent?: string }[];
  total: number;
}) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        <Icon className="w-5 h-5 text-gold-400" />
        <h3 className="font-display text-base font-semibold text-ink-100">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-500">No data yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-ink-300">{item.label}</span>
                <span className="text-ink-100 font-mono text-xs">
                  {item.count} ({item.percentage}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-ink-800/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    item.accent === 'gold' ? 'bg-gold-500/70' : 'bg-ink-600/70'
                  }`}
                  style={{ width: `${item.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CommentBreakdownCard({
  title,
  items,
}: {
  title: string;
  items: { label: string; commentCount: number; memberCount: number; participationRate: number }[];
}) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        <MessageSquare className="w-5 h-5 text-gold-400" />
        <h3 className="font-display text-base font-semibold text-ink-100">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-500">No comments yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-ink-300">{item.label}</span>
                <span className="text-ink-100 font-mono text-xs">
                  {item.commentCount} comments / {item.memberCount} members ({item.participationRate}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-ink-800/60 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gold-500/50 transition-all duration-500"
                  style={{ width: `${Math.min(item.participationRate, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gold-400" />
        <span className="text-xs font-medium text-ink-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-display font-bold text-ink-100">{value}</p>
    </div>
  );
}

function ReportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b border-ink-800/50 last:border-0">
      <span className="text-ink-300">{label}</span>
      <span className="text-ink-100 font-mono font-medium">{value}</span>
    </div>
  );
}

export default AdminPage;

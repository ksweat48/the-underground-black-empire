import { useEffect, useState } from 'react';
import {
  Loader2,
  MapPin,
  Sparkles,
  Users,
  Calendar,
  Trophy,
  Award,
  Share2,
  CheckCircle2,
  TrendingUp,
  Store,
  Briefcase,
  Building2,
  Heart,
  Scale,
} from 'lucide-react';
import { GlassModal } from '@/shared/components/glass-modal';
import { EmpireFrame } from '@/shared/components/empire-frame';
import { Avatar } from '@/shared/components/avatar';
import { NominateButton } from '@/shared/components/nominate-button';
import {
  fetchPublicMemberProfile,
  type PublicMemberProfile,
} from '@/domains/founder-campaign/services';
import { getLevelFromInfluence, getCityTier } from '@/config/progression-rules';
import { fetchMyListings, fetchListingUpdates, type MarketListing, type ListingUpdate } from '@/domains/market/services';
import {
  ETHNIC_IDENTITY_LABELS,
} from '@/shared/components/ethnic-identity-selector';
import {
  GENDER_LABELS,
} from '@/shared/components/gender-selector';
import {
  SUPPORT_ROLE_LABELS,
} from '@/shared/components/support-role-selector';

interface MemberProfileModalProps {
  memberId: string | null;
  onClose: () => void;
  currentUserId?: string | null;
}

function getInitials(name: string): string {
  const parts = name.split(/[\s@._-]/).filter(Boolean);
  if (parts.length === 0) return 'F';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatJoinDate(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDob(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Achievement {
  id: string;
  label: string;
  icon: typeof Trophy;
  unlocked: boolean;
  description: string;
}

function getAchievements(profile: PublicMemberProfile, cityTier: string | null): Achievement[] {
  return [
    { id: 'first_member', label: 'Pioneer', icon: Trophy, unlocked: !!profile.founder_number, description: 'One of the first 1,000 members' },
    { id: 'first_referral', label: 'First Referral', icon: Share2, unlocked: profile.referral_count > 0, description: 'Invited their first member' },
    { id: 'verified_referral', label: 'Verified Recruiter', icon: CheckCircle2, unlocked: profile.verified_referral_count > 0, description: 'Got a verified referral' },
    { id: 'inf_100', label: '100 Influence', icon: TrendingUp, unlocked: profile.influence >= 100, description: 'Earned 100 Influence' },
    { id: 'inf_500', label: '500 Influence', icon: TrendingUp, unlocked: profile.influence >= 500, description: 'Earned 500 Influence' },
    { id: 'inf_1000', label: '1000 Influence', icon: Sparkles, unlocked: profile.influence >= 1000, description: 'Earned 1000 Influence' },
    { id: 'tribe', label: 'Tribe Member', icon: Users, unlocked: cityTier !== null && cityTier !== 'group', description: 'City reached Tribe status' },
    { id: 'five_referrals', label: 'Recruiter', icon: Users, unlocked: profile.referral_count >= 5, description: '5 referrals' },
  ];
}

const SUPPORT_ROLE_ICONS: Record<string, typeof Briefcase> = {
  supporter: Heart,
  business_owner: Store,
  organization: Building2,
};

export function MemberProfileModal({ memberId, onClose, currentUserId = null }: MemberProfileModalProps) {
  const [profile, setProfile] = useState<PublicMemberProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [listingUpdates, setListingUpdates] = useState<Record<string, ListingUpdate[]>>({});

  useEffect(() => {
    if (!memberId) {
      setProfile(null);
      setError(null);
      setListings([]);
      setListingUpdates({});
      return;
    }
    setLoading(true);
    setError(null);
    setListings([]);
    setListingUpdates({});
    fetchPublicMemberProfile(memberId)
      .then((data) => {
        if (!data) setError('Member not found.');
        else setProfile(data);
      })
      .catch(() => setError('Unable to load profile.'))
      .finally(() => setLoading(false));

    fetchMyListings(memberId)
      .then(async (ownerListings) => {
        setListings(ownerListings);
        const updatesMap: Record<string, ListingUpdate[]> = {};
        await Promise.all(
          ownerListings.map(async (listing) => {
            try {
              const updates = await fetchListingUpdates(listing.id);
              updatesMap[listing.id] = updates;
            } catch {
              updatesMap[listing.id] = [];
            }
          })
        );
        setListingUpdates(updatesMap);
      })
      .catch(() => {});
  }, [memberId]);

  const open = memberId !== null;

  return (
    <GlassModal open={open} onClose={onClose} title="Member Profile">
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-plum-500 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      )}

      {profile && !loading && !error && (
        <ProfileContent
          profile={profile}
          listings={listings}
          listingUpdates={listingUpdates}
          currentUserId={currentUserId}
        />
      )}
    </GlassModal>
  );
}

function ProfileContent({
  profile,
  listings,
  listingUpdates,
  currentUserId,
}: {
  profile: PublicMemberProfile;
  listings: MarketListing[];
  listingUpdates: Record<string, ListingUpdate[]>;
  currentUserId: string | null;
}) {
  const displayName = profile.display_name ?? profile.email.split('@')[0];
  const initials = getInitials(displayName);
  const founderLevel = getLevelFromInfluence(profile.influence);
  const cityTier = profile.city_population_count ? getCityTier(profile.city_population_count) : null;
  const isFounder = profile.founder_number !== null;
  const isOwnProfile = currentUserId === profile.id;

  const achievements = getAchievements(profile, profile.city_tier);
  const unlockedBadges = achievements.filter((a) => a.unlocked);

  const showNominate =
    !isOwnProfile &&
    profile.leadership_opt_in === true &&
    currentUserId !== null;

  const roleIcon = profile.support_role ? SUPPORT_ROLE_ICONS[profile.support_role] ?? Briefcase : null;
  const roleLabel = profile.support_role ? SUPPORT_ROLE_LABELS[profile.support_role as keyof typeof SUPPORT_ROLE_LABELS] ?? profile.support_role : null;

  return (
    <div className="space-y-5">
      {/* Header: Avatar + Name + Badge */}
      <div className="flex items-center gap-4">
        <div
          className="shrink-0 w-14 h-14 rounded-full overflow-hidden"
          style={{
            background: 'linear-gradient(160deg, #2A2A2A, #0A0A0A)',
            border: '2px solid rgba(255,255,255,0.10)',
            boxShadow: '0 0 0 3px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06), 0 6px 18px rgba(0,0,0,0.50)',
          }}
        >
          <Avatar
            src={profile.avatar_url}
            initials={initials}
            initialsClassName="text-lg"
            initialsStyle={{ color: '#ffffff', textShadow: '0 1px 3px rgba(0,0,0,0.65)' }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-display font-bold text-gray-900 truncate">
            {displayName}
          </h4>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {profile.member_number !== null && (
              <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                Member #{profile.member_number}
              </span>
            )}
            {isFounder && (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-plum-50 px-2 py-0.5 text-[10px] font-semibold text-plum-700">
                Pioneer
                <span className="text-plum-400 font-normal">· First 1,000 members</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={Trophy} label="Level" value={`Lv ${founderLevel.level}`} />
        <StatTile icon={Sparkles} label="Influence" value={profile.influence.toLocaleString()} accent="emerald" />
        <StatTile icon={Users} label="Referrals" value={String(profile.referral_count)} />
      </div>

      {/* Identity Details */}
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Identity</p>
        <div className="flex flex-wrap gap-1.5">
          {profile.ethnic_identity && (
            <span className="px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-xs text-gray-700">
              {ETHNIC_IDENTITY_LABELS[profile.ethnic_identity as keyof typeof ETHNIC_IDENTITY_LABELS] ?? profile.ethnic_identity}
              {profile.ethnic_identity_detail && (
                <span className="text-gray-500 ml-1">· {profile.ethnic_identity_detail}</span>
              )}
            </span>
          )}
          {profile.gender && (
            <span className="px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-xs text-gray-700">
              {GENDER_LABELS[profile.gender as keyof typeof GENDER_LABELS] ?? profile.gender}
              {profile.gender_detail && (
                <span className="text-gray-500 ml-1">· {profile.gender_detail}</span>
              )}
            </span>
          )}
          {profile.date_of_birth && (
            <span className="px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-xs text-gray-700">
              <Calendar className="w-3 h-3 inline mr-1 text-gray-400" />
              {formatDob(profile.date_of_birth)}
            </span>
          )}
          {roleLabel && (
            <span className="px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-xs text-gray-700">
              {roleIcon && (() => { const Icon = roleIcon; return <Icon className="w-3 h-3 inline mr-1 text-gray-400" />; })()}
              {roleLabel}
              {profile.support_role_detail && (
                <span className="text-gray-500 ml-1">· {profile.support_role_detail}</span>
              )}
            </span>
          )}
          {profile.occupation && (
            <span className="px-2 py-0.5 rounded-md bg-gray-100 border border-gray-200 text-xs text-gray-700">
              <Briefcase className="w-3 h-3 inline mr-1 text-gray-400" />
              Occupation · {profile.occupation}
            </span>
          )}
          {!profile.ethnic_identity && !profile.gender && !profile.date_of_birth && !profile.support_role && !profile.occupation && (
            <span className="text-xs text-gray-400 italic">No identity details shared</span>
          )}
        </div>
      </div>

      {/* City Info */}
      {profile.city_name && (
        <EmpireFrame variant="utility" className="p-4">
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
              <MapPin className="w-3.5 h-3.5 text-gray-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">City</p>
              <p className="text-sm font-medium text-gray-900 truncate">
                {profile.city_name}
                {profile.state && <span className="text-gray-500">, {profile.state}</span>}
              </p>
            </div>
            {cityTier && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-plum-600">
                {cityTier}
              </span>
            )}
          </div>
        </EmpireFrame>
      )}

      {/* Achievements / Badges */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Badges</p>
          <span className="text-xs text-gray-400">{unlockedBadges.length} of {achievements.length} unlocked</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {achievements.map((ach) => {
            const Icon = ach.icon;
            return (
              <div
                key={ach.id}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-center ${
                  ach.unlocked
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-gray-50 border-gray-200 opacity-50'
                }`}
                title={ach.description}
              >
                <Icon className={`w-4 h-4 ${ach.unlocked ? 'text-amber-600' : 'text-gray-400'}`} />
                <span className={`text-[9px] leading-tight ${ach.unlocked ? 'text-amber-800 font-medium' : 'text-gray-400'}`}>
                  {ach.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Nominate Button */}
      {showNominate && (
        <div className="pt-1">
          <NominateButton
            candidateId={profile.id}
            candidateName={displayName}
            candidateAvatarUrl={profile.avatar_url}
            candidateLevel={founderLevel.level}
            candidateInfluence={profile.influence}
            variant="full"
          />
        </div>
      )}

      {/* Businesses / Organizations */}
      {listings.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-gray-500" />
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
              Businesses & Organizations
            </p>
          </div>
          <div className="space-y-3">
            {listings.map((listing) => (
              <div key={listing.id} className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-start gap-3 p-3">
                  {listing.image_url ? (
                    <img
                      src={listing.image_url}
                      alt=""
                      className="shrink-0 w-12 h-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="shrink-0 w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                      <Store className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{listing.name}</p>
                    <p className="text-xs text-gray-500 capitalize">{listing.category.replace(/_/g, ' ')}</p>
                    {listing.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{listing.description}</p>
                    )}
                  </div>
                </div>
                {/* Updates for this listing */}
                {listingUpdates[listing.id] && listingUpdates[listing.id].length > 0 && (
                  <div className="border-t border-gray-100 bg-gray-50/50 p-3 space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Recent Updates</p>
                    {listingUpdates[listing.id].slice(0, 3).map((update) => (
                      <div key={update.id} className="flex items-start gap-2">
                        <div className="shrink-0 w-1.5 h-1.5 rounded-full bg-plum-400 mt-1.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-600 line-clamp-2">{update.body}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {formatJoinDate(update.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                    {listingUpdates[listing.id].length > 3 && (
                      <p className="text-[10px] text-gray-400 italic">
                        +{listingUpdates[listing.id].length - 3} more updates
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Joined Date */}
      <div className="flex items-center gap-2 text-xs text-gray-500 pt-1">
        <Calendar className="w-3.5 h-3.5" />
        <span>Joined {formatJoinDate(profile.joined_at)}</span>
      </div>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent = 'neutral',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: 'neutral' | 'emerald';
}) {
  const iconColor = accent === 'emerald' ? 'text-emerald-600' : 'text-gray-600';
  const iconBg = accent === 'emerald' ? 'bg-emerald-50 border-emerald-100' : 'bg-gray-100 border-gray-200';
  return (
    <EmpireFrame variant="utility" className="p-3 flex items-center gap-2.5 min-h-[56px]">
      <div className={`shrink-0 w-7 h-7 rounded-full ${iconBg} border flex items-center justify-center`}>
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
      </div>
      <div className="flex flex-col leading-tight min-w-0">
        <span className="text-[9px] uppercase tracking-wider text-gray-400">{label}</span>
        <span className="text-sm font-display font-bold text-gray-900 tabular-nums truncate">{value}</span>
      </div>
    </EmpireFrame>
  );
}

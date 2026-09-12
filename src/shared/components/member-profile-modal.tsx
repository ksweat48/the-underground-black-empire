import { useEffect, useState } from 'react';
import {
  Loader2,
  MapPin,
  Sparkles,
  Users,
  Calendar,
  Trophy,
} from 'lucide-react';
import { GlassModal } from '@/shared/components/glass-modal';
import { EmpireFrame } from '@/shared/components/empire-frame';
import {
  fetchPublicMemberProfile,
  type PublicMemberProfile,
} from '@/domains/founder-campaign/services';
import { getLevelFromInfluence, getCityTier } from '@/config/progression-rules';

interface MemberProfileModalProps {
  memberId: string | null;
  onClose: () => void;
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

export function MemberProfileModal({ memberId, onClose }: MemberProfileModalProps) {
  const [profile, setProfile] = useState<PublicMemberProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!memberId) {
      setProfile(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    fetchPublicMemberProfile(memberId)
      .then((data) => {
        if (!data) setError('Member not found.');
        else setProfile(data);
      })
      .catch(() => setError('Unable to load profile.'))
      .finally(() => setLoading(false));
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
        <ProfileContent profile={profile} />
      )}
    </GlassModal>
  );
}

function ProfileContent({ profile }: { profile: PublicMemberProfile }) {
  const displayName = profile.display_name ?? profile.email.split('@')[0];
  const initials = getInitials(displayName);
  const founderLevel = getLevelFromInfluence(profile.influence);
  const cityTier = profile.city_population_count ? getCityTier(profile.city_population_count) : null;

  const isFounder = profile.founder_number !== null;

  return (
    <div className="space-y-5">
      {/* Header: Avatar + Name + Badge */}
      <div className="flex items-center gap-4">
        <div
          className="flex items-center justify-center shrink-0 w-14 h-14 rounded-full text-lg font-display font-bold"
          style={{
            background: 'linear-gradient(160deg, #2A2A2A, #0A0A0A)',
            border: '2px solid rgba(255,255,255,0.10)',
            boxShadow: '0 0 0 3px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06), 0 6px 18px rgba(0,0,0,0.50)',
            color: '#ffffff',
            textShadow: '0 1px 3px rgba(0,0,0,0.65)',
          }}
        >
          {initials}
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
                Founder
                <span className="text-plum-400 font-normal">· First 10,000 users</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Trophy} label="Your Level" value={`Lv ${founderLevel.level}`} />
        <StatTile icon={Sparkles} label="Influence" value={profile.influence.toLocaleString()} accent="emerald" />
        <StatTile icon={Users} label="Referrals" value={String(profile.referral_count)} />
        <StatTile
          icon={Sparkles}
          label="Influence"
          value={profile.influence.toLocaleString()}
          accent="emerald"
        />
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

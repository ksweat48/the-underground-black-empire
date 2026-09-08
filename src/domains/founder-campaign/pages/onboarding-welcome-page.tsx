import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Sparkles, Users, TrendingUp, Target, ArrowRight, Store, Briefcase, Building2, CheckCircle2 } from 'lucide-react';
import { OnboardingStep } from '@/shared/components/onboarding-step';
import { EmpireEmblem } from '@/shared/components/empire-emblem';
import { fetchCityWithMetro, type CityWithMetro } from '@/domains/founder-campaign/services';
import { supabase } from '@/shared/supabase-client';

export function OnboardingWelcomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const founderNumber = searchParams.get('number');
  const cityId = searchParams.get('city');
  const listingId = searchParams.get('listing');
  const [city, setCity] = useState<CityWithMetro | null>(null);

  useEffect(() => {
    if (!cityId || !founderNumber) {
      navigate('/onboarding/city');
      return;
    }
    fetchCityWithMetro(cityId).then(setCity).catch(() => {});
  }, [cityId, founderNumber, navigate]);

  const features = [
    {
      icon: TrendingUp,
      title: 'Track Your City Growth',
      description: 'Watch your city grow from a Group to a Legacy City.',
    },
    {
      icon: Target,
      title: 'Complete Missions',
      description: 'Earn Influence by completing missions and climbing the leaderboard.',
    },
    {
      icon: Users,
      title: 'Invite Members',
      description: 'Share your referral link and earn Influence for every verified member.',
    },
  ];

  return (
    <OnboardingStep
      step={4}
      totalSteps={4}
      title="Enter The Empire"
      subtitle="Your journey begins now."
      onBack={() => navigate(`/onboarding/identity?city=${cityId}${founderNumber ? `&number=${founderNumber}` : ''}`)}
    >
      <div className="text-center mb-6">
        <div className="inline-flex p-4 rounded-full bg-gold-950/40 border border-gold-800/30 mb-4 animate-glow-pulse">
          <EmpireEmblem variant="light" className="w-10 h-10" />
        </div>
        <p className="text-sm text-ink-400 mb-1">You are</p>
        <h2 className="text-5xl font-display font-bold text-gradient-gold mb-2">
          Member #{founderNumber}
        </h2>
        {city && (
          <p className="text-lg text-ink-200">
            {city.name}, {city.state}
          </p>
        )}
        <div className="inline-flex items-center gap-2 mt-3 badge-gold">
          <Sparkles className="w-3.5 h-3.5" />
          +20 Influence Earned
        </div>
      </div>

      {/* Listing confirmation */}
      {listingId && (
        <div className="card p-4 mb-4 border-gold-800/30 bg-gold-950/20">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-display font-semibold text-ink-100">
                Your Marketplace Listing Is Live
              </p>
              <p className="text-xs text-ink-400 mt-1">
                Your listing is now visible in the Marketplace with an "In Review" badge.
                An admin will review it soon. You can still receive likes, comments, and shares while in review.
              </p>
            </div>
          </div>
        </div>
      )}

      {city && (
        <div className="card p-4 mb-6">
          <div className="flex items-center justify-between text-sm py-1.5 border-b border-ink-800/50 last:border-0">
            <span className="text-ink-400">Member Signup Bonus</span>
            <span className="text-gold-300 font-medium">+10 Influence</span>
          </div>
          <div className="flex items-center justify-between text-sm py-1.5 border-b border-ink-800/50 last:border-0">
            <span className="text-ink-400">City Selection Bonus</span>
            <span className="text-gold-300 font-medium">+10 Influence</span>
          </div>
          {city.metro_name && (
            <div className="flex items-center justify-between text-sm py-1.5">
              <span className="text-ink-400">Metro Region</span>
              <span className="text-ink-100 font-medium">{city.metro_name}</span>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 mb-6">
        {features.map((feature) => (
          <div key={feature.title} className="card p-4 flex items-start gap-4">
            <div className="flex-shrink-0 p-2 rounded-lg bg-gold-950/30">
              <feature.icon className="w-5 h-5 text-gold-400" />
            </div>
            <div>
              <h3 className="font-display text-sm font-semibold text-ink-100 mb-1">
                {feature.title}
              </h3>
              <p className="text-xs text-ink-400">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={async () => {
          await supabase.rpc('mark_onboarding_complete');
          navigate('/empire');
        }}
        className="btn-primary w-full text-base py-4"
      >
        Enter The Empire
        <ArrowRight className="w-5 h-5" />
      </button>
    </OnboardingStep>
  );
}

export default OnboardingWelcomePage;

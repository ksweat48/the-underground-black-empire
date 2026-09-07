import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MapPin, Building2, Users, TrendingUp, ArrowRight, Loader2 } from 'lucide-react';
import { OnboardingStep } from '@/shared/components/onboarding-step';
import { EmpireEmblem } from '@/shared/components/empire-emblem';
import { fetchCityWithMetro, type CityWithMetro } from '@/domains/founder-campaign/services';
import { PROGRESSION_RULES, getCityTier, getCityTierProgress } from '@/config/progression-rules';

export function OnboardingConfirmPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cityId = searchParams.get('city');
  const [city, setCity] = useState<CityWithMetro | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cityId) {
      navigate('/onboarding/city');
      return;
    }
    fetchCityWithMetro(cityId)
      .then(setCity)
      .catch(() => navigate('/onboarding/city'))
      .finally(() => setLoading(false));
  }, [cityId, navigate]);

  if (loading || !city) {
    return (
      <OnboardingStep step={1} totalSteps={4} title="Loading...">
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-gold-400 animate-spin" />
        </div>
      </OnboardingStep>
    );
  }

  const tier = getCityTier(city.population_count);
  const tierLabel = PROGRESSION_RULES.city[tier].label;
  const nextFounderNumber = city.population_count + 1;
  const isFirstFounder = city.population_count === 0;
  const progress = getCityTierProgress(city.population_count);

  return (
    <OnboardingStep
      step={1}
      totalSteps={4}
      title="Confirm Your City"
      subtitle="Review your selection before creating your account."
      onBack={() => navigate('/onboarding/city')}
    >
      <div className="card p-6 mb-6">
        <div className="text-center mb-6">
          <p className="text-xs font-medium text-ink-400 uppercase tracking-wider mb-1">
            You Will Represent
          </p>
          <h2 className="text-2xl font-display font-bold text-ink-100">
            {city.name}, {city.state}
          </h2>
        </div>

        {city.metro_name && (
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-between text-sm py-2 border-b border-ink-800/50">
              <span className="text-ink-400 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                State
              </span>
              <span className="text-ink-100 font-medium">{city.state}</span>
            </div>
          </div>
        )}

        <div className="bg-ink-900/50 rounded-lg p-4 mb-4">
          <p className="text-xs font-medium text-ink-400 uppercase tracking-wider mb-3">
            City Status
          </p>
          {isFirstFounder ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gold-500/15 flex items-center justify-center flex-shrink-0">
                  <EmpireEmblem variant="dark" className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-lg font-display font-semibold text-gradient-gold">
                    Be the First Member
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    You'll put {city.name} on the map and claim Member #1.
                  </p>
                </div>
              </div>
              <div className="h-px bg-ink-800/60" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-400">Current Tier</span>
                <span className="text-ink-100 font-medium">{tierLabel}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-400">Your Member Number</span>
                <span className="text-gold-300 font-semibold">#1</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-lg font-display font-semibold text-ink-100">
                    {city.population_count} {city.population_count === 1 ? 'Member' : 'Members'} Already Here
                  </p>
                  <p className="text-xs text-ink-400 mt-0.5">
                    Join them and help {city.name} grow to the next tier.
                  </p>
                </div>
              </div>
              <div className="h-px bg-ink-800/60" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-400">Your Member Number</span>
                <span className="text-gold-300 font-semibold">#{nextFounderNumber}</span>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-ink-400">{tierLabel}</span>
                  <span className="text-xs text-ink-500">
                    {city.population_count} / {progress.next ? PROGRESSION_RULES.city[progress.next].minPopulation : PROGRESSION_RULES.city.tribe.minPopulation} to {progress.next ? PROGRESSION_RULES.city[progress.next].label : 'Tribe'}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-ink-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-all duration-500"
                    style={{
                      width: `${progress.percent}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {city.metro_name && (
          <div className="bg-gradient-to-br from-gold-950/30 to-ink-900/50 rounded-lg p-4 border border-gold-800/20 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-4 h-4 text-gold-400" />
              <p className="text-xs font-medium text-gold-400 uppercase tracking-wider">
                Your Metro Community
              </p>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-lg font-display font-bold text-ink-100">
                  {city.metro_name}
                </p>
                <p className="text-xs text-ink-400 mt-0.5">
                  {city.metro_city_count} {city.metro_city_count === 1 ? 'city' : 'cities'} in this metro
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-display font-bold text-gradient-gold">
                  {city.metro_population_count.toLocaleString()}
                </p>
                <p className="text-xs text-ink-400">
                  {city.metro_population_count === 1 ? 'member' : 'members'} in the metro
                </p>
              </div>
            </div>
            {city.metro_rank > 0 && (
              <div className="mt-3 pt-3 border-t border-gold-800/20">
                <div className="flex items-center gap-1.5 text-xs text-ink-400">
                  <TrendingUp className="w-3 h-3" />
                  <span>National Rank #{city.metro_rank}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => navigate('/onboarding/city')}
          className="btn-ghost flex-1"
        >
          Back
        </button>
        <button
          onClick={() => navigate(`/onboarding/account?city=${city.id}`)}
          className="btn-primary flex-1"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </OnboardingStep>
  );
}

export default OnboardingConfirmPage;

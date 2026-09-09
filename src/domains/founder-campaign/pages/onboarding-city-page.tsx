import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, X, PlusCircle } from 'lucide-react';
import { OnboardingStep } from '@/shared/components/onboarding-step';
import { useAuth } from '@/domains/identity/auth-context';
import {
  fetchAllStates,
  searchCitiesInState,
  type StateOption,
  type CitySearchResult,
} from '@/domains/founder-campaign/services';

export function OnboardingCityPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const [states, setStates] = useState<StateOption[]>([]);
  const [stateQuery, setStateQuery] = useState('');
  const [selectedState, setSelectedState] = useState<StateOption | null>(null);
  const [showStateDropdown, setShowStateDropdown] = useState(false);

  const [searchResults, setSearchResults] = useState<CitySearchResult[]>([]);
  const [cityQuery, setCityQuery] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const stateInputRef = useRef<HTMLInputElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const stateDropdownRef = useRef<HTMLDivElement>(null);
  const cityDropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    fetchAllStates()
      .then(setStates)
      .catch(() => {});
  }, []);

  const performSearch = useCallback(async (stateAbbr: string, query: string) => {
    const reqId = ++requestIdRef.current;
    setCitiesLoading(true);
    try {
      const results = await searchCitiesInState(stateAbbr, query, 8);
      if (reqId === requestIdRef.current) {
        setSearchResults(results);
        setHasSearched(true);
      }
    } catch {
      if (reqId === requestIdRef.current) {
        setSearchResults([]);
        setHasSearched(true);
      }
    } finally {
      if (reqId === requestIdRef.current) {
        setCitiesLoading(false);
      }
    }
  }, []);

  const handleCityInputChange = useCallback((value: string) => {
    setCityQuery(value);
    setShowCityDropdown(value.trim().length > 0);
    if (!selectedState) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      performSearch(selectedState.abbreviation, value);
    }, 200);
  }, [selectedState, performSearch]);

  useEffect(() => {
    if (selectedState) {
      setCityQuery('');
      setSearchResults([]);
      setHasSearched(false);
      setShowCityDropdown(false);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [selectedState]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        stateDropdownRef.current &&
        !stateDropdownRef.current.contains(e.target as Node) &&
        stateInputRef.current &&
        !stateInputRef.current.contains(e.target as Node)
      ) {
        setShowStateDropdown(false);
      }
      if (
        cityDropdownRef.current &&
        !cityDropdownRef.current.contains(e.target as Node) &&
        cityInputRef.current &&
        !cityInputRef.current.contains(e.target as Node)
      ) {
        setShowCityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredStates = stateQuery.trim()
    ? states
        .filter(
          (s) =>
            s.name.toLowerCase().startsWith(stateQuery.toLowerCase()) ||
            s.abbreviation.toLowerCase() === stateQuery.toLowerCase()
        )
        .concat(
          states.filter(
            (s) =>
              !s.name.toLowerCase().startsWith(stateQuery.toLowerCase()) &&
              s.abbreviation.toLowerCase() !== stateQuery.toLowerCase() &&
              s.name.toLowerCase().includes(stateQuery.toLowerCase())
          )
        )
        .slice(0, 6)
    : [];

  const handleSelectState = (state: StateOption) => {
    setSelectedState(state);
    setStateQuery('');
    setShowStateDropdown(false);
    setTimeout(() => cityInputRef.current?.focus(), 80);
  };

  const handleClearState = () => {
    setSelectedState(null);
    setStateQuery('');
    setSearchResults([]);
    setCityQuery('');
    setHasSearched(false);
    setShowCityDropdown(false);
    setTimeout(() => stateInputRef.current?.focus(), 80);
  };

  const handleSelectCity = (city: CitySearchResult) => {
    navigate(`/onboarding/confirm?city=${city.id}`);
  };

  const noMatchAfterTyping =
    selectedState &&
    cityQuery.trim().length >= 3 &&
    !citiesLoading &&
    hasSearched &&
    searchResults.length === 0;

  return (
    <OnboardingStep
      step={1}
      totalSteps={5}
      title="Your Location"
      subtitle="Tell us where you're based so we can place you on the map."
      onBack={async () => {
        await signOut();
        navigate('/auth/sign-in');
      }}
    >
      <div className="space-y-3">
        {/* State Field */}
        <div className="relative">
          <label className="block text-xs font-medium text-ink-400 uppercase tracking-widest mb-1.5 px-1">
            State
          </label>

          {selectedState ? (
            <div className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-ink-900 border border-gold-600/40">
              <span className="text-ink-100 font-medium">{selectedState.name}</span>
              <button
                onClick={handleClearState}
                className="text-ink-500 hover:text-ink-200 transition-colors ml-2"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                ref={stateInputRef}
                type="text"
                value={stateQuery}
                onChange={(e) => {
                  setStateQuery(e.target.value);
                  setShowStateDropdown(true);
                }}
                onFocus={() => stateQuery.trim() && setShowStateDropdown(true)}
                placeholder="Type your state..."
                autoFocus
                className="w-full px-4 py-3.5 rounded-xl bg-ink-900 border border-ink-700 text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-all"
              />

              {showStateDropdown && filteredStates.length > 0 && (
                <div
                  ref={stateDropdownRef}
                  className="absolute top-full left-0 right-0 mt-1.5 rounded-xl bg-ink-900 border border-ink-700 shadow-2xl overflow-hidden z-20"
                >
                  {filteredStates.map((state) => (
                    <button
                      key={state.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelectState(state)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ink-800 transition-colors text-left border-b border-ink-800 last:border-0"
                    >
                      <span className="text-xs font-bold text-gold-400 w-6 flex-shrink-0">
                        {state.abbreviation}
                      </span>
                      <span className="text-sm text-ink-100">{state.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* City Field */}
        <div className="relative">
          <label
            className={`block text-xs font-medium uppercase tracking-widest mb-1.5 px-1 transition-colors ${
              selectedState ? 'text-ink-400' : 'text-ink-600'
            }`}
          >
            City
          </label>

          <div className="relative">
            <input
              ref={cityInputRef}
              type="text"
              value={cityQuery}
              onChange={(e) => handleCityInputChange(e.target.value)}
              onFocus={() => cityQuery.trim().length > 0 && setShowCityDropdown(true)}
              placeholder={
                selectedState
                  ? `Search cities in ${selectedState.name}...`
                  : 'Select a state first'
              }
              disabled={!selectedState}
              className={`w-full px-4 py-3.5 rounded-xl border text-ink-100 placeholder:text-ink-500 focus:outline-none transition-all ${
                selectedState
                  ? 'bg-ink-900 border-ink-700 focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 cursor-text'
                  : 'bg-ink-950 border-ink-800 cursor-not-allowed opacity-50'
              }`}
            />

            {citiesLoading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-gold-400/20 border-t-gold-400 rounded-full animate-spin" />
              </div>
            )}

            {showCityDropdown && !citiesLoading && searchResults.length > 0 && (
              <div
                ref={cityDropdownRef}
                className="absolute top-full left-0 right-0 mt-1.5 rounded-xl bg-ink-900 border border-ink-700 shadow-2xl overflow-hidden z-20"
              >
                {searchResults.map((city) => (
                  <button
                    key={city.id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelectCity(city)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ink-800 transition-colors text-left border-b border-ink-800 last:border-0"
                  >
                    <MapPin className="w-3.5 h-3.5 text-gold-400 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-ink-100">{city.name}</span>
                      {city.population_count > 0 && (
                        <span className="text-xs text-gold-400/70 ml-2">
                          {city.population_count} {city.population_count === 1 ? 'member' : 'members'}
                        </span>
                      )}
                    </div>
                    {city.population_count === 0 ? (
                      <span className="text-xs text-emerald-400/80 font-medium flex-shrink-0">
                        Be the first
                      </span>
                    ) : null}
                    {city.metro_name && (
                      <span className="text-xs text-ink-500 flex-shrink-0">{city.metro_name}</span>
                    )}
                  </button>
                ))}
              </div>
           )}

            {showCityDropdown && !citiesLoading && hasSearched && searchResults.length === 0 && cityQuery.trim().length > 0 && cityQuery.trim().length < 3 && (
              <div
                ref={cityDropdownRef}
                className="absolute top-full left-0 right-0 mt-1.5 rounded-xl bg-ink-900 border border-ink-700 shadow-2xl overflow-hidden z-20 px-4 py-3"
              >
                <p className="text-xs text-ink-500">
                  Keep typing to search cities in {selectedState?.name}...
                </p>
              </div>
            )}
          </div>

          {noMatchAfterTyping && (
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="text-xs text-ink-500">
                "{cityQuery}" isn't in our system yet.
              </span>
              <button
                onClick={() =>
                  navigate(
                    `/onboarding/request-city?state=${selectedState!.abbreviation}&name=${encodeURIComponent(cityQuery)}`
                  )
                }
                className="inline-flex items-center gap-1.5 text-xs text-gold-400 hover:text-gold-300 transition-colors"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                Request it
              </button>
            </div>
          )}
        </div>
      </div>
    </OnboardingStep>
  );
}

export default OnboardingCityPage;

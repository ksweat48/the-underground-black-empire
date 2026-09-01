import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/cn';

export const PROFESSION_OPTIONS: string[] = [
  'Accountant',
  'Actor',
  'Architect',
  'Artist',
  'Attorney / Lawyer',
  'Author / Writer',
  'Banker',
  'Barber',
  'Blacksmith',
  'Builder / Contractor',
  'Business Analyst',
  'Carpenter',
  'Chef / Cook',
  'Chiropractor',
  'Civil Engineer',
  'Cleaner',
  'Clerk',
  'Coach',
  'Community Organizer',
  'Consultant',
  'Content Creator',
  'Counselor',
  'Dentist',
  'Designer (Graphic)',
  'Developer / Software Engineer',
  'Dietitian',
  'Doctor / Physician',
  'Draftsperson',
  'Economist',
  'Electrician',
  'EMT / Paramedic',
  'Engineer',
  'Event Planner',
  'Farmer',
  'Financial Advisor',
  'Firefighter',
  'Fitness Trainer',
  'Florist',
  'Gardener / Landscaper',
  'Hair Stylist',
  'Healthcare Worker',
  'Home Inspector',
  'Human Resources',
  'IT Technician',
  'Insurance Agent',
  'Interior Designer',
  'Investor',
  'Journalist',
  'Landscaper',
  'Locksmith',
  'Marketing Specialist',
  'Massage Therapist',
  'Mechanic',
  'Musician',
  'Nail Technician',
  'Nurse',
  'Optometrist',
  'Painter',
  'Personal Trainer',
  'Pharmacist',
  'Photographer',
  'Physical Therapist',
  'Pilot',
  'Plumber',
  'Police Officer',
  'Politician',
  'Producer',
  'Project Manager',
  'Professor / Teacher',
  'Programmer',
  'Psychologist',
  'Real Estate Agent',
  'Receptionist',
  'Researcher',
  'Restauranteur',
  'Retail Worker',
  'Roofer',
  'Sales Representative',
  'Social Media Manager',
  'Social Worker',
  'Stockbroker',
  'Stylist',
  'Tailor',
  'Tax Preparer',
  'Therapist',
  'Truck Driver',
  'Tutor',
  'Veterinarian',
  'Videographer',
  'Welder',
  'Youth Worker',
];

interface ProfessionAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
}

export function ProfessionAutocomplete({
  value,
  onChange,
  placeholder = 'Start typing your profession',
  error,
}: ProfessionAutocompleteProps) {
  const [focused, setFocused] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return PROFESSION_OPTIONS.slice(0, 8);
    const filtered = PROFESSION_OPTIONS.filter((p) =>
      p.toLowerCase().includes(query),
    );
    return filtered.slice(0, 8);
  }, [value]);

  const showDropdown = focused && (suggestions.length > 0 || value.trim().length > 0);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
        setShowOther(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowOther(false);
        }}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        className="input-field"
        maxLength={100}
      />
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 shadow-xl shadow-black/40 max-h-56 overflow-y-auto scrollbar-thin">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                onChange(suggestion);
                setFocused(false);
                setShowOther(false);
              }}
              className={cn(
                'w-full px-4 py-2.5 text-left text-sm transition-colors',
                value === suggestion
                  ? 'bg-gold-950/40 text-gold-300'
                  : 'text-ink-200 hover:bg-ink-800',
              )}
            >
              {suggestion}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onChange('');
              setShowOther(true);
              setFocused(true);
            }}
            className={cn(
              'w-full px-4 py-2.5 text-left text-sm border-t border-ink-700/50 transition-colors',
              showOther
                ? 'bg-gold-950/40 text-gold-300'
                : 'text-ink-300 hover:bg-ink-800',
            )}
          >
            Other — type your own
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-crimson-300 px-1">{error}</p>}
    </div>
  );
}

export default ProfessionAutocomplete;

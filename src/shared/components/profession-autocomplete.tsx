import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, X, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/cn';

// Structured occupation data: categories with optional sub-occupations.
// Categories with sub-occupations show a second dropdown when selected.
// Categories without sub-occupations are saved directly.
export interface OccupationCategory {
  label: string;
  subs?: string[];
}

export const OCCUPATION_CATEGORIES: OccupationCategory[] = [
  {
    label: 'Healthcare & Wellness',
    subs: [
      'Acupuncturist', 'Athletic Trainer', 'Audiologist', 'Caregiver',
      'Certified Nursing Assistant', 'Chiropractor', 'Dental Assistant',
      'Dental Hygienist', 'Dentist', 'Dietitian', 'Doctor / Physician',
      'EMT / Paramedic', 'Healthcare Administrator', 'Home Health Aide',
      'Massage Therapist', 'Medical Assistant', 'Medical Technologist',
      'Mental Health Counselor', 'Midwife', 'Nurse', 'Nurse Practitioner',
      'Nutritionist', 'Occupational Therapist', 'Optometrist', 'Pharmacist',
      'Pharmacy Technician', 'Physical Therapist', 'Physician Assistant',
      'Psychiatrist', 'Psychologist', 'Radiologic Technologist',
      'Registered Nurse', 'Respiratory Therapist', 'Speech Therapist',
      'Surgeon', 'Therapist', 'Veterinarian', 'Wellness Coach',
    ],
  },
  {
    label: 'Education & Childcare',
    subs: [
      'After-School Program Coordinator', 'Childcare Worker', 'College Advisor',
      'Counselor', 'Curriculum Developer', 'Daycare Provider',
      'Education Administrator', 'Elementary School Teacher', 'High School Teacher',
      'Librarian', 'Middle School Teacher', 'Montessori Teacher',
      'Paraprofessional', 'Preschool Teacher', 'Principal', 'Professor',
      'School Counselor', 'School Social Worker', 'Special Education Teacher',
      'Substitute Teacher', 'Tutor', 'University Lecturer', 'Youth Worker',
    ],
  },
  {
    label: 'Skilled Trades & Construction',
    subs: [
      'Blacksmith', 'Builder / Contractor', 'Carpenter', 'Construction Worker',
      'Drywall Installer', 'Electrician', 'Flooring Installer', 'Glazier',
      'HVAC Technician', 'Heavy Equipment Operator', 'Home Inspector',
      'Insulation Worker', 'Ironworker', 'Landscaper', 'Locksmith', 'Mason',
      'Painter', 'Pipefitter', 'Plasterer', 'Plumber', 'Roofer',
      'Sheet Metal Worker', 'Solar Panel Installer', 'Tile Setter', 'Welder',
      'Window Installer',
    ],
  },
  {
    label: 'Business, Finance & Administration',
    subs: [
      'Accountant', 'Accounts Payable Specialist', 'Administrative Assistant',
      'Auditor', 'Banker', 'Bookkeeper', 'Business Analyst',
      'Business Consultant', 'Business Owner', 'Chief Financial Officer',
      'Compliance Officer', 'Controller', 'Customer Service Representative',
      'Data Entry Clerk', 'Economist', 'Entrepreneur', 'Executive Assistant',
      'Financial Advisor', 'Financial Analyst', 'Human Resources Manager',
      'Insurance Agent', 'Investment Banker', 'Loan Officer', 'Office Manager',
      'Operations Manager', 'Payroll Specialist', 'Project Manager',
      'Purchasing Agent', 'Quality Assurance Specialist', 'Real Estate Agent',
      'Real Estate Appraiser', 'Receptionist', 'Recruiter', 'Risk Manager',
      'Sales Representative', 'Stockbroker', 'Tax Preparer', 'Underwriter',
    ],
  },
  {
    label: 'Technology & Engineering',
    subs: [
      'AI / ML Engineer', 'Aerospace Engineer', 'Biomedical Engineer',
      'Chemical Engineer', 'Civil Engineer', 'Cloud Architect',
      'Computer Hardware Engineer', 'Content Creator', 'Cybersecurity Analyst',
      'Data Analyst', 'Data Engineer', 'Data Scientist', 'Database Administrator',
      'Developer / Software Engineer', 'DevOps Engineer', 'Draftsperson',
      'Electrical Engineer', 'Environmental Engineer', 'Game Developer',
      'Industrial Engineer', 'IT Support Specialist', 'IT Technician',
      'Mechanical Engineer', 'Mobile App Developer', 'Network Administrator',
      'Network Engineer', 'Programmer', 'QA Tester', 'Robotics Engineer',
      'Security Engineer', 'Systems Administrator', 'Technical Writer',
      'UI/UX Designer', 'Web Developer',
    ],
  },
  {
    label: 'Creative, Media & Arts',
    subs: [
      'Actor', 'Animator', 'Architect', 'Art Director', 'Artist',
      'Author / Writer', 'Blogger', 'Broadcast Technician', 'Camera Operator',
      'Cartoonist', 'Cinematographer', 'Comedian', 'Composer',
      'Content Strategist', 'Copywriter', 'Dancer', 'DJ', 'Editor',
      'Fashion Designer', 'Film Director', 'Film Producer', 'Florist',
      'Graphic Designer', 'Illustrator', 'Interior Designer', 'Jewelry Designer',
      'Journalist', 'Makeup Artist', 'Music Producer', 'Musician',
      'Painter (Fine Art)', 'Photographer', 'Podcaster', 'Poet', 'Producer',
      'Radio Host', 'Screenwriter', 'Sculptor', 'Set Designer', 'Singer',
      'Social Media Manager', 'Sound Engineer', 'Stylist', 'Tattoo Artist',
      'TV Host', 'Video Editor', 'Videographer', 'Voice Actor', 'Writer',
    ],
  },
  {
    label: 'Transportation & Logistics',
    subs: [
      'Air Traffic Controller', 'Ambulance Driver', 'Bike Courier', 'Bus Driver',
      'Delivery Driver', 'Dispatcher', 'Dock Worker', 'Forklift Operator',
      'Logistics Coordinator', 'Marine Pilot', 'Package Handler', 'Pilot',
      'Ship Captain', 'Sailor', 'Taxi Driver', 'Train Conductor', 'Truck Driver',
      'Uber / Lyft Driver', 'Warehouse Manager', 'Warehouse Worker',
    ],
  },
  {
    label: 'Public Service, Government & Community',
    subs: [
      'Activist', 'City Planner', 'Community Organizer', 'Correctional Officer',
      'Diplomat', 'Election Worker', 'Emergency Management Director',
      'Firefighter', 'Government Official', 'Grant Writer', 'Judge',
      'Law Enforcement Officer', 'Legislative Aide', 'Mayor',
      'Military Personnel', 'Nonprofit Director', 'Park Ranger',
      'Parole Officer', 'Police Officer', 'Politician', 'Probation Officer',
      'Public Health Worker', 'Public Relations Specialist', 'Social Worker',
      'Translator / Interpreter', 'Urban Planner', 'Volunteer Coordinator',
    ],
  },
  {
    label: 'Retail, Food Service & Hospitality',
    subs: [
      'Baker', 'Bartender', 'Barista', 'Butcher', 'Caterer', 'Chef / Cook',
      'Concierge', 'Event Planner', 'Fast Food Worker', 'Food Service Worker',
      'Grocery Clerk', 'Hair Stylist', 'Host / Hostess', 'Hotel Manager',
      'Line Cook', 'Manicurist', 'Nail Technician', 'Pastry Chef',
      'Restaurant Manager', 'Restauranteur', 'Retail Manager', 'Retail Worker',
      'Sommelier', 'Spa Manager', 'Tour Guide', 'Travel Agent',
      'Waiter / Waitress',
    ],
  },
  {
    label: 'Science, Law & Professional Services',
    subs: [
      'Attorney / Lawyer', 'Biologist', 'Chemist', 'Dental Lab Technician',
      'Environmental Scientist', 'Forensic Scientist', 'Geologist',
      'Hydrologist', 'Laboratory Technician', 'Landscape Architect',
      'Legal Assistant', 'Legal Secretary', 'Marine Biologist',
      'Mathematician', 'Meteorologist', 'Notary Public', 'Paralegal',
      'Patent Attorney', 'Physicist', 'Research Scientist', 'Researcher',
      'Sociologist', 'Statistician', 'Surveyor',
    ],
  },
  {
    label: 'Fitness, Sports & Recreation',
    subs: [
      'Athlete', 'Coach', 'Fitness Trainer', 'Golf Pro', 'Gym Owner',
      'Personal Trainer', 'Physical Education Teacher', 'Pilates Instructor',
      'Referee', 'Ski Instructor', 'Sports Agent', 'Sports Analyst',
      'Sports Coach', 'Swim Instructor', 'Tennis Pro', 'Yoga Instructor',
    ],
  },
  {
    label: 'Agriculture, Environment & Animal Care',
    subs: [
      'Agricultural Technician', 'Animal Trainer', 'Beekeeper', 'Dog Groomer',
      'Dog Walker', 'Farmer', 'Fisherman', 'Gardener', 'Landscape Designer',
      'Landscaper', 'Nursery Worker', 'Pet Sitter', 'Rancher',
      'Veterinary Assistant', 'Wildlife Biologist',
    ],
  },
  {
    label: 'Personal Care & Domestic',
    subs: [
      'Cleaning Service Worker', 'Custodian', 'Elder Care Provider',
      'Esthetician', 'Family Caregiver', 'Hair Braider', 'Homemaker',
      'House Cleaner', 'Housekeeper', 'Laundry Worker', 'Nanny',
      'Pet Groomer', 'Residential Cleaner',
    ],
  },
  // Standalone options — no sub-occupations, saved directly
  { label: 'Barber' },
  { label: 'Mechanic' },
  { label: 'Student' },
  { label: 'Retired' },
  { label: 'Homemaker' },
  { label: 'Currently Unemployed' },
  { label: 'Self-Employed' },
  { label: 'Freelancer' },
  { label: 'Entrepreneur' },
  { label: 'Volunteer' },
];

// Flat list of all occupation names (categories + all subs) for search and backward compat
export const PROFESSION_OPTIONS: string[] = (() => {
  const list: string[] = [];
  for (const cat of OCCUPATION_CATEGORIES) {
    list.push(cat.label);
    if (cat.subs) list.push(...cat.subs);
  }
  return list;
})();

// Popular occupations shown when the field first opens — a balanced mix
const POPULAR_OCCUPATIONS: string[] = [
  'Student',
  'Retired',
  'Business Owner',
  'Teacher',
  'Nurse',
  'Developer / Software Engineer',
  'Truck Driver',
  'Construction Worker',
  'Chef / Cook',
  'Electrician',
  'Real Estate Agent',
  'Mechanic',
  'Plumber',
  'Hair Stylist',
  'Police Officer',
  'Accountant',
  'Sales Representative',
  'Caregiver',
  'Photographer',
  'Musician',
  'Coach',
  'Farmer',
  'Barber',
  'Artist',
  'Writer',
  'Entrepreneur',
  'Homemaker',
  'Currently Unemployed',
  'Self-Employed',
  'Freelancer',
];

// Map each sub-occupation back to its parent category for lookups
const SUB_TO_CATEGORY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const cat of OCCUPATION_CATEGORIES) {
    if (cat.subs) {
      for (const sub of cat.subs) {
        map[sub.toLowerCase()] = cat.label;
      }
    }
  }
  return map;
})();

// All categories that have sub-occupations (for quick lookup)
const CATEGORIES_WITH_SUBS = new Set(
  OCCUPATION_CATEGORIES.filter((c) => c.subs).map((c) => c.label),
);

interface ProfessionAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
}

export function ProfessionAutocomplete({
  value,
  onChange,
  placeholder = 'Start typing your occupation',
  error,
}: ProfessionAutocompleteProps) {
  const [focused, setFocused] = useState(false);
  const [otherMode, setOtherMode] = useState(false);
  // When a category with subs is selected, show the sub-dropdown
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // If the current value is not in the preset list, treat it as a custom entry
  const isCustom = value.trim().length > 0 && !PROFESSION_OPTIONS.some((p) => p.toLowerCase() === value.trim().toLowerCase());

  // Determine if current value is a sub-occupation, and which category it belongs to
  const valueCategory = value.trim() ? SUB_TO_CATEGORY[value.trim().toLowerCase()] ?? null : null;

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return POPULAR_OCCUPATIONS;
    // Search across all occupation names (categories + subs)
    const filtered = PROFESSION_OPTIONS.filter((p) => p.toLowerCase().includes(query));
    return filtered.slice(0, 30);
  }, [value]);

  const showDropdown = focused && !otherMode && (suggestions.length > 0 || value.trim().length > 0);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-focus input when entering other mode
  useEffect(() => {
    if (otherMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [otherMode]);

  // If value gets cleared externally, exit other mode and sub-dropdown
  useEffect(() => {
    if (value === '') {
      setOtherMode(false);
      setSelectedCategory(null);
    }
  }, [value]);

  // Sync selectedCategory when value changes externally (e.g. editing profile)
  useEffect(() => {
    if (valueCategory) {
      setSelectedCategory(valueCategory);
    } else if (!value || !CATEGORIES_WITH_SUBS.has(value)) {
      setSelectedCategory(null);
    }
  }, [valueCategory, value]);

  const handleSelectOccupation = (occupation: string) => {
    onChange(occupation);
    setFocused(false);
    setSelectedCategory(null);
  };

  const handleSelectCategory = (category: string) => {
    if (CATEGORIES_WITH_SUBS.has(category)) {
      // Show sub-occupation dropdown
      setSelectedCategory(category);
      onChange(category);
    } else {
      // Standalone occupation — save directly
      handleSelectOccupation(category);
    }
  };

  const handleSelectSub = (sub: string) => {
    onChange(sub);
    setFocused(false);
    setSelectedCategory(null);
  };

  const currentCategoryData = selectedCategory
    ? OCCUPATION_CATEGORIES.find((c) => c.label === selectedCategory)
    : null;

  if (otherMode) {
    return (
      <div ref={containerRef} className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Type your occupation"
          className="input-field pr-10"
          maxLength={100}
        />
        <button
          type="button"
          onClick={() => {
            onChange('');
            setOtherMode(false);
            setFocused(false);
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 hover:text-ink-200 transition-colors"
          aria-label="Back to suggestions"
        >
          <X className="w-4 h-4" />
        </button>
        <p className="text-xs text-ink-500 mt-1 px-1">Custom occupation — type your own and it will be saved as entered.</p>
        {error && <p className="mt-2 text-sm text-crimson-300 px-1">{error}</p>}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setSelectedCategory(null);
        }}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        className="input-field pr-10"
        maxLength={100}
      />
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 shadow-xl shadow-black/40 max-h-72 overflow-y-auto scrollbar-thin">
          {!value.trim() && (
            <div className="px-4 py-2 text-[11px] text-ink-500 border-b border-ink-700/50 sticky top-0 bg-ink-900">
              Popular occupations — type to search all {PROFESSION_OPTIONS.length}+
            </div>
          )}
          {suggestions.map((suggestion) => {
            const hasSubs = CATEGORIES_WITH_SUBS.has(suggestion);
            const isSelected = value === suggestion;
            return (
              <button
                key={suggestion}
                type="button"
                onClick={() => handleSelectCategory(suggestion)}
                className={cn(
                  'w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center justify-between',
                  isSelected
                    ? 'bg-gold-950/40 text-gold-300'
                    : 'text-ink-200 hover:bg-ink-800',
                )}
              >
                <span>{suggestion}</span>
                {hasSubs && (
                  <ChevronRight className="w-3.5 h-3.5 text-ink-500 shrink-0 ml-2" />
                )}
              </button>
            );
          })}
          {value.trim().length > 0 && !PROFESSION_OPTIONS.some((p) => p.toLowerCase() === value.trim().toLowerCase()) && (
            <div className="px-4 py-2 text-xs text-ink-400 border-t border-ink-700/50">
              Your entry: <span className="text-ink-200">{value}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOtherMode(true);
              setFocused(true);
            }}
            className={cn(
              'w-full px-4 py-2.5 text-left text-sm border-t border-ink-700/50 transition-colors',
              isCustom
                ? 'bg-gold-950/40 text-gold-300'
                : 'text-ink-300 hover:bg-ink-800',
            )}
          >
            Other — type your own
          </button>
        </div>
      )}

      {/* Sub-occupation dropdown — appears when a category with subs is selected */}
      {currentCategoryData && currentCategoryData.subs && (
        <div className="mt-2 animate-fade-up">
          <label className="label-field text-xs">
            Choose a specific role in {currentCategoryData.label}
          </label>
          <div className="relative">
            <select
              value={value !== currentCategoryData.label ? value : ''}
              onChange={(e) => {
                if (e.target.value) {
                  handleSelectSub(e.target.value);
                }
              }}
              className="input-field appearance-none pr-10 cursor-pointer text-sm"
            >
              <option value="" disabled>Select a specific role...</option>
              {currentCategoryData.subs.map((sub) => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(currentCategoryData.label);
              setSelectedCategory(null);
            }}
            className="text-[11px] text-ink-500 hover:text-ink-300 mt-1.5 px-1 transition-colors"
          >
            Keep "{currentCategoryData.label}" as your occupation
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-crimson-300 px-1">{error}</p>}
    </div>
  );
}

export default ProfessionAutocomplete;

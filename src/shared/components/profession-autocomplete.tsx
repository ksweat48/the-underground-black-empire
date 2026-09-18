import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, X, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/cn';

export interface OccupationEntry {
  label: string;
  subs?: string[];
}

export const OCCUPATIONS: OccupationEntry[] = [
  { label: 'Nurse', subs: ['Registered Nurse', 'Nurse Practitioner', 'Certified Nursing Assistant', 'Licensed Practical Nurse', 'Travel Nurse', 'School Nurse'] },
  { label: 'Doctor / Physician', subs: ['Surgeon', 'Pediatrician', 'Psychiatrist', 'Cardiologist', 'Dermatologist', 'Obstetrician', 'Anesthesiologist', 'Family Medicine Doctor', 'Radiologist', 'Neurologist', 'Oncologist', 'ER Doctor'] },
  { label: 'Therapist', subs: ['Physical Therapist', 'Occupational Therapist', 'Speech Therapist', 'Mental Health Counselor', 'Respiratory Therapist', 'Massage Therapist'] },
  { label: 'Pharmacist', subs: ['Retail Pharmacist', 'Clinical Pharmacist', 'Pharmacy Technician'] },
  { label: 'Dentist', subs: ['Orthodontist', 'Oral Surgeon', 'Dental Hygienist', 'Dental Assistant'] },
  { label: 'Teacher', subs: ['Elementary School Teacher', 'High School Teacher', 'Middle School Teacher', 'Special Education Teacher', 'Preschool Teacher', 'Substitute Teacher', 'Montessori Teacher', 'Professor', 'University Lecturer', 'School Counselor', 'Paraprofessional'] },
  { label: 'Developer / Software Engineer', subs: ['Web Developer', 'Mobile App Developer', 'Game Developer', 'AI / ML Engineer', 'DevOps Engineer', 'Cloud Architect', 'Data Scientist', 'Data Engineer', 'Cybersecurity Analyst', 'QA Tester', 'Programmer'] },
  { label: 'Engineer', subs: ['Civil Engineer', 'Mechanical Engineer', 'Electrical Engineer', 'Chemical Engineer', 'Aerospace Engineer', 'Biomedical Engineer', 'Industrial Engineer', 'Environmental Engineer', 'Robotics Engineer'] },
  { label: 'Chef / Cook', subs: ['Executive Chef', 'Sous Chef', 'Pastry Chef', 'Line Cook', 'Prep Cook', 'Private Chef', 'Baker'] },
  { label: 'Attorney / Lawyer', subs: ['Corporate Lawyer', 'Criminal Defense Lawyer', 'Family Lawyer', 'Patent Attorney', 'Personal Injury Lawyer', 'Paralegal', 'Legal Assistant'] },
  { label: 'Law Enforcement Officer', subs: ['Police Officer', 'Detective', 'Sheriff Deputy', 'State Trooper', 'Federal Agent', 'Correctional Officer', 'Probation Officer', 'Parole Officer'] },
  { label: 'Business Owner', subs: ['Restaurant Owner', 'Retail Store Owner', 'Online Business Owner', 'Franchise Owner', 'Consulting Firm Owner'] },
  { label: 'Coach', subs: ['Sports Coach', 'Fitness Trainer', 'Personal Trainer', 'Life Coach', 'Youth Coach', 'Referee'] },
  { label: 'Construction Worker', subs: ['Carpenter', 'Mason', 'Roofer', 'Drywall Installer', 'Flooring Installer', 'Insulation Worker', 'Sheet Metal Worker', 'Ironworker', 'Glazier'] },
  { label: 'Electrician', subs: ['Residential Electrician', 'Commercial Electrician', 'Industrial Electrician', 'Low Voltage Electrician'] },
  { label: 'Truck Driver', subs: ['Long Haul Truck Driver', 'Local Delivery Driver', 'Dump Truck Driver', 'Tow Truck Driver'] },
  { label: 'Photographer', subs: ['Wedding Photographer', 'Portrait Photographer', 'Commercial Photographer', 'Event Photographer', 'Fashion Photographer'] },
  { label: 'Musician', subs: ['Singer', 'Guitarist', 'Pianist', 'Drummer', 'Music Producer', 'DJ'] },
  { label: 'Artist', subs: ['Painter (Fine Art)', 'Sculptor', 'Illustrator', 'Tattoo Artist'] },
  { label: 'Writer / Author', subs: ['Novelist', 'Copywriter', 'Blogger', 'Screenwriter', 'Technical Writer', 'Journalist', 'Poet'] },
  { label: 'Designer', subs: ['Graphic Designer', 'Interior Designer', 'Fashion Designer', 'UI/UX Designer', 'Web Designer', 'Jewelry Designer', 'Florist'] },
  { label: 'Manager', subs: ['Office Manager', 'Operations Manager', 'Retail Manager', 'Restaurant Manager', 'Hotel Manager', 'Warehouse Manager', 'Project Manager'] },
  { label: 'Farmer', subs: ['Crop Farmer', 'Livestock Farmer', 'Dairy Farmer', 'Organic Farmer', 'Rancher'] },
  { label: 'Real Estate Agent', subs: ['Residential Agent', 'Commercial Agent', 'Property Manager', 'Real Estate Appraiser'] },
  { label: 'Accountant', subs: ['CPA', 'Bookkeeper', 'Tax Preparer', 'Auditor', 'Payroll Specialist'] },
  { label: 'Social Worker', subs: ['School Social Worker', 'Child Welfare Worker', 'Clinical Social Worker', 'Community Organizer'] },
  { label: 'Actor', subs: ['Film Actor', 'TV Actor', 'Theater Actor', 'Voice Actor', 'Comedian'] },
  { label: 'Builder / Contractor', subs: ['General Contractor', 'Home Builder', 'Remodeling Contractor', 'Home Inspector'] },
  { label: 'Firefighter', subs: ['City Firefighter', 'Wildland Firefighter', 'Fire Inspector', 'EMT / Paramedic'] },
  { label: 'Military Personnel', subs: ['Army', 'Navy', 'Air Force', 'Marines', 'Coast Guard', 'National Guard'] },
  { label: 'Pilot', subs: ['Commercial Pilot', 'Private Pilot', 'Helicopter Pilot', 'Air Traffic Controller'] },
  { label: 'Barista', subs: ['Coffee Shop Barista', 'Shift Supervisor', 'Coffee Roaster'] },
  { label: 'Hair Stylist', subs: ['Hair Stylist', 'Hair Braider', 'Colorist', 'Barber'] },
  { label: 'Athlete', subs: ['Professional Athlete', 'College Athlete', 'Golf Pro', 'Tennis Pro', 'Ski Instructor', 'Swim Instructor'] },
  { label: 'Researcher / Scientist', subs: ['Biologist', 'Chemist', 'Physicist', 'Marine Biologist', 'Environmental Scientist', 'Forensic Scientist', 'Geologist', 'Research Scientist'] },
  { label: 'Government Official', subs: ['Mayor', 'City Planner', 'Diplomat', 'Legislative Aide', 'Public Health Worker'] },
  // Standalone occupations — no sub-specializations
  { label: 'Acupuncturist' },
  { label: 'Athletic Trainer' },
  { label: 'Audiologist' },
  { label: 'Bartender' },
  { label: 'Bike Courier' },
  { label: 'Blacksmith' },
  { label: 'Blogger' },
  { label: 'Broadcast Technician' },
  { label: 'Bus Driver' },
  { label: 'Butcher' },
  { label: 'Camera Operator' },
  { label: 'Cartoonist' },
  { label: 'Caterer' },
  { label: 'Chiropractor' },
  { label: 'Cinematographer' },
  { label: 'Cleaner / Custodian' },
  { label: 'Compliance Officer' },
  { label: 'Computer Hardware Engineer' },
  { label: 'Content Creator' },
  { label: 'Content Strategist' },
  { label: 'Copywriter' },
  { label: 'Customer Service Representative' },
  { label: 'Dancer' },
  { label: 'Data Analyst' },
  { label: 'Data Entry Clerk' },
  { label: 'Database Administrator' },
  { label: 'Daycare Provider' },
  { label: 'Delivery Driver' },
  { label: 'Dietitian' },
  { label: 'Dispatcher' },
  { label: 'Dock Worker' },
  { label: 'Dog Groomer' },
  { label: 'Dog Walker' },
  { label: 'Draftsperson' },
  { label: 'Editor' },
  { label: 'Elder Care Provider' },
  { label: 'Entrepreneur' },
  { label: 'Esthetician' },
  { label: 'Event Planner' },
  { label: 'Executive Assistant' },
  { label: 'Family Caregiver' },
  { label: 'Film Director' },
  { label: 'Film Producer' },
  { label: 'Financial Advisor' },
  { label: 'Financial Analyst' },
  { label: 'Forklift Operator' },
  { label: 'Freelancer' },
  { label: 'Gardener' },
  { label: 'Grant Writer' },
  { label: 'Gym Owner' },
  { label: 'Home Health Aide' },
  { label: 'Homemaker' },
  { label: 'Human Resources Manager' },
  { label: 'Illustrator' },
  { label: 'Insurance Agent' },
  { label: 'Investment Banker' },
  { label: 'IT Support Specialist' },
  { label: 'IT Technician' },
  { label: 'Journalist' },
  { label: 'Landscaper' },
  { label: 'Librarian' },
  { label: 'Loan Officer' },
  { label: 'Locksmith' },
  { label: 'Makeup Artist' },
  { label: 'Manicurist' },
  { label: 'Marine Pilot' },
  { label: 'Mechanic' },
  { label: 'Medical Assistant' },
  { label: 'Medical Technologist' },
  { label: 'Midwife' },
  { label: 'Nail Technician' },
  { label: 'Network Administrator' },
  { label: 'Network Engineer' },
  { label: 'Nonprofit Director' },
  { label: 'Notary Public' },
  { label: 'Nanny' },
  { label: 'Nutritionist' },
  { label: 'Occupational Therapist' },
  { label: 'Office Manager' },
  { label: 'Optometrist' },
  { label: 'Package Handler' },
  { label: 'Painter' },
  { label: 'Park Ranger' },
  { label: 'Pet Sitter' },
  { label: 'Physician Assistant' },
  { label: 'Pilates Instructor' },
  { label: 'Plumber' },
  { label: 'Podcaster' },
  { label: 'Political Scientist' },
  { label: 'Politician' },
  { label: 'Producer' },
  { label: 'Professor' },
  { label: 'Psychologist' },
  { label: 'Public Relations Specialist' },
  { label: 'Purchasing Agent' },
  { label: 'Quality Assurance Specialist' },
  { label: 'Radio Host' },
  { label: 'Receptionist' },
  { label: 'Recruiter' },
  { label: 'Respiratory Therapist' },
  { label: 'Restauranteur' },
  { label: 'Retail Worker' },
  { label: 'Risk Manager' },
  { label: 'Sailor' },
  { label: 'Sales Representative' },
  { label: 'School Counselor' },
  { label: 'Sculptor' },
  { label: 'Set Designer' },
  { label: 'Ship Captain' },
  { label: 'Sociologist' },
  { label: 'Social Media Manager' },
  { label: 'Solar Panel Installer' },
  { label: 'Sommelier' },
  { label: 'Sound Engineer' },
  { label: 'Spa Manager' },
  { label: 'Statistician' },
  { label: 'Stockbroker' },
  { label: 'Student' },
  { label: 'Stylist' },
  { label: 'Surveyor' },
  { label: 'Systems Administrator' },
  { label: 'Taxi Driver' },
  { label: 'Technical Writer' },
  { label: 'Tile Setter' },
  { label: 'Tour Guide' },
  { label: 'Train Conductor' },
  { label: 'Translator / Interpreter' },
  { label: 'Travel Agent' },
  { label: 'Tutor' },
  { label: 'TV Host' },
  { label: 'Uber / Lyft Driver' },
  { label: 'Underwriter' },
  { label: 'Urban Planner' },
  { label: 'Veterinarian' },
  { label: 'Veterinary Assistant' },
  { label: 'Video Editor' },
  { label: 'Videographer' },
  { label: 'Volunteer' },
  { label: 'Volunteer Coordinator' },
  { label: 'Waiter / Waitress' },
  { label: 'Warehouse Worker' },
  { label: 'Welder' },
  { label: 'Wellness Coach' },
  { label: 'Window Installer' },
  { label: 'Youth Worker' },
  { label: 'Currently Unemployed' },
  { label: 'Self-Employed' },
  { label: 'Retired' },
];

const OCCUPATION_MAP: Record<string, OccupationEntry> = (() => {
  const map: Record<string, OccupationEntry> = {};
  for (const occ of OCCUPATIONS) {
    map[occ.label.toLowerCase()] = occ;
  }
  return map;
})();

export const PROFESSION_OPTIONS: string[] = (() => {
  const list: string[] = [];
  for (const occ of OCCUPATIONS) {
    list.push(occ.label);
    if (occ.subs) list.push(...occ.subs);
  }
  return list;
})();

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
  'Writer / Author',
  'Entrepreneur',
  'Homemaker',
  'Currently Unemployed',
  'Self-Employed',
  'Freelancer',
];

const SUB_TO_PARENT: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const occ of OCCUPATIONS) {
    if (occ.subs) {
      for (const sub of occ.subs) {
        map[sub.toLowerCase()] = occ.label;
      }
    }
  }
  return map;
})();

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
  const [expandedOccupation, setExpandedOccupation] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isCustom = value.trim().length > 0 && !PROFESSION_OPTIONS.some((p) => p.toLowerCase() === value.trim().toLowerCase());

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return POPULAR_OCCUPATIONS;
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

  useEffect(() => {
    if (otherMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [otherMode]);

  useEffect(() => {
    if (value === '') {
      setOtherMode(false);
      setExpandedOccupation(null);
    }
  }, [value]);

  const handleSelect = (occupation: string) => {
    onChange(occupation);
    setFocused(false);
    setExpandedOccupation(null);
  };

  const toggleExpand = (occupation: string) => {
    setExpandedOccupation((current) => (current === occupation ? null : occupation));
  };

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
          setExpandedOccupation(null);
        }}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        className="input-field pr-10"
        maxLength={100}
      />
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 shadow-xl shadow-black/40 max-h-80 overflow-y-auto scrollbar-thin">
          {!value.trim() && (
            <div className="px-4 py-2 text-[11px] text-ink-500 border-b border-ink-700/50 sticky top-0 bg-ink-900 z-10">
              Popular occupations — type to search all {PROFESSION_OPTIONS.length}+
            </div>
          )}
          {suggestions.map((suggestion) => {
            const parentName = SUB_TO_PARENT[suggestion.toLowerCase()];
            const isSubResult = Boolean(parentName);
            const occupationName = parentName ?? suggestion;
            const occupationData = OCCUPATION_MAP[occupationName.toLowerCase()];
            const hasSubs = Boolean(occupationData?.subs?.length);
            const isExpanded = expandedOccupation === occupationName;
            const isSelected = value === suggestion;

            return (
              <div key={suggestion}>
                <div
                  className={cn(
                    'w-full text-left text-sm transition-colors flex items-center',
                    isSelected ? 'bg-gold-950/40 text-gold-300' : 'text-ink-200 hover:bg-ink-800',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSelect(suggestion)}
                    className="flex-1 min-w-0 px-4 py-2.5 text-left"
                  >
                    <span className="block truncate">{suggestion}</span>
                    {isSubResult && (
                      <span className="block text-[10px] text-ink-500 mt-0.5 truncate">
                        under {parentName}
                      </span>
                    )}
                  </button>
                  {hasSubs && !isSubResult && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(occupationName);
                      }}
                      className="p-3 text-ink-500 hover:text-gold-300 transition-colors shrink-0"
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${occupationName} specializations`}
                    >
                      <ChevronRight
                        className={cn(
                          'w-4 h-4 transition-transform',
                          isExpanded && 'rotate-90',
                        )}
                      />
                    </button>
                  )}
                </div>
                {isExpanded && occupationData?.subs && (
                  <div className="border-t border-ink-800/70 bg-ink-950/40">
                    {occupationData.subs.map((sub) => (
                      <button
                        key={`${occupationName}-${sub}`}
                        type="button"
                        onClick={() => handleSelect(sub)}
                        className={cn(
                          'w-full pl-8 pr-4 py-2 text-left text-xs transition-colors',
                          value === sub
                            ? 'text-gold-300 bg-gold-950/30'
                            : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
                        )}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

      {error && <p className="mt-2 text-sm text-crimson-300 px-1">{error}</p>}
    </div>
  );
}

export default ProfessionAutocomplete;

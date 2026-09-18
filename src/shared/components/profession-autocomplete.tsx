import { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { cn } from '@/shared/cn';

export const PROFESSION_OPTIONS: string[] = [
  // Healthcare & Wellness
  'Acupuncturist',
  'Athletic Trainer',
  'Audiologist',
  'Caregiver',
  'Certified Nursing Assistant',
  'Chiropractor',
  'Dental Assistant',
  'Dental Hygienist',
  'Dentist',
  'Dietitian',
  'Doctor / Physician',
  'EMT / Paramedic',
  'Healthcare Administrator',
  'Home Health Aide',
  'Massage Therapist',
  'Medical Assistant',
  'Medical Technologist',
  'Mental Health Counselor',
  'Midwife',
  'Nurse',
  'Nurse Practitioner',
  'Nutritionist',
  'Occupational Therapist',
  'Optometrist',
  'Pharmacist',
  'Pharmacy Technician',
  'Physical Therapist',
  'Physician Assistant',
  'Psychiatrist',
  'Psychologist',
  'Radiologic Technologist',
  'Registered Nurse',
  'Respiratory Therapist',
  'Speech Therapist',
  'Surgeon',
  'Therapist',
  'Veterinarian',
  'Wellness Coach',

  // Education & Childcare
  'After-School Program Coordinator',
  'Childcare Worker',
  'College Advisor',
  'Counselor',
  'Curriculum Developer',
  'Daycare Provider',
  'Education Administrator',
  'Elementary School Teacher',
  'High School Teacher',
  'Librarian',
  'Middle School Teacher',
  'Montessori Teacher',
  'Paraprofessional',
  'Preschool Teacher',
  'Principal',
  'Professor',
  'School Counselor',
  'School Social Worker',
  'Special Education Teacher',
  'Substitute Teacher',
  'Tutor',
  'University Lecturer',
  'Youth Worker',

  // Skilled Trades & Construction
  'Blacksmith',
  'Builder / Contractor',
  'Carpenter',
  'Construction Worker',
  'Drywall Installer',
  'Electrician',
  'Flooring Installer',
  'Glazier',
  'HVAC Technician',
  'Heavy Equipment Operator',
  'Home Inspector',
  'Insulation Worker',
  'Ironworker',
  'Landscaper',
  'Locksmith',
  'Mason',
  'Painter',
  'Pipefitter',
  'Plasterer',
  'Plumber',
  'Roofer',
  'Sheet Metal Worker',
  'Solar Panel Installer',
  'Tile Setter',
  'Welder',
  'Window Installer',

  // Business, Finance & Administration
  'Accountant',
  'Accounts Payable Specialist',
  'Administrative Assistant',
  'Auditor',
  'Banker',
  'Bookkeeper',
  'Business Analyst',
  'Business Consultant',
  'Business Owner',
  'Chief Financial Officer',
  'Compliance Officer',
  'Controller',
  'Customer Service Representative',
  'Data Entry Clerk',
  'Economist',
  'Entrepreneur',
  'Executive Assistant',
  'Financial Advisor',
  'Financial Analyst',
  'Human Resources Manager',
  'Insurance Agent',
  'Investment Banker',
  'Loan Officer',
  'Office Manager',
  'Operations Manager',
  'Payroll Specialist',
  'Project Manager',
  'Purchasing Agent',
  'Quality Assurance Specialist',
  'Real Estate Agent',
  'Real Estate Appraiser',
  'Receptionist',
  'Recruiter',
  'Risk Manager',
  'Sales Representative',
  'Stockbroker',
  'Tax Preparer',
  'Underwriter',

  // Technology & Engineering
  'AI / ML Engineer',
  'Aerospace Engineer',
  'Biomedical Engineer',
  'Chemical Engineer',
  'Civil Engineer',
  'Cloud Architect',
  'Computer Hardware Engineer',
  'Content Creator',
  'Cybersecurity Analyst',
  'Data Analyst',
  'Data Engineer',
  'Data Scientist',
  'Database Administrator',
  'Developer / Software Engineer',
  'DevOps Engineer',
  'Draftsperson',
  'Electrical Engineer',
  'Environmental Engineer',
  'Game Developer',
  'Industrial Engineer',
  'IT Support Specialist',
  'IT Technician',
  'Mechanical Engineer',
  'Mobile App Developer',
  'Network Administrator',
  'Network Engineer',
  'Programmer',
  'QA Tester',
  'Robotics Engineer',
  'Security Engineer',
  'Systems Administrator',
  'Technical Writer',
  'UI/UX Designer',
  'Web Developer',

  // Creative, Media & Arts
  'Actor',
  'Animator',
  'Architect',
  'Art Director',
  'Artist',
  'Author / Writer',
  'Blogger',
  'Broadcast Technician',
  'Camera Operator',
  'Cartoonist',
  'Cinematographer',
  'Comedian',
  'Composer',
  'Content Strategist',
  'Copywriter',
  'Dancer',
  'DJ',
  'Editor',
  'Fashion Designer',
  'Film Director',
  'Film Producer',
  'Florist',
  'Graphic Designer',
  'Illustrator',
  'Interior Designer',
  'Jewelry Designer',
  'Journalist',
  'Makeup Artist',
  'Music Producer',
  'Musician',
  'Painter (Fine Art)',
  'Photographer',
  'Podcaster',
  'Poet',
  'Producer',
  'Radio Host',
  'Screenwriter',
  'Sculptor',
  'Set Designer',
  'Singer',
  'Social Media Manager',
  'Sound Engineer',
  'Stylist',
  'Tattoo Artist',
  'TV Host',
  'Video Editor',
  'Videographer',
  'Voice Actor',
  'Writer',

  // Transportation & Logistics
  'Air Traffic Controller',
  'Ambulance Driver',
  'Bike Courier',
  'Bus Driver',
  'Delivery Driver',
  'Dispatcher',
  'Dock Worker',
  'Forklift Operator',
  'Logistics Coordinator',
  'Marine Pilot',
  'Package Handler',
  'Pilot',
  'Ship Captain',
  'Sailor',
  'Taxi Driver',
  'Train Conductor',
  'Truck Driver',
  'Uber / Lyft Driver',
  'Warehouse Manager',
  'Warehouse Worker',

  // Public Service, Government & Community
  'Activist',
  'City Planner',
  'Community Organizer',
  'Correctional Officer',
  'Diplomat',
  'Election Worker',
  'Emergency Management Director',
  'Firefighter',
  'Government Official',
  'Grant Writer',
  'Judge',
  'Law Enforcement Officer',
  'Legislative Aide',
  'Mayor',
  'Military Personnel',
  'Nonprofit Director',
  'Park Ranger',
  'Parole Officer',
  'Police Officer',
  'Politician',
  'Probation Officer',
  'Public Health Worker',
  'Public Relations Specialist',
  'Social Worker',
  'Translator / Interpreter',
  'Urban Planner',
  'Volunteer Coordinator',

  // Retail, Food Service & Hospitality
  'Baker',
  'Bartender',
  'Barista',
  'Butcher',
  'Caterer',
  'Chef / Cook',
  'Concierge',
  'Event Planner',
  'Fast Food Worker',
  'Food Service Worker',
  'Grocery Clerk',
  'Hair Stylist',
  'Host / Hostess',
  'Hotel Manager',
  'Line Cook',
  'Manicurist',
  'Massage Therapist',
  'Nail Technician',
  'Pastry Chef',
  'Restaurant Manager',
  'Restauranteur',
  'Retail Manager',
  'Retail Worker',
  'Sommelier',
  'Spa Manager',
  'Tour Guide',
  'Travel Agent',
  'Waiter / Waitress',

  // Science, Law & Professional Services
  'Attorney / Lawyer',
  'Biologist',
  'Chemist',
  'Dental Lab Technician',
  'Environmental Scientist',
  'Forensic Scientist',
  'Geologist',
  'Hydrologist',
  'Laboratory Technician',
  'Landscape Architect',
  'Legal Assistant',
  'Legal Secretary',
  'Librarian',
  'Marine Biologist',
  'Mathematician',
  'Meteorologist',
  'Notary Public',
  'Paralegal',
  'Patent Attorney',
  'Physicist',
  'Research Scientist',
  'Researcher',
  'Sociologist',
  'Statistician',
  'Surveyor',

  // Fitness, Sports & Recreation
  'Athlete',
  'Coach',
  'Fitness Trainer',
  'Golf Pro',
  'Gym Owner',
  'Personal Trainer',
  'Physical Education Teacher',
  'Pilates Instructor',
  'Referee',
  'Ski Instructor',
  'Sports Agent',
  'Sports Analyst',
  'Sports Coach',
  'Swim Instructor',
  'Tennis Pro',
  'Yoga Instructor',

  // Agriculture, Environment & Animal Care
  'Agricultural Technician',
  'Animal Trainer',
  'Beekeeper',
  'Dog Groomer',
  'Dog Walker',
  'Farmer',
  'Fisherman',
  'Gardener',
  'Landscape Designer',
  'Landscaper',
  'Nursery Worker',
  'Pet Sitter',
  'Rancher',
  'Veterinary Assistant',
  'Wildlife Biologist',

  // Personal Care & Domestic
  'Caregiver',
  'Cleaning Service Worker',
  'Custodian',
  'Elder Care Provider',
  'Esthetician',
  'Family Caregiver',
  'Hair Braider',
  'Homemaker',
  'House Cleaner',
  'Housekeeper',
  'Laundry Worker',
  'Nanny',
  'Pet Groomer',
  'Residential Cleaner',

  // Status / Non-Occupational
  'Currently Unemployed',
  'Freelancer',
  'Homemaker',
  'Retired',
  'Self-Employed',
  'Student',
  'Volunteer',
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
  placeholder = 'Start typing your occupation',
  error,
}: ProfessionAutocompleteProps) {
  const [focused, setFocused] = useState(false);
  const [otherMode, setOtherMode] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // If the current value is not in the preset list, treat it as a custom entry
  const isCustom = value.trim().length > 0 && !PROFESSION_OPTIONS.some((p) => p.toLowerCase() === value.trim().toLowerCase());

  const suggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return PROFESSION_OPTIONS.slice(0, 12);
    const filtered = PROFESSION_OPTIONS.filter((p) => p.toLowerCase().includes(query));
    return filtered.slice(0, 12);
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

  // If value gets cleared externally, exit other mode
  useEffect(() => {
    if (value === '' && otherMode) {
      setOtherMode(false);
    }
  }, [value, otherMode]);

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
        }}
        onFocus={() => setFocused(true)}
        placeholder={placeholder}
        className="input-field pr-10"
        maxLength={100}
      />
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-ink-700 bg-ink-900 shadow-xl shadow-black/40 max-h-64 overflow-y-auto scrollbar-thin">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                onChange(suggestion);
                setFocused(false);
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

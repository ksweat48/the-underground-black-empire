import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/cn';

export type EthnicIdentityValue =
  | 'black_african_american'
  | 'hispanic_latino'
  | 'white'
  | 'asian'
  | 'middle_eastern_north_african'
  | 'american_indian_alaska_native'
  | 'native_hawaiian_pacific_islanderer'
  | 'another';

export const ETHNIC_IDENTITY_OPTIONS: { value: EthnicIdentityValue; label: string }[] = [
  { value: 'black_african_american', label: 'Black / African American' },
  { value: 'hispanic_latino', label: 'Hispanic / Latino' },
  { value: 'white', label: 'White' },
  { value: 'asian', label: 'Asian' },
  { value: 'middle_eastern_north_african', label: 'Middle Eastern / North African' },
  { value: 'american_indian_alaska_native', label: 'American Indian / Alaska Native' },
  { value: 'native_hawaiian_pacific_islanderer', label: 'Native Hawaiian / Pacific Islander' },
  { value: 'another', label: 'Another race / ethnic identity' },
];

export const ETHNIC_IDENTITY_LABELS: Record<EthnicIdentityValue, string> =
  ETHNIC_IDENTITY_OPTIONS.reduce(
    (acc, opt) => {
      acc[opt.value] = opt.label;
      return acc;
    },
    {} as Record<EthnicIdentityValue, string>,
  );

interface EthnicIdentitySelectorProps {
  selected: EthnicIdentityValue | null;
  detail: string;
  onSelect: (value: EthnicIdentityValue) => void;
  onDetailChange: (detail: string) => void;
  showExplanation?: boolean;
  error?: string | null;
}

export function EthnicIdentitySelector({
  selected,
  detail,
  onSelect,
  onDetailChange,
  showExplanation = true,
  error,
}: EthnicIdentitySelectorProps) {
  const hasAnother = selected === 'another';

  return (
    <div>
      {showExplanation && (
        <p className="text-sm text-ink-400 mb-4 leading-relaxed">
          The Empire tracks who is participating so every community can see who is
          helping build, support, and grow the Empire.
        </p>
      )}

      <label htmlFor="ethnic-select" className="label-field">
        Race / Ethnic Identity <span className="text-crimson-400">*</span>
      </label>
      <div className="relative">
        <select
          id="ethnic-select"
          value={selected ?? ''}
          onChange={(e) => onSelect(e.target.value as EthnicIdentityValue)}
          className="input-field appearance-none pr-10 cursor-pointer"
        >
          <option value="" disabled>Select your race / ethnic identity</option>
          {ETHNIC_IDENTITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
      </div>

      {hasAnother && (
        <div className="mt-3 animate-fade-up">
          <label htmlFor="ethnic-detail" className="label-field">
            Self-Description <span className="text-crimson-400">*</span>
          </label>
          <input
            id="ethnic-detail"
            type="text"
            value={detail}
            onChange={(e) => onDetailChange(e.target.value)}
            placeholder="Describe your race / ethnic identity"
            className="input-field"
            maxLength={100}
          />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-crimson-300 px-1">{error}</p>}
    </div>
  );
}

export default EthnicIdentitySelector;

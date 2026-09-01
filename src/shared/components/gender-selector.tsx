import { ChevronDown } from 'lucide-react';

export type GenderValue = 'male' | 'female' | 'other';

export const GENDER_OPTIONS: { value: GenderValue; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export const GENDER_LABELS: Record<GenderValue, string> = GENDER_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.value] = opt.label;
    return acc;
  },
  {} as Record<GenderValue, string>,
);

interface GenderSelectorProps {
  selected: GenderValue | null;
  detail: string;
  onSelect: (value: GenderValue) => void;
  onDetailChange: (detail: string) => void;
  error?: string | null;
}

export function GenderSelector({
  selected,
  detail,
  onSelect,
  onDetailChange,
  error,
}: GenderSelectorProps) {
  const hasOther = selected === 'other';

  return (
    <div>
      <label htmlFor="gender-select" className="label-field">
        Gender <span className="text-crimson-400">*</span>
      </label>
      <div className="relative">
        <select
          id="gender-select"
          value={selected ?? ''}
          onChange={(e) => onSelect(e.target.value as GenderValue)}
          className="input-field appearance-none pr-10 cursor-pointer"
        >
          <option value="" disabled>Select your gender</option>
          {GENDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
      </div>

      {hasOther && (
        <div className="mt-3 animate-fade-up">
          <label htmlFor="gender-detail" className="label-field">
            Self-Description <span className="text-ink-500">(optional)</span>
          </label>
          <input
            id="gender-detail"
            type="text"
            value={detail}
            onChange={(e) => onDetailChange(e.target.value)}
            placeholder="Describe your gender"
            className="input-field"
            maxLength={100}
          />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-crimson-300 px-1">{error}</p>}
    </div>
  );
}

export default GenderSelector;

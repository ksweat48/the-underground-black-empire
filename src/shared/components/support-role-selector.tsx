import { ChevronDown } from 'lucide-react';

export type SupportRole = 'supporter' | 'business_owner' | 'professional' | 'organization';

export const SUPPORT_ROLE_OPTIONS: { value: SupportRole; label: string; description: string; detailLabel: string }[] = [
  {
    value: 'supporter',
    label: 'Supporter',
    description: 'Share and help build the Empire',
    detailLabel: '',
  },
  {
    value: 'business_owner',
    label: 'Business Owner',
    description: 'List your business in the Marketplace',
    detailLabel: '',
  },
  {
    value: 'professional',
    label: 'Professional',
    description: 'Add your profession and services',
    detailLabel: '',
  },
  {
    value: 'organization',
    label: 'Organization',
    description: 'Non-profits, local initiatives, programs & community efforts',
    detailLabel: 'Organization or Initiative Name',
  },
];

export const SUPPORT_ROLE_LABELS: Record<SupportRole, string> = SUPPORT_ROLE_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.value] = opt.label;
    return acc;
  },
  {} as Record<SupportRole, string>,
);

interface SupportRoleSelectorProps {
  selected: SupportRole | null;
  detail: string;
  onSelect: (value: SupportRole) => void;
  onDetailChange: (detail: string) => void;
  error?: string | null;
}

export function SupportRoleSelector({
  selected,
  detail,
  onSelect,
  onDetailChange,
  error,
}: SupportRoleSelectorProps) {
  const currentOption = SUPPORT_ROLE_OPTIONS.find((o) => o.value === selected);
  const needsDetail = Boolean(selected && currentOption?.detailLabel);

  return (
    <div>
      <label htmlFor="support-role-select" className="label-field">
        Your Role in the Empire <span className="text-crimson-400">*</span>
      </label>
      <div className="relative">
        <select
          id="support-role-select"
          value={selected ?? ''}
          onChange={(e) => onSelect(e.target.value as SupportRole)}
          className="input-field appearance-none pr-10 cursor-pointer"
        >
          <option value="" disabled>Choose your role</option>
          {SUPPORT_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label} — {option.description}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500 pointer-events-none" />
      </div>

      {needsDetail && currentOption && (
        <div className="mt-3 animate-fade-up">
          <label htmlFor="support-role-detail" className="label-field">
            {currentOption.detailLabel} <span className="text-crimson-400">*</span>
          </label>
          <input
            id="support-role-detail"
            type="text"
            value={detail}
            onChange={(e) => onDetailChange(e.target.value)}
            placeholder={currentOption.detailLabel}
            className="input-field"
            maxLength={100}
          />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-crimson-300 px-1">{error}</p>}
    </div>
  );
}

export default SupportRoleSelector;

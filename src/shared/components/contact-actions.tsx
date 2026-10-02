import { ExternalLink, Phone } from 'lucide-react';
import { cn } from '@/shared/cn';

export interface ContactActionsProps {
  website: string | null;
  phone: string | null;
  className?: string;
}

export function ContactActions({ website, phone, className }: ContactActionsProps) {
  if (!website && !phone) return null;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {website && (
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          aria-label="Visit website"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-ink-200 bg-white text-ink-700 transition-colors hover:border-ink-400 hover:bg-ink-50"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
      {phone && (
        <a
          href={phone}
          onClick={(event) => event.stopPropagation()}
          aria-label="Call now"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-ink-200 bg-white text-ink-700 transition-colors hover:border-ink-400 hover:bg-ink-50"
        >
          <Phone className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

export function getSafeHttpUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getPhoneHref(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const match = value.match(/(?:\+?\d[\d\s().-]{6,}\d)/);
  if (!match) return null;
  const digits = match[0].replace(/[^\d+]/g, '');
  return digits.length >= 7 ? `tel:${digits}` : null;
}

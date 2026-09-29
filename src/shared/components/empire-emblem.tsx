import { useState } from 'react';
import { Landmark } from 'lucide-react';
import { cn } from '@/shared/cn';

interface EmpireEmblemProps {
  variant: 'light' | 'dark';
  className?: string;
  alt?: string;
}

const EMBLEM_SRC = {
  light: '/UBE_icon_official.png',
  dark: '/UBE_icon_official.png',
} as const;

export function EmpireEmblem({ variant, className, alt = 'The Underground Black Empire' }: EmpireEmblemProps) {
  const [imageFailed, setImageFailed] = useState(false);

  if (imageFailed) {
    return <Landmark aria-label={alt} className={cn('select-none', className)} />;
  }

  return (
    <img
      src={EMBLEM_SRC[variant]}
      alt={alt}
      className={cn('object-contain select-none', className)}
      draggable={false}
      onError={() => setImageFailed(true)}
    />
  );
}

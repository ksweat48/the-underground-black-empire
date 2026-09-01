import { cn } from '@/shared/cn';

interface EmpireEmblemProps {
  variant: 'light' | 'dark';
  className?: string;
  alt?: string;
}

const EMBLEM_SRC = {
  light: '/ube-icon-black.png',
  dark: '/ube-icon-white.png',
} as const;

export function EmpireEmblem({ variant, className, alt = 'The Underground Black Empire' }: EmpireEmblemProps) {
  return (
    <img
      src={EMBLEM_SRC[variant]}
      alt={alt}
      className={cn('object-contain select-none', className)}
      draggable={false}
    />
  );
}

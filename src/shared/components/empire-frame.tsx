import { type ReactNode, type CSSProperties } from 'react';
import { cn } from '@/shared/cn';

type FrameVariant = 'command' | 'intel' | 'utility';

interface EmpireFrameProps {
  children: ReactNode;
  variant?: FrameVariant;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  role?: string;
  'aria-label'?: string;
}

const variantClass: Record<FrameVariant, string> = {
  command: 'frame-command',
  intel: 'frame-intel',
  utility: 'frame-utility',
};

export function EmpireFrame({
  children,
  variant = 'utility',
  className,
  style,
  onClick,
  role,
  'aria-label': ariaLabel,
}: EmpireFrameProps) {
  return (
    <div
      className={cn('relative', variantClass[variant], className)}
      style={style}
      onClick={onClick}
      role={role}
      aria-label={ariaLabel}
    >
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

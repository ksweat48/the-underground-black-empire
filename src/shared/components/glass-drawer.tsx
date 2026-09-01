import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface GlassDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function GlassDrawer({ open, onClose, title, children }: GlassDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="glass-overlay animate-fade-in" onClick={onClose}>
      <div className="flex items-end justify-center min-h-full" onClick={(e) => e.stopPropagation()}>
        <div className="glass-drawer" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display text-lg font-semibold text-antique-200 uppercase tracking-wider">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-stone hover:text-ivory hover:bg-ink-800/30 transition-all"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

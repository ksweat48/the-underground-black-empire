import { useEffect } from 'react';
import { X, ScrollText } from 'lucide-react';
import {
  whitePaperSubtitle,
  whitePaperTagline,
  whitePaperSections,
  whitePaperClosing,
  type WhitePaperBlock,
} from '@/config/white-paper';

interface WhitePaperModalProps {
  open: boolean;
  onClose: () => void;
}

function Block({ block }: { block: WhitePaperBlock }) {
  return (
    <div className="mt-4 first:mt-0">
      {block.heading && (
        <h4 className="font-display text-sm font-bold uppercase tracking-wider text-empire-gold">
          {block.heading}
        </h4>
      )}
      {block.paragraphs?.map((p, i) => (
        <p
          key={i}
          className={`mt-2 text-sm leading-relaxed text-empire-text-secondary ${
            block.highlight
              ? 'rounded-lg border border-empire-gold/30 bg-empire-gold/5 px-4 py-3 font-medium text-empire-white'
              : ''
          }`}
        >
          {p}
        </p>
      ))}
      {block.bullets && (
        <ul className="mt-2 space-y-1.5 pl-1">
          {block.bullets.map((b, i) => (
            <li
              key={i}
              className="flex gap-2.5 text-sm leading-relaxed text-empire-text-secondary"
            >
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-empire-gold" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function WhitePaperModal({ open, onClose }: WhitePaperModalProps) {
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
    <div
      className="fixed inset-0 z-[60] animate-fade-in"
      style={{ background: 'rgba(10,9,8,0.92)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div className="flex min-h-full items-start justify-center px-3 py-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+2rem)]">
        <div
          className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-empire-gold/20 bg-[#0d0c0b] shadow-2xl animate-scale-in"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-empire-gold/15 bg-[#0d0c0b]/95 px-5 py-4 backdrop-blur-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <ScrollText className="h-5 w-5 shrink-0 text-empire-gold" />
              <div className="min-w-0">
                <p className="truncate font-display text-sm font-bold uppercase tracking-wider text-empire-white">
                  The White Paper
                </p>
                <p className="truncate text-[10px] uppercase tracking-[0.15em] text-empire-text-muted">
                  Treasury & Money Architecture
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-empire-text-secondary transition-all hover:bg-empire-gold/10 hover:text-empire-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="max-h-[calc(100dvh-12rem)] overflow-y-auto px-5 py-6 scrollbar-none sm:px-8 sm:py-8">
            {/* Title block */}
            <div className="text-center">
              <h2 className="font-display text-xl font-bold text-empire-white sm:text-2xl">
                THE UNDERGROUND BLACK EMPIRE
              </h2>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.15em] text-empire-gold">
                {whitePaperSubtitle}
              </p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-empire-text-secondary">
                {whitePaperTagline}
              </p>
              <div className="mx-auto mt-5 h-px w-16 bg-gradient-to-r from-transparent via-empire-gold/40 to-transparent" />
            </div>

            {/* Sections */}
            <div className="mt-8 space-y-8">
              {whitePaperSections.map((section) => (
                <section key={section.id} id={section.id}>
                  <h3 className="font-display text-base font-bold text-empire-white">
                    <span className="text-empire-gold">{section.number}.</span>{' '}
                    {section.title}
                  </h3>
                  <div className="mt-3">
                    {section.paragraphs.map((p, i) => (
                      <p
                        key={i}
                        className="mt-2 first:mt-0 text-sm leading-relaxed text-empire-text-secondary"
                      >
                        {p}
                      </p>
                    ))}
                    {section.blocks?.map((block, i) => (
                      <Block key={i} block={block} />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Closing */}
            <div className="mt-10 text-center">
              <div className="mx-auto mb-5 h-px w-16 bg-gradient-to-r from-transparent via-empire-gold/40 to-transparent" />
              <p className="font-display text-lg font-bold uppercase tracking-[0.15em] text-empire-gold">
                {whitePaperClosing.line}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-empire-text-secondary">
                {whitePaperClosing.subline}
              </p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-empire-text-muted">
                {whitePaperClosing.signature}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

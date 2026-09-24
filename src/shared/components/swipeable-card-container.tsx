import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { cn } from '@/shared/cn';

interface SwipeableCardContainerProps {
  cards: {
    label: string;
    node: ReactNode;
  }[];
  collapsed?: boolean;
  swipeable?: boolean;
  className?: string;
}

export function SwipeableCardContainer({
  cards,
  collapsed = false,
  swipeable = true,
  className,
}: SwipeableCardContainerProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartX = useRef(0);
  const [measuredWidth, setMeasuredWidth] = useState(0);

  useEffect(() => {
    const measure = () => {
      const w = containerRef.current?.offsetWidth ?? 0;
      if (w > 0) setMeasuredWidth(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const goToIndex = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(cards.length - 1, idx));
    setActiveIndex(clamped);
  }, [cards.length]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartX.current = e.touches[0].clientX;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientX - dragStartX.current;
    setDragOffset(delta);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    const threshold = measuredWidth * 0.2;

    if (dragOffset < -threshold && activeIndex < cards.length - 1) {
      setActiveIndex(activeIndex + 1);
    } else if (dragOffset > threshold && activeIndex > 0) {
      setActiveIndex(activeIndex - 1);
    }
    setDragOffset(0);
    setIsDragging(false);
  }, [isDragging, dragOffset, activeIndex, cards.length, measuredWidth]);

  const translateX = -activeIndex * measuredWidth + dragOffset;
  const hasPrev = activeIndex > 0;
  const hasNext = activeIndex < cards.length - 1;

  return (
    <div
      className={cn(
        'card-swipe-slot flex w-full min-w-0 flex-col overflow-hidden transition-all duration-300 ease-out',
        collapsed && 'hidden lg:flex',
        !swipeable && 'touch-none',
        className,
      )}
    >
      {/* Card viewport */}
      <div
        ref={containerRef}
        className="card-swipe-viewport overflow-hidden select-none flex-1"
        onTouchStart={swipeable ? handleTouchStart : (e) => e.stopPropagation()}
        onTouchMove={swipeable ? handleTouchMove : (e) => e.stopPropagation()}
        onTouchEnd={swipeable ? handleTouchEnd : (e) => e.stopPropagation()}
        style={{ cursor: swipeable ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        <div
          className="flex transition-transform h-full"
          style={{
            transform: `translateX(${translateX}px)`,
            transitionDuration: isDragging ? '0ms' : '300ms',
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {cards.map((card, idx) => (
            <div
              key={idx}
              className="shrink-0 w-full h-full"
              style={{ width: measuredWidth > 0 ? `${measuredWidth}px` : '100%' }}
            >
              {card.node}
            </div>
          ))}
        </div>
      </div>

      {/* Navigation row: Map tab | arrows + dots | Mission tab */}
      <div className="card-navigation-strip flex items-center justify-between gap-2">
        {/* Map tag — left, visible when not on the first card */}
        {hasPrev ? (
          <button
            onClick={() => goToIndex(activeIndex - 1)}
            className="card-nav-tab card-nav-tab-map group"
            aria-label={`Go to ${cards[activeIndex - 1]?.label ?? 'previous'} card`}
          >
            <ChevronLeft className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" />
            <span className="card-nav-tab-label">Map</span>
          </button>
        ) : (
          <span className="card-nav-tab-placeholder" />
        )}

        {/* Arrows + dots — center */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => goToIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            className={cn(
              'flex items-center justify-center w-5 h-5 rounded-full transition-all',
              activeIndex === 0
                ? 'opacity-30 pointer-events-none'
                : 'hover:bg-empire-black-800/30 text-empire-text-secondary hover:text-empire-gold',
            )}
            aria-label="Previous card"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>

          <div className="flex items-center gap-1.5">
            {cards.map((card, idx) => (
              <button
                key={idx}
                onClick={() => goToIndex(idx)}
                className="group flex flex-col items-center gap-1"
                aria-label={`Go to ${card.label}`}
              >
                <span
                  className={cn(
                    'rounded-full transition-all duration-300',
                    idx === activeIndex
                      ? 'w-4 h-1.5 bg-empire-gold'
                      : 'w-1.5 h-1.5 bg-empire-black-800/30 group-hover:bg-empire-black-800/50',
                  )}
                  style={idx === activeIndex ? { boxShadow: '0 0 6px rgba(17,17,17,0.3)' } : undefined}
                />
              </button>
            ))}
          </div>

          <button
            onClick={() => goToIndex(activeIndex + 1)}
            disabled={activeIndex === cards.length - 1}
            className={cn(
              'flex items-center justify-center w-5 h-5 rounded-full transition-all',
              activeIndex === cards.length - 1
                ? 'opacity-30 pointer-events-none'
                : 'hover:bg-empire-black-800/30 text-empire-text-secondary hover:text-empire-gold',
            )}
            aria-label="Next card"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        {/* Mission tag — right, visible when not on the last card */}
        {hasNext ? (
          <button
            onClick={() => goToIndex(activeIndex + 1)}
            className="card-nav-tab card-nav-tab-mission group"
            aria-label={`Go to ${cards[activeIndex + 1]?.label ?? 'next'} card`}
          >
            <span className="card-nav-tab-label">Mission</span>
            <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </button>
        ) : (
          <span className="card-nav-tab-placeholder" />
        )}
      </div>


    </div>
  );
}

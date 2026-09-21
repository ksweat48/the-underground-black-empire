import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, X } from 'lucide-react';
import { supabase } from '@/shared/supabase-client';
import type { AppNotification } from '@/domains/notifications/services';

const DISPLAY_DURATION = 4500;
const PROGRESS_INTERVAL = 50;

export function InfluenceCelebrationPopup() {
  const [current, setCurrent] = useState<AppNotification | null>(null);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const queueRef = useRef<AppNotification[]>([]);
  const isShowingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedAtRef = useRef<number>(0);
  const navigate = useNavigate();

  const showNext = useCallback(() => {
    const next = queueRef.current.shift();
    if (!next) {
      isShowingRef.current = false;
      setCurrent(null);
      setVisible(false);
      return;
    }
    isShowingRef.current = true;
    setCurrent(next);
    setVisible(true);
    setProgress(100);

    let elapsed = 0;
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => {
      elapsed += PROGRESS_INTERVAL;
      setProgress(Math.max(0, 100 - (elapsed / DISPLAY_DURATION) * 100));
    }, PROGRESS_INTERVAL);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setVisible(false);
      setTimeout(showNext, 300);
    }, DISPLAY_DURATION);
  }, []);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) clearInterval(progressRef.current);
    setVisible(false);
    setTimeout(showNext, 300);
  }, [showNext]);

  useEffect(() => {
    mountedAtRef.current = Date.now();
    const channel = supabase
      .channel('influence-celebration')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const notif = payload.new as AppNotification;
          if (notif.type !== 'influence_earned') return;
          if (new Date(notif.created_at).getTime() < mountedAtRef.current - 5000) return;
          queueRef.current.push(notif);
          if (!isShowingRef.current) showNext();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [showNext]);

  if (!current) return null;

  const amountMatch = current.body?.match(/(\d+)\s*Influence/i);
  const amount = amountMatch ? parseInt(amountMatch[1], 10) : null;

  return (
    <div
      className={`fixed top-4 left-1/2 z-[200] transition-all duration-300 ease-out ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={{
        transform: visible ? 'translate(-50%, 0)' : 'translate(-50%, -1.5rem)',
      }}
    >
      <div
        className="relative overflow-hidden rounded-2xl bg-white border border-emerald-600/15 shadow-lg shadow-emerald-950/10 cursor-pointer min-w-[280px] max-w-[360px]"
        onClick={() => {
          dismiss();
          if (current.link_url) navigate(current.link_url);
        }}
      >
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500" />

        <div className="flex items-start gap-3 p-4 pt-5">
          <div className="shrink-0 w-11 h-11 rounded-full bg-emerald-50 border border-emerald-200/80 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-display font-semibold text-stone-900">
                Influence Earned
              </p>
              {amount !== null && (
                <span className="text-lg font-display font-bold text-emerald-600 tabular-nums leading-none">
                  +{amount}
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500 leading-snug mt-0.5">
              {current.body}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              dismiss();
            }}
            className="shrink-0 p-1 rounded-full hover:bg-stone-100 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4 text-stone-400" />
          </button>
        </div>

        <div className="h-0.5 bg-stone-100">
          <div
            className="h-full bg-emerald-400"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

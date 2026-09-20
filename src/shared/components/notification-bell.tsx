import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  Users,
  Store,
  Vote as VoteIcon,
  Trophy,
  Megaphone,
  TrendingUp,
  UserPlus,
  Shield,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/shared/cn';
import { GlassDrawer } from '@/shared/components/glass-drawer';
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToNotifications,
  type AppNotification,
} from '@/domains/notifications/services';

const NOTIF_ICONS: Record<string, typeof Bell> = {
  listing_approved: Store,
  listing_needs_changes: AlertCircle,
  listing_removed: Trash2,
  listing_submitted: Store,
  referral_verified: UserPlus,
  leadership_nomination: Shield,
  voting_window_opened: VoteIcon,
  vote_confirmation: Check,
  city_upgrade: Trophy,
  empire_upgrade: TrendingUp,
  quest_notification: Megaphone,
  general_announcement: Megaphone,
  leadership_election: VoteIcon,
  treasury_funding_vote: VoteIcon,
};

const NOTIF_COLORS: Record<string, string> = {
  listing_approved: 'text-emerald-400',
  listing_needs_changes: 'text-amber-400',
  listing_removed: 'text-red-400',
  referral_verified: 'text-emerald-400',
  leadership_nomination: 'text-empire-gold',
  voting_window_opened: 'text-blue-400',
  vote_confirmation: 'text-emerald-400',
  city_upgrade: 'text-empire-gold',
  empire_upgrade: 'text-empire-gold',
  general_announcement: 'text-empire-gold',
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const unsubRef = useRef<(() => void) | null>(null);

  const loadCount = useCallback(async () => {
    try {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch { /* ignore */ }
  }, []);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications(50);
      setNotifications(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadCount();
    unsubRef.current = subscribeToNotifications(() => {
      loadCount();
      if (open) loadNotifications();
    });
    return () => { unsubRef.current?.(); };
  }, [loadCount, open, loadNotifications]);

  useEffect(() => {
    if (open) {
      loadNotifications();
    }
  }, [open, loadNotifications]);

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.is_read) {
      try {
        await markNotificationRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch { /* ignore */ }
    }
    setOpen(false);
    if (notif.link_url) {
      navigate(notif.link_url);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="command-bar-slot group relative shrink-0"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
      >
        <div className="icon-circle-sm">
          <div className="icon-circle-inner">
            <Bell className="w-5 h-5 text-empire-text-muted group-hover:text-empire-gold transition-colors" />
          </div>
        </div>
        {unreadCount > 0 && (
          <span
            className="absolute top-0.5 right-0.5 z-20 flex items-center justify-center rounded-full bg-empire-accent text-white font-bold leading-none transition-all"
            style={{
              minWidth: unreadCount > 9 ? '18px' : '14px',
              height: unreadCount > 9 ? '18px' : '14px',
              fontSize: unreadCount > 9 ? '9px' : '8px',
              padding: unreadCount > 9 ? '0 4px' : '0',
              boxShadow: '0 0 6px rgba(255,90,22,0.7)',
            }}
          >
            {displayCount}
          </span>
        )}
      </button>

      <GlassDrawer open={open} onClose={() => setOpen(false)} title="Notifications">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-stone">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </span>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-xs text-empire-gold hover:text-empire-gold/80 transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="frame-intel p-3 flex items-center gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-ink-800/40 border border-ink-700/30 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2.5 rounded bg-ink-800/40 w-2/3" />
                  <div className="h-3 rounded bg-ink-800/30 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="frame-intel p-8 text-center">
            <Bell className="w-8 h-8 text-ink-500 mx-auto mb-2" />
            <p className="text-sm text-sand">No notifications yet.</p>
            <p className="text-[11px] text-stone mt-1">
              You will see updates here when events happen.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((notif) => {
              const Icon = NOTIF_ICONS[notif.type] ?? Megaphone;
              const colorClass = NOTIF_COLORS[notif.type] ?? 'text-empire-gold';
              return (
                <button
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={cn(
                    'frame-intel w-full text-left p-3 flex items-start gap-3 transition-all duration-200 hover:border-antique-gold/30 hover:bg-ink-800/30 active:scale-[0.98]',
                    !notif.is_read && 'border-empire-accent/30 bg-empire-accent/5'
                  )}
                >
                  <div className={cn(
                    'shrink-0 w-9 h-9 rounded-full border flex items-center justify-center transition-all',
                    !notif.is_read
                      ? 'bg-empire-accent/10 border-empire-accent/30'
                      : 'bg-ink-800/40 border-ink-700/30'
                  )}>
                    <Icon className={cn('w-4 h-4', colorClass)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={cn(
                        'text-sm font-display font-semibold leading-snug line-clamp-1',
                        notif.is_read ? 'text-ink-200' : 'text-ivory'
                      )}>
                        {notif.title}
                      </p>
                      {!notif.is_read && (
                        <span className="w-2 h-2 rounded-full bg-empire-accent shrink-0" />
                      )}
                    </div>
                    {notif.body && (
                      <p className="text-xs text-stone leading-snug line-clamp-2 mt-0.5">
                        {notif.body}
                      </p>
                    )}
                    <span className="text-[10px] text-stone/70 mt-1 block tabular-nums">
                      {formatTimeAgo(notif.created_at)}
                    </span>
                  </div>
                  {notif.link_url && (
                    <div className="shrink-0 self-center">
                      <svg className="w-4 h-4 text-stone" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </GlassDrawer>
    </>
  );
}

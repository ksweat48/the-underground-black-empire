import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  MessageSquarePlus,
  Newspaper,
  CalendarPlus,
  X,
} from 'lucide-react';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import { supabase } from '@/shared/supabase-client';

type CreateAction = 'listing' | 'update' | 'news' | 'event';

interface CreateSheetContextValue {
  openSheet: () => void;
  closeSheet: () => void;
  isOpen: boolean;
}

const CreateSheetContext = createContext<CreateSheetContextValue | null>(null);

export function useCreateSheet() {
  const ctx = useContext(CreateSheetContext);
  if (!ctx) throw new Error('useCreateSheet must be used within CreateSheetProvider');
  return ctx;
}

interface CreateOption {
  key: CreateAction;
  label: string;
  description: string;
  icon: typeof Building2;
  path: string;
  requiresApprovedListing?: boolean;
  requiresCorrespondent?: boolean;
}

const CREATE_OPTIONS: CreateOption[] = [
  {
    key: 'listing',
    label: 'List a Business',
    description: 'Showcase your business, products, or services with external links for purchasing.',
    icon: Building2,
    path: '/market/create/listing',
  },
  {
    key: 'update',
    label: 'Share an Offer or Update',
    description: 'Post a short offer, update, or progress milestone from one of your approved businesses.',
    icon: MessageSquarePlus,
    path: '/market/create/update',
    requiresApprovedListing: true,
  },
  {
    key: 'news',
    label: 'Post Local News',
    description: 'Report on something happening in your city. Only approved Correspondents can post news.',
    icon: Newspaper,
    path: '/market/create/news',
    requiresCorrespondent: true,
  },
  {
    key: 'event',
    label: 'Create an Event',
    description: 'Add a community event with date, time, location, and check-in support.',
    icon: CalendarPlus,
    path: '/market/create/event',
  },
];

export function CreateSheetProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasApprovedListing, setHasApprovedListing] = useState(false);
  const [checkedApproved, setCheckedApproved] = useState(false);
  const [isCorrespondent, setIsCorrespondent] = useState(false);
  const [checkedCorrespondent, setCheckedCorrespondent] = useState(false);
  const { session } = useAuth();
  const navigate = useNavigate();

  const openSheet = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setIsOpen(false);
  }, []);

  const checkApprovedListings = useCallback(async () => {
    if (!session?.user.id || checkedApproved) return;
    try {
      const { count } = await supabase
        .from('market_listings')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', session.user.id)
        .eq('status', 'approved');
      setHasApprovedListing((count ?? 0) > 0);
      setCheckedApproved(true);
    } catch {
      setCheckedApproved(true);
    }
  }, [session?.user.id, checkedApproved]);

  const checkCorrespondentStatus = useCallback(async () => {
    if (!session?.user.id || checkedCorrespondent) return;
    try {
      const { data } = await supabase
        .from('members')
        .select('correspondent_status')
        .eq('id', session.user.id)
        .maybeSingle();
      setIsCorrespondent(data?.correspondent_status === 'approved');
      setCheckedCorrespondent(true);
    } catch {
      setCheckedCorrespondent(true);
    }
  }, [session?.user.id, checkedCorrespondent]);

  useEffect(() => {
    if (isOpen) {
      checkApprovedListings();
      checkCorrespondentStatus();
    }
  }, [isOpen, checkApprovedListings, checkCorrespondentStatus]);

  const handleSelect = useCallback(
    (option: CreateOption) => {
      setIsOpen(false);
      navigate(option.path);
    },
    [navigate],
  );

  const visibleOptions = CREATE_OPTIONS.filter((opt) => {
    if (opt.requiresApprovedListing) return hasApprovedListing;
    if (opt.requiresCorrespondent) return isCorrespondent;
    return true;
  });

  return (
    <CreateSheetContext.Provider value={{ openSheet, closeSheet, isOpen }}>
      {children}
      {isOpen && (
        <div className="glass-overlay animate-fade-in" onClick={closeSheet}>
          <div className="flex items-end justify-center min-h-full" onClick={(e) => e.stopPropagation()}>
            <div
              className="fixed bottom-0 left-0 right-0 z-50 glass-panel p-6 max-h-[85vh] overflow-y-auto scrollbar-none animate-slide-up"
              style={{
                borderRadius: 'var(--radius-card) var(--radius-card) 0 0',
                marginBottom: 'calc(env(safe-area-inset-bottom) + 4rem)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-display text-lg font-semibold text-empire-ivory uppercase tracking-wider">
                  Create
                </h3>
                <button
                  onClick={closeSheet}
                  className="p-2 rounded-xl text-empire-text-muted hover:text-empire-ivory hover:bg-ink-800/30 transition-all"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2">
                {visibleOptions.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.key}
                      onClick={() => handleSelect(option)}
                      className="w-full flex items-start gap-4 p-4 rounded-xl border border-transparent hover:border-empire-gold/20 hover:bg-ink-800/20 transition-all duration-200 text-left group active:scale-[0.99]"
                    >
                      <div
                        className="flex items-center justify-center shrink-0 w-12 h-12 rounded-xl transition-all duration-200 group-hover:scale-105"
                        style={{
                          background: 'linear-gradient(135deg, rgba(17,17,17,0.06), rgba(17,17,17,0.02))',
                          border: '1px solid rgba(17,17,17,0.12)',
                        }}
                      >
                        <Icon className="w-5 h-5 text-empire-gold" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-base font-semibold text-empire-ivory mb-0.5">
                          {option.label}
                        </p>
                        <p className="text-sm text-empire-text-secondary leading-snug">
                          {option.description}
                        </p>
                      </div>
                    </button>
                  );
                })}

                {!hasApprovedListing && checkedApproved && (
                  <div className="pt-2 pb-1">
                    <p className="text-xs text-empire-text-muted text-center">
                      Share an Offer or Update becomes available once you have an approved business listing.
                    </p>
                  </div>
                )}
                {!isCorrespondent && checkedCorrespondent && (
                  <div className="pt-1 pb-1">
                    <p className="text-xs text-empire-text-muted text-center">
                      Post Local News is available to approved Correspondents only.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </CreateSheetContext.Provider>
  );
}

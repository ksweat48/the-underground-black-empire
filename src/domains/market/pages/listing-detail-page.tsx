import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  MapPin,
  ExternalLink,
  BadgeCheck,
  CalendarDays,
  Send,
  Flag,
  Loader2,
  Image as ImageIcon,
  Store,
  ShieldAlert,
  AlertCircle,
  X,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { GlassModal } from '@/shared/components/glass-modal';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import {
  fetchListingById,
  fetchListingUpdates,
  fetchEvents,
  fetchListingComments,
  createListingComment,
  toggleListingLike,
  createContentReport,
  type MarketListing,
  type ListingUpdate,
  type MarketEvent,
  type ListingComment,
} from '@/domains/market/services';

export function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [listing, setListing] = useState<MarketListing | null>(null);
  const [updates, setUpdates] = useState<ListingUpdate[]>([]);
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [comments, setComments] = useState<ListingComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadListing = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await fetchListingById(id, userId);
      setListing(data);
      if (data) {
        const [ups, evs, coms] = await Promise.all([
          fetchListingUpdates(id),
          fetchEvents({ listingId: id, limit: 5 }),
          fetchListingComments(id),
        ]);
        setUpdates(ups);
        setEvents(evs);
        setComments(coms);
      }
    } catch (err) {
      console.error('Failed to load listing:', err);
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useEffect(() => { loadListing(); }, [loadListing]);

  const handleLike = async () => {
    if (!listing || !userId) return;
    setActionError(null);
    try {
      const newLiked = await toggleListingLike(listing.id, userId, listing.is_liked ?? false);
      setListing({
        ...listing,
        is_liked: newLiked,
        like_count: newLiked ? listing.like_count + 1 : Math.max(0, listing.like_count - 1),
      });
    } catch (err) {
      console.error('Like failed:', err);
      setActionError('Unable to like this listing. Please try again.');
    }
  };

  const handleComment = async () => {
    if (!listing || !commentText.trim()) return;
    setCommentSubmitting(true);
    setActionError(null);
    try {
      await createListingComment(listing.id, commentText.trim());
      setCommentText('');
      const coms = await fetchListingComments(listing.id);
      setComments(coms);
      setListing({ ...listing, comment_count: listing.comment_count + 1 });
    } catch (err) {
      console.error('Comment failed:', err);
      setActionError('Unable to post your comment. Please try again.');
    } finally {
      setCommentSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout fullWidth>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-empire-text-muted animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!listing) {
    return (
      <Layout fullWidth>
        <div className="max-w-[960px] lg:max-w-[1100px] mx-auto px-4 py-8">
          <div className="frame-utility p-8 text-center">
            <Store className="w-8 h-8 text-empire-text-muted mx-auto mb-3" />
            <p className="text-sm text-empire-text-secondary">This listing is not available.</p>
            <button onClick={() => navigate('/market')} className="btn-secondary mt-4 text-sm">
              Back to Market
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout fullWidth>
      <div className="max-w-[960px] lg:max-w-[1100px] mx-auto px-2 sm:px-3 pt-3 pb-32 lg:pb-10 space-y-4">
        {/* Back button */}
        <button
          onClick={() => navigate('/market')}
          className="flex items-center gap-1.5 text-sm text-empire-text-muted hover:text-empire-ivory transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Market
        </button>

        {actionError && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-empire-danger/10 border border-empire-danger/20 animate-fade-up">
            <AlertCircle className="w-4 h-4 text-empire-danger shrink-0" />
            <p className="text-xs text-empire-danger flex-1">{actionError}</p>
            <button onClick={() => setActionError(null)} className="text-empire-danger/60 hover:text-empire-danger transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Listing header card */}
        <div className="frame-command overflow-hidden animate-fade-up">
          {/* Image */}
          <div className="relative h-48 overflow-hidden bg-ink-800/10">
            {listing.image_url ? (
              <img src={listing.image_url} alt={listing.name} className="w-full h-full object-cover" />
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                <ImageIcon className="w-12 h-12 text-empire-text-muted/30" />
              </div>
            )}
            {listing.is_verified && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 backdrop-blur-sm border border-empire-success/20">
                <BadgeCheck className="w-3.5 h-3.5 text-empire-success" />
                <span className="text-[10px] font-semibold text-empire-success">Verified</span>
              </div>
            )}
            {!listing.is_verified && listing.status === 'in_review' && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/90 backdrop-blur-sm border border-amber-400/20">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-900" />
                <span className="text-[10px] font-semibold text-amber-900">In Review</span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-xl font-bold text-empire-ivory">{listing.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="badge-gold text-[10px] py-0.5 px-2 capitalize">{listing.category}</span>
                  {listing.city_name && (
                    <span className="flex items-center gap-1 text-xs text-empire-text-muted">
                      <MapPin className="w-3 h-3" />
                      {listing.city_state ? `${listing.city_name}, ${listing.city_state}` : listing.city_name}
                    </span>
                  )}
                </div>
              </div>
              {listing.price_display && (
                <span className="text-lg font-display font-bold text-empire-gold whitespace-nowrap">
                  {listing.price_display}
                </span>
              )}
            </div>

            {/* In Review notice */}
            {!listing.is_verified && listing.status === 'in_review' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/90">
                  This listing has not yet been verified by the Empire. It is still visible and can receive likes, comments, and saves.
                </p>
              </div>
            )}
            {listing.status === 'needs_changes' && listing.review_reason && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-empire-danger/10 border border-empire-danger/20">
                <ShieldAlert className="w-4 h-4 text-empire-danger shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-empire-danger">Needs Changes</p>
                  <p className="text-xs text-empire-text-secondary mt-0.5">{listing.review_reason}</p>
                </div>
              </div>
            )}

            {/* Description */}
            {listing.description && (
              <p className="text-sm text-empire-text-secondary leading-relaxed">{listing.description}</p>
            )}

            {/* Products / Services */}
            {listing.products_services && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-empire-text-muted mb-1">
                  Products & Services
                </p>
                <p className="text-sm text-empire-text-secondary leading-relaxed">{listing.products_services}</p>
              </div>
            )}

            {/* Contact info */}
            {listing.contact_info && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-empire-text-muted mb-1">
                  Contact
                </p>
                <p className="text-sm text-empire-text-secondary">{listing.contact_info}</p>
              </div>
            )}

            {/* External link */}
            {listing.external_url && (
              <a
                href={listing.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full text-sm py-2.5"
              >
                <ExternalLink className="w-4 h-4" />
                Visit Website / Purchase
              </a>
            )}

            {/* Engagement bar */}
            <div className="flex items-center gap-2 pt-2 border-t border-ink-700/15">
              <button
                onClick={handleLike}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  listing.is_liked
                    ? 'bg-empire-danger/10 text-empire-danger border border-empire-danger/20'
                    : 'frame-utility text-empire-text-muted hover:text-empire-ivory'
                )}
              >
                <Heart className={cn('w-3.5 h-3.5', listing.is_liked && 'fill-current')} />
                {listing.like_count}
              </button>
              <button
                onClick={() => setShowComments(!showComments)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium frame-utility text-empire-text-muted hover:text-empire-ivory transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                {listing.comment_count}
              </button>
              <button
                onClick={() => setShowReportModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium frame-utility text-empire-text-muted hover:text-empire-danger transition-all ml-auto"
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Comments section */}
        {showComments && (
          <div className="space-y-3 animate-fade-up">
            <div className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleComment()}
                placeholder="Write a comment..."
                className="input-field flex-1 text-sm"
              />
              <button
                onClick={handleComment}
                disabled={!commentText.trim() || commentSubmitting}
                className="btn-primary px-4 py-3 text-sm disabled:opacity-50"
              >
                {commentSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            {comments.length === 0 ? (
              <p className="text-xs text-empire-text-muted text-center py-2">No comments yet.</p>
            ) : (
              <div className="space-y-2">
                {comments.map((comment) => (
                  <div key={comment.id} className="frame-intel p-3">
                    <p className="text-xs font-semibold text-empire-ivory mb-1">{comment.author_name}</p>
                    <p className="text-sm text-empire-text-secondary">{comment.body}</p>
                    <p className="text-[10px] text-empire-text-muted mt-1">{formatTimeAgo(comment.created_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Related events */}
        {events.length > 0 && (
          <section className="animate-fade-up">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-empire-gold" />
              <h2 className="font-display text-sm font-semibold text-empire-ivory uppercase tracking-wider">
                Events from this Business
              </h2>
            </div>
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="frame-intel p-3 flex items-center gap-3">
                  <div className="flex flex-col items-center justify-center shrink-0 w-11 h-11 rounded-lg bg-empire-gold/8 border border-empire-gold/15">
                    <span className="text-[9px] font-semibold text-empire-gold uppercase">
                      {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short' })}
                    </span>
                    <span className="text-base font-display font-bold text-empire-ivory leading-none">
                      {new Date(event.event_date).getDate()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-sm font-semibold text-empire-ivory line-clamp-1">{event.name}</h3>
                    <p className="text-xs text-empire-text-muted line-clamp-1">
                      {event.event_time && `${event.event_time} · `}{event.location_text || 'Location TBA'}
                    </p>
                  </div>
                  {event.external_url && (
                    <a
                      href={event.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-empire-text-muted hover:text-empire-gold transition-colors shrink-0"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Related updates */}
        {updates.length > 0 && (
          <section className="animate-fade-up">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="w-4 h-4 text-empire-gold" />
              <h2 className="font-display text-sm font-semibold text-empire-ivory uppercase tracking-wider">
                Business Updates
              </h2>
            </div>
            <div className="space-y-2">
              {updates.map((update) => (
                <div key={update.id} className="frame-intel p-3">
                  <p className="text-sm text-empire-text-secondary">{update.body}</p>
                  {update.image_url && (
                    <img src={update.image_url} alt="" className="mt-2 rounded-lg w-full max-h-48 object-cover" />
                  )}
                  <p className="text-[10px] text-empire-text-muted mt-1">{formatTimeAgo(update.created_at)}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Report modal */}
      <ReportModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        contentId={listing.id}
        contentType="listing"
      />
    </Layout>
  );
}

// ==================== Report Modal ====================

export function ReportModal({
  open,
  onClose,
  contentId,
  contentType,
}: {
  open: boolean;
  onClose: () => void;
  contentId: string;
  contentType: 'listing' | 'update' | 'news' | 'event' | 'comment';
}) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const REPORT_REASONS = [
    'Misleading or false information',
    'Spam or promotional abuse',
    'Inappropriate content',
    'Scam or fraud',
    'Other',
  ];

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    try {
      await createContentReport({ content_type: contentType, content_id: contentId, reason, details });
      setSubmitted(true);
      setTimeout(() => {
        onClose();
        setSubmitted(false);
        setReason('');
        setDetails('');
      }, 2000);
    } catch (err) {
      console.error('Report failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassModal open={open} onClose={onClose} title="Report Content">
      {submitted ? (
        <div className="text-center py-6 space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-empire-success/10 border border-empire-success/20">
            <BadgeCheck className="w-6 h-6 text-empire-success" />
          </div>
          <p className="text-sm text-empire-text-secondary">Report submitted. Thank you for helping keep the Market safe.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label-field">Reason</label>
            <div className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg text-sm border transition-all',
                    reason === r
                      ? 'bg-empire-gold/10 border-empire-gold/25 text-empire-gold'
                      : 'frame-utility text-empire-text-secondary hover:text-empire-ivory'
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label-field">Additional details (optional)</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
              className="input-field text-sm resize-none"
              placeholder="Provide more context..."
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!reason || submitting}
            className="btn-primary w-full text-sm disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flag className="w-4 h-4" />}
            Submit Report
          </button>
        </div>
      )}
    </GlassModal>
  );
}

// ==================== Utilities ====================

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export default ListingDetailPage;

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  MapPin,
  ExternalLink,
  BadgeCheck,
  Send,
  Flag,
  Loader2,
  Image as ImageIcon,
  HeartHandshake,
  ShieldAlert,
  AlertCircle,
  X,
  TrendingUp,
} from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import {
  fetchOrganizationById,
  fetchOrganizationComments,
  createOrganizationComment,
  toggleOrganizationLike,
  type Organization,
  type OrganizationComment,
} from '@/domains/market/services';
import { ORG_TYPE_LABELS } from '@/domains/market/types';

export function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [org, setOrg] = useState<Organization | null>(null);
  const [comments, setComments] = useState<OrganizationComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadOrg = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await fetchOrganizationById(id, userId);
      setOrg(data);
      if (data) {
        const coms = await fetchOrganizationComments(id);
        setComments(coms);
      }
    } catch {
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useEffect(() => { loadOrg(); }, [loadOrg]);

  const handleLike = async () => {
    if (!org || !userId) return;
    setActionError(null);
    try {
      const newLiked = await toggleOrganizationLike(org.id, userId, org.is_liked ?? false);
      setOrg({
        ...org,
        is_liked: newLiked,
        like_count: newLiked ? org.like_count + 1 : Math.max(0, org.like_count - 1),
      });
    } catch {
      setActionError('Unable to like this organization. Please try again.');
    }
  };

  const handleComment = async () => {
    if (!org || !commentText.trim()) return;
    setCommentSubmitting(true);
    setActionError(null);
    try {
      await createOrganizationComment(org.id, commentText.trim());
      setCommentText('');
      const coms = await fetchOrganizationComments(org.id);
      setComments(coms);
      setOrg({ ...org, comment_count: org.comment_count + 1 });
    } catch {
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

  if (!org) {
    return (
      <Layout fullWidth>
        <div className="max-w-[960px] lg:max-w-[1100px] mx-auto px-4 py-8">
          <div className="frame-utility p-8 text-center">
            <HeartHandshake className="w-8 h-8 text-empire-text-muted mx-auto mb-3" />
            <p className="text-sm text-empire-text-secondary">This organization is not available.</p>
            <button onClick={() => navigate('/market')} className="btn-secondary mt-4 text-sm">
              Back to Market
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  const goalNum = org.funding_goal || 0;
  const raisedNum = org.total_raised || 0;
  const progressPct = goalNum > 0 ? Math.min(100, (raisedNum / goalNum) * 100) : 0;

  return (
    <Layout fullWidth>
      <div className="max-w-[960px] lg:max-w-[1100px] mx-auto px-2 sm:px-3 pt-3 pb-24 lg:pb-10 space-y-4">
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

        {/* Organization header card */}
        <div className="frame-command overflow-hidden animate-fade-up">
          {/* Image */}
          <div className="relative h-48 overflow-hidden bg-ink-800/10">
            {org.image_url ? (
              <img src={org.image_url} alt={org.name} className="w-full h-full object-cover" />
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                <ImageIcon className="w-12 h-12 text-empire-text-muted/30" />
              </div>
            )}
            {org.is_verified && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 backdrop-blur-sm border border-empire-success/20">
                <BadgeCheck className="w-3.5 h-3.5 text-empire-success" />
                <span className="text-[10px] font-semibold text-empire-success">Verified</span>
              </div>
            )}
            {!org.is_verified && org.status === 'in_review' && (
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
                <h1 className="font-display text-xl font-bold text-empire-ivory">{org.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="badge-gold text-[10px] py-0.5 px-2">{ORG_TYPE_LABELS[org.org_type]}</span>
                  {org.city_name && (
                    <span className="flex items-center gap-1 text-xs text-empire-text-muted">
                      <MapPin className="w-3 h-3" />
                      {org.city_state ? `${org.city_name}, ${org.city_state}` : org.city_name}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* In Review notice */}
            {!org.is_verified && org.status === 'in_review' && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/90">
                  This organization has not yet been verified by the Empire. It is still visible and can receive likes, comments, and support.
                </p>
              </div>
            )}

            {/* Mission description */}
            {org.description && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-empire-text-muted mb-1">
                  Mission
                </p>
                <p className="text-sm text-empire-text-secondary leading-relaxed">{org.description}</p>
              </div>
            )}

            {/* Fundraising progress */}
            <div className="frame-utility p-4 space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <p className="text-xs font-semibold text-empire-ivory uppercase tracking-wider">Fundraising Progress</p>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] text-empire-text-muted">Raised</p>
                  <p className="text-2xl font-display font-bold text-emerald-400 tabular-nums">
                    ${raisedNum.toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-empire-text-muted">Goal</p>
                  <p className="text-lg font-display font-semibold text-empire-text-secondary tabular-nums">
                    ${goalNum.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-ink-700/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-[10px] text-empire-text-muted">
                {progressPct.toFixed(1)}% of goal reached. Organizations can exceed their goal and appear in multiple voting rounds.
              </p>
            </div>

            {/* Contact info */}
            {org.contact_info && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-empire-text-muted mb-1">
                  Contact
                </p>
                <p className="text-sm text-empire-text-secondary">{org.contact_info}</p>
              </div>
            )}

            {/* External link */}
            {org.external_url && (
              <a
                href={org.external_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full text-sm py-2.5"
              >
                <ExternalLink className="w-4 h-4" />
                Visit Website / Donate
              </a>
            )}

            {/* Voting info callout */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-plum-500/5 border border-plum-500/15">
              <HeartHandshake className="w-4 h-4 text-plum-400 shrink-0 mt-0.5" />
              <p className="text-xs text-empire-text-secondary">
                This organization can receive community support through voting. The most liked and engaged organizations are promoted to the voting booth when voting is open.
              </p>
            </div>

            {/* Engagement bar */}
            <div className="flex items-center gap-2 pt-2 border-t border-ink-700/15">
              <button
                onClick={handleLike}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  org.is_liked
                    ? 'bg-empire-danger/10 text-empire-danger border border-empire-danger/20'
                    : 'frame-utility text-empire-text-muted hover:text-empire-ivory'
                )}
              >
                <Heart className={cn('w-3.5 h-3.5', org.is_liked && 'fill-current')} />
                {org.like_count}
              </button>
              <button
                onClick={() => setShowComments(!showComments)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium frame-utility text-empire-text-muted hover:text-empire-ivory transition-all"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                {org.comment_count}
              </button>
            </div>
          </div>
        </div>

        {/* Comments section */}
        {showComments && (
          <div className="frame-utility p-4 space-y-3 animate-fade-up">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-empire-gold" />
              <h3 className="font-display text-sm font-semibold text-empire-ivory uppercase tracking-wider">
                Comments ({comments.length})
              </h3>
            </div>

            {/* Comment input */}
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
                disabled={commentSubmitting || !commentText.trim()}
                className="btn-primary px-3 py-2 disabled:opacity-50"
              >
                {commentSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>

            {/* Comment list */}
            {comments.length === 0 ? (
              <p className="text-xs text-empire-text-muted text-center py-4">
                No comments yet. Be the first to show support.
              </p>
            ) : (
              <div className="space-y-2">
                {comments.map((comment) => (
                  <div key={comment.id} className="frame-utility p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-empire-ivory">
                        {comment.author_name ?? 'Member'}
                      </span>
                      <span className="text-[10px] text-empire-text-muted">
                        {new Date(comment.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-empire-text-secondary">{comment.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default OrganizationDetailPage;

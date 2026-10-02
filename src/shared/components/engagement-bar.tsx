import { useState, useCallback, useEffect } from 'react';
import { Heart, MessageCircle, Scale, Loader2 } from 'lucide-react';
import { cn } from '@/shared/cn';
import { supabase } from '@/shared/supabase-client';
import { NominateButton } from '@/shared/components/nominate-button';
import { Avatar } from '@/shared/components/avatar';
import type { FeedPostType } from '@/domains/market/types';
import {
  toggleListingLike,
  toggleOrganizationLike,
  toggleNewsLike,
  createListingComment,
  createOrganizationComment,
  createNewsComment,
  fetchListingComments,
  fetchOrganizationComments,
  fetchNewsComments,
} from '@/domains/market/services';

export interface EngagementBarProps {
  postType: FeedPostType;
  postId: string;
  likeCount: number;
  commentCount: number;
  isLiked?: boolean;
  authorId?: string;
  authorName?: string;
  authorAvatarUrl?: string | null;
  authorLevel?: number;
  authorInfluence?: number;
  hasNominated?: boolean;
  currentUserId?: string;
  onEngagementChange?: (updates: {
    likeCount?: number;
    commentCount?: number;
    isLiked?: boolean;
  }) => void;
}

interface CommentData {
  id: string;
  body: string;
  author_name: string;
  author_avatar_url?: string | null;
  created_at: string;
}

export function EngagementBar({
  postType,
  postId,
  likeCount: initialLikeCount,
  commentCount: initialCommentCount,
  isLiked: initialIsLiked = false,
  authorId,
  authorName,
  authorAvatarUrl,
  authorLevel,
  authorInfluence,
  hasNominated = false,
  currentUserId,
  onEngagementChange,
}: EngagementBarProps) {
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [isLiked, setIsLiked] = useState(initialIsLiked);

  const [likeLoading, setLikeLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentData[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [resolvedAuthorName, setResolvedAuthorName] = useState(authorName ?? '');
  const [resolvedAuthorAvatarUrl, setResolvedAuthorAvatarUrl] = useState<string | null>(authorAvatarUrl ?? null);

  useEffect(() => {
    setResolvedAuthorName(authorName ?? '');
    setResolvedAuthorAvatarUrl(authorAvatarUrl ?? null);
  }, [authorName, authorAvatarUrl]);

  useEffect(() => {
    if (!authorId || resolvedAuthorName) return;
    let cancelled = false;
    supabase
      .from('members')
      .select('display_name, avatar_url')
      .eq('id', authorId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) {
          setResolvedAuthorName(data.display_name ?? 'Member');
          setResolvedAuthorAvatarUrl(data.avatar_url ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [authorId, resolvedAuthorName]);

  const emit = useCallback(
    (updates: Parameters<NonNullable<EngagementBarProps['onEngagementChange']>>[0]) => {
      onEngagementChange?.(updates);
    },
    [onEngagementChange]
  );

  const handleLike = async () => {
    if (likeLoading) return;
    setLikeLoading(true);
    const newLiked = !isLiked;
    const newCount = Math.max(0, likeCount + (newLiked ? 1 : -1));
    setIsLiked(newLiked);
    setLikeCount(newCount);
    emit({ likeCount: newCount, isLiked: newLiked });
    try {
      if (postType === 'listing') {
        await toggleListingLike(postId, currentUserId ?? '', !newLiked);
      } else if (postType === 'organization') {
        await toggleOrganizationLike(postId, currentUserId ?? '', !newLiked);
      } else if (postType === 'news') {
        await toggleNewsLike(postId, !newLiked);
      }
    } catch {
      setIsLiked(!newLiked);
      setLikeCount(likeCount);
      emit({ likeCount, isLiked: !newLiked });
    } finally {
      setLikeLoading(false);
    }
  };

  const loadComments = async () => {
    setCommentsLoading(true);
    try {
      let data: CommentData[] = [];
      if (postType === 'listing') {
        const fetched = await fetchListingComments(postId);
        data = fetched.map((c) => ({
          id: c.id,
          body: c.body,
          author_name: c.author_name ?? 'Member',
          created_at: c.created_at,
        }));
      } else if (postType === 'organization') {
        const fetched = await fetchOrganizationComments(postId);
        data = fetched.map((c) => ({
          id: c.id,
          body: c.body,
          author_name: c.author_name ?? 'Member',
          created_at: c.created_at,
        }));
      } else if (postType === 'news') {
        const fetched = await fetchNewsComments(postId);
        data = fetched.map((c) => ({
          id: c.id,
          body: c.body,
          author_name: c.author_name ?? 'Member',
          author_avatar_url: c.author_avatar_url,
          created_at: c.created_at,
        }));
      }
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleCommentToggle = () => {
    if (!showComments) {
      setShowComments(true);
      loadComments();
    } else {
      setShowComments(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim() || commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      if (postType === 'listing') {
        await createListingComment(postId, commentText.trim());
      } else if (postType === 'organization') {
        await createOrganizationComment(postId, commentText.trim());
      } else if (postType === 'news') {
        await createNewsComment(postId, commentText.trim());
      }
      const newCount = commentCount + 1;
      setCommentCount(newCount);
      emit({ commentCount: newCount });
      setCommentText('');
      loadComments();
    } catch {
      // error will be visible because comment didn't appear
    } finally {
      setCommentSubmitting(false);
    }
  };

  const canNominate =
    !!authorId &&
    !!currentUserId &&
    authorId !== currentUserId &&
    !!resolvedAuthorName;

  const btnBase =
    'flex items-center gap-1.5 px-1.5 py-1 rounded-md transition-all duration-150 text-xs font-medium';

  return (
    <div className="mt-2">
      <div className="flex items-center gap-0.5 flex-wrap">
        {/* Like */}
        <button
          onClick={handleLike}
          disabled={likeLoading}
          className={cn(
            btnBase,
            isLiked
              ? 'text-emerald-500'
              : 'text-ink-400 hover:text-ink-200 hover:bg-ink-200/10',
            likeLoading && 'opacity-50'
          )}
          aria-label={isLiked ? 'Unlike' : 'Like'}
        >
          {likeLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Heart className={cn('w-3.5 h-3.5', isLiked && 'fill-current')} />
          )}
          {likeCount > 0 && <span>{likeCount}</span>}
        </button>

        {/* Comment */}
        <button
          onClick={handleCommentToggle}
          className={cn(
            btnBase,
            showComments
              ? 'text-ink-200 bg-ink-200/10'
              : 'text-ink-400 hover:text-ink-200 hover:bg-ink-200/10'
          )}
          aria-label="Comments"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          {commentCount > 0 && <span>{commentCount}</span>}
        </button>

        {/* Nominate (only for posts by other users) */}
        {canNominate && (
          <NominateButton
            candidateId={authorId}
            candidateName={resolvedAuthorName}
            candidateAvatarUrl={resolvedAuthorAvatarUrl}
            candidateLevel={authorLevel}
            candidateInfluence={authorInfluence}
            hasNominated={hasNominated}
            variant="icon"
          />
        )}
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="mt-2 pt-2 border-t border-ink-700/15 space-y-2">
          {commentsLoading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="w-4 h-4 text-ink-500 animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-xs text-ink-500 py-1">No comments yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2 items-start">
                  <div className="shrink-0">
                    <Avatar
                      name={c.author_name}
                      url={c.author_avatar_url ?? undefined}
                      size="sm"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-ink-200">
                      {c.author_name}
                    </span>{' '}
                    <span className="text-xs text-ink-400">{c.body}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-1.5">
            <input
              type="text"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && commentText.trim()) handleSubmitComment();
              }}
              placeholder="Write a comment..."
              className="input-field flex-1 text-xs py-1.5 px-2"
            />
            <button
              onClick={handleSubmitComment}
              disabled={!commentText.trim() || commentSubmitting}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
            >
              {commentSubmitting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                'Post'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

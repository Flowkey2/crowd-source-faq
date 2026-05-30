import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import CommunityPostCard from '../components/ui/CommunityPostCard';
import ThreadDetail from '../components/ui/ThreadDetail';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { CommunityDoodles } from '../components/ui/PageDoodles';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import type { Post } from '../types/ui';

const formatDate = (d: string | undefined) =>
  new Date(d ?? Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// ─── Comment type ─────────────────────────────────────────────────────────────
interface Comment {
  _id: string;
  author?: { name?: string };
  body: string;
  createdAt?: string;
  upvotes?: unknown[];
  downvotes?: unknown[];
  verified?: boolean;
}

// ─── Post Detail Dialog ───────────────────────────────────────────────────────
interface PostDetailDialogProps {
  post: Post;
  onClose: () => void;
  currentUserId: string;
  userRole: string;
}

function PostDetailDialog({ post: initialPost, onClose, currentUserId, userRole }: PostDetailDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [post, setPost] = useState<Post>(initialPost);
  const [commentText, setCommentText] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const [upvoteLoading, setUpvoteLoading] = useState(false);
  const [resolveText, setResolveText] = useState('');
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [expertHelpLoading, setExpertHelpLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isAnswered = post.status === 'answered';
  const upvoteCount = (post.upvotes?.length ?? 0);
  const hasUpvoted = post.upvotes?.some(
    (id) => (typeof id === 'object' ? (id as { _id?: string })._id || id : id)?.toString() === currentUserId
  );
  const canResolve = userRole === 'admin' || userRole === 'moderator';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (e: MouseEvent) => {
        if (e.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isContent =
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
        if (!isContent) dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('click', handleBackdropClick);
      };
    }

    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  const handleUpvote = async () => {
    if (upvoteLoading) return;
    setUpvoteLoading(true);
    try {
      const res = await api.post<{ upvotedByMe: boolean }>(`/community/${post._id}/upvote`);
      setPost((prev) => ({
        ...prev,
        upvotes: res.data.upvotedByMe
          ? [...(prev.upvotes || []), currentUserId]
          : (prev.upvotes || []).filter((u) => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId),
      }));
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Upvote failed. Please try again.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    } finally {
      setUpvoteLoading(false);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || commentLoading) return;
    setCommentLoading(true);
    try {
      const res = await api.post<{ comment: Comment }>(`/community/${post._id}/comments`, { body: commentText });
      setPost((prev) => ({ ...prev, comments: [...(prev.comments || []), res.data.comment] }));
      setCommentText('');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Comment failed. Please try again.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    } finally {
      setCommentLoading(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolveText.trim() || resolveLoading) return;
    setResolveLoading(true);
    try {
      await api.patch(`/community/${post._id}/resolve`, { answer: resolveText });
      setPost((prev) => ({ ...prev, status: 'answered', answer: resolveText.trim() }));
      setShowResolveForm(false);
      setResolveText('');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Could not mark as resolved. Please try again.';
      setActionError(msg);
      setTimeout(() => setActionError(null), 3000);
    } finally {
      setResolveLoading(false);
    }
  };

  const handleRequestExpertHelp = async () => {
    if (expertHelpLoading) return;
    setExpertHelpLoading(true);
    try {
      await api.post(`/community/${post._id}/request-expert`);
      setPost((prev) => ({ ...prev, _expertHelpRequested: true } as any));
    } catch (e) {
      console.error(e);
    } finally {
      setExpertHelpLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="post-dialog-title"
      className="m-auto w-full max-w-2xl rounded-2xl border border-border shadow-2xl bg-card p-0 backdrop:bg-ink/30 backdrop:backdrop-blur-sm"
      style={{ maxHeight: '90vh' }}
    >
      {/* Action error banner */}
      {actionError && (
        <div className="mx-6 mt-4 px-4 py-2.5 bg-danger-light border border-danger/20 rounded-xl text-xs text-danger flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-danger/60 hover:text-danger font-bold text-sm leading-none">✕</button>
        </div>
      )}
      <div className="flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
        <div className="flex items-start justify-between gap-3 p-6 pb-4 border-b border-border">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center mt-0.5
              ${isAnswered ? 'bg-success-light text-success' : 'bg-warning-light text-warning'}`}>
              {isAnswered ? (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3.5 9L7.5 13L14.5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.7"/>
                  <path d="M9 6V10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                  <circle cx="9" cy="12.5" r="0.9" fill="currentColor"/>
                </svg>
              )}
            </div>
            <div className="min-w-0">
              <h2 id="post-dialog-title" className="text-base font-semibold text-ink leading-snug">
                {post.title}
              </h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge variant={isAnswered ? 'success' : 'warning'}>
                  {isAnswered ? '✓ Answered' : '○ Open'}
                </Badge>
                <span className="text-xs text-ink-soft">by {post.author?.name || 'Student'}</span>
                <span className="text-xs text-ink-faint">·</span>
                <span className="text-xs text-ink-soft">{formatDate(post.createdAt)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => dialogRef.current?.close()}
            aria-label="Close dialog"
            className="flex-shrink-0 w-8 h-8 rounded-full bg-mist flex items-center justify-center text-ink-soft hover:text-ink hover:bg-border transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          <div className="px-6 py-4">
            <p className="text-sm text-ink/70 leading-relaxed">{post.body}</p>
          </div>

          <div className="px-6 pb-4 flex items-center gap-3">
            <button
              onClick={handleUpvote}
              disabled={upvoteLoading}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200
                ${hasUpvoted
                  ? 'bg-accent-light text-accent hover:bg-accent/15'
                  : 'bg-mist text-ink-soft hover:bg-border hover:text-ink'
                } disabled:opacity-50`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill={hasUpvoted ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
                <path d="M7 1L8.8 4.8H13L9.8 7.6L11 12L7 9.2L3 12L4.2 7.6L1 4.8H5.2L7 1Z" strokeLinejoin="round"/>
              </svg>
              {hasUpvoted ? 'Upvoted' : 'Upvote'}
              <span className="font-semibold">{upvoteCount}</span>
            </button>
            <span className="text-xs text-ink-faint flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1 2.5C1 1.67 1.67 1 2.5 1h7C10.33 1 11 1.67 11 2.5v5C11 8.33 10.33 9 9.5 9H7L4.5 11V9H2.5C1.67 9 1 8.33 1 7.5v-5z" strokeLinejoin="round"/>
              </svg>
              {post.comments?.length ?? 0} comments
            </span>

            {canResolve && !isAnswered && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowResolveForm((v) => !v)}
                className="ml-auto"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M2 6L5 9L10 3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Mark as Resolved
              </Button>
            )}

            {!canResolve && !isAnswered && currentUserId && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRequestExpertHelp}
                loading={expertHelpLoading}
                className="ml-auto"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 1L7.5 4.5H11.5L8.5 7.5L9.5 11L6 8.5L2.5 11L3.5 7.5L0.5 4.5H4.5L6 1Z"/>
                </svg>
                Request Expert Help
              </Button>
            )}
          </div>

          {isAnswered && post.answer && (
            <div className={`mx-6 mb-4 rounded-xl border p-4 ${
              post.answerIsExpert
                ? 'bg-amber-light border-amber/20'
                : 'bg-success-light border-success/20'
            }`}>
              <p className={`text-xs font-semibold mb-2 uppercase tracking-wide flex items-center gap-1.5 ${
                post.answerIsExpert ? 'text-amber' : 'text-success'
              }`}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 0L7.5 4.5H12L8.5 7L9.8 11.5L6 8.5L2.2 11.5L3.5 7L0 4.5H4.5L6 0Z"/>
                </svg>
                {post.answerIsExpert ? '⭐ Expert Mentor Answer' : 'Official Answer'}
              </p>
              <p className="text-sm text-ink/75 leading-relaxed">{post.answer}</p>
            </div>
          )}

          {showResolveForm && (
            <form onSubmit={handleResolve} className="mx-6 mb-4 rounded-xl border border-accent/20 bg-accent-light p-4">
              <label className="block text-xs font-medium text-accent mb-2">Write the official answer</label>
              <textarea
                value={resolveText}
                onChange={(e) => setResolveText(e.target.value)}
                rows={3}
                placeholder="Provide a clear, helpful answer…"
                className="w-full rounded-xl border border-accent/20 bg-card px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
              />
              <div className="flex gap-2 mt-2">
                <Button type="submit" size="sm" loading={resolveLoading} disabled={!resolveText.trim()}>
                  Save Answer
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowResolveForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          <div className="px-6 pb-2">
            <h3 className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-3">
              Comments ({post.comments?.length ?? 0})
            </h3>

            {post.comments?.length === 0 ? (
              <p className="text-sm text-ink-faint py-2">No comments yet. Be the first to comment!</p>
            ) : (
              <div className="space-y-3">
                {post.comments.map((c, i) => {
                  const comment = c as Comment;
                  const cUpvotes = comment.upvotes?.length ?? 0;
                  const cDownvotes = comment.downvotes?.length ?? 0;
                  const netScore = cUpvotes - cDownvotes;
                  const hasUpvotedComment = comment.upvotes?.some(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId);
                  const hasDownvotedComment = comment.downvotes?.some(u => (typeof u === 'object' ? (u as { _id?: string })._id || u : u)?.toString() === currentUserId);
                  const commentOpacity = netScore >= 0 ? 1 : Math.max(0.15, 1 - (Math.abs(netScore) * 0.2));

                  const handleCommentUpvote = async () => {
                    try {
                      const res = await api.post<{ upvotedByMe: boolean }>(`/community/${post._id}/comments/${comment._id}/upvote`);
                      setPost(prev => ({
                        ...prev,
                        comments: (prev.comments as Comment[]).map(cm =>
                          cm._id === comment._id ? { ...cm, upvotes: res.data.upvotedByMe ? [...(cm.upvotes || []), currentUserId] : (cm.upvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId), downvotes: (cm.downvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId) } : cm
                        )
                      }));
                    } catch (e) { console.error(e); }
                  };

                  const handleCommentDownvote = async () => {
                    try {
                      const res = await api.post<{ deleted?: boolean; downvotedByMe: boolean }>(`/community/${post._id}/comments/${comment._id}/downvote`);
                      if (res.data.deleted) {
                        try { new Audio('/fahhhhh.mp3').play(); } catch (_) {}
                        const el = document.getElementById(`comment-${comment._id}`);
                        if (el) {
                          el.style.setProperty('--current-opacity', String(commentOpacity));
                          el.classList.add('comment-dying');
                          setTimeout(() => {
                            setPost(prev => ({ ...prev, comments: (prev.comments as Comment[]).filter(cm => cm._id !== comment._id) }));
                          }, 800);
                        } else {
                          setPost(prev => ({ ...prev, comments: (prev.comments as Comment[]).filter(cm => cm._id !== comment._id) }));
                        }
                        return;
                      }
                      setPost(prev => ({
                        ...prev,
                        comments: (prev.comments as Comment[]).map(cm =>
                          cm._id === comment._id ? { ...cm, downvotes: res.data.downvotedByMe ? [...(cm.downvotes || []), currentUserId] : (cm.downvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId), upvotes: (cm.upvotes || []).filter(u => (typeof u === 'object' ? (u as { _id?: string })._id : u)?.toString() !== currentUserId) } : cm
                        )
                      }));
                    } catch (e) { console.error(e); }
                  };

                  return (
                    <div
                      key={comment._id || i}
                      id={`comment-${comment._id}`}
                      className="flex items-start gap-2.5 transition-opacity duration-300 relative"
                      style={{ opacity: commentOpacity }}
                    >
                      <Avatar name={comment.author?.name} size="sm" />
                      <div className="flex-1 bg-mist rounded-xl px-3 py-2.5 relative overflow-hidden">
                        <div className={`comment-fire-glow ${netScore > 2 ? 'active' : ''}`} />
                        <div className="relative z-10">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-medium text-ink">{comment.author?.name || 'User'}</span>
                            {comment.verified && <span className="verified-badge">✅ Verified</span>}
                            <span className="text-xs text-ink-faint">{formatDate(comment.createdAt)}</span>
                          </div>
                          <p className="text-sm text-ink/75 leading-relaxed">{comment.body}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={handleCommentUpvote}
                              className={`comment-vote-btn ${hasUpvotedComment ? 'upvoted' : ''}`}
                              title="Upvote"
                            >
                              <span className="emoji-upvote">{hasUpvotedComment ? '🔥' : '🤌'}</span>
                              <span className="text-xs font-semibold">{cUpvotes > 0 ? cUpvotes : ''}</span>
                            </button>
                            <button
                              onClick={handleCommentDownvote}
                              className={`comment-vote-btn ${hasDownvotedComment ? 'downvoted' : ''}`}
                              title="Downvote"
                            >
                              <span className="emoji-downvote">🥀</span>
                              <span className="text-xs font-semibold">{cDownvotes > 0 ? cDownvotes : ''}</span>
                            </button>
                            {netScore < 0 && (
                              <span className="text-[10px] text-ink-faint ml-1 melting-text">🧊 melting...</span>
                            )}
                            {canResolve && (
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await api.patch<{ verified: boolean }>(`/community/${post._id}/comments/${comment._id}/verify`);
                                    setPost(prev => ({
                                      ...prev,
                                      comments: (prev.comments as Comment[]).map(cm =>
                                        cm._id === comment._id ? { ...cm, verified: res.data.verified } : cm
                                      )
                                    }));
                                  } catch (e) { console.error(e); }
                                }}
                                className="ml-auto text-[10px] text-ink-faint hover:text-accent transition-colors"
                                title={comment.verified ? 'Unverify answer' : 'Mark as verified answer'}
                              >
                                {comment.verified ? 'Unverify' : '✅ Verify'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <form onSubmit={handleComment} className="px-6 pt-3 pb-6">
            <div className="flex gap-2 items-start">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={2}
                placeholder="Write a comment…"
                className="flex-1 rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!commentLoading) handleComment(e as unknown as React.FormEvent);
                  }
                }}
              />
              <Button
                type="submit"
                size="md"
                disabled={!commentText.trim()}
                loading={commentLoading}
                className="flex-shrink-0 mt-0.5"
              >
                Post
              </Button>
            </div>
            <p className="text-xs text-ink-faint mt-1.5 ml-1">Press Enter to post, Shift+Enter for newline</p>
          </form>
        </div>
      </div>
    </dialog>
  );
}

// ─── Create Post Dialog ───────────────────────────────────────────────────────
interface CreatePostDialogProps {
  onClose: () => void;
  onCreated: (post: Post) => void;
}

function CreatePostDialog({ onClose, onCreated }: CreatePostDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const DRAFT_KEY = 'yaksha_post_draft';

  // Restore draft from sessionStorage on mount
  const [title, setTitle] = useState(() => {
    try {
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft) {
        const { t } = JSON.parse(draft);
        return t || '';
      }
    } catch {}
    return '';
  });
  const [body, setBody] = useState(() => {
    try {
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft) {
        const { b } = JSON.parse(draft);
        return b || '';
      }
    } catch {}
    return '';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [faqMatch, setFaqMatch] = useState<{ question: string } | null>(null);
  const [faqCheckLoading, setFaqCheckLoading] = useState(false);
  const faqCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Save draft on field changes
  const handleTitleChange = (val: string) => {
    setTitle(val);
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ t: val, b: body })); } catch {}
  };
  const handleBodyChange = (val: string) => {
    setBody(val);
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ t: title, b: val })); } catch {}
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (e: MouseEvent) => {
        if (e.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isContent =
          rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX && e.clientX <= rect.left + rect.width;
        if (!isContent) dialog.close();
      };
      dialog.addEventListener('click', handleBackdropClick);
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('click', handleBackdropClick);
      };
    }
    return () => dialog.removeEventListener('close', handleClose);
  }, [onClose]);

  useEffect(() => {
    if (faqCheckTimerRef.current) clearTimeout(faqCheckTimerRef.current);
    const q = title.trim();
    if (q.length < 10) {
      setFaqMatch(null);
      setFaqCheckLoading(false);
      return;
    }
    setFaqCheckLoading(true);
    faqCheckTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.post<{ matched?: boolean; faq?: { question: string } }>('/faq/check-match', { query: q });
        setFaqMatch(res.data.matched ? res.data.faq : null);
      } catch (e) {
        console.error('FAQ match check failed:', e);
        setFaqMatch(null);
      } finally {
        setFaqCheckLoading(false);
      }
    }, 500);
    return () => { if (faqCheckTimerRef.current) clearTimeout(faqCheckTimerRef.current); };
  }, [title]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim() || !body.trim()) {
      setError('Both title and description are required.');
      return;
    }
    if (faqMatch) {
      setError('This question is already answered in our FAQ. Please check the FAQ page first.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ post: Post }>('/community', { title: title.trim(), body: body.trim() });
      // Clear draft on success
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
      onCreated(res.data.post);
      dialogRef.current?.close();
    } catch (err) {
      const errObj = err as { response?: { data?: { message?: string } } };
      setError(errObj.response?.data?.message || 'Failed to post. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const isSubmitDisabled = !title.trim() || !body.trim() || !!faqMatch || faqCheckLoading;

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="create-post-title"
      className="m-auto w-full max-w-lg rounded-2xl border border-border shadow-2xl bg-card p-0 backdrop:bg-ink/30 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 id="create-post-title" className="text-base font-semibold text-ink">Ask a Question</h2>
            <p className="text-xs text-ink-soft mt-0.5">Share your question with the community</p>
          </div>
          <button
            onClick={() => dialogRef.current?.close()}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full bg-mist flex items-center justify-center text-ink-soft hover:text-ink hover:bg-border transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="post-title" className="block text-xs font-medium text-ink-soft mb-1.5">
              Title <span className="text-danger">*</span>
            </label>
            <input
              id="post-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="E.g. How do I request leave during the internship?"
              maxLength={150}
              required
              className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all"
            />
            <div className="flex items-center justify-between mt-1">
              <div>
                {faqCheckLoading && (
                  <span className="text-xs text-ink-faint flex items-center gap-1">
                    <span className="w-3 h-3 border border-accent/30 border-t-accent rounded-full animate-spin inline-block" />
                    Checking FAQ...
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-faint text-right">{title.length}/150</p>
            </div>
          </div>

          {faqMatch && (
            <div className="faq-match-banner">
              <span>📖</span>
              <div>
                <p className="font-medium">This question is already answered in our FAQ!</p>
                <p className="text-xs mt-0.5 opacity-80">
                  <strong>"{faqMatch.question}"</strong>
                </p>
                <a href="/faq" className="text-xs mt-1 inline-block">→ Go to FAQ page</a>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="post-body" className="block text-xs font-medium text-ink-soft mb-1.5">
              Description <span className="text-danger">*</span>
            </label>
            <textarea
              id="post-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Describe your question in detail. Include any context that might be helpful…"
              maxLength={2000}
              required
              className="w-full rounded-xl border border-border bg-mist px-3 py-2.5 text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 focus:bg-card transition-all resize-none"
            />
            <p className="text-xs text-ink-faint mt-1 text-right">{body.length}/2000</p>
          </div>

          {error && (
            <p className="text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="submit"
              loading={loading}
              disabled={isSubmitDisabled}
              className="flex-1"
            >
              Post Question
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => dialogRef.current?.close()}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CommunityPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [search, setSearch] = useState('');

  const [searchResults, setSearchResults] = useState<Post[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Thread detail: when a post ID is set, show ThreadDetail instead of the list/dialog
  const handleOpenThread = useCallback((postId: string) => {
    setSelectedPostId(postId);
  }, []);

  const handleCloseThread = useCallback(() => {
    setSelectedPostId(null);
    // Refresh current page to pick up any new comments/upvotes
    fetchPosts(page);
  }, [page, fetchPosts]);

  // If navigated here via ?ask=true (from navbar "Ask Question") or ?post=<id> (from search)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // ?ask=true — guard auth, redirect if not logged in
    if (params.get('ask') === 'true') {
      if (!user) {
        window.history.replaceState({}, '', window.location.pathname);
        navigate('/login?redirect=/community?ask=true');
        return;
      }
      setShowCreate(true);
      window.history.replaceState({}, '', window.location.pathname);
    }

    // ?post=<id> — open thread, fetch individually if not in cached list
    const postId = params.get('post');
    if (postId) {
      const found = posts.find((p) => p._id === postId);
      if (found) {
        setSelectedPostId(postId);
      } else {
        // Post not in list — fetch individually
        api.get(`/community/${postId}`)
          .then((res) => {
            const post = res.data;
            if (post && post._id) {
              setSelectedPostId(postId);
              // Prepend to posts so it's in cache
              setPosts(prev => [post, ...prev]);
            }
          })
          .catch(() => {
            // Post not found or access denied — silently fail, don't open thread
          });
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [posts, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPosts = useCallback((pageNum = 1) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    api.get('/community', { params: { page: pageNum, limit: 20 } })
      .then((res) => {
        const incoming = res.data.posts || [];
        setPosts((prev) => pageNum === 1 ? incoming : [...prev, ...incoming]);
        setTotal(res.data.total || 0);
        setHasMore(res.data.hasMore ?? false);
        setPage(pageNum);
      })
      .catch(() => setError('Failed to load posts. Please try again.'))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  }, []);

  useEffect(() => {
    fetchPosts(1);
  }, [fetchPosts]);

  const handleLoadMore = () => {
    if (!hasMore || loadingMore) return;
    fetchPosts(page + 1);
  };

  const runSemanticSearch = useCallback(async (q: string) => {
    setSearchLoading(true);
    try {
      const res = await api.get<{ results: Post[] }>('/community/search', { params: { q } });
      setSearchResults(res.data.results || []);
    } catch (err) {
      console.error(err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      runSemanticSearch(q);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, runSemanticSearch]);

  // When filter or sort changes — refresh posts (if no search active) or re-filter existing results
  useEffect(() => {
    if (search.trim()) {
      // Search is active — re-apply filter/sort client-side to existing searchResults
      setSearchResults(prev => {
        if (!prev.length) return prev;
        let filtered = [...prev];
        if (filter === 'answered') filtered = filtered.filter(p => p.status === 'answered');
        else if (filter === 'unanswered') filtered = filtered.filter(p => p.status === 'unanswered');
        if (sort === 'newest') filtered.sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
        else if (sort === 'oldest') filtered.sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime());
        else if (sort === 'popular') filtered.sort((a, b) => ((b.upvotes?.length ?? 0)) - ((a.upvotes?.length ?? 0)));
        else if (sort === 'discussed') filtered.sort((a, b) => ((b.comments?.length ?? 0)) - ((a.comments?.length ?? 0)));
        return filtered;
      });
      return;
    }
    fetchPosts(1);
  }, [filter, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePostCreated = (newPost: Post) => {
    setPosts((prev) => [newPost, ...prev]);
    setTotal((t) => t + 1);
    setShowCreate(false);
    setHasMore(true);
  };

  const handleCloseDetail = () => {
    setSelectedPostId(null);
  };

  const visible = (() => {
    if (search.trim()) return searchResults;

    return [...posts].sort((a, b) => {
      if (sort === 'newest') return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
      if (sort === 'oldest') return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
      if (sort === 'popular') return ((b.upvotes?.length ?? 0)) - ((a.upvotes?.length ?? 0));
      if (sort === 'discussed') return ((b.comments?.length ?? 0)) - ((a.comments?.length ?? 0));
      return 0;
    });
  })();

  const displayedPosts = filter === 'all'
    ? visible
    : visible.filter((p) => p.status === filter);

  const answeredCount = posts.filter((p) => p.status === 'answered').length;
  const unansweredCount = posts.filter((p) => p.status !== 'answered').length;

  return (
    <div className="min-h-screen bg-bg grid-bg relative">
      <CommunityDoodles />
      <Navbar />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 sm:pt-24 pb-8 sm:pb-10 relative z-10">

        <div className="flex items-start justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-serif text-ink tracking-tight">Community Board</h1>
            {!loading && (
              <p className="mt-1 sm:mt-1.5 text-xs sm:text-sm text-ink-soft truncate">
                {total} discussions · {answeredCount} answered · {unansweredCount} open
              </p>
            )}
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            id="ask-question-btn"
            size="sm"
            className="sm:!px-5 sm:!py-2.5 sm:!text-sm flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2V12M2 7H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span className="hidden sm:inline">Ask a Question</span>
            <span className="sm:hidden">Ask</span>
          </Button>
        </div>

        {!loading && total > 0 && (
          <div className="relative mb-4">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M10 10L12.5 12.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions…"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 transition-all"
            />
            {searchLoading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}

        {!loading && !error && total > 0 && (
          <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
            <div className="flex gap-1 p-1 bg-mist rounded-xl w-fit">
              {[
                { key: 'all', label: 'All' },
                { key: 'answered', label: 'Answered' },
                { key: 'unanswered', label: 'Open' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
                    ${filter === key ? 'bg-card text-ink shadow-subtle' : 'text-ink-soft hover:text-ink'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-border bg-card text-xs text-ink-soft focus:outline-none focus:ring-2 focus:ring-accent/25 cursor-pointer"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="popular">Most upvoted</option>
              <option value="discussed">Most commented</option>
            </select>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-card rounded-2xl border border-border shadow-subtle p-4 flex items-start gap-4 animate-pulse">
                <div className="w-9 h-9 rounded-xl bg-mist flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-mist rounded w-3/4" />
                  <div className="h-3 bg-mist rounded w-1/2" />
                  <div className="h-3 bg-mist rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-danger-light border border-danger/15 p-4 text-sm text-danger">
            {error}
          </div>
        )}

        {!loading && !error && total === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-mist flex items-center justify-center mb-4">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" className="text-ink-faint" strokeWidth="1.5">
                <circle cx="14" cy="14" r="11"/>
                <path d="M14 8.5V14.5" strokeLinecap="round"/>
                <circle cx="14" cy="18" r="1" fill="currentColor" stroke="none"/>
              </svg>
            </div>
            <p className="text-sm font-medium text-ink-soft">No discussions yet</p>
            <p className="text-xs text-ink-faint mt-1">Be the first to ask a question!</p>
            <Button onClick={() => setShowCreate(true)} className="mt-4">
              Ask a Question
            </Button>
          </div>
        )}

        {!loading && !error && total > 0 && displayedPosts.length === 0 && (
          <p className="text-center text-sm text-ink-soft py-16">
            No posts match your current filters.
          </p>
        )}

        {!loading && !error && displayedPosts.length > 0 && (
          <div className="space-y-3">
            {displayedPosts.map((post) => (
              <CommunityPostCard
                key={post._id}
                post={post}
                onClick={(p) => handleOpenThread(p._id)}
                currentUserId={user?._id || user?.id}
              />
            ))}
          </div>
        )}

        {!loading && !search.trim() && hasMore && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-6 py-2.5 rounded-full border border-border bg-card text-sm font-medium text-ink hover:bg-cream transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loadingMore && (
                <span className="w-4 h-4 border-2 border-ink/20 border-t-ink rounded-full animate-spin inline-block" />
              )}
              {loadingMore ? 'Loading…' : `Load more${total > 0 ? ` (${total - posts.length} remaining)` : ''}`}
            </button>
          </div>
        )}

        <div className="h-12" />
      </main>

      <Footer />

      {/* Thread detail — full-page overlay replaces the list view */}
      {selectedPostId && (
        <div className="fixed inset-0 z-40 bg-bg overflow-y-auto">
          <ThreadDetail
            postId={selectedPostId}
            onClose={handleCloseDetail}
          />
        </div>
      )}

      {showCreate && (
        <CreatePostDialog
          onClose={() => setShowCreate(false)}
          onCreated={handlePostCreated}
        />
      )}
    </div>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { Send, Heart, Trash2, Edit3, Reply } from 'lucide-react';
import { useVideoStore } from '../store/useVideoStore';
import { useAuthStore } from '../store/useAuthStore';
import {
  apiDeleteVideoComment,
  apiFetchVideoComments,
  apiPatchVideoComment,
  apiPostVideoComment,
  apiToggleCommentLike,
} from '../features/feed/feedApi';
import { showToast } from '../lib/toast';
import { reportFailure } from '../lib/reportFailure';
import { LevelBadge } from './LevelBadge';
import { profileRingOuterAddMm } from '../lib/profileFrame';

/** Compact level chip — same on every comment row + composer. */
const COMMENT_LEVEL_PILL_PX = 14;
/** Avatar circle: +1mm each side vs prior 20px. */
const COMMENT_LEVEL_RING_PX = profileRingOuterAddMm(20, 2);

interface Comment {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string;
  level?: number;
  text: string;
  likes: number;
  created_at: string;
  is_liked?: boolean;
  parent_id?: string;
  replies?: Comment[];
  reply_count?: number;
}

interface CommentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string;
}

export default function CommentsModal({ isOpen, onClose, videoId }: CommentsModalProps) {
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'mostLiked'>('newest');
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [showReplies, setShowReplies] = useState<Set<string>>(new Set());
  const commentsEndRef = useRef<HTMLDivElement>(null);
  
  const { user } = useAuthStore();
  const { getVideoById, updateVideo } = useVideoStore();

  // Fetch comments when modal opens
  useEffect(() => {
    if (isOpen && videoId) {
      fetchComments();
    }
  }, [isOpen, videoId, sortBy]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const sort = sortBy === 'oldest' ? 'oldest' : 'newest';
      const { comments: raw, error } = await apiFetchVideoComments(videoId, sort);
      if (error) throw new Error(error);
      let list = Array.isArray(raw) ? (raw as Comment[]) : [];
      if (sortBy === 'mostLiked') {
        list = [...list].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0));
      }
      setComments(list);
    } catch (error) {
      reportFailure('comments_fetch', error, { videoId });
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async (parentComment?: Comment) => {
    const commentText = newComment.trim();
    if (!commentText || !user?.id || posting) return;

    setPosting(true);
    try {
      const { error } = await apiPostVideoComment(videoId, commentText, parentComment?.id || null);
      if (error) throw new Error(error);

      // Server owns comment shape — reload from GET, do not invent rows from POST body.
      setNewComment('');
      setReplyingTo(null);
      await fetchComments();

      if (!parentComment) {
        const video = getVideoById(videoId);
        if (video) {
          updateVideo(videoId, {
            stats: { ...video.stats, comments: video.stats.comments + 1 }
          });
        }
      }
    } catch (error) {
      reportFailure('comments_post', error, { videoId });
      showToast('Could not post comment');
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteComment = async (commentId: string, isReply: boolean = false, parentId?: string) => {
    try {
      const { error } = await apiDeleteVideoComment(videoId, commentId);
      if (error) throw new Error(error);

      if (isReply && parentId) {
        // Remove reply from parent comment
        setComments(prev => prev.map(comment => {
          if (comment.id === parentId) {
            return {
              ...comment,
              replies: comment.replies?.filter(reply => reply.id !== commentId) || [],
              reply_count: Math.max(0, (comment.reply_count || 0) - 1)
            };
          }
          return comment;
        }));
      } else {
        // Remove top-level comment
        setComments(prev => prev.filter(comment => comment.id !== commentId));
        const video = getVideoById(videoId);
        if (video) {
          updateVideo(videoId, {
            stats: { ...video.stats, comments: Math.max(0, video.stats.comments - 1) }
          });
        }
      }
    } catch (error) {
      reportFailure('comments_delete', error, { videoId, commentId });
    }
  };

  const handleEditComment = async (commentId: string) => {
    const nextText = editText.trim();
    if (!nextText) return;

    try {
      const { error } = await apiPatchVideoComment(videoId, commentId, nextText);
      if (error) throw new Error(error);

      // Reflect the persisted edit in local state
      setComments(prev => prev.map(comment => {
        if (comment.id === commentId) {
          return { ...comment, text: editText.trim() };
        }
        // Also check replies
        if (comment.replies) {
          return {
            ...comment,
            replies: comment.replies.map(reply => 
              reply.id === commentId ? { ...reply, text: editText.trim() } : reply
            )
          };
        }
        return comment;
      }));

      setEditingComment(null);
      setEditText('');
    } catch (error) {
      reportFailure('comments_edit', error, { videoId, commentId });
      showToast('Could not edit comment');
    }
  };

  const handleLikeComment = async (commentId: string, _isReply: boolean = false) => {
    if (!user?.id) return;

    try {
      const findLiked = (c: Comment) => c.id === commentId ? c.is_liked : undefined;
      let currentlyLiked = false;
      for (const c of comments) {
        const v = findLiked(c);
        if (v !== undefined) { currentlyLiked = !!v; break; }
        if (c.replies) {
          for (const r of c.replies) {
            const rv = findLiked(r);
            if (rv !== undefined) { currentlyLiked = !!rv; break; }
          }
        }
      }

      const action = currentlyLiked ? 'unlike' : 'like';
      await apiToggleCommentLike(videoId, commentId, action);

      setComments(prev => prev.map(comment => {
        if (comment.id === commentId) {
          return {
            ...comment,
            likes: comment.is_liked ? Math.max(0, comment.likes - 1) : comment.likes + 1,
            is_liked: !comment.is_liked
          };
        }
        if (comment.replies) {
          return {
            ...comment,
            replies: comment.replies.map(reply => 
              reply.id === commentId ? {
                ...reply,
                likes: reply.is_liked ? Math.max(0, reply.likes - 1) : reply.likes + 1,
                is_liked: !reply.is_liked
              } : reply
            )
          };
        }
        return comment;
      }));
    } catch (error) {
      reportFailure('comments_like', error, { videoId, commentId });
    }
  };

  const toggleReplies = (commentId: string) => {
    setShowReplies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  const renderComment = (comment: Comment, isReply: boolean = false) => (
    <div key={comment.id} className={`${isReply ? 'ml-12' : ''} mb-4`}>
      {/* Level + name on one line */}
      <div className="flex items-center gap-1.5 min-w-0 mb-1">
        <div className="flex-shrink-0">
          <LevelBadge
            level={comment.level || 1}
            avatar={comment.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.username || 'U')}&background=121212&color=FFFFFF`}
            layout="fixed"
            size={COMMENT_LEVEL_PILL_PX}
            circleSize={COMMENT_LEVEL_RING_PX}
            name={comment.username}
          />
        </div>
        <span
          className="font-semibold text-white text-xs truncate max-w-[150px] leading-none"
          style={{ transform: 'translateY(0.5mm)' }}
        >
          {comment.username}
        </span>
        <span className="text-white/60 text-[10px] flex-shrink-0 leading-none">
          {formatTime(comment.created_at)}
        </span>
      </div>

      <div className="min-w-0">
          {editingComment === comment.id ? (
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="flex-1 bg-white/10 text-white text-xs px-2.5 py-1 rounded-lg border border-white/20 focus:border-[#D8D9DD] outline-none"
                placeholder="Edit comment..."
              />
              <button
                onClick={() => handleEditComment(comment.id)}
                className="text-white text-xs hover:text-white/80"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingComment(null);
                  setEditText('');
                }}
                className="text-white/60 text-xs hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <p className="text-white/90 text-xs mb-1.5 break-words leading-snug w-full">
              {comment.text}
            </p>
          )}
          
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => handleLikeComment(comment.id, isReply)}
              className={`flex items-center gap-0.5 text-[9px] ${
                comment.is_liked ? 'text-white/70' : 'text-white/60'
              } hover:text-white transition`}
            >
              <Heart className={`w-2.5 h-2.5 ${comment.is_liked ? 'fill-current' : ''}`} strokeWidth={2.25} />
              {comment.likes}
            </button>
            
            {!isReply && (
              <button
                onClick={() => setReplyingTo(comment)}
                className="flex items-center gap-0.5 text-[9px] text-white/60 hover:text-white transition"
              >
                <Reply className="w-2.5 h-2.5" strokeWidth={2.25} />
                Reply
              </button>
            )}
            
            {comment.user_id === user?.id && (
              <>
                <button
                  onClick={() => {
                    setEditingComment(comment.id);
                    setEditText(comment.text);
                  }}
                  className="text-[9px] text-white/60 hover:text-white transition"
                >
                  <Edit3 className="w-2.5 h-2.5" strokeWidth={2.25} />
                </button>
                <button
                  onClick={() => handleDeleteComment(comment.id, isReply, comment.parent_id)}
                  className="text-[9px] text-white/60 hover:text-white/70 transition"
                >
                  <Trash2 className="w-2.5 h-2.5" strokeWidth={2.25} />
                </button>
              </>
            )}
          </div>
          
          {/* Replies section */}
          {!isReply && comment.replies && comment.replies.length > 0 && (
            <div className="mt-3">
              {(comment.reply_count as NonNullable<typeof comment.reply_count>) > 0 && (
                <button
                  onClick={() => toggleReplies(comment.id)}
                  className="text-xs text-white hover:text-white/80 mb-2"
                >
                  {showReplies.has(comment.id) ? 'Hide' : 'View'} {comment.reply_count} {comment.reply_count === 1 ? 'reply' : 'replies'}
                </button>
              )}
              
              {showReplies.has(comment.id) && (
                <div className="space-y-3">
                  {comment.replies.map(reply => renderComment(reply, true))}
                </div>
              )}
            </div>
          )}
          
          {/* Reply input */}
          {replyingTo?.id === comment.id && (
            <div className="mt-3 flex gap-2 items-end">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={`Reply to ${comment.username}...`}
                rows={2}
                className="flex-1 w-full bg-white/10 text-white text-xs px-2.5 py-1.5 rounded-lg border border-white/20 focus:border-[#D8D9DD] outline-none resize-none break-words leading-snug"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment(comment);
                  }
                }}
              />
              <button
                onClick={() => handleAddComment(comment)}
                className="text-white hover:text-white/80 mb-1"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setReplyingTo(null)}
                className="text-white/60 hover:text-white text-[10px] font-semibold mb-1"
              >
                Cancel
              </button>
            </div>
          )}
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-modals flex items-end justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 pointer-events-auto" onClick={onClose} />
      <div
        className="elix-glass rounded-t-2xl p-3 pb-safe h-1/2 w-full max-w-[480px] flex flex-col pointer-events-auto relative z-10 bottom-sheet-above-nav border border-black"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-0.5 pb-2">
          <div className="w-10 h-1 rounded-full bg-white/25" />
        </div>
        <div className="relative flex items-center justify-center mb-2 min-h-[28px]">
          <div className="absolute left-0 top-1/2 -translate-y-1/2">
            <button
              type="button"
              onClick={() => setSortBy('newest')}
              className={`text-[11px] font-semibold capitalize ${
                sortBy === 'newest' ? 'text-[#A7A7AD]' : 'text-white/60 hover:text-white'
              } transition-colors`}
            >
              Newest
            </button>
          </div>
          <h2 className="text-white font-semibold text-sm pointer-events-none">
            Comments
          </h2>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-3">
            {(['oldest', 'mostLiked'] as const).map(sort => (
              <button
                key={sort}
                type="button"
                onClick={() => setSortBy(sort)}
                className={`text-[11px] font-semibold capitalize ${
                  sortBy === sort ? 'text-[#A7A7AD]' : 'text-white/60 hover:text-white'
                } transition-colors`}
              >
                {sort === 'mostLiked' ? 'Most Liked' : sort}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full h-px bg-white/15 mb-2" aria-hidden />

        <div className="flex-1 overflow-y-auto no-scrollbar pr-1">
          {loading ? (
            <div className="text-center text-white/60 py-6 text-sm">Loading comments...</div>
          ) : comments.length === 0 ? (
            <div className="text-center text-white/60 py-6 text-sm">No comments yet.</div>
          ) : (
            <div className="space-y-4">
              {comments.map(comment => renderComment(comment))}
              <div ref={commentsEndRef} />
            </div>
          )}
        </div>

        <div className="pt-3 mt-2 border-t border-white/10" style={{ transform: 'translateY(-5mm)' }}>
          <div className="flex gap-2 items-center">
            {/* Input area avatar updated to LevelBadge */}
            <div className="flex-shrink-0">
                <LevelBadge
                    level={user?.level || 1}
                    avatar={user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=121212&color=FFFFFF`}
                    layout="fixed"
                    size={COMMENT_LEVEL_PILL_PX}
                    circleSize={COMMENT_LEVEL_RING_PX}
                />
            </div>
            <div className="flex-1 flex gap-2 items-end">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                rows={2}
                className="flex-1 w-full bg-[rgba(0,0,0,0.35)] text-white px-2.5 py-1.5 rounded-lg border border-white/10 focus:border-secondary outline-none text-xs resize-none break-words leading-snug"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => handleAddComment()}
                disabled={!newComment.trim() || posting}
                className="text-[#A7A7AD] hover:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed transition mb-1"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
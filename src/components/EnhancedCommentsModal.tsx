import React, { useState, useRef, useEffect } from 'react';
import { Send, Heart, Trash2, Edit3, MessageSquare, Reply, MoreVertical } from 'lucide-react';
import { useVideoStore } from '../store/useVideoStore';
import { useAuthStore } from '../store/useAuthStore';
import { request } from '../lib/apiClient';
import { LevelBadge } from './LevelBadge';

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
  const [showReplies, setShowReplies] = useState<Set<string>>(new Set());
  const commentsEndRef = useRef<HTMLDivElement>(null);
  
  const { user } = useAuthStore();
  const token = useAuthStore((s) => s.session?.access_token || '');
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
      const { data: body, error } = await request(`/api/videos/${encodeURIComponent(videoId)}/comments?sort=${sort}`);
      if (error) throw new Error(error.message);
      setComments(Array.isArray(body?.comments) ? body.comments : []);
    } catch (error) {
      console.error('Failed to fetch comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async (parentComment?: Comment) => {
    const commentText = newComment.trim();
    if (!commentText || !user?.id) return;

    try {
      const { data: body, error } = await request(`/api/videos/${encodeURIComponent(videoId)}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text: commentText, parentId: parentComment?.id || null }),
      });
      if (error) throw new Error(error.message);
      const newCommentFormatted: any = body?.comment;

      if (parentComment) {
        // Add reply to parent comment
        setComments(prev => prev.map(comment => {
          if (comment.id === parentComment.id) {
            return {
              ...comment,
              replies: [...(comment.replies || []), newCommentFormatted],
              reply_count: (comment.reply_count || 0) + 1
            };
          }
          return comment;
        }));
      } else {
        // Add top-level comment
        setComments(prev => [newCommentFormatted, ...prev]);
        // Update video comment count in store so the player UI stays in sync
        const video = getVideoById(videoId);
        if (video) {
          updateVideo(videoId, {
            stats: { ...video.stats, comments: video.stats.comments + 1 }
          });
        }
      }

      setNewComment('');
      setReplyingTo(null);
    } catch (error) {
      console.error('Failed to add comment:', error);
    }
  };

  const handleDeleteComment = async (commentId: string, isReply: boolean = false, parentId?: string) => {
    try {
      const { error } = await request(`/api/videos/${encodeURIComponent(videoId)}/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
      });
      if (error) throw new Error(error.message);

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

    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editText.trim()) return;

    try {
      // Edit not supported by backend yet; update local only so UI doesn't break.
      // (Can be added later if needed.)

      // Update comment in state
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

    }
  };

  const handleLikeComment = async (commentId: string, isReply: boolean = false) => {
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
      await request(`/api/videos/${encodeURIComponent(videoId)}/comments/${encodeURIComponent(commentId)}/${action}`, { method: 'POST' });

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
      <div className="flex gap-3">
        {/* REPLACED IMG WITH LEVEL BADGE */}
        <div className="flex-shrink-0 mt-1">
          <LevelBadge 
            level={comment.level || 1} 
            avatar={comment.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.username || 'U')}&background=121212&color=C9A96E`} 
            size={40} 
            layout="fixed"
          />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-semibold text-white truncate max-w-[150px]">{comment.username}</span>
            <span className="text-white/60 text-sm">{formatTime(comment.created_at)}</span>
          </div>
          
          {editingComment === comment.id ? (
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="flex-1 bg-white/10 text-white px-3 py-1 rounded-lg border border-white/20 focus:border-[#C9A96E] outline-none"
                placeholder="Edit comment..."
              />
              <button
                onClick={() => handleEditComment(comment.id)}
                className="text-white hover:text-white/80"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditingComment(null);
                  setEditText('');
                }}
                className="text-white/60 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <p className="text-white/90 mb-2 break-words">{comment.text}</p>
          )}
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => handleLikeComment(comment.id, isReply)}
              className={`flex items-center gap-1 text-sm ${
                comment.is_liked ? 'text-red-500' : 'text-white/60'
              } hover:text-white transition`}
            >
              <Heart className={`w-4 h-4 ${comment.is_liked ? 'fill-current' : ''}`} />
              {comment.likes}
            </button>
            
            {!isReply && (
              <button
                onClick={() => setReplyingTo(comment)}
                className="flex items-center gap-1 text-sm text-white/60 hover:text-white transition"
              >
                <Reply className="w-4 h-4" />
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
                  className="text-sm text-white/60 hover:text-white transition"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteComment(comment.id, isReply, comment.parent_id)}
                  className="text-sm text-white/60 hover:text-red-500 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
          
          {/* Replies section */}
          {!isReply && comment.replies && comment.replies.length > 0 && (
            <div className="mt-3">
              {comment.reply_count! > 0 && (
                <button
                  onClick={() => toggleReplies(comment.id)}
                  className="text-sm text-white hover:text-white/80 mb-2"
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
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={`Reply to ${comment.username}...`}
                className="flex-1 bg-white/10 text-white px-3 py-2 rounded-lg border border-white/20 focus:border-[#C9A96E] outline-none"
                autoFocus
              />
              <button
                onClick={() => handleAddComment(comment)}
                className="text-white hover:text-white/80"
              >
                <Send className="w-5 h-5" />
              </button>
              <button
                onClick={() => setReplyingTo(null)}
                className="text-white/60 hover:text-white text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-modals flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-[#1C1E24]/95 rounded-t-2xl p-3 pb-safe h-1/2 w-full max-w-[480px] shadow-2xl flex flex-col border-2 border-b-0 border-[#C9A96E]"
        style={{ marginBottom: 'calc(var(--bottom-ui-reserve) - 5mm)', boxShadow: '0 -4px 30px rgba(201,169,110,0.25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-white font-semibold text-sm flex items-center gap-2">
            <MessageSquare className="text-secondary" size={16} />
            Comments
          </h2>
          <div className="flex items-center gap-3">
            {(['newest', 'oldest', 'mostLiked'] as const).map(sort => (
              <button
                key={sort}
                onClick={() => setSortBy(sort)}
                className={`text-[11px] font-semibold capitalize ${
                  sortBy === sort ? 'text-secondary' : 'text-white/60 hover:text-white'
                } transition-colors`}
              >
                {sort === 'mostLiked' ? 'Most Liked' : sort}
              </button>
            ))}
          </div>
        </div>

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
                    avatar={user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=121212&color=C9A96E`} 
                    size={36} 
                    layout="fixed"
                />
            </div>
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 bg-[#13151A] text-white px-3 py-2 rounded-lg border border-white/10 focus:border-secondary outline-none text-sm"
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
                disabled={!newComment.trim()}
                className="text-secondary hover:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { RoyceBackIcon } from '../components/royce';
import { request } from '../lib/apiClient';
import { useAuthStore } from '../store/useAuthStore';
import { useVideoStore } from '../store/useVideoStore';
import { showToast } from '../lib/toast';
import { AvatarRing } from '../components/AvatarRing';

type Person = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export default function FollowList() {
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const location = useLocation();
  const mode = location.pathname.endsWith('/following') ? 'following' : 'followers';
  const me = useAuthStore((s) => s.user);
  const followingUsers = useVideoStore((s) => s.followingUsers);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [iFollow, setIFollow] = useState<Set<string>>(new Set(followingUsers));

  useEffect(() => {
    setIFollow(new Set(followingUsers));
  }, [followingUsers]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      if (mode === 'followers') {
        const { data } = await request<{ follower_profiles?: Person[] }>(
          `/api/profiles/${encodeURIComponent(userId)}/followers`,
        );
        setPeople(Array.isArray(data?.follower_profiles) ? data.follower_profiles : []);
      } else {
        const { data } = await request<{ following?: string[] }>(
          `/api/profiles/${encodeURIComponent(userId)}/following`,
        );
        const ids = Array.isArray(data?.following) ? data.following : [];
        const rows = await Promise.all(
          ids.slice(0, 200).map(async (id) => {
            try {
              const { data: body } = await request<{ profile?: Record<string, unknown> }>(
                `/api/profiles/${encodeURIComponent(id)}`,
              );
              const p = body?.profile ?? body;
              const rec = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
              return {
                user_id: id,
                username: String(rec.username ?? 'user'),
                display_name: (rec.displayName as string) ?? (rec.display_name as string) ?? null,
                avatar_url: (rec.avatarUrl as string) ?? (rec.avatar_url as string) ?? null,
              } as Person;
            } catch {
              return { user_id: id, username: 'user', display_name: null, avatar_url: null };
            }
          }),
        );
        setPeople(rows);
      }
    } catch {
      setPeople([]);
    } finally {
      setLoading(false);
    }
  }, [userId, mode]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFollow = async (targetId: string) => {
    if (!me?.id) {
      showToast('Log in to follow');
      navigate('/login');
      return;
    }
    if (targetId === me.id) return;
    const was = iFollow.has(targetId);
    setIFollow((prev) => {
      const next = new Set(prev);
      if (was) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
    const { error } = await request(
      was
        ? `/api/profiles/${encodeURIComponent(targetId)}/unfollow`
        : `/api/profiles/${encodeURIComponent(targetId)}/follow`,
      { method: 'POST' },
    );
    if (error) {
      setIFollow((prev) => {
        const next = new Set(prev);
        if (was) next.add(targetId);
        else next.delete(targetId);
        return next;
      });
      showToast('Could not update follow');
      return;
    }
    const prevIds = useVideoStore.getState().followingUsers;
    useVideoStore.setState({
      followingUsers: was
        ? prevIds.filter((id) => id !== targetId)
        : prevIds.includes(targetId)
          ? prevIds
          : [...prevIds, targetId],
    });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#111111] flex flex-col max-w-[480px] mx-auto">
      <div className="flex items-center justify-between px-3 pt-[max(12px,env(safe-area-inset-top))] pb-2">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back">
          <RoyceBackIcon />
        </button>
        <h1 className="text-sm font-bold text-[#D4AF37] absolute left-1/2 -translate-x-1/2">
          {mode === 'following' ? 'Following' : 'Followers'}
        </h1>
        <div className="w-8" />
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-[#C9A227] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : people.length === 0 ? (
          <p className="text-white/40 text-sm text-center py-10">
            {mode === 'following' ? 'Not following anyone yet.' : 'No followers yet.'}
          </p>
        ) : (
          <div className="space-y-1">
            {people.map((p) => {
              const name = p.display_name || p.username || 'User';
              const isMe = me?.id === p.user_id;
              const following = iFollow.has(p.user_id);
              return (
                <div key={p.user_id} className="flex items-center gap-3 py-2.5">
                  <button
                    type="button"
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    onClick={() => navigate(`/profile/${p.user_id}`)}
                  >
                    <AvatarRing src={p.avatar_url || ''} alt={name} size={44} />
                    <div className="min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{name}</p>
                      <p className="text-white/45 text-xs truncate">@{p.username}</p>
                    </div>
                  </button>
                  {!isMe && (
                    <button
                      type="button"
                      onClick={() => void toggleFollow(p.user_id)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold active:scale-95 ${
                        following
                          ? 'bg-white/10 text-white border border-white/15'
                          : 'bg-[#D4AF37] text-black'
                      }`}
                    >
                      {following ? 'Following' : 'Follow'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

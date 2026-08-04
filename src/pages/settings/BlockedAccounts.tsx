import React, { useCallback, useState, useEffect } from 'react';
import { Search, Ban } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../../lib/toast';
import { AvatarRing } from '../../components/AvatarRing';
import SettingsOptionSheet from '../../components/SettingsOptionSheet';
import {
  apiGetCurrentUserId,
  apiListBlockedUsers,
  apiUnblockUser,
} from '../../features/safety/safetyApi';

interface BlockedUser {
  blocked_user_id: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  created_at?: string;
}

export default function BlockedAccounts() {
  const navigate = useNavigate();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const goBack = useCallback(() => navigate(-1), [navigate]);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  useEffect(() => {
    if (currentUserId) {
      loadBlockedUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  const loadCurrentUser = async () => {
    try {
      const { userId, error } = await apiGetCurrentUserId();
      if (error) throw new Error(error);
      setCurrentUserId(userId);
    } catch {
      showToast('Failed to load user');
    }
  };

  const loadBlockedUsers = async () => {
    if (!currentUserId) return;

    setLoading(true);
    try {
      const { rows, error } = await apiListBlockedUsers();
      if (error) throw error;
      const list = rows as unknown as BlockedUser[];
      setBlockedUsers(list);
    } catch {
      showToast('Failed to load blocked users');
    } finally {
      setLoading(false);
    }
  };

  const unblockUser = async (blockedUserId: string) => {
    try {
      const { error } = await apiUnblockUser(blockedUserId);
      if (error) throw error;
      setBlockedUsers(prev => prev.filter(b => b.blocked_user_id !== blockedUserId));
    } catch {
      showToast('Failed to unblock user');
    }
  };

  const filteredUsers = blockedUsers.filter(
    user =>
      (user.username || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SettingsOptionSheet onClose={goBack}>
      <div className="w-full h-full overflow-hidden bg-[#0B0B0E] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-[#0B0B0E] z-10 px-4 pt-3 pb-3 border-b border-white/[0.06]">
        <div className="flex items-center justify-center mb-3">
          <h1 className="text-lg font-bold text-[#D2ADF8]">Blocked Accounts</h1>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 bg-white/[0.06] border border-white/10 rounded-full px-4 py-2.5">
          <Search className="w-5 h-5 text-white/50 shrink-0" />
          <input
            type="text"
            placeholder="Search blocked users..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm text-white placeholder-white/40"
          />
        </div>
      </div>

      {/* Blocked Users List */}
      <div className="px-4 py-4 overflow-y-auto min-h-0 pb-3">
        {loading ? (
          <div className="text-center py-12 text-white/40">Loading...</div>
        ) : (
          <div className="space-y-2.5">
            {filteredUsers.map(block => (
              <div
                key={block.blocked_user_id}
                className="flex items-center gap-3 p-3 bg-white/[0.05] border border-white/10 rounded-xl"
              >
                <AvatarRing
                  src={block.avatar_url || `https://ui-avatars.com/api/?name=${block.username || 'U'}`}
                  alt={block.username}
                  size={48}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[15px] text-white truncate">{block.display_name || block.username || 'User'}</p>
                  <p className="text-xs text-white/55 mt-0.5">Blocked {formatDate(block.created_at || '')}</p>
                </div>
                <button
                  onClick={() => unblockUser(block.blocked_user_id)}
                  className="px-4 py-2 bg-[#5F0AE3] text-black rounded-full text-sm font-semibold hover:brightness-110 transition shrink-0"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <Ban className="w-12 h-12 text-white/20 mx-auto mb-3" />
            <p className="text-white/40">
              {searchQuery ? 'No blocked users found' : 'You haven\'t blocked anyone'}
            </p>
          </div>
        )}
      </div>
      </div>
    </SettingsOptionSheet>
  );
}

function formatDate(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

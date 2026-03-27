import React, { useState, useEffect } from 'react';
import { api } from '../../lib/apiClient';
import { Search, Ban } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../../lib/toast';
import { AvatarRing } from '../../components/AvatarRing';
import SettingsOptionSheet from '../../components/SettingsOptionSheet';

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
    const { data } = await api.auth.getUser();
    setCurrentUserId(data.user?.id || null);
  };

  const loadBlockedUsers = async () => {
    if (!currentUserId) return;

    setLoading(true);
    try {
      const { data, error } = await api.blocked.list();

      if (error) throw error;
      setBlockedUsers(Array.isArray(data) ? data : []);
    } catch (error) {

    } finally {
      setLoading(false);
    }
  };

  const unblockUser = async (blockedUserId: string) => {
    try {
      const { error } = await api.blocked.unblock(blockedUserId);
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
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#13151A] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-[#13151A] z-10 px-4 py-4 border-b border-transparent">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:brightness-125 rounded-full transition">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold">Blocked Accounts</h1>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 bg-[#13151A] rounded-full px-4 py-3">
          <Search className="w-5 h-5 text-white/60" />
          <input
            type="text"
            placeholder="Search blocked users..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-white placeholder-white/40/40"
          />
        </div>
      </div>

      {/* Blocked Users List */}
      <div className="px-4 py-4 overflow-y-auto min-h-0">
        {loading ? (
          <div className="text-center py-12 text-white/40">Loading...</div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map(block => (
              <div
                key={block.blocked_user_id}
                className="flex items-center gap-3 p-4 bg-white rounded-xl"
              >
                <AvatarRing
                  src={block.avatar_url || `https://ui-avatars.com/api/?name=${block.username || 'U'}`}
                  alt={block.username}
                  size={48}
                />
                <div className="flex-1">
                  <p className="font-semibold">{block.display_name || block.username || 'User'}</p>
                  <p className="text-sm text-white/60">Blocked {formatDate(block.created_at || '')}</p>
                </div>
                <button
                  onClick={() => unblockUser(block.blocked_user_id)}
                  className="px-4 py-2 bg-[#13151A] rounded-full text-sm font-semibold hover:brightness-125 transition"
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
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

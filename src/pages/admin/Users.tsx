import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, request } from '../../lib/apiClient';
import { Ban, Search } from 'lucide-react';
import { showToast } from '../../lib/toast';

interface User {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
  coin_balance?: number;
  is_banned?: boolean;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const { data, error } = await api.profiles.list();

      if (error) throw error;

      const profiles = Array.isArray(data) ? data : [];
      const usersData = profiles.map((u: any) => ({
        id: u.user_id || u.userId || u.id,
        username: u.username || '',
        email: u.email || '',
        avatar_url: u.avatar_url || u.avatarUrl || null,
        created_at: u.created_at || u.createdAt || '',
      }));

      setUsers(usersData);
    } catch {
      showToast('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async (userId: string) => {
    try {
      const { error } = await request(`/api/admin/users/${encodeURIComponent(userId)}/ban`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Banned by admin' }),
      });
      if (error) throw error;
      showToast('User banned successfully');
      loadUsers();
    } catch {
      showToast('Failed to ban user');
    }
  };

  const filteredUsers = users.filter(
    u =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <div className="min-h-screen bg-[#13151A] flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-[#13151A] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">User Management</h1>

        {/* Search */}
        <div className="mb-6 flex items-center gap-4 bg-[#1C1E24] rounded-lg px-4 py-3">
          <Search className="w-5 h-5 text-white" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-white"
          />
        </div>

        {/* Users Table */}
        <div className="bg-[#1C1E24] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#2A2D35]">
              <tr>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Joined</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id} className="hover:bg-[#2A2D35]/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                        <img
                          src={user.avatar_url || `https://ui-avatars.com/api/?name=${user.username}`}
                          alt={user.username}
                          className="w-full h-full object-cover object-center"
                        />
                      </div>
                      <span className="font-semibold">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{user.email}</td>
                  <td className="px-4 py-3 text-gray-400">{user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/profile/${user.id}`)}
                        className="px-3 py-1 bg-[#C9A96E] rounded hover:bg-[#B8943F] text-sm"
                      >
                        View
                      </button>
                      <button
                        onClick={() => handleBanUser(user.id)}
                        className="px-3 py-1 bg-red-600 rounded hover:bg-red-700 text-sm flex items-center gap-1"
                      >
                        <Ban className="w-4 h-4" />
                        Ban
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

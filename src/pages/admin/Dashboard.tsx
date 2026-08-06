import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Users, Video, DollarSign, Flag, Zap } from 'lucide-react';
import { showToast } from '../../lib/toast';
import { apiFetchAdminDashboardSourceData } from '../../features/admin/adminApi';

interface DashboardStats {
  dailyActiveUsers: number;
  totalUsers: number;
  totalVideos: number;
  liveRooms: number;
  totalRevenue: number;
  pendingReports: number;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const goAdminPath = useCallback((path: string) => navigate(path), [navigate]);
  const [stats, setStats] = useState<DashboardStats>({
    dailyActiveUsers: 0,
    totalUsers: 0,
    totalVideos: 0,
    liveRooms: 0,
    totalRevenue: 0,
    pendingReports: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data, error } = await apiFetchAdminDashboardSourceData();
      if (error) throw new Error(error);

      setStats({
        dailyActiveUsers: data.dailyActiveUsers,
        totalUsers: data.totalUsers,
        totalVideos: data.totalVideos,
        liveRooms: data.liveRooms,
        totalRevenue: data.totalRevenueMinor / 100,
        pendingReports: data.pendingReports,
      });
    } catch {
      showToast('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[rgba(0,0,0,0.35)] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[rgba(0,0,0,0.35)] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-white" />
          Admin Dashboard
        </h1>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <StatCard
            icon={<Users className="w-8 h-8" />}
            title="Daily Active Users"
            value={stats.dailyActiveUsers.toLocaleString()}
            color="blue"
          />
          <StatCard
            icon={<Users className="w-8 h-8" />}
            title="Total Users"
            value={stats.totalUsers.toLocaleString()}
            color="green"
          />
          <StatCard
            icon={<Video className="w-8 h-8" />}
            title="Total Videos"
            value={stats.totalVideos.toLocaleString()}
            color="purple"
          />
          <StatCard
            icon={<Zap className="w-8 h-8" />}
            title="Live Rooms"
            value={stats.liveRooms.toLocaleString()}
            color="red"
          />
          <StatCard
            icon={<DollarSign className="w-8 h-8" />}
            title="Total Revenue"
            value={`$${stats.totalRevenue.toLocaleString()}`}
            color="yellow"
          />
          <StatCard
            icon={<Flag className="w-8 h-8" />}
            title="Pending Reports"
            value={stats.pendingReports.toLocaleString()}
            color="orange"
          />
        </div>

        {/* Quick Actions */}
        <div className="bg-[#09090B] rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <ActionButton href="/admin/users" label="Manage Users" onClick={goAdminPath} />
            <ActionButton href="/admin/reports" label="Review Reports" onClick={goAdminPath} />
            <ActionButton href="/admin/economy" label="Economy Controls" onClick={goAdminPath} />
            <ActionButton href="/admin/monetisation" label="Monetisation" onClick={goAdminPath} />
            <ActionButton href="/admin/purchases" label="IAP & Shop Purchases" onClick={goAdminPath} />
            <ActionButton href="/admin/withdrawals" label="Withdrawals" onClick={goAdminPath} />
            <ActionButton href="/admin/rising-stars" label="Rising Stars" onClick={goAdminPath} />
            <ActionButton href="/admin/progression" label="Starter Coins & XP" onClick={goAdminPath} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, title, value, color }: { icon: React.ReactNode; title: string; value: string; color: string }) {
  const colorClasses = {
    blue: 'from-blue-500/20 to-blue-600/5',
    green: 'from-green-500/20 to-green-600/5',
    purple: 'from-purple-500/20 to-purple-600/5',
    red: 'from-red-500/20 to-red-600/5',
    yellow: 'from-yellow-500/20 to-yellow-600/5',
    orange: 'from-orange-500/20 to-orange-600/5',
  };

  return (
    <div className={`bg-gradient-to-br ${colorClasses[color as keyof typeof colorClasses]} rounded-lg p-6`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-white/80">{icon}</div>
      </div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      <div className="text-sm text-white/60">{title}</div>
    </div>
  );
}

function ActionButton({ href, label, onClick }: { href: string; label: string; onClick?: (href: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(href)}
      className="px-4 py-3 bg-[#6F3FF5] text-white rounded-lg font-semibold hover:bg-[#6F3FF5]/90 transition text-center"
    >
      {label}
    </button>
  );
}

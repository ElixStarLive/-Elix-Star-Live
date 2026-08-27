import { Link } from 'react-router-dom';
import { ArrowLeft, BarChart3, Flag, Star, TrendingUp, Users, Wallet } from 'lucide-react';

const ITEMS = [
  { label: 'Users', to: '/admin/users', icon: Users },
  { label: 'Reports', to: '/admin/reports', icon: Flag },
  { label: 'Economy', to: '/admin/economy', icon: BarChart3 },
  { label: 'Progression', to: '/admin/progression', icon: TrendingUp },
  { label: 'Rising Stars', to: '/admin/rising-stars', icon: Star },
  { label: 'Payouts', to: '/admin/payouts', icon: Wallet },
];

export default function Admin() {
  return (
    <div className="min-h-[100dvh] bg-black p-4 text-white">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/feed" className="text-white/70 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-fluid-xl font-bold">Admin</h1>
      </header>

      <div className="grid grid-cols-2 gap-3">
        {ITEMS.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-6 text-center"
          >
            <item.icon className="h-8 w-8 text-white/60" />
            <span className="text-fluid-sm font-semibold">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

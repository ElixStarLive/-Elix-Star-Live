import { useCallback } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeDollarSign,
  ChevronRight,
  Copyright,
  FileText,
  Lock,
  Mail,
  Music,
  Package,
  ShieldAlert,
  Users,
} from 'lucide-react';

const ITEMS = [
  { icon: FileText, label: 'Terms & Conditions', to: '/terms' },
  { icon: Lock, label: 'Privacy Policy', to: '/privacy' },
  { icon: Copyright, label: 'Copyright Notice', to: '/copyright' },
  { icon: Music, label: 'Audio & Music Disclaimer', to: '/legal/audio' },
  { icon: Users, label: 'UGC Disclaimer', to: '/legal/ugc' },
  { icon: BadgeDollarSign, label: 'Affiliate / Sponsored Disclosure', to: '/legal/affiliate' },
  { icon: Package, label: 'Supplier Agreement', to: '/legal/supplier' },
  { icon: Mail, label: 'DMCA / Copyright Report', to: '/legal/dmca' },
  { icon: ShieldAlert, label: 'Safety', to: '/legal/safety' },
];

export default function LegalHub() {
  const navigate = useNavigate();
  const location = useLocation();

  const exit = useCallback(() => {
    const from = (location.state as { from?: string } | null)?.from ?? '/settings';
    navigate(from, { replace: true });
  }, [navigate, location.state]);

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Legal</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-y-contain px-4 pb-24 pt-2">
        <div className="flex flex-col gap-0">
          {ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => navigate(item.to)}
              className="flex w-full items-center gap-3 rounded-md px-2.5 py-3 text-left text-white/80 hover:bg-white/5"
            >
              <item.icon className="h-5 w-5" />
              <span className="flex-1 text-fluid-sm">{item.label}</span>
              <ChevronRight className="h-4 w-4 text-white/40" />
            </button>
          ))}
        </div>

        <div className="mt-6 space-y-2 border-t border-white/10 pt-4 text-fluid-xs text-white/50">
          <p>DMCA: <span className="font-semibold text-white/80">dmca@elixstarlive.com</span></p>
          <p>Support: <span className="font-semibold text-white/80">support@elixstarlive.co.uk</span></p>
        </div>
      </main>
    </div>
  );
}

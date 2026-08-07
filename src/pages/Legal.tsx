import React, { useCallback } from 'react';
import { ChevronRight, FileText, Lock, Copyright, Music, Users, BadgeDollarSign, ShieldAlert, Mail, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import SettingsOptionSheet from '../components/SettingsOptionSheet';
import { SETTINGS_HOME } from '../lib/settingsNav';

export default function Legal() {
  const navigate = useNavigate();

  const exit = useCallback(() => navigate(SETTINGS_HOME, { replace: true }), [navigate]);
  const openLegalItem = useCallback((to: string) => navigate(to), [navigate]);
  const dmcaEmail = 'dmca@elixstarlive.com';
  const supportEmail = 'support@elixstarlive.co.uk';

  const items = [
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

  return (
    <SettingsOptionSheet onClose={exit} title="Legal">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="flex flex-col gap-0">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md"
              onClick={() => openLegalItem(item.to)}
            >
              <span
                className="royce-glow-disc shrink-0"
                style={{ width: 36, height: 36 }}
                aria-hidden
              >
                <item.icon size={18} className="royce-icon-gold" />
              </span>
              <span className="flex-1 text-[15px] text-[#E6E9EE]">{item.label}</span>
              <ChevronRight size={16} className="text-white/30 shrink-0" />
            </button>
          ))}

          <div className="mt-4 px-2.5 pt-3 border-t border-white/10 text-xs text-[#8B9099] space-y-2">
            <div>
              DMCA: <span className="text-[#E6E9EE] font-semibold">{dmcaEmail}</span>
            </div>
            <div>
              Support: <span className="text-[#E6E9EE] font-semibold">{supportEmail}</span>
            </div>
          </div>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}

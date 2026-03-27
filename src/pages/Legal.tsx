import React from 'react';
import { FileText, Lock, Copyright, Music, Users, BadgeDollarSign, ShieldAlert, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function Legal() {
  const navigate = useNavigate();
  const dmcaEmail = 'dmca@elixstarlive.com';
  const supportEmail = 'support@elixstarlive.co.uk';

  const items = [
    { icon: FileText, label: 'Terms & Conditions', to: '/terms' },
    { icon: Lock, label: 'Privacy Policy', to: '/privacy' },
    { icon: Copyright, label: 'Copyright Notice', to: '/copyright' },
    { icon: Music, label: 'Audio & Music Disclaimer', to: '/legal/audio' },
    { icon: Users, label: 'UGC Disclaimer', to: '/legal/ugc' },
    { icon: BadgeDollarSign, label: 'Affiliate / Sponsored Disclosure', to: '/legal/affiliate' },
    { icon: Mail, label: 'DMCA / Copyright Report', to: '/legal/dmca' },
    { icon: ShieldAlert, label: 'Safety', to: '/legal/safety' },
  ];

  return (
    <div className="bg-[#13151A] text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] rounded-3xl overflow-hidden bg-[#13151A] flex flex-col overflow-y-auto p-4">
        <header className="flex items-center justify-between mb-6">
          <button onClick={() => navigate(-1)} aria-label="Back">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">Legal</h1>
          <div className="w-6" />
        </header>

        <div className="space-y-1">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className="w-full flex items-center p-4 hover:bg-[#13151A] cursor-pointer text-left"
              onClick={() => navigate(item.to)}
            >
              <item.icon size={20} className="mr-4 text-white" />
              <span className="text-base">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-8 border-t border-gray-800 pt-4 text-xs text-white/60 space-y-2">
          <div>
            DMCA: <span className="text-white font-semibold">{dmcaEmail}</span>
          </div>
          <div>
            Support: <span className="text-white font-semibold">{supportEmail}</span>
          </div>
        </div>
      </div>
    </div>
  );
}


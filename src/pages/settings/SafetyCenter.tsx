import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Lock, Eye, AlertTriangle, Ban, Flag, HelpCircle } from 'lucide-react';
import SettingsOptionSheet from '../../components/SettingsOptionSheet';

export default function SafetyCenter() {
  const navigate = useNavigate();
  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#111111] flex flex-col">
        <header className="flex items-center justify-center mb-2 px-4 pt-2">
          <h1 className="font-bold text-lg text-[#D4AF37]">Safety Center</h1>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 space-y-4">
          <Section title="Quick Actions">
            <OptionRow
              icon={<Ban size={18} />}
              title="Blocked Accounts"
              description="Manage users you've blocked."
              onClick={() => navigate('/settings/blocked')}
            />
            <OptionRow
              icon={<Flag size={18} />}
              title="Report a Problem"
              description="Report users or content violating guidelines."
              onClick={() => navigate('/report?type=support&id=support_ticket')}
            />
          </Section>

          <Section title="Privacy Controls">
            <OptionRow
              icon={<Lock size={18} />}
              title="Account Privacy"
              description="Control who can see your content."
              onClick={() => navigate('/edit-profile')}
            />
            <OptionRow
              icon={<Eye size={18} />}
              title="Data & Personalization"
              description="Manage how your data is used."
              onClick={() => navigate('/privacy')}
            />
          </Section>

          <Section title="Resources">
            <OptionRow
              icon={<AlertTriangle size={18} />}
              title="Community Guidelines"
              description="Read what is allowed on Elix Star."
              onClick={() => navigate('/guidelines')}
            />
            <OptionRow
              icon={<HelpCircle size={18} />}
              title="Safety Tips"
              description="Open online safety best practices."
              onClick={() => navigate('/guidelines')}
            />
          </Section>

          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <p className="text-sm font-bold text-gold-bright/90">Need Immediate Help?</p>
            <p className="text-xs text-gold-bright/60 mt-1 leading-relaxed">
              If you or someone you know is in immediate danger, contact emergency services.
            </p>
            <p className="text-xs text-gold-bright/50 mt-2">US: 911&nbsp;&nbsp;|&nbsp;&nbsp;UK: 999&nbsp;&nbsp;|&nbsp;&nbsp;EU: 112</p>
          </div>

          <Section title="Support">
            <OptionRow
              icon={<HelpCircle size={18} />}
              title="Contact Support"
              description="Send us a message and we will respond."
              onClick={() => navigate('/support')}
            />
          </Section>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-white/35 uppercase tracking-[0.12em] mb-1.5 px-1 font-semibold">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function OptionRow({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-lg"
    >
      <span
        className="royce-glow-disc shrink-0 [&_svg]:size-[18px]"
        style={{ width: '36px', height: '36px' }}
      >
        <span className="royce-icon-gold">{icon}</span>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] leading-tight text-white/85">{title}</p>
        <p className="text-xs text-white/45 mt-0.5">{description}</p>
      </div>
      <ChevronRight size={16} className="text-white/30 shrink-0" />
    </button>
  );
}

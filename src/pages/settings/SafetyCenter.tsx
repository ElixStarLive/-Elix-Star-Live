import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Lock, Eye, AlertTriangle, Ban, Flag, HelpCircle } from 'lucide-react';
import SettingsOptionSheet from '../../components/SettingsOptionSheet';

export default function SafetyCenter() {
  const navigate = useNavigate();
  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#13151A] flex flex-col">
        <div className="flex-shrink-0 px-3 pt-1.5 pb-1.5">
          <div className="flex items-center justify-center">
            <div className="w-10 h-1 bg-white/20 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
            <span className="text-[13px] font-bold text-[#C9A96E]">Safety Center</span>
          </div>
        </div>

        <div className="h-full min-h-0 overflow-y-auto overscroll-y-contain px-3 pb-[max(10px,calc(env(safe-area-inset-bottom,0px)+6px))]">
          <Section title="Quick Actions">
            <OptionRow
              icon={<Ban size={14} />}
              title="Blocked Accounts"
              description="Manage users you've blocked."
              onClick={() => navigate('/settings/blocked')}
            />
            <OptionRow
              icon={<Flag size={14} />}
              title="Report a Problem"
              description="Report users or content violating guidelines."
              onClick={() => navigate('/report')}
            />
          </Section>

          <Section title="Privacy Controls">
            <OptionRow
              icon={<Lock size={14} />}
              title="Account Privacy"
              description="Control who can see your content."
              onClick={() => navigate('/edit-profile')}
            />
            <OptionRow
              icon={<Eye size={14} />}
              title="Data & Personalization"
              description="Manage how your data is used."
              onClick={() => navigate('/privacy')}
            />
          </Section>

          <Section title="Resources">
            <OptionRow
              icon={<AlertTriangle size={14} />}
              title="Community Guidelines"
              description="Read what is allowed on Elix Star."
              onClick={() => navigate('/guidelines')}
            />
            <OptionRow
              icon={<HelpCircle size={14} />}
              title="Safety Tips"
              description="Open online safety best practices."
              onClick={() => navigate('/guidelines')}
            />
          </Section>

          <div className="mt-2 p-3 rounded-xl border border-red-500/20 bg-red-500/10">
            <p className="text-[12px] font-bold text-red-400">Need Immediate Help?</p>
            <p className="text-[11px] text-white/75 mt-1">
              If you or someone you know is in immediate danger, contact emergency services.
            </p>
            <p className="text-[11px] text-white/65 mt-1.5">US: 911  |  UK: 999  |  EU: 112</p>
          </div>

          <Section title="Support">
            <OptionRow
              icon={<HelpCircle size={14} />}
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
    <div className="mb-1">
      <p className="text-[8px] text-white/30 uppercase tracking-[0.12em] mt-2.5 mb-0.5 px-1 leading-none">{title}</p>
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
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-2 active:bg-white/5 text-left rounded-md"
    >
      <span className="text-[#C9A96E]/70 shrink-0 [&_svg]:size-[14px]">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] leading-tight text-white/85">{title}</p>
        <p className="text-[10px] text-white/45 mt-0.5 truncate">{description}</p>
      </div>
      <ChevronRight size={13} className="text-white/30 shrink-0" />
    </button>
  );
}

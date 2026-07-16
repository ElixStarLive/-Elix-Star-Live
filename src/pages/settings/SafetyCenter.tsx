import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Lock, Eye, AlertTriangle, Ban, Flag, HelpCircle } from 'lucide-react';
import SettingsOptionSheet from '../../components/SettingsOptionSheet';

export default function SafetyCenter() {
  const navigate = useNavigate();
  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#111111] flex flex-col">
        <div className="flex-shrink-0 px-3 pt-1 pb-1">
          <div className="flex items-center justify-center">
            <span className="text-[12px] font-bold text-[#D4AF37]">Safety Center</span>
          </div>
        </div>

        {/* Fill live column edge-to-edge — no empty void */}
        <div className="flex-1 min-h-0 overflow-hidden px-3 pb-2 flex flex-col justify-between">
          <Section title="Quick Actions">
            <OptionRow
              icon={<Ban size={12} />}
              title="Blocked Accounts"
              description="Manage users you've blocked."
              onClick={() => navigate('/settings/blocked')}
            />
            <OptionRow
              icon={<Flag size={12} />}
              title="Report a Problem"
              description="Report users or content violating guidelines."
              onClick={() => navigate('/report?type=support&id=support_ticket')}
            />
          </Section>

          <Section title="Privacy Controls">
            <OptionRow
              icon={<Lock size={12} />}
              title="Account Privacy"
              description="Control who can see your content."
              onClick={() => navigate('/edit-profile')}
            />
            <OptionRow
              icon={<Eye size={12} />}
              title="Data & Personalization"
              description="Manage how your data is used."
              onClick={() => navigate('/privacy')}
            />
          </Section>

          <Section title="Resources">
            <OptionRow
              icon={<AlertTriangle size={12} />}
              title="Community Guidelines"
              description="Read what is allowed on Elix Star."
              onClick={() => navigate('/guidelines')}
            />
            <OptionRow
              icon={<HelpCircle size={12} />}
              title="Safety Tips"
              description="Open online safety best practices."
              onClick={() => navigate('/guidelines')}
            />
          </Section>

          <div className="px-1 py-1 bg-[#111111]">
            <p className="text-[10px] font-bold text-gold-bright/80">Need Immediate Help?</p>
            <p className="text-[9px] text-gold-bright/55 mt-0.5 leading-snug">
              If you or someone you know is in immediate danger, contact emergency services.
            </p>
            <p className="text-[9px] text-gold-bright/45 mt-1">US: 911  |  UK: 999  |  EU: 112</p>
          </div>

          <Section title="Support">
            <OptionRow
              icon={<HelpCircle size={12} />}
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
      <p className="text-[7px] text-gold-bright/35 uppercase tracking-[0.12em] mb-0.5 px-1 leading-none">{title}</p>
      <div className="space-y-0">{children}</div>
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
      className="w-full flex items-center gap-2 px-2 py-1.5 bg-[#111111] text-left"
    >
      <span className="text-[#E8D5A3]/70 shrink-0 [&_svg]:size-[12px]">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] leading-tight text-gold-bright/85">{title}</p>
        <p className="text-[9px] text-gold-bright/40 mt-0.5 truncate">{description}</p>
      </div>
      <ChevronRight size={12} className="text-gold-bright/30 shrink-0" />
    </button>
  );
}

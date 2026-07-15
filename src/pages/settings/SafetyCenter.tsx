import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, AlertTriangle, Ban, Flag, HelpCircle } from 'lucide-react';
import SettingsOptionSheet from '../../components/SettingsOptionSheet';
import { SettingsListRow, SettingsSectionLabel } from '../../components/SettingsListRow';

export default function SafetyCenter() {
  const navigate = useNavigate();
  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#111111] flex flex-col">
        <div className="flex-shrink-0 px-3 pt-1.5 pb-1.5">
          <div className="flex items-center justify-center">
            <span className="text-[13px] font-bold text-[#D4AF37]">Safety Center</span>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pb-3">
          <SettingsSectionLabel title="Quick Actions" />
          <SettingsListRow
            icon={<Ban size={14} />}
            title="Blocked Accounts"
            description="Manage users you've blocked."
            onClick={() => navigate('/settings/blocked')}
          />
          <SettingsListRow
            icon={<Flag size={14} />}
            title="Report a Problem"
            description="Report users or content violating guidelines."
            onClick={() => navigate('/report')}
          />

          <SettingsSectionLabel title="Privacy Controls" />
          <SettingsListRow
            icon={<Lock size={14} />}
            title="Account Privacy"
            description="Control who can see your content."
            onClick={() => navigate('/edit-profile')}
          />
          <SettingsListRow
            icon={<Eye size={14} />}
            title="Data & Personalization"
            description="Manage how your data is used."
            onClick={() => navigate('/privacy')}
          />

          <SettingsSectionLabel title="Resources" />
          <SettingsListRow
            icon={<AlertTriangle size={14} />}
            title="Community Guidelines"
            description="Read what is allowed on Elix Star."
            onClick={() => navigate('/guidelines')}
          />
          <SettingsListRow
            icon={<HelpCircle size={14} />}
            title="Safety Tips"
            description="Open online safety best practices."
            onClick={() => navigate('/guidelines')}
          />

          <div className="mt-2 p-3 rounded-xl border border-white/40/20 bg-white/20/10">
            <p className="text-[12px] font-bold text-white/60">Need Immediate Help?</p>
            <p className="text-[11px] text-white/75 mt-1">
              If you or someone you know is in immediate danger, contact emergency services.
            </p>
            <p className="text-[11px] text-white/65 mt-1.5">US: 911  |  UK: 999  |  EU: 112</p>
          </div>

          <SettingsSectionLabel title="Support" />
          <SettingsListRow
            icon={<HelpCircle size={14} />}
            title="Contact Support"
            description="Send us a message and we will respond."
            onClick={() => navigate('/support')}
          />
        </div>
      </div>
    </SettingsOptionSheet>
  );
}

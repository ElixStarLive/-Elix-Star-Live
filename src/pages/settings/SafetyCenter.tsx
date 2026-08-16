import React, { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Eye, AlertTriangle, Ban, Flag, HelpCircle } from 'lucide-react';
import SettingsOptionSheet from '../../components/SettingsOptionSheet';
import { SettingsOptionRow as R } from '../../components/settings/SettingsOptionRow';
import { SettingsSectionLabel as S } from '../../components/settings/SettingsSectionLabel';
import {
  SETTINGS_HOME,
  containerReturnState,
  exitToFromLocationState,
  returnToFromLocationState,
} from '../../lib/settingsNav';

const SAFETY_HOME = '/settings/safety';

export default function SafetyCenter() {
  const navigate = useNavigate();
  const location = useLocation();

  const exit = useCallback(
    () => navigate(exitToFromLocationState(location.state, SETTINGS_HOME), { replace: true }),
    [navigate, location.state],
  );
  const childReturnState = containerReturnState(
    returnToFromLocationState(location.state) || SAFETY_HOME,
  );
  const goBlocked = useCallback(
    () => navigate('/settings/blocked', { state: childReturnState }),
    [navigate, childReturnState],
  );
  const goReport = useCallback(
    () => navigate('/report?type=support&id=support_ticket', { state: childReturnState }),
    [navigate, childReturnState],
  );
  const goEditProfile = useCallback(() => navigate('/edit-profile', { state: childReturnState }), [navigate, childReturnState]);
  const goPrivacy = useCallback(() => navigate('/privacy', { state: childReturnState }), [navigate, childReturnState]);
  const goGuidelines = useCallback(() => navigate('/guidelines', { state: childReturnState }), [navigate, childReturnState]);
  const goSupport = useCallback(
    () => navigate('/support', { state: childReturnState }),
    [navigate, childReturnState],
  );

  return (
    <SettingsOptionSheet onClose={exit} title="Safety Center">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full">
          <S t="Quick Actions" />
          <R
            ic={<Ban size={14} />}
            t="Blocked Accounts"
            d="Manage users you've blocked."
            fn={goBlocked}
          />
          <R
            ic={<Flag size={14} />}
            t="Report a Problem"
            d="Report users or content violating guidelines."
            fn={goReport}
          />

          <S t="Privacy Controls" />
          <R
            ic={<Lock size={14} />}
            t="Account Privacy"
            d="Control who can see your content."
            fn={goEditProfile}
          />
          <R
            ic={<Eye size={14} />}
            t="Data & Personalization"
            d="Manage how your data is used."
            fn={goPrivacy}
          />

          <S t="Resources" />
          <R
            ic={<AlertTriangle size={14} />}
            t="Community Guidelines"
            d="Read what is allowed on Elix Star."
            fn={goGuidelines}
          />
          <R
            ic={<HelpCircle size={14} />}
            t="Safety Tips"
            d="Open online safety best practices."
            fn={goGuidelines}
          />

          <div className="mt-3.5 mb-1 px-1 text-[10px] uppercase tracking-[0.12em] text-[#8B9099] leading-none">
            Need Immediate Help?
          </div>
          <div className="px-2.5 py-2.5 text-xs text-[#C8CDD5] leading-relaxed">
            If you or someone you know is in immediate danger, contact emergency services.
            <div className="text-[#8B9099] mt-2">US: 911&nbsp;&nbsp;|&nbsp;&nbsp;UK: 999&nbsp;&nbsp;|&nbsp;&nbsp;EU: 112</div>
          </div>

          <S t="Support" />
          <R
            ic={<HelpCircle size={14} />}
            t="Contact Support"
            d="Send us a message and we will respond."
            fn={goSupport}
          />
        </div>
      </div>
    </SettingsOptionSheet>
  );
}

import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import SettingsOptionSheet from '../components/SettingsOptionSheet';
import { LegalDocSection as Section } from '../components/LegalDocSection';
import { SETTINGS_HOME } from '../lib/settingsNav';

export default function LegalAffiliate() {
  const navigate = useNavigate();
  const exit = useCallback(() => navigate(SETTINGS_HOME, { replace: true }), [navigate]);

  return (
    <SettingsOptionSheet onClose={exit} title="Affiliate & Sponsored Content">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-white">
        <div className="text-sm text-[#C8CDD5] space-y-5 leading-6 px-1">
          <Section title="Disclosure">
            <p>
              Some content on Elix Star Live may contain affiliate links, sponsored products,
              or paid partnerships. When creators or the platform receive compensation for
              promoting products or services, this will be disclosed in accordance with applicable
              advertising standards and regulations.
            </p>
          </Section>

          <Section title="Creator Responsibilities">
            <p>If you are a creator who participates in sponsored or affiliate content, you must:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Clearly disclose any paid partnerships or affiliate relationships</li>
              <li>Use appropriate labels (e.g. "Ad", "Sponsored", "Paid Partnership")</li>
              <li>Comply with the UK Advertising Standards Authority (ASA) guidelines</li>
              <li>Comply with the US Federal Trade Commission (FTC) endorsement guidelines</li>
              <li>Not promote illegal, misleading, or harmful products</li>
            </ul>
          </Section>

          <Section title="Platform Partnerships">
            <p>
              Elix Star Live may enter into partnerships with third-party brands and services.
              Any platform-level promotions will be clearly identified. Revenue generated from
              these partnerships helps support the development and maintenance of the App.
            </p>
          </Section>

          <Section title="User Protection">
            <p>
              We are committed to transparency. If you believe any content on Elix Star Live
              contains undisclosed affiliate or sponsored material, please report it using the
              in-app reporting feature or contact us at{' '}
              <span className="text-white font-medium">legal@elixstarlive.com</span>.
            </p>
          </Section>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}


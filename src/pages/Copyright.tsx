import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import SettingsOptionSheet from '../components/SettingsOptionSheet';
import { SETTINGS_HOME } from '../lib/settingsNav';

export default function Copyright() {
  const navigate = useNavigate();

  const exit = useCallback(() => navigate(SETTINGS_HOME, { replace: true }), [navigate]);
  const goDmca = useCallback(() => navigate('/legal/dmca'), [navigate]);

  return (
    <SettingsOptionSheet onClose={exit} title="Copyright Notice">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-sm text-[#C8CDD5] space-y-5 leading-6">
          <p className="px-1">© 2026 Elix Star Live Ltd. All rights reserved.</p>

          <Section title="Ownership">
            <p>
              All app content, design, branding, logos, software code, and user interface elements
              are the intellectual property of Elix Star Live Ltd unless otherwise stated. No part
              of this application may be reproduced, distributed, or transmitted in any form without
              prior written permission.
            </p>
          </Section>

          <Section title="User Content">
            <p>
              Users retain ownership of the content they create and upload. By posting content on
              Elix Star Live, you grant us a worldwide, non-exclusive, royalty-free licence to
              display, distribute, and promote your content within and in connection with the App.
            </p>
          </Section>

          <Section title="Third-Party Content">
            <p>
              Some content displayed in the App (such as profile avatars, video thumbnails, and
              user-generated media) is owned by respective users and third parties. Elix Star Live
              does not claim ownership of user-generated content.
            </p>
          </Section>

          <Section title="Trademarks">
            <p>
              "Elix Star Live", the Elix Star Live logo, and related marks are trademarks of
              Elix Star Live Ltd. Use of these trademarks without written permission is prohibited.
            </p>
          </Section>

          <Section title="Report Copyright Infringement">
            <p>
              If you believe your copyrighted work has been used without authorisation, please see
              our{' '}
              <button
                onClick={goDmca}
                className="text-[#F5F5F7] underline"
              >
                DMCA Policy
              </button>{' '}
              or contact us at{' '}
              <span className="text-white font-medium">dmca@elixstarlive.com</span>.
            </p>
          </Section>
      </div>
    </SettingsOptionSheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-1">
      <h2 className="text-white font-semibold text-base mb-2">{title}</h2>
      {children}
    </div>
  );
}

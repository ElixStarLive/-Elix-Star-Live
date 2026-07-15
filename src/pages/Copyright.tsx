import React from 'react';
import { useNavigate } from 'react-router-dom';
import SettingsOptionSheet from '../components/SettingsOptionSheet';

export default function Copyright() {
  const navigate = useNavigate();

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#111111] text-white flex flex-col">
        <header className="flex items-center justify-center mb-4 px-4 pt-2">
          <h1 className="font-bold text-lg">Copyright Notice</h1>
        </header>

        <div className="overflow-y-auto min-h-0 px-4 pb-3 text-sm text-white/75 space-y-5 leading-6">
          <p>© 2026 Elix Star Live Ltd. All rights reserved.</p>

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
                onClick={() => navigate('/legal/dmca')}
                className="text-[#D4AF37] underline"
              >
                DMCA Policy
              </button>{' '}
              or contact us at{' '}
              <span className="text-white font-medium">dmca@elixstarlive.com</span>.
            </p>
          </Section>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-white font-semibold text-base mb-2">{title}</h2>
      {children}
    </div>
  );
}

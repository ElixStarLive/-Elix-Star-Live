import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function LegalUGC() {
  const navigate = useNavigate();

  return (
    <div className="bg-[#13151A] text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] rounded-3xl overflow-hidden bg-[#13151A] flex flex-col overflow-y-auto p-4 pb-20">
        <header className="flex items-center justify-between mb-4">
          <button onClick={() => navigate(-1)} aria-label="Back" title="Back">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">User-Generated Content Policy</h1>
          <div className="w-6" />
        </header>

        <div className="text-sm text-white/75 space-y-5 leading-6">
          <Section title="About UGC">
            <p>
              Elix Star Live is a user-generated content (UGC) platform. Users create, upload,
              share, and interact with content including videos, live streams, comments, and
              messages. The views, opinions, and content expressed by users do not represent or
              reflect the views of Elix Star Live Ltd.
            </p>
          </Section>

          <Section title="User Responsibility">
            <p>
              Users are solely responsible for the content they upload and share on the platform.
              By uploading content, you confirm that:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>You own or have all necessary rights to the content</li>
              <li>The content does not infringe on any third-party intellectual property rights</li>
              <li>The content complies with our Community Guidelines and Terms of Service</li>
              <li>The content does not contain illegal, harmful, or misleading material</li>
            </ul>
          </Section>

          <Section title="Content Verification">
            <p>
              Elix Star Live does not pre-screen, endorse, or verify all user-generated content.
              However, we reserve the right to review, moderate, and remove any content that
              violates our policies. We use a combination of automated detection and human
              moderation to maintain platform safety.
            </p>
          </Section>

          <Section title="Licence Grant">
            <p>
              By posting content on Elix Star Live, you grant us a worldwide, non-exclusive,
              royalty-free licence to use, display, reproduce, distribute, and promote your content
              within and in connection with the App. This licence continues until you delete your
              content or account.
            </p>
          </Section>

          <Section title="Content Removal">
            <p>
              We may remove or restrict access to content that violates our Terms of Service,
              Community Guidelines, or applicable law. Users can also report content using the
              in-app reporting tools. For copyright-related removal requests, please refer to our
              {' '}
              <button
                onClick={() => navigate('/legal/dmca')}
                className="text-[#C9A96E] underline"
              >
                DMCA Policy
              </button>.
            </p>
          </Section>

          <Section title="Disclaimer">
            <p>
              Elix Star Live Ltd is not liable for any user-generated content posted on the
              platform. We act as a hosting provider and comply with applicable safe harbour
              provisions. If you encounter content that concerns you, please report it immediately.
            </p>
          </Section>
        </div>
      </div>
    </div>
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

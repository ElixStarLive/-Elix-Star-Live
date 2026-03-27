import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function LegalSafety() {
  const navigate = useNavigate();

  return (
    <div className="bg-[#13151A] text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] rounded-3xl overflow-hidden bg-[#13151A] flex flex-col overflow-y-auto p-4 pb-20">
        <header className="flex items-center justify-between mb-4">
          <button onClick={() => navigate(-1)} aria-label="Back" title="Back">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">Safety Centre</h1>
          <div className="w-6" />
        </header>

        <div className="text-sm text-white/75 space-y-5 leading-6">
          <p>
            Elix Star Live is committed to maintaining a safe and respectful environment for all
            users. We take user safety seriously and provide multiple tools to help you stay safe.
          </p>

          <Section title="Reporting Content">
            <p>
              If you see content that violates our Community Guidelines, you can report it directly
              from any video, live stream, profile, or message. Reports are reviewed by our moderation
              team and appropriate action is taken.
            </p>
          </Section>

          <Section title="Blocking Users">
            <p>
              You can block any user at any time. Blocked users cannot see your content, send you
              messages, or interact with you. You can manage your blocked accounts list from
              Settings → Blocked Accounts.
            </p>
          </Section>

          <Section title="Live Stream Safety">
            <ul className="list-disc pl-5 space-y-1">
              <li>Live streams are monitored for violations of our Community Guidelines.</li>
              <li>We may terminate a stream without notice if it contains prohibited content.</li>
              <li>Viewers can report live streams in real time.</li>
              <li>Creators can moderate their live chat and remove disruptive viewers.</li>
            </ul>
          </Section>

          <Section title="Content Moderation">
            <p>We use a combination of automated systems and human review to detect and remove:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nudity and sexual content</li>
              <li>Violence and graphic content</li>
              <li>Hate speech and discrimination</li>
              <li>Harassment and bullying</li>
              <li>Spam and scams</li>
              <li>Illegal activities</li>
            </ul>
          </Section>

          <Section title="Child Safety">
            <p>
              Elix Star Live is not intended for users under 13. We do not knowingly collect
              information from children under 13. Any content that exploits or endangers minors
              is strictly prohibited and will be reported to relevant authorities.
            </p>
          </Section>

          <Section title="Emergency Resources">
            <p>If you or someone you know is in immediate danger, please contact local emergency services.</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>UK:</strong> 999 (Emergency) or 116 123 (Samaritans)</li>
              <li><strong>US:</strong> 911 (Emergency) or 988 (Suicide & Crisis Lifeline)</li>
              <li><strong>EU:</strong> 112 (Emergency)</li>
            </ul>
          </Section>

          <Section title="Contact Us">
            <p>
              For safety concerns, contact us at{' '}
              <span className="text-white font-medium">safety@elixstarlive.com</span>
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

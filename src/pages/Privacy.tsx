import React from 'react';
import { useNavigate } from 'react-router-dom';
import SettingsOptionSheet from '../components/SettingsOptionSheet';

export default function Privacy() {
  const navigate = useNavigate();

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#13151A] text-white flex flex-col">
        <header className="flex items-center justify-between mb-4 px-4 pt-4">
          <button onClick={() => navigate(-1)} aria-label="Back" title="Back">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">Privacy Policy</h1>
          <div className="w-6" />
        </header>
        <div className="overflow-y-auto min-h-0 px-4 pb-[max(10px,calc(env(safe-area-inset-bottom,0px)+6px))]">
          <p className="text-xs text-white/40 italic mb-4">Last updated: February 20, 2026</p>
          <div className="text-sm text-white/75 space-y-5 leading-6">
          <p>
            Elix Star Live Ltd ("we", "us", "our"), registered in England and Wales, operates
            the Elix Star Live application. This Privacy Policy explains how we collect, use,
            store, and protect your personal data when you use our App.
          </p>

          <Section title="1. Information We Collect">
            <p className="font-medium text-white/90 mb-1">Account Information</p>
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>Email address</li>
              <li>Username and display name</li>
              <li>Profile picture</li>
              <li>Password (securely hashed — we never store plain-text passwords)</li>
            </ul>

            <p className="font-medium text-white/90 mb-1">Usage Data</p>
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>How you interact with the App (viewed content, liked videos, session duration)</li>
              <li>Search queries within the App</li>
              <li>Live stream and battle participation</li>
            </ul>

            <p className="font-medium text-white/90 mb-1">Device Information</p>
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>Device type, model, and operating system version</li>
              <li>Unique device identifiers</li>
              <li>IP address</li>
              <li>Browser type (when using the web version)</li>
            </ul>

            <p className="font-medium text-white/90 mb-1">Camera & Microphone</p>
            <ul className="list-disc pl-5 space-y-1 mb-3">
              <li>Only accessed when you actively record a video, go live, or join a video call</li>
              <li>We do not access your camera or microphone in the background</li>
            </ul>

            <p className="font-medium text-white/90 mb-1">Payment Information</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Processed securely through Apple In-App Purchase, Google Play Billing, or Stripe</li>
              <li>We do not store your payment card details directly</li>
              <li>We store transaction records (amount, date, coin package purchased)</li>
            </ul>
          </Section>

          <Section title="2. Why We Collect Your Data">
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide and operate the App's features</li>
              <li>To personalise your content feed</li>
              <li>To process transactions (coin purchases, gifts)</li>
              <li>To send important notifications about your account</li>
              <li>To ensure safety, prevent abuse, and enforce our Community Guidelines</li>
              <li>To improve and develop the App</li>
              <li>To comply with legal obligations</li>
            </ul>
          </Section>

          <Section title="3. How We Store Your Data">
            <p>
              Your data is stored on secure servers (e.g. EU/US).
              All data is encrypted in transit (HTTPS/TLS) and at rest. Passwords are cryptographically
              hashed and never stored in plain text.
            </p>
          </Section>

          <Section title="4. Data Sharing">
            <p>We do not sell your personal data. We may share data with:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Service providers:</strong> hosting, analytics, payment processing (Apple, Google, Stripe)</li>
              <li><strong>Law enforcement:</strong> when required by law or to protect our legal rights</li>
              <li><strong>Other users:</strong> your public profile, live streams, and public chat messages are visible to others</li>
            </ul>
          </Section>

          <Section title="5. Data Retention">
            <p>
              We retain your data for as long as your account is active. If you delete your account,
              we permanently remove your personal data within 30 days, except where we are legally
              required to retain it (e.g. transaction records for tax compliance, which may be
              retained for up to 7 years).
            </p>
          </Section>

          <Section title="6. Your Rights (GDPR / UK Data Protection Act 2018)">
            <p>As a user, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Access</strong> your personal data</li>
              <li><strong>Correct</strong> inaccurate or incomplete data via your profile settings</li>
              <li><strong>Delete</strong> your account and data at any time via Settings → Delete Account</li>
              <li><strong>Export</strong> your data by contacting us at privacy@elixstarlive.com</li>
              <li><strong>Object</strong> to processing of your data for certain purposes</li>
              <li><strong>Withdraw consent</strong> at any time where processing is based on consent</li>
              <li><strong>Lodge a complaint</strong> with the UK Information Commissioner's Office (ICO) if you believe we have violated your data protection rights</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, contact us at{' '}
              <span className="text-white font-medium">privacy@elixstarlive.com</span>.
              We will respond within 30 days.
            </p>
          </Section>

          <Section title="7. Legal Basis for Processing (GDPR)">
            <p>We process your data under the following legal bases:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Contract:</strong> to provide the App services you signed up for</li>
              <li><strong>Consent:</strong> for optional features (e.g. push notifications, marketing)</li>
              <li><strong>Legitimate interest:</strong> to improve our services, prevent fraud, and ensure safety</li>
              <li><strong>Legal obligation:</strong> to comply with applicable laws and regulations</li>
            </ul>
          </Section>

          <Section title="8. International Data Transfers">
            <p>
              Your data may be transferred to and processed in countries outside the UK/EEA. Where
              this occurs, we ensure appropriate safeguards are in place (e.g. Standard Contractual
              Clauses or adequacy decisions) to protect your data in accordance with applicable law.
            </p>
          </Section>

          <Section title="9. Cookies & Tracking">
            <p>
              The App uses minimal cookies and local storage to maintain your session and preferences.
              We do not use third-party advertising trackers. Analytics data is collected anonymously
              to improve the App experience.
            </p>
          </Section>

          <Section title="10. Children's Privacy">
            <p>
              Elix Star Live is not intended for children under 13. We do not knowingly collect
              personal data from children under 13. If we become aware that a child under 13 has
              provided us with personal data, we will take steps to delete that information promptly.
            </p>
          </Section>

          <Section title="11. Security">
            <p>
              We use industry-standard security measures to protect your data, including HTTPS
              encryption, hashed passwords (bcrypt), secure server infrastructure, and regular
              security audits. However, no method of transmission over the internet is 100% secure.
            </p>
          </Section>

          <Section title="12. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material
              changes via email or in-app notification. Continued use after changes constitutes
              acceptance of the updated policy.
            </p>
          </Section>

          <Section title="13. Data Protection Officer">
            <p>
              For data protection enquiries, contact our Data Protection Officer at:
            </p>
            <p className="text-white font-medium">privacy@elixstarlive.com</p>
          </Section>

          <Section title="14. Contact Us">
            <p>For any privacy questions or requests:</p>
            <ul className="list-none space-y-1">
              <li><span className="text-white font-medium">Email:</span> privacy@elixstarlive.com</li>
              <li><span className="text-white font-medium">Company:</span> Elix Star Live Ltd</li>
              <li><span className="text-white font-medium">Jurisdiction:</span> England and Wales</li>
            </ul>
          </Section>

          <div className="pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium transition"
            >
              Go to Settings
            </button>
          </div>
          </div>
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

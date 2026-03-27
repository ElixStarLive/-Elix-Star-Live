import React from 'react';
import { useNavigate } from 'react-router-dom';
import { platform } from '../lib/platform';
import SettingsOptionSheet from '../components/SettingsOptionSheet';

export default function Terms() {
  const navigate = useNavigate();

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#13151A] text-white flex flex-col">
        <header className="flex items-center justify-between mb-4 px-4 pt-4">
          <button onClick={() => navigate(-1)} aria-label="Back" title="Back">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">Terms of Service</h1>
          <div className="w-6" />
        </header>
        <div className="overflow-y-auto min-h-0 px-4 pb-[max(10px,calc(env(safe-area-inset-bottom,0px)+6px))]">
          <p className="text-xs text-white/40 italic mb-4">Last updated: February 20, 2026</p>
          <div className="text-sm text-white/75 space-y-5 leading-6">
          <Section title="1. Acceptance of Terms">
            <p>
              By accessing or using Elix Star Live ("the App"), operated by Elix Star Live Ltd,
              registered in England and Wales, you agree to be bound by these Terms of Service.
              If you do not agree, do not use the App.
            </p>
          </Section>

          <Section title="2. Eligibility">
            <p>
              You must be at least 13 years old to use Elix Star Live. If you are under 18, you
              must have parental or guardian consent. By creating an account, you represent that you
              meet these requirements.
            </p>
          </Section>

          <Section title="3. User Accounts">
            <ul className="list-disc pl-5 space-y-1">
              <li>You are responsible for maintaining the security of your account and password.</li>
              <li>You must provide accurate information when creating an account.</li>
              <li>One person may not maintain more than one account.</li>
              <li>You are responsible for all activity that occurs under your account.</li>
              <li>Notify us immediately if you suspect unauthorised access to your account.</li>
            </ul>
          </Section>

          <Section title="4. User Content">
            <ul className="list-disc pl-5 space-y-1">
              <li>You retain ownership of content you create and upload.</li>
              <li>
                By posting content, you grant us a worldwide, non-exclusive, royalty-free licence to
                display, distribute, and promote your content within the App and for marketing purposes.
              </li>
              <li>
                You must not post content that is illegal, harmful, threatening, abusive, harassing,
                defamatory, obscene, or otherwise objectionable.
              </li>
              <li>We reserve the right to remove content that violates these terms without prior notice.</li>
              <li>
                You represent and warrant that you have all necessary rights to the content you upload,
                including audio, video, and images.
              </li>
            </ul>
          </Section>

          <Section title="5. Live Streaming">
            <ul className="list-disc pl-5 space-y-1">
              <li>You must comply with all applicable laws when live streaming.</li>
              <li>Nudity, violence, hate speech, harassment, and illegal activities are prohibited.</li>
              <li>We may terminate streams that violate our guidelines without notice.</li>
              <li>Live streams may be recorded and stored for moderation and safety purposes.</li>
            </ul>
          </Section>

          <Section title="6. Virtual Currency, Gifts & Refund Policy">
            <p className="mb-2">The following refund rules apply to all purchases made within Elix Star Live:</p>

            <h4 className="font-semibold text-white/90 mt-3 mb-1">6.1 Coins</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>{platform.isIOS ? 'Coins are virtual currency purchased through the App Store (in-app purchase).' : 'Coins are virtual currency purchased through Apple In-App Purchase (iOS) or Google Play Billing (Android).'}</li>
              <li>Coins have no real-world monetary value and cannot be exchanged for cash.</li>
              <li><strong>All coin purchases are final and non-refundable.</strong> Once coins are purchased, they cannot be returned, reversed, or restored. No exceptions except as required by applicable law.</li>
              <li>Prices may vary by platform.</li>
              <li>We reserve the right to modify coin pricing, bonuses, and availability at any time.</li>
            </ul>

            <h4 className="font-semibold text-white/90 mt-3 mb-1">6.2 Gifts & Creator Earnings</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Gifts sent to creators are final and cannot be undone.</strong> Once a gift is sent during a live stream, the transaction is permanent. Coins spent on gifts cannot be recovered.</li>
              <li>Gifts sent to creators are converted to earnings in the creator's account.</li>
              <li>Earnings are calculated after applicable fees.</li>
              <li>Creator earnings are held for a minimum period before becoming available for withdrawal.</li>
            </ul>

            <h4 className="font-semibold text-white/90 mt-3 mb-1">6.3 Subscriptions</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>{platform.isIOS ? 'Subscriptions are managed by the App Store and are non-refundable.' : 'Subscriptions are managed by the App Store (iOS) or Google Play (Android) and are non-refundable.'}</strong></li>
              <li>You may cancel future renewals at any time through your store settings or account page. Cancellation takes effect at the end of the current billing period.</li>
              <li>If a store provider issues a refund for a subscription, access to subscription benefits will be revoked immediately.</li>
            </ul>

            <h4 className="font-semibold text-white/90 mt-3 mb-1">6.4 Shop Items</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Digital shop items (badges, frames, boosts, and other virtual goods) may be eligible for a refund if the item has not been used or activated and the request is made within 14 days of purchase.</li>
              <li>Refunded items will be revoked from your account. Coins will be restored to your balance.</li>
              <li>Items that have been used, activated, or applied are not eligible for refund.</li>
              <li>Refund requests are reviewed on a case-by-case basis. We reserve the right to deny refunds in cases of abuse or fraud.</li>
            </ul>

            <h4 className="font-semibold text-white/90 mt-3 mb-1">6.5 Chargebacks & Fraud</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>If a platform provider (Apple, Google, Stripe) issues a chargeback or refund on your behalf, we may suspend or terminate accounts involved in fraudulent or abusive purchase behaviour.</li>
              <li>Forced refunds from store providers will result in revocation of the associated benefits or items.</li>
            </ul>
          </Section>

          <Section title="7. Prohibited Conduct">
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Harass, bully, or threaten other users</li>
              <li>Impersonate another person or entity</li>
              <li>Post spam or send unsolicited messages</li>
              <li>Attempt to hack, exploit, or reverse-engineer the App</li>
              <li>Use bots, scrapers, or other automated systems</li>
              <li>Upload malware, viruses, or any harmful code</li>
              <li>Violate any applicable local, national, or international law</li>
              <li>Promote scams, fraud, or misleading information</li>
            </ul>
          </Section>

          <Section title="8. Intellectual Property">
            <p>
              All App content, design, branding, logos, and software are the property of Elix Star
              Live Ltd and are protected by copyright, trademark, and other intellectual property
              laws. You may not copy, modify, distribute, or create derivative works without our
              written permission.
            </p>
          </Section>

          <Section title="9. Termination">
            <p>
              We may suspend or terminate your account at any time for violations of these terms or
              for any reason at our discretion. You may delete your account at any time through
              Settings. Upon termination, your right to use the App ceases immediately, and any
              remaining virtual currency is forfeited.
            </p>
          </Section>

          <Section title="10. Disclaimer of Warranties">
            <p>
              The App is provided "as is" and "as available" without warranties of any kind, either
              express or implied. We do not guarantee uninterrupted, secure, or error-free service.
              Your use of the App is at your own risk.
            </p>
          </Section>

          <Section title="11. Limitation of Liability">
            <p>
              To the maximum extent permitted by law, Elix Star Live Ltd shall not be liable for any
              indirect, incidental, special, consequential, or punitive damages arising from your
              use of the App. Our total liability shall not exceed the amount you have paid to us in
              the twelve (12) months preceding the claim.
            </p>
          </Section>

          <Section title="12. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless Elix Star Live Ltd and its officers,
              directors, employees, and agents from any claims, liabilities, damages, losses, or
              expenses arising from your use of the App or violation of these terms.
            </p>
          </Section>

          <Section title="13. Governing Law">
            <p>
              These terms are governed by and construed in accordance with the laws of England and
              Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of
              England and Wales.
            </p>
          </Section>

          <Section title="14. Changes to Terms">
            <p>
              We may update these terms at any time. We will notify you of material changes via
              email or in-app notification. Continued use of the App after changes constitutes
              acceptance of the updated terms.
            </p>
          </Section>

          <Section title="15. Contact">
            <p>Questions about these terms? Contact us at:</p>
            <p className="text-white font-medium">legal@elixstarlive.com</p>
          </Section>
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

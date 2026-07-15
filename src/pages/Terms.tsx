import React from 'react';
import { useNavigate } from 'react-router-dom';
import { platform } from '../lib/platform';
import SettingsOptionSheet from '../components/SettingsOptionSheet';

/**
 * In-app Terms of Service for Elix Star Live.
 * Grounded in product rules: short videos, live, sounds, buy-only shop (Stripe),
 * IAP coins, live gifts, admin-reviewed creator withdrawal requests.
 * Not a substitute for solicitor-drafted agreements or music licences.
 */
export default function Terms() {
  const navigate = useNavigate();

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#111111] text-white flex flex-col">
        <header className="flex items-center justify-center mb-4 px-4 pt-2">
          <h1 className="font-bold text-lg">Terms of Service</h1>
        </header>
        <div className="overflow-y-auto min-h-0 px-4 pb-3">
          <p className="text-xs text-white/40 italic mb-4">Last updated: July 15, 2026</p>
          <div className="text-sm text-white/75 space-y-5 leading-6">
          <Section title="1. About the Service">
            <p>
              Elix Star Live is operated by <span className="text-white font-medium">Elix Star Live Ltd</span>
              (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;), registered in England and Wales. The App provides short-form video,
              live streaming, sounds, messaging, a shop where you can buy items we offer, virtual
              gifts/coins, and related features.
            </p>
            <p className="mt-2">
              The Service is offered where made available through our websites, Apple App Store,
              and Google Play. Availability may vary by region, device, and store listing.
            </p>
            <p className="mt-2">
              By creating an account or using the Service, you agree to these Terms. If you do not
              agree, do not use the App.
            </p>
            <p className="mt-2">
              Contact: <span className="text-white font-medium">support@elixstarlive.co.uk</span> ·{' '}
              <span className="text-white font-medium">info@elixstarlive.co.uk</span>
            </p>
          </Section>

          <Section title="2. Eligibility">
            <ul className="list-disc pl-5 space-y-1">
              <li>You must be at least 13 years old.</li>
              <li>If you are under 18, you must have parental or guardian consent.</li>
              <li>You must be legally allowed to use the Service in your country.</li>
              <li>We may refuse, restrict, or close accounts that do not meet eligibility requirements.</li>
            </ul>
          </Section>

          <Section title="3. Creating an Account">
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide accurate registration information and keep it updated.</li>
              <li>Keep login credentials secure and do not share them.</li>
              <li>You are responsible for all activity under your account.</li>
              <li>Fake accounts, bot accounts, and impersonation are prohibited.</li>
              <li>Do not create accounts to evade bans, manipulate engagement, or commit fraud.</li>
              <li>Notify us promptly of suspected unauthorised access.</li>
            </ul>
          </Section>

          <Section title="4. User Profiles">
            <ul className="list-disc pl-5 space-y-1">
              <li>Profiles may include username, display name, bio, avatar, and related settings.</li>
              <li>Usernames and profile images must not infringe rights or violate Community Rules.</li>
              <li>Privacy and visibility settings may be available in the App; some information may remain public based on features you use (for example public videos).</li>
              <li>We may reclaim, rename, or restrict usernames that violate these Terms.</li>
            </ul>
          </Section>

          <Section title="5. User Content">
            <p className="mb-2">
              You may upload or share videos, photos, comments, messages, audio, livestreams, and
              similar materials (&quot;User Content&quot;).
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>You confirm you own the content or have permission to use it.</li>
              <li>You are solely responsible for your User Content.</li>
              <li>
                You grant Elix Star Live Ltd a worldwide, non-exclusive, royalty-free, transferable,
                sublicensable licence to host, store, display, process, reproduce, adapt, and
                distribute User Content inside and in connection with the Service (including promotion
                of the App).
              </li>
              <li>You retain ownership of your User Content subject to this licence.</li>
              <li>We may remove User Content that violates these Terms or law.</li>
            </ul>
            <p className="mt-2 text-white/60 text-xs">
              These Terms do not replace music licences. They do not authorise use of a third
              party&apos;s copyrighted works beyond rights you already hold.
            </p>
          </Section>

          <Section title="6. Music and Sounds">
            <ul className="list-disc pl-5 space-y-1">
              <li>Do not upload or use music/sounds you lack rights to use.</li>
              <li>Do not use the App to distribute music illegally.</li>
              <li>Licensed sounds we provide depend on licences and may change, be muted, removed, or geo-restricted.</li>
              <li>Unauthorised music on live streams may be muted or removed, and accounts may be restricted.</li>
            </ul>
          </Section>

          <Section title="7. Copyright and Intellectual Property">
            <p className="mb-2">
              Our branding, software, and App materials are owned by Elix Star Live Ltd or our
              licensors. User Content remains owned by users, subject to Section 5.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Report copyright infringement to{' '}
                <span className="text-white font-medium">dmca@elixstarlive.com</span> or via Copyright
                / DMCA in the App.
              </li>
              <li>Provide work identification, location of material, contact details, and authority statement.</li>
              <li>We may remove or disable access to material and notify the uploader.</li>
              <li>Repeat infringers may be suspended or terminated.</li>
            </ul>
          </Section>

          <Section title="8. Community Rules">
            <p className="mb-2">You must not engage in or post:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Illegal activity</li>
              <li>Hate speech, harassment, threats, or violence</li>
              <li>Sexual exploitation (including of minors — zero tolerance)</li>
              <li>Fraud, scams, spam, or phishing</li>
              <li>Fake engagement or manipulation of gifts, likes, views, or followers</li>
              <li>Copyright abuse or IP infringement</li>
              <li>Malware or security attacks</li>
            </ul>
            <p className="mt-2">
              Additional rules appear in our Community Guidelines in the App.
            </p>
          </Section>

          <Section title="9. Live Streaming">
            <ul className="list-disc pl-5 space-y-1">
              <li>Live streams must comply with law and Community Rules.</li>
              <li>We may end streams without notice for violations.</li>
              <li>Streams may be monitored, recorded, and stored for safety and moderation.</li>
            </ul>
          </Section>

          <Section title="10. Shopping">
            <p className="mb-2">
              The Shop lets you <strong>buy</strong> products and digital goods offered by Elix Star
              Live Ltd. Users cannot sell products to other users through the Shop.
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Product descriptions, prices, and availability are set by us and may change.</li>
              <li>Items may sell out or be removed at any time.</li>
              <li>Unless stated otherwise, we are the seller of record for shop purchases.</li>
              <li>
                Goods we source from third-party suppliers are covered by our Supplier Agreement
                framework (see Legal → Supplier Agreement / supplier-agreement.html).
              </li>
            </ul>
          </Section>

          <Section title="11. Orders">
            <ul className="list-disc pl-5 space-y-1">
              <li>An order is created when payment is authorised through our checkout flow.</li>
              <li>Orders may be cancelled or fail due to payment failure, stock issues, or fraud checks.</li>
              <li>Processing and delivery times (for physical goods, if offered) will be described at purchase or in order communications.</li>
              <li>Contact support@elixstarlive.co.uk for order issues.</li>
            </ul>
          </Section>

          <Section title="12. Shop Payments">
            <ul className="list-disc pl-5 space-y-1">
              <li>Shop checkout uses third-party payment providers (for example Stripe).</li>
              <li>Currency may be shown in GBP or other currencies offered at checkout.</li>
              <li>Taxes, fees, and shipping (if any) may be added where applicable.</li>
              <li>By paying, you authorise the charge through the selected payment method.</li>
            </ul>
          </Section>

          <Section title="13. Virtual Coins / Credits">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                {platform.isIOS
                  ? 'Coins are purchased through the App Store (in-app purchase).'
                  : 'Coins are purchased through Apple In-App Purchase (iOS) or Google Play Billing (Android).'}
              </li>
              <li>Coins are digital items only — not real money, bank balances, or securities.</li>
              <li>Coins generally have no cash value for consumers and are not transferable outside the Service except where our monetization programme expressly allows creator conversion under Section 15.</li>
              <li>
                <strong>Coin purchases are final and non-refundable</strong>, except where required by
                applicable law or the app store.
              </li>
              <li>Packages, pricing, and bonuses may change.</li>
            </ul>
          </Section>

          <Section title="14. Gifts">
            <ul className="list-disc pl-5 space-y-1">
              <li>Users may buy gifts using coins and send them to creators during live streams.</li>
              <li>
                <strong>Gifts are final once sent</strong> and coins spent are not returned, except
                where required by law.
              </li>
              <li>Gift catalogue, prices, and effects may change.</li>
              <li>Gift fraud, chargebacks, and abuse may result in account action and revocation of balances.</li>
            </ul>
          </Section>

          <Section title="15. Creator Earnings">
            <ul className="list-disc pl-5 space-y-1">
              <li>Eligible creators may earn through gifts or other programme features we enable.</li>
              <li>Withdrawal or payout requests may require identity verification, payout details, minimum thresholds, and admin review.</li>
              <li>Payment timing is not guaranteed; requests may be delayed, rejected, or reversed for fraud, errors, chargebacks, or policy breaches.</li>
              <li>Creators are responsible for taxes on earnings.</li>
              <li>We may change or end monetization terms, fees, and eligibility at any time.</li>
            </ul>
          </Section>

          <Section title="16. Refunds">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Coins and sent gifts:</strong> generally non-refundable except as required by
                law or the relevant app store (Apple / Google).
              </li>
              <li>
                <strong>Subscriptions:</strong> managed by Apple or Google; cancel renewals in store
                settings; refunds follow store rules.
              </li>
              <li>
                <strong>Digital shop cosmetic items</strong> (badges, frames, boosts, etc.): may be
                refundable if unused/unactivated and requested within 14 days, subject to review; used
                items are not refundable.
              </li>
              <li>
                <strong>Shop purchases from Elix Star Live:</strong> refunds/returns follow the product
                type, stated policy at purchase, and applicable consumer law. Contact
                support@elixstarlive.co.uk.
              </li>
              <li>We investigate fraud; chargebacks may cause balances/items to be revoked and accounts suspended.</li>
            </ul>
          </Section>

          <Section title="17. Advertising">
            <ul className="list-disc pl-5 space-y-1">
              <li>Ads, promotions, or sponsored content may appear in the Service.</li>
              <li>Sponsored content should be identifiable where required by law.</li>
              <li>Advertising partners and placements may change.</li>
            </ul>
          </Section>

          <Section title="18. Notifications">
            <ul className="list-disc pl-5 space-y-1">
              <li>We may send service, safety, and transactional notifications.</li>
              <li>Marketing messages (where used) can be controlled via device or in-App settings where available.</li>
              <li>Essential service messages may still be sent.</li>
            </ul>
          </Section>

          <Section title="19. Moderation">
            <ul className="list-disc pl-5 space-y-1">
              <li>We may review content and accounts manually or with automated systems.</li>
              <li>We may remove content, limit features, mute streams, suspend users, or ban accounts.</li>
              <li>Users may report content through in-App tools.</li>
            </ul>
          </Section>

          <Section title="20. Account Termination">
            <ul className="list-disc pl-5 space-y-1">
              <li>We may remove or suspend accounts for Terms violations, fraud, abuse, illegal activity, or security risk.</li>
              <li>You may delete your account via Settings where available.</li>
              <li>On termination, access ends; unused coins/benefits may be forfeited except where law requires otherwise.</li>
            </ul>
          </Section>

          <Section title="21. Security">
            <p className="mb-2">You must not:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Hack, probe, or attack our systems or other users</li>
              <li>Reverse engineer the App except where mandatory law allows</li>
              <li>Use bots, scrapers, or automated abuse tools</li>
              <li>Interfere with Service integrity or availability</li>
            </ul>
          </Section>

          <Section title="22. Third-Party Services">
            <ul className="list-disc pl-5 space-y-1">
              <li>We use third parties for payments (Apple, Google, Stripe), hosting/storage, analytics, and realtime media.</li>
              <li>Those providers have their own terms and privacy policies.</li>
              <li>External links are not under our control.</li>
            </ul>
          </Section>

          <Section title="23. Privacy">
            <p>
              Our Privacy Policy explains data collection, device and account information, analytics,
              User Content processing, and your rights. Read it together with these Terms.
            </p>
            <p className="mt-2">
              Privacy contact: <span className="text-white font-medium">info@elixstarlive.co.uk</span>
            </p>
          </Section>

          <Section title="24. Limitation of Liability">
            <p className="mb-2">
              The Service is provided &quot;as is&quot; and &quot;as available&quot; to the maximum extent permitted by law.
            </p>
            <p className="mb-2">
              To the fullest extent permitted by law, Elix Star Live Ltd is not liable for service
              interruptions, User Content, third-party services, payment-provider outages, or
              indirect, incidental, special, consequential, or punitive damages.
            </p>
            <p>
              Our total liability for claims relating to the Service shall not exceed the amount you
              paid us in the twelve (12) months before the claim, except where liability cannot be
              limited by law.
            </p>
            <p className="mt-2">
              You agree to indemnify Elix Star Live Ltd against claims arising from your User Content
              or Terms violations.
            </p>
          </Section>

          <Section title="25. Changes to Terms">
            <p>
              We may update these Terms. Material changes may be notified by email or in-App notice.
              Continued use after changes means you accept the updated Terms.
            </p>
          </Section>

          <Section title="26. Governing Law">
            <p>
              These Terms are governed by the laws of England and Wales. Courts of England and Wales
              have exclusive jurisdiction, without prejudice to non-waivable consumer rights.
            </p>
          </Section>

          <Section title="27. Contact">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="text-white font-medium">Company:</span> Elix Star Live Ltd
                (England and Wales)
              </li>
              <li>
                <span className="text-white font-medium">Support:</span> support@elixstarlive.co.uk
              </li>
              <li>
                <span className="text-white font-medium">Business / privacy:</span> info@elixstarlive.co.uk
              </li>
              <li>
                <span className="text-white font-medium">Copyright / DMCA:</span> dmca@elixstarlive.com
              </li>
            </ul>
            <p className="mt-2 text-white/60 text-xs">
              Separate documents also apply where published: Privacy Policy, Community Guidelines,
              and Copyright / DMCA Policy. A Creator Monetization agreement may be introduced as
              programmes expand.
            </p>
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

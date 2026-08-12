import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import SettingsOptionSheet from '../components/SettingsOptionSheet';
import { LegalDocSection as Section } from '../components/LegalDocSection';
import { SETTINGS_HOME } from '../lib/settingsNav';

export default function LegalDMCA() {
  const navigate = useNavigate();
  const exit = useCallback(() => navigate(SETTINGS_HOME, { replace: true }), [navigate]);
  const dmcaEmail = 'dmca@elixstarlive.com';

  return (
    <SettingsOptionSheet onClose={exit} title="DMCA / Copyright Policy">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm] text-white">
        <div className="text-sm text-[#C8CDD5] space-y-5 leading-6 px-1">
          <p>
            Elix Star Live respects the intellectual property rights of others and expects our
            users to do the same. We comply with the Digital Millennium Copyright Act (DMCA) and
            equivalent UK/EU copyright regulations.
          </p>

          <Section title="Copyright Infringement Notification">
            <p>
              If you believe your copyrighted work has been used on Elix Star Live without
              authorisation, you may submit a DMCA takedown notice to our designated agent.
              Your notice must include:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Your full legal name and contact information (email, phone, address)</li>
              <li>A description of the copyrighted work that has been infringed</li>
              <li>The URL or location of the infringing content on our platform</li>
              <li>
                A statement that you have a good faith belief the use is not authorised by the
                copyright owner, its agent, or the law
              </li>
              <li>
                A statement, under penalty of perjury, that the information in your notice is
                accurate and that you are the copyright owner or authorised to act on their behalf
              </li>
              <li>Your physical or electronic signature</li>
            </ul>
          </Section>

          <Section title="Counter-Notification">
            <p>
              If you believe your content was removed in error, you may file a counter-notification
              including:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Your full legal name and contact information</li>
              <li>Identification of the content that was removed</li>
              <li>
                A statement under penalty of perjury that you have a good faith belief the content
                was removed by mistake or misidentification
              </li>
              <li>Consent to the jurisdiction of the courts in your area</li>
              <li>Your physical or electronic signature</li>
            </ul>
          </Section>

          <Section title="Repeat Infringers">
            <p>
              We maintain a policy of terminating, in appropriate circumstances, accounts of users
              who are repeat copyright infringers.
            </p>
          </Section>

          <Section title="Contact Our DMCA Agent">
            <p>
              Send all DMCA notices and counter-notifications to:
            </p>
            <p className="text-white font-medium mt-2">{dmcaEmail}</p>
            <div className="pt-3">
              <a
                className="inline-flex items-center justify-center rounded-xl bg-[#E6E9EE] text-white font-bold px-4 py-2 text-sm"
                href={`mailto:${dmcaEmail}?subject=DMCA%20Notice%20-%20ElixStarLive`}
              >
                Email DMCA Agent
              </a>
            </div>
          </Section>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}


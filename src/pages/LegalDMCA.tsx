import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function LegalDMCA() {
  const navigate = useNavigate();
  const dmcaEmail = 'dmca@elixstarlive.com';

  return (
    <div className="bg-[#13151A] text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] rounded-3xl overflow-hidden bg-[#13151A] flex flex-col overflow-y-auto p-4 pb-20">
        <header className="flex items-center justify-between mb-4">
          <button onClick={() => navigate(-1)} aria-label="Back" title="Back">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">DMCA / Copyright Policy</h1>
          <div className="w-6" />
        </header>

        <div className="text-sm text-white/75 space-y-5 leading-6">
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
                className="inline-flex items-center justify-center rounded-xl bg-[#C9A96E] text-black font-bold px-4 py-2 text-sm"
                href={`mailto:${dmcaEmail}?subject=DMCA%20Notice%20-%20ElixStarLive`}
              >
                Email DMCA Agent
              </a>
            </div>
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

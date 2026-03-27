import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function LegalAffiliate() {
  const navigate = useNavigate();

  return (
    <div className="bg-[#13151A] text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] rounded-3xl overflow-hidden bg-[#13151A] flex flex-col overflow-y-auto p-4 pb-20">
        <header className="flex items-center justify-between mb-4">
          <button onClick={() => navigate(-1)} aria-label="Back" title="Back">
            <img src="/Icons/Gold power buton.png" alt="Back" className="w-5 h-5" />
          </button>
          <h1 className="font-bold text-lg">Affiliate & Sponsored Content</h1>
          <div className="w-6" />
        </header>

        <div className="text-sm text-white/75 space-y-5 leading-6">
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

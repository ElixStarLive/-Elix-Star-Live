import React from 'react';
import { RoyceBackIcon } from '../components/royce';
import { useNavigate } from 'react-router-dom';

/**
 * Supplier Agreement template for vendors who supply goods to Elix Star Live Ltd
 * for sale in the buy-only Shop. Not a signed contract substitute — parties should
 * execute a signed/written agreement with commercial schedules attached.
 */
export default function LegalSupplier() {
  const navigate = useNavigate();

  return (
    <div className="bg-[#111111] text-white flex justify-center px-2">
      <div className="w-full max-w-[480px] rounded-3xl overflow-hidden bg-[#111111] flex flex-col overflow-y-auto p-4 pb-20">
        <header className="flex items-center justify-between mb-4">
          <button onClick={() => navigate(-1)} aria-label="Back" title="Back">
            <RoyceBackIcon />
          </button>
          <h1 className="font-bold text-lg">Supplier Agreement</h1>
          <div className="w-6" />
        </header>

        <div className="text-sm text-white/75 space-y-5 leading-6">
          <p className="text-xs text-white/40 italic">Last updated: July 15, 2026</p>

          <Section title="1. Parties">
            <p>
              This Supplier Agreement (&quot;Agreement&quot;) is between{' '}
              <span className="text-white font-medium">Elix Star Live Ltd</span> (&quot;Buyer&quot;,
              &quot;we&quot;, &quot;us&quot;), registered in England and Wales, and the supplier named in the
              commercial schedule or order (&quot;Supplier&quot;, &quot;you&quot;).
            </p>
            <p className="mt-2">
              The Shop in Elix Star Live is <strong>buy-only for end users</strong>. End users do not
              sell to each other. You supply goods or approved products to Elix Star Live Ltd for us
              to offer and sell to customers.
            </p>
          </Section>

          <Section title="2. Supply of Goods">
            <ul className="list-disc pl-5 space-y-1">
              <li>You will supply the goods described in purchase orders, schedules, or written confirmations we issue.</li>
              <li>Goods must match description, quantity, quality, packaging, and labelling specifications.</li>
              <li>You must have clear title to the goods and the right to sell them to us.</li>
              <li>Delivery times, Incoterms (if any), and places of delivery will be set in writing per order.</li>
            </ul>
          </Section>

          <Section title="3. Compliance & Product Safety">
            <ul className="list-disc pl-5 space-y-1">
              <li>Goods must comply with applicable UK and destination-market laws (product safety, labelling, chemicals, consumer protection, import rules).</li>
              <li>You must not supply illegal, counterfeit, stolen, hazardous (unless agreed in writing), or otherwise prohibited items.</li>
              <li>You will provide certificates, manuals, warranties, and safety data on request.</li>
              <li>You will cooperate promptly with product recalls, withdrawals, and regulator requests.</li>
            </ul>
          </Section>

          <Section title="4. Intellectual Property">
            <ul className="list-disc pl-5 space-y-1">
              <li>You warrant that goods and branding you supply do not infringe third-party IP rights.</li>
              <li>You grant us a non-exclusive licence to use your product names, images, and trademarks solely to market and sell the goods in our Shop and related channels.</li>
              <li>Our App branding and platform remain our property.</li>
            </ul>
          </Section>

          <Section title="5. Pricing, Invoices & Payment">
            <ul className="list-disc pl-5 space-y-1">
              <li>Prices are as agreed in writing (schedule or purchase order).</li>
              <li>Unless otherwise agreed, invoices are payable by bank transfer to the Supplier account on the invoice after acceptance of delivery.</li>
              <li>Payment terms (for example Net 30) and currency (often GBP) will be stated in the commercial schedule.</li>
              <li>You are responsible for your own taxes; provide valid VAT/tax details where required.</li>
            </ul>
          </Section>

          <Section title="6. Title, Risk & Returns">
            <ul className="list-disc pl-5 space-y-1">
              <li>Risk and title transfer as agreed in writing (for example on delivery and/or payment).</li>
              <li>We may reject non-conforming goods and require repair, replacement, or credit.</li>
              <li>Customer returns under consumer law may require you to accept return stock or credit as agreed.</li>
            </ul>
          </Section>

          <Section title="7. Confidentiality">
            <p>
              Each party must keep the other&apos;s confidential commercial information secure and use
              it only to perform this Agreement, except where disclosure is required by law.
            </p>
          </Section>

          <Section title="8. Liability & Indemnity">
            <ul className="list-disc pl-5 space-y-1">
              <li>You indemnify us against claims arising from defective goods, IP infringement, regulatory non-compliance, or your breach of this Agreement.</li>
              <li>Nothing excludes liability that cannot be limited by law (for example death/personal injury caused by negligence, or fraud).</li>
            </ul>
          </Section>

          <Section title="9. Term & Termination">
            <ul className="list-disc pl-5 space-y-1">
              <li>Either party may terminate for material breach not cured within a reasonable written notice period.</li>
              <li>We may suspend or stop ordering if goods or practices create safety, legal, or reputational risk.</li>
              <li>Survival: confidentiality, IP warranties, indemnity, and accrued payment obligations continue after termination.</li>
            </ul>
          </Section>

          <Section title="10. Governing Law">
            <p>
              This Agreement is governed by the laws of England and Wales. Courts of England and
              Wales have exclusive jurisdiction.
            </p>
          </Section>

          <Section title="11. Contact">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <span className="text-white font-medium">Company:</span> Elix Star Live Ltd
              </li>
              <li>
                <span className="text-white font-medium">Business:</span> info@elixstarlive.co.uk
              </li>
              <li>
                <span className="text-white font-medium">Support:</span> support@elixstarlive.co.uk
              </li>
            </ul>
            <p className="mt-3 text-white/60 text-xs">
              This page is a standard supplier framework for the buy-only Shop. A signed purchase
              order or commercial schedule with price, SKUs, delivery, and payment terms is required
              for a binding supply relationship. Have a solicitor review before high-value deals.
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

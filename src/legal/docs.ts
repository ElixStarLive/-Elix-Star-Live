export const LEGAL_DOCS: Record<string, { title: string; sections: { title: string; body: string }[] }> = {
  copyright: {
    title: 'Copyright Notice',
    sections: [
      { title: 'Ownership', body: 'All app content, design, branding, logos, software code, and user interface elements are the intellectual property of Elix Star Live Ltd unless otherwise stated. No part of this application may be reproduced, distributed, or transmitted in any form without prior written permission.' },
      { title: 'User Content', body: 'Users retain ownership of the content they create and upload. By posting content on Elix Star Live, you grant us a worldwide, non-exclusive, royalty-free licence to display, distribute, and promote your content within and in connection with the App.' },
      { title: 'Third-Party Content', body: 'Some content displayed in the App (such as profile avatars, video thumbnails, and user-generated media) is owned by respective users and third parties. Elix Star Live does not claim ownership of user-generated content.' },
      { title: 'Trademarks', body: '"Elix Star Live", the Elix Star Live logo, and related marks are trademarks of Elix Star Live Ltd. Use of these trademarks without written permission is prohibited.' },
      { title: 'Report Copyright Infringement', body: 'If you believe your copyrighted work has been used without authorisation, please see our DMCA Policy or contact us at dmca@elixstarlive.com .' },
    ],
  },
  audio: {
    title: 'Audio & Music Disclaimer',
    sections: [
      { title: 'Audio Content', body: 'Audio used within Elix Star Live falls into the following categories: Original audio: Created by Elix Star Live or its partners User-generated audio: Uploaded or recorded by users Licensed audio: Obtained under royalty-free or commercial licences' },
      { title: 'User Responsibility', body: 'When uploading content that contains audio, you confirm that you either: Created the audio yourself (it is your original work) Have obtained permission or a licence from the copyright holder The audio is in the public domain or available under a Creative Commons licence' },
      { title: 'Audio Removal', body: 'We reserve the right to mute, remove, or replace audio in any content that infringes on third-party copyrights. This may happen automatically or through manual review following a DMCA takedown notice.' },
      { title: 'Live Streaming Audio', body: 'Playing copyrighted music during live streams may result in the stream being muted or terminated. You are responsible for ensuring you have the right to broadcast any audio content during your live sessions.' },
      { title: 'Contact', body: 'For audio-related enquiries or disputes, contact us at legal@elixstarlive.com' },
    ],
  },
  ugc: {
    title: 'User-Generated Content Policy',
    sections: [
      { title: 'About UGC', body: 'Elix Star Live is a user-generated content (UGC) platform. Users create, upload, share, and interact with content including videos, live streams, comments, and messages. The views, opinions, and content expressed by users do not represent or reflect the views of Elix Star Live Ltd.' },
      { title: 'User Responsibility', body: 'Users are solely responsible for the content they upload and share on the platform. By uploading content, you confirm that: You own or have all necessary rights to the content The content does not infringe on any third-party intellectual property rights The content complies with our Community Guidelines and Terms of Service The content does not contain illegal, harmful, or misleading material' },
      { title: 'Content Verification', body: 'Elix Star Live does not pre-screen, endorse, or verify all user-generated content. However, we reserve the right to review, moderate, and remove any content that violates our policies. We use a combination of automated detection and human moderation to maintain platform safety.' },
      { title: 'Licence Grant', body: 'By posting content on Elix Star Live, you grant us a worldwide, non-exclusive, royalty-free licence to use, display, reproduce, distribute, and promote your content within and in connection with the App. This licence continues until you delete your content or account.' },
      { title: 'Content Removal', body: 'We may remove or restrict access to content that violates our Terms of Service, Community Guidelines, or applicable law. Users can also report content using the in-app reporting tools. For copyright-related removal requests, please refer to our DMCA Policy .' },
      { title: 'Disclaimer', body: 'Elix Star Live Ltd is not liable for any user-generated content posted on the platform. We act as a hosting provider and comply with applicable safe harbour provisions. If you encounter content that concerns you, please report it immediately.' },
    ],
  },
  affiliate: {
    title: 'Affiliate & Sponsored Content',
    sections: [
      { title: 'Disclosure', body: 'Some content on Elix Star Live may contain affiliate links, sponsored products, or paid partnerships. When creators or the platform receive compensation for promoting products or services, this will be disclosed in accordance with applicable advertising standards and regulations.' },
      { title: 'Creator Responsibilities', body: 'If you are a creator who participates in sponsored or affiliate content, you must: Clearly disclose any paid partnerships or affiliate relationships Use appropriate labels (e.g. "Ad", "Sponsored", "Paid Partnership") Comply with the UK Advertising Standards Authority (ASA) guidelines Comply with the US Federal Trade Commission (FTC) endorsement guidelines Not promote illegal, misleading, or harmful products' },
      { title: 'Platform Partnerships', body: 'Elix Star Live may enter into partnerships with third-party brands and services. Any platform-level promotions will be clearly identified. Revenue generated from these partnerships helps support the development and maintenance of the App.' },
      { title: 'User Protection', body: 'We are committed to transparency. If you believe any content on Elix Star Live contains undisclosed affiliate or sponsored material, please report it using the in-app reporting feature or contact us at legal@elixstarlive.com .' },
    ],
  },
  dmca: {
    title: 'DMCA / Copyright Policy',
    sections: [
      { title: 'Copyright Infringement Notification', body: 'If you believe your copyrighted work has been used on Elix Star Live without authorisation, you may submit a DMCA takedown notice to our designated agent. Your notice must include: Your full legal name and contact information (email, phone, address) A description of the copyrighted work that has been infringed The URL or location of the infringing content on our platform A statement that you have a good faith belief the use is not authorised by the copyright owner, its agent, or the law A statement, under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorised to act on their behalf Your physical or electronic signature' },
      { title: 'Counter-Notification', body: 'If you believe your content was removed in error, you may file a counter-notification including: Your full legal name and contact information Identification of the content that was removed A statement under penalty of perjury that you have a good faith belief the content was removed by mistake or misidentification Consent to the jurisdiction of the courts in your area Your physical or electronic signature' },
      { title: 'Repeat Infringers', body: 'We maintain a policy of terminating, in appropriate circumstances, accounts of users who are repeat copyright infringers.' },
      { title: 'Contact Our DMCA Agent', body: 'Send all DMCA notices and counter-notifications to: dmca@elixstarlive.com Email DMCA Agent' },
    ],
  },
  safety: {
    title: 'Safety Centre',
    sections: [
      { title: 'Reporting Content', body: 'If you see content that violates our Community Guidelines, you can report it directly from any video, live stream, profile, or message. Reports are reviewed by our moderation team and appropriate action is taken.' },
      { title: 'Blocking Users', body: 'You can block any user at any time. Blocked users cannot see your content, send you messages, or interact with you. You can manage your blocked accounts list from Settings → Blocked Accounts.' },
      { title: 'Live Stream Safety', body: 'Live streams are monitored for violations of our Community Guidelines. We may terminate a stream without notice if it contains prohibited content. Viewers can report live streams in real time. Creators can moderate their live chat and remove disruptive viewers.' },
      { title: 'Content Moderation', body: 'We use a combination of automated systems and human review to detect and remove: Nudity and sexual content Violence and graphic content Hate speech and discrimination Harassment and bullying Spam and scams Illegal activities' },
      { title: 'Child Safety', body: 'Elix Star Live is not intended for users under 13. We do not knowingly collect information from children under 13. Any content that exploits or endangers minors is strictly prohibited and will be reported to relevant authorities.' },
      { title: 'Emergency Resources', body: 'If you or someone you know is in immediate danger, please contact local emergency services. UK: 999 (Emergency) or 116 123 (Samaritans) US: 911 (Emergency) or 988 (Suicide & Crisis Lifeline) EU: 112 (Emergency)' },
      { title: 'Contact Us', body: 'For safety concerns, contact us at safety@elixstarlive.com' },
    ],
  },
  supplier: {
    title: 'Supplier Agreement',
    sections: [
      { title: '1. Parties', body: 'This Supplier Agreement ("Agreement") is between Elix Star Live Ltd ("Buyer", "we", "us"), registered in England and Wales, and the supplier named in the commercial schedule or order ("Supplier", "you"). The Shop in Elix Star Live is buy-only for end users . End users do not sell to each other. You supply goods or approved products to Elix Star Live Ltd for us to offer and sell to customers.' },
      { title: '2. Supply of Goods', body: 'You will supply the goods described in purchase orders, schedules, or written confirmations we issue. Goods must match description, quantity, quality, packaging, and labelling specifications. You must have clear title to the goods and the right to sell them to us. Delivery times, Incoterms (if any), and places of delivery will be set in writing per order.' },
      { title: '3. Compliance & Product Safety', body: 'Goods must comply with applicable UK and destination-market laws (product safety, labelling, chemicals, consumer protection, import rules). You must not supply illegal, counterfeit, stolen, hazardous (unless agreed in writing), or otherwise prohibited items. You will provide certificates, manuals, warranties, and safety data on request. You will cooperate promptly with product recalls, withdrawals, and regulator requests.' },
      { title: '4. Intellectual Property', body: 'You warrant that goods and branding you supply do not infringe third-party IP rights. You grant us a non-exclusive licence to use your product names, images, and trademarks solely to market and sell the goods in our Shop and related channels. Our App branding and platform remain our property.' },
      { title: '5. Pricing, Invoices & Payment', body: 'Prices are as agreed in writing (schedule or purchase order). Unless otherwise agreed, invoices are payable by bank transfer to the Supplier account on the invoice after acceptance of delivery. Payment terms (for example Net 30) and currency (often GBP) will be stated in the commercial schedule. You are responsible for your own taxes; provide valid VAT/tax details where required.' },
      { title: '6. Title, Risk & Returns', body: 'Risk and title transfer as agreed in writing (for example on delivery and/or payment). We may reject non-conforming goods and require repair, replacement, or credit. Customer returns under consumer law may require you to accept return stock or credit as agreed.' },
      { title: '7. Confidentiality', body: 'Each party must keep the other\'s confidential commercial information secure and use it only to perform this Agreement, except where disclosure is required by law.' },
      { title: '8. Liability & Indemnity', body: 'You indemnify us against claims arising from defective goods, IP infringement, regulatory non-compliance, or your breach of this Agreement. Nothing excludes liability that cannot be limited by law (for example death/personal injury caused by negligence, or fraud).' },
      { title: '9. Term & Termination', body: 'Either party may terminate for material breach not cured within a reasonable written notice period. We may suspend or stop ordering if goods or practices create safety, legal, or reputational risk. Survival: confidentiality, IP warranties, indemnity, and accrued payment obligations continue after termination.' },
      { title: '10. Governing Law', body: 'This Agreement is governed by the laws of England and Wales. Courts of England and Wales have exclusive jurisdiction.' },
      { title: '11. Contact', body: 'Company: Elix Star Live Ltd Business: info@elixstarlive.co.uk Support: support@elixstarlive.co.uk This page is a standard supplier framework for the buy-only Shop. A signed purchase order or commercial schedule with price, SKUs, delivery, and payment terms is required for a binding supply relationship. Have a solicitor review before high-value deals.' },
    ],
  },
  guidelines: {
    title: 'Community Guidelines',
    sections: [
    ],
  },
  'how-it-works': {
    title: 'How the app works',
    sections: [
    ],
  },
  support: {
    title: 'Help & Support',
    sections: [
    ],
  },
};

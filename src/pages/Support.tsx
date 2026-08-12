import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Book, ChevronRight, HelpCircle, Mail, MessageCircle, Send, Shield } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import { showToast } from '../lib/toast';
import SettingsOptionSheet from '../components/SettingsOptionSheet';
import { SettingsSectionLabel as S } from '../components/settings/SettingsSectionLabel';
import { apiCreateReport, apiGetCurrentUserId } from '../features/safety/safetyApi';
import { SETTINGS_HOME } from '../lib/settingsNav';

const FAQ_ITEMS = [
  {
    question: 'How do I earn coins?',
    answer: 'You can purchase coins through the in-app store, or receive them as gifts from other users during your live streams.',
  },
  {
    question: 'Are digital coin purchases refundable?',
    answer:
      'No. Digital coin purchases (Apple / Google Play) are final and non-refundable. Elix Star Live does not offer in-app coin refunds, and coins are not refunded through Stripe or the shop. Gifts sent with coins are also final.',
  },
  {
    question: 'Can I get a refund on a shop purchase?',
    answer:
      'Shop purchases paid with Stripe may be eligible for a refund under our shop policy (for example unused/unfulfilled items within 14 days, subject to review). Contact support@elixstarlive.co.uk with your order/payment reference. Approved shop refunds are issued via Stripe — never as digital coins.',
  },
  {
    question: 'What are battles?',
    answer: 'Battles are live competitions between two streamers where viewers send gifts to support their favorite creator. The streamer with the most gifts at the end wins!',
  },
  {
    question: 'How do I start a live stream?',
    answer: 'Tap the "+" button, select "Go Live", and follow the prompts to start broadcasting.',
  },
  {
    question: 'Can I download my videos?',
    answer: 'Yes! Tap the three dots on your video and select "Download" to save it to your device.',
  },
  {
    question: 'How do I delete my account?',
    answer: 'Go to Settings → Account → Delete Account. This action is permanent and cannot be undone.',
  },
  {
    question: 'What content is not allowed?',
    answer: 'Please review our Community Guidelines for a complete list. In general, content that promotes violence, harassment, hate speech, or illegal activities is prohibited.',
  },
];

export default function Support() {
  const navigate = useNavigate();
  const [showContactForm, setShowContactForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const exit = useCallback(() => navigate(SETTINGS_HOME, { replace: true }), [navigate]);
  const goSafety = useCallback(() => navigate('/settings/safety'), [navigate]);
  const goGuidelines = useCallback(() => navigate('/guidelines'), [navigate]);
  const goTerms = useCallback(() => navigate('/terms'), [navigate]);
  const goPrivacy = useCallback(() => navigate('/privacy'), [navigate]);
  const goCopyright = useCallback(() => navigate('/copyright'), [navigate]);
  const openContactForm = useCallback(() => setShowContactForm(true), []);
  const closeContactForm = useCallback(() => setShowContactForm(false), []);

  const handleSubmitTicket = async () => {
    if (!subject.trim() || !message.trim() || !email.trim()) {
      showToast('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const { userId } = await apiGetCurrentUserId();

      const { error } = await apiCreateReport({
        reporter_id: userId,
        targetType: 'support',
        targetId: 'support_ticket',
        reason: subject,
        details: `Email: ${email}\n\n${message}`,
      });

      if (error) {
        showToast('Failed to submit. Please try again.');
        return;
      }

      trackEvent('support_ticket_submit', {
        subject,
        has_user: !!userId,
      });

      setSubmitted(true);
      setTimeout(() => {
        exit();
      }, 2000);
    } catch {
      showToast('Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SettingsOptionSheet onClose={exit} title="Help & Support">
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 text-center">
          <div className="w-16 h-16 bg-[#E6E9EE] rounded-full mx-auto mb-4 flex items-center justify-center">
            <Send className="w-8 h-8 text-black" />
          </div>
          <h2 className="text-lg font-bold mb-1.5 text-white">Message Sent</h2>
          <p className="text-sm text-[#8B9099]">We will get back to you within 24 hours.</p>
        </div>
      </SettingsOptionSheet>
    );
  }

  if (showContactForm) {
    return (
      <SettingsOptionSheet onClose={closeContactForm} title="Contact Support">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
          <div className="px-1 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#C8CDD5] mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-lg px-3 py-2.5 outline-none text-sm text-white placeholder:text-[#8B9099] border border-white/10 focus:border-[#D8D9DD] transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#C8CDD5] mb-1.5">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief description of your issue"
                maxLength={100}
                className="w-full rounded-lg px-3 py-2.5 outline-none text-sm text-white placeholder:text-[#8B9099] border border-white/10 focus:border-[#D8D9DD] transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#C8CDD5] mb-1.5">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue in detail..."
                maxLength={1000}
                rows={6}
                className="w-full rounded-lg px-3 py-2.5 outline-none text-sm text-white placeholder:text-[#8B9099] border border-white/10 focus:border-[#D8D9DD] transition resize-none"
              />
              <div className="text-xs text-[#8B9099] mt-1 text-right">{message.length}/1000</div>
            </div>

            <button
              type="button"
              onClick={() => { void handleSubmitTicket(); }}
              disabled={loading || !subject.trim() || !message.trim() || !email.trim()}
              className="w-full py-3 bg-[#E6E9EE] text-white text-sm rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed active:opacity-90 transition"
            >
              {loading ? 'Sending...' : 'Send Message'}
            </button>
          </div>
        </div>
      </SettingsOptionSheet>
    );
  }

  return (
    <SettingsOptionSheet onClose={exit} title="Help & Support">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full">
          <S t="Quick Links" />
          <R
            ic={<MessageCircle size={14} />}
            t="Contact Support"
            d="Send a message to our support team."
            fn={openContactForm}
          />
          <R
            ic={<Shield size={14} />}
            t="Safety Center"
            d="Safety tools and reporting resources."
            fn={goSafety}
          />
          <R
            ic={<Book size={14} />}
            t="Community Guidelines"
            d="Read what content is allowed."
            fn={goGuidelines}
          />

          <S t="Frequently Asked Questions" />
          {FAQ_ITEMS.map((item) => (
            <FAQItem key={item.question} question={item.question} answer={item.answer} />
          ))}

          <S t="Legal" />
          <R t="Terms of Service" fn={goTerms} />
          <R t="Privacy Policy" fn={goPrivacy} />
          <R t="Copyright Policy" fn={goCopyright} />

          <div className="mt-3.5 px-2.5 py-3 text-center">
            <Mail className="w-5 h-5 text-[#E6E9EE] mx-auto mb-2" />
            <div className="text-sm text-[#C8CDD5] mb-1">Email us directly</div>
            <a
              href="mailto:support@elixstarlive.co.uk"
              className="text-sm text-[#E6E9EE]"
            >
              support@elixstarlive.co.uk
            </a>
          </div>
        </div>
      </div>
    </SettingsOptionSheet>
  );
}

function R({
  ic,
  t,
  d,
  fn,
}: {
  ic?: React.ReactNode;
  t: string;
  d?: string;
  fn: () => void;
}) {
  return (
    <button
      type="button"
      onClick={fn}
      className="w-full flex items-center gap-3 px-2.5 py-2.5 active:bg-white/5 text-left rounded-md"
    >
      {ic ? (
        <span
          className="royce-glow-disc shrink-0 [&_svg]:size-[18px]"
          style={{ width: '36px', height: '36px' }}
        >
          <span className="royce-icon-gold">{ic}</span>
        </span>
      ) : null}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] leading-tight text-[#E6E9EE]">{t}</span>
        {d ? <span className="block text-xs text-[#8B9099] mt-0.5">{d}</span> : null}
      </span>
      <ChevronRight size={16} className="text-white/30 shrink-0" />
    </button>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2.5 px-2.5 py-2.5 active:bg-white/5 transition text-left rounded-md"
      >
        <span className="text-sm text-[#E6E9EE] pr-2">{question}</span>
        <HelpCircle className={`w-4 h-4 text-[#8B9099] flex-shrink-0 transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen ? (
        <div className="px-2.5 pb-2.5 text-[13px] leading-relaxed text-[#C8CDD5]">
          {answer}
        </div>
      ) : null}
    </div>
  );
}

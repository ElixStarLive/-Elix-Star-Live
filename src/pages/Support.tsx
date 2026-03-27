import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Book, ChevronRight, HelpCircle, Mail, MessageCircle, Send, Shield } from 'lucide-react';
import { api } from '../lib/apiClient';
import { trackEvent } from '../lib/analytics';
import { showToast } from '../lib/toast';
import SettingsOptionSheet from '../components/SettingsOptionSheet';

const FAQ_ITEMS = [
  {
    question: 'How do I earn coins?',
    answer: 'You can purchase coins through the in-app store, or receive them as gifts from other users during your live streams.',
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

  const handleSubmitTicket = async () => {
    if (!subject.trim() || !message.trim() || !email.trim()) {
      showToast('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const { data: userData } = await api.auth.getUser();

      const { error } = await api.reports.create({
        reporter_id: userData.user?.id || null,
        target_type: 'support',
        target_id: 'support_ticket',
        reason: subject,
        details: `Email: ${email}\n\n${message}`,
      });

      if (error) {
        showToast('Failed to submit. Please try again.');
        return;
      }

      trackEvent('support_ticket_submit', {
        subject,
        has_user: !!userData.user,
      });

      setSubmitted(true);
      setTimeout(() => {
        navigate(-1);
      }, 2000);
    } catch {
      showToast('Failed to submit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SettingsOptionSheet onClose={() => navigate(-1)}>
        <div className="h-full flex items-center justify-center px-4 text-center">
          <div className="w-14 h-14 bg-[#C9A96E] rounded-full mx-auto mb-3 flex items-center justify-center">
            <Send className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-[16px] font-bold mb-1">Message Sent</h2>
          <p className="text-[11px] text-white/60">We will get back to you within 24 hours.</p>
        </div>
      </SettingsOptionSheet>
    );
  }

  if (showContactForm) {
    return (
      <SettingsOptionSheet onClose={() => navigate(-1)}>
        <div className="w-full h-full overflow-hidden bg-[#13151A] flex flex-col">
          <div className="flex-shrink-0 px-3 pt-1.5 pb-1.5">
            <div className="flex items-center justify-center">
              <div className="w-10 h-1 bg-white/20 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
              <span className="text-[13px] font-bold text-[#C9A96E]">Contact Support</span>
            </div>
          </div>

          <div className="px-3 py-2.5 space-y-3 overflow-y-auto min-h-0">
          <div>
            <label className="block text-[11px] text-white/70 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full bg-[#0f1218] rounded-lg px-3 py-2.5 outline-none text-[12px] text-white placeholder-white/35 border border-white/10 focus:border-[#C9A96E] transition"
            />
          </div>

          <div>
            <label className="block text-[11px] text-white/70 mb-1.5">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Brief description of your issue"
              maxLength={100}
              className="w-full bg-[#0f1218] rounded-lg px-3 py-2.5 outline-none text-[12px] text-white placeholder-white/35 border border-white/10 focus:border-[#C9A96E] transition"
            />
          </div>

          <div>
            <label className="block text-[11px] text-white/70 mb-1.5">Message</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Describe your issue in detail..."
              maxLength={1000}
              rows={6}
              className="w-full bg-[#0f1218] rounded-lg px-3 py-2.5 outline-none text-[12px] text-white placeholder-white/35 border border-white/10 focus:border-[#C9A96E] transition resize-none"
            />
            <p className="text-[10px] text-white/40 mt-1 text-right">{message.length}/1000</p>
          </div>

          <button
            onClick={handleSubmitTicket}
            disabled={loading || !subject.trim() || !message.trim() || !email.trim()}
            className="w-full py-2.5 bg-[#C9A96E] text-black text-[12px] rounded-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition"
          >
            {loading ? 'Sending...' : 'Send Message'}
          </button>
          </div>
        </div>
      </SettingsOptionSheet>
    );
  }

  return (
    <SettingsOptionSheet onClose={() => navigate(-1)}>
      <div className="w-full h-full overflow-hidden bg-[#13151A] flex flex-col">
        <div className="flex-shrink-0 px-3 pt-1.5 pb-1.5">
          <div className="flex items-center justify-center">
            <div className="w-10 h-1 bg-white/20 rounded-full absolute top-2 left-1/2 -translate-x-1/2" />
            <span className="text-[13px] font-bold text-[#C9A96E]">Help & Support</span>
          </div>
        </div>

      <div className="px-3 py-1.5 flex-1 overflow-y-auto">
        <Section title="Quick Links">
          <ListRow
            icon={<MessageCircle size={14} />}
            label="Contact Support"
            helper="Send a message to our support team."
            onClick={() => setShowContactForm(true)}
          />
          <ListRow
            icon={<Shield size={14} />}
            label="Safety Center"
            helper="Safety tools and reporting resources."
            onClick={() => navigate('/settings/safety')}
          />
          <ListRow
            icon={<Book size={14} />}
            label="Community Guidelines"
            helper="Read what content is allowed."
            onClick={() => navigate('/guidelines')}
          />
        </Section>

        <Section title="Frequently Asked Questions">
          <div className="space-y-0.5">
            {FAQ_ITEMS.map((item) => (
              <FAQItem key={item.question} question={item.question} answer={item.answer} />
            ))}
          </div>
        </Section>

        <Section title="Legal">
          <ListRow label="Terms of Service" onClick={() => navigate('/terms')} />
          <ListRow label="Privacy Policy" onClick={() => navigate('/privacy')} />
          <ListRow label="Copyright Policy" onClick={() => navigate('/copyright')} />
        </Section>

        <div className="mt-2 p-3 rounded-xl border border-white/10 bg-[#0f1218] text-center">
          <Mail className="w-4 h-4 text-[#C9A96E] mx-auto mb-1.5" />
          <p className="text-[11px] text-white/75 mb-0.5">Email us directly</p>
          <a
            href="mailto:support@elixstar.live"
            className="text-[11px] text-white/90 hover:underline"
          >
            support@elixstar.live
          </a>
        </div>
      </div>
      </div>
    </SettingsOptionSheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="text-[8px] text-white/30 uppercase tracking-[0.12em] mt-2.5 mb-0.5 px-1 leading-none">{title}</p>
      {children}
    </div>
  );
}

function ListRow({
  icon,
  label,
  helper,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  helper?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-2 active:bg-white/5 text-left rounded-md"
    >
      {icon && <span className="text-[#C9A96E]/70 shrink-0 [&_svg]:size-[14px]">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-[12px] leading-tight text-white/85">{label}</p>
        {helper && <p className="text-[10px] text-white/45 mt-0.5 truncate">{helper}</p>}
      </div>
      <ChevronRight size={13} className="text-white/30 shrink-0" />
    </button>
  );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-md overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2.5 px-2 py-2 active:bg-white/5 transition text-left"
      >
        <span className="text-[12px] text-white/85 pr-2">{question}</span>
        <HelpCircle className={`w-4 h-4 text-white/45 flex-shrink-0 transition ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="px-2 pb-2 text-[11px] leading-relaxed text-white/65">
          {answer}
        </div>
      )}
    </div>
  );
}

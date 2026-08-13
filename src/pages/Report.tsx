import React, { useCallback, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { CheckCircle, Flag } from 'lucide-react';
import { trackEvent } from '../lib/analytics';
import { showToast } from '../lib/toast';
import SettingsOptionSheet from '../components/SettingsOptionSheet';
import { apiCreateReport, apiGetCurrentUserId } from '../features/safety/safetyApi';
import { FEED_HOME, exitToFromLocationState } from '../lib/settingsNav';

const REPORT_REASONS = {
  video: [
    { id: 'spam', label: 'Spam or misleading' },
    { id: 'harassment', label: 'Harassment or bullying' },
    { id: 'hate_speech', label: 'Hate speech' },
    { id: 'violence', label: 'Violence or dangerous content' },
    { id: 'sexual_content', label: 'Sexual content' },
    { id: 'child_safety', label: 'Child safety concerns' },
    { id: 'copyright', label: 'Copyright violation' },
    { id: 'other', label: 'Other' },
  ],
  user: [
    { id: 'harassment', label: 'Harassment or bullying' },
    { id: 'impersonation', label: 'Impersonation' },
    { id: 'spam', label: 'Spam account' },
    { id: 'underage', label: 'Underage user' },
    { id: 'other', label: 'Other' },
  ],
  comment: [
    { id: 'spam', label: 'Spam' },
    { id: 'harassment', label: 'Harassment' },
    { id: 'hate_speech', label: 'Hate speech' },
    { id: 'other', label: 'Other' },
  ],
};

export default function Report() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const rawType = searchParams.get('type') || 'video';
  const contentType = (
    rawType === 'support' ? 'user' : rawType
  ) as 'video' | 'user' | 'comment';
  const contentId = searchParams.get('id') || '';
  const isGeneralSupport = rawType === 'support' || !contentId;

  const [selectedReason, setSelectedReason] = useState('');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const goBack = useCallback(
    () => navigate(exitToFromLocationState(location.state, FEED_HOME), { replace: true }),
    [navigate, location.state],
  );

  const reasons = REPORT_REASONS[contentType] || REPORT_REASONS.video;

  const handleSubmit = async () => {
    if (!selectedReason) {
      showToast('Please select a reason');
      return;
    }

    setLoading(true);
    try {
      const { userId, error: userErr } = await apiGetCurrentUserId();
      if (!userId || userErr) throw new Error(userErr || 'Not authenticated');

      const { error } = await apiCreateReport({
        reporter_id: userId,
        targetType: isGeneralSupport ? 'support' : contentType,
        targetId: isGeneralSupport ? (contentId || 'support_ticket') : contentId,
        reason: selectedReason,
        details: details.trim(),
      });

      if (error) throw error;

      trackEvent('report_submit', {
        content_type: contentType,
        content_id: contentId,
        reason: selectedReason,
      });

      setSubmitted(true);
      setTimeout(() => {
        goBack();
      }, 2000);
    } catch {

      showToast('Failed to submit report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SettingsOptionSheet onClose={goBack} title="Report">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="w-20 h-20 bg-[#FFFFFF] rounded-full mx-auto mb-4 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2 text-white">Report Submitted</h2>
            <p className="text-[#8B9099]">Thank you for helping keep our community safe.</p>
          </div>
        </div>
      </SettingsOptionSheet>
    );
  }

  return (
    <SettingsOptionSheet onClose={goBack} title={isGeneralSupport ? 'Report a problem' : `Report ${contentType}`}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="text-center mb-6 px-1">
          <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center border border-white/10">
            <Flag className="w-8 h-8 text-[#E6E9EE]" />
          </div>
          <h2 className="text-xl font-bold mb-2 text-white">Why are you reporting this?</h2>
          <p className="text-sm text-[#8B9099]">
            Your report is anonymous and helps us maintain a safe community
          </p>
        </div>

        <div className="space-y-2 mb-6">
          {reasons.map(reason => (
            <button
              key={reason.id}
              type="button"
              onClick={() => setSelectedReason(reason.id)}
              className={`w-full text-left px-4 py-4 rounded-xl transition border ${
                selectedReason === reason.id
                  ? 'border-[#D8D9DD] bg-white/10'
                  : 'border-white/10 active:bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#E6E9EE]">{reason.label}</span>
                {selectedReason === reason.id && (
                  <div className="w-6 h-6 bg-[#FFFFFF] rounded-full flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-black" />
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="mb-6 px-1">
          <label className="block text-sm font-semibold mb-2 text-[#C8CDD5]">
            Additional details (optional)
          </label>
          <textarea
            value={details}
            onChange={e => setDetails(e.target.value)}
            placeholder="Provide more context to help us understand the issue..."
            maxLength={500}
            rows={4}
            className="w-full rounded-xl px-4 py-3 outline-none text-white placeholder:text-[#8B9099] bg-transparent border border-white/10 focus:border-[#D8D9DD] transition resize-none"
          />
          <div className="text-xs text-[#8B9099] mt-1 text-right">{details.length}/500</div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selectedReason || loading}
          className="w-full py-4 bg-white/20 text-white rounded-xl font-bold disabled:opacity-40 disabled:cursor-not-allowed active:opacity-90 transition"
        >
          {loading ? 'Submitting...' : 'Submit Report'}
        </button>
      </div>
    </SettingsOptionSheet>
  );
}

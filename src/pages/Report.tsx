import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { submitReport } from '../features/reports/reportApi';

const REASONS = ['Harassment or bullying', 'Hate speech', 'Nudity or sexual content', 'Violence', 'Spam', 'Copyright', 'Other'];
const TYPES = [
  { label: 'User', value: 'user' as const },
  { label: 'Video', value: 'video' as const },
  { label: 'Live stream', value: 'live_stream' as const },
  { label: 'Comment', value: 'comment' as const },
];

export default function Report() {
  const { targetId, targetType } = useParams<{ targetId: string; targetType: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const initialType = ['user', 'video', 'live_stream', 'comment'].includes(targetType ?? '')
    ? (targetType as typeof TYPES[number]['value'])
    : 'video';
  const initialTarget = targetId ?? '';

  const [type, setType] = useState<typeof TYPES[number]['value']>(initialType);
  const [target, setTarget] = useState(initialTarget);
  const [reason, setReason] = useState(REASONS[0] ?? '');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const exit = () => {
    const from = (location.state as { from?: string } | null)?.from ?? '/feed';
    navigate(from, { replace: true });
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    const { error } = await submitReport({ targetId: target, targetType: type, reason, details });
    setSubmitting(false);
    if (error) return;
    setDone(true);
  };

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">Report</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      {done ? (
        <main className="flex flex-1 flex-col items-center justify-center p-4 text-center">
          <h2 className="text-fluid-lg font-bold">Thank you</h2>
          <p className="mt-2 text-fluid-sm text-white/60">Your report has been submitted for review.</p>
          <button
            type="button"
            onClick={exit}
            className="mt-6 rounded-xl border border-white/40 px-6 py-3 text-fluid-sm font-bold"
          >
            Done
          </button>
        </main>
      ) : (
        <form onSubmit={onSubmit} className="flex-1 space-y-4 p-4">
          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">What are you reporting?</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as typeof TYPES[number]['value'])}
              className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value} className="bg-black text-white">
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Target ID</label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none"
            >
              {REASONS.map((r) => (
                <option key={r} value={r} className="bg-black text-white">
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-fluid-sm text-white/70">Details</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="h-32 w-full resize-none rounded-xl border border-white/10 bg-white/10 p-3 text-fluid-sm text-white outline-none focus:border-white/40"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !target.trim()}
            className="w-full rounded-xl border border-white/40 bg-transparent py-3 text-fluid-sm font-bold disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit Report'}
          </button>
        </form>
      )}
    </div>
  );
}

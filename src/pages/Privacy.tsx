import { useCallback } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LegalDocSection } from '../components/LegalDocSection';
import { PRIVACY } from '../legal/privacy';

export default function Privacy() {
  const navigate = useNavigate();
  const location = useLocation();

  const exit = useCallback(() => {
    const from = (location.state as { from?: string } | null)?.from ?? '/register';
    navigate(from, { replace: true });
  }, [navigate, location.state]);

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">{PRIVACY.title}</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-y-contain px-4 pb-24 pt-4">
        <p className="mb-6 text-fluid-xs italic text-white/50">Last updated: {PRIVACY.lastUpdated}</p>
        <div className="space-y-6">
          {PRIVACY.sections.map((section) => (
            <LegalDocSection key={section.title} title={section.title}>
              <p>{section.body}</p>
            </LegalDocSection>
          ))}
        </div>
      </main>
    </div>
  );
}

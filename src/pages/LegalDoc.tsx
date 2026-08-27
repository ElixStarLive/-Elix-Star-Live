import { useCallback } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { LegalDocSection } from '../components/LegalDocSection';
import { LEGAL_DOCS } from '../legal/docs';

interface LegalDocProps {
  /** Optional explicit document key. Falls back to the route :docId param. */
  docKey?: string;
}

export default function LegalDoc({ docKey }: LegalDocProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ docId: string }>();
  const resolved = docKey ?? params.docId;
  const doc = resolved ? LEGAL_DOCS[resolved] : undefined;

  const exit = useCallback(() => {
    const from = (location.state as { from?: string } | null)?.from ?? '/legal';
    navigate(from, { replace: true });
  }, [navigate, location.state]);

  if (!doc) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-4 text-white">
        <p>Document not found.</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-black text-white">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-black/90 px-4 py-3 backdrop-blur-md">
        <button type="button" onClick={exit} className="flex items-center gap-2 text-white/70 hover:text-white" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
          <span className="text-fluid-sm">Back</span>
        </button>
        <h1 className="text-fluid-base font-bold">{doc.title}</h1>
        <button type="button" onClick={exit} aria-label="Close">
          <X className="h-5 w-5 text-white/70 hover:text-white" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-y-contain px-4 pb-24 pt-4">
        <div className="space-y-6">
          {doc.sections.map((section) => (
            <LegalDocSection key={section.title} title={section.title}>
              <p>{section.body}</p>
            </LegalDocSection>
          ))}
        </div>
      </main>
    </div>
  );
}

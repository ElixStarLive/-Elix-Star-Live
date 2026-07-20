import { Check } from 'lucide-react';
import { RoyceCloseIcon } from './royce';
import { LANGUAGES, useT } from '../lib/i18n';

type Props = { onClose: () => void };

export default function LanguagePickerSheet({ onClose }: Props) {
  const { t, lang, setLang } = useT();

  return (
    <div className="fixed inset-0 z-[10000] flex items-end justify-center" role="dialog" aria-label={t('settings.chooseLanguage')}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-md bg-[#111111] rounded-t-2xl border-t border-white/10 max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <span className="text-[13px] font-bold text-[#D4AF37]">{t('settings.chooseLanguage')}</span>
          <button type="button" onClick={onClose} className="p-1 rounded-full active:scale-90 transition-transform" aria-label="Close">
            <RoyceCloseIcon size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-2 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => { setLang(l.code); onClose(); }}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-md active:bg-white/5 text-left"
            >
              <span className="flex-1 text-[15px] text-white/85">
                {l.label}
                {l.english !== l.label && <span className="text-white/40 text-[12px]"> · {l.english}</span>}
              </span>
              {lang === l.code && <Check size={18} className="text-[#C9A227] shrink-0" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

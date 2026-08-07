import { Check } from 'lucide-react';
import { LANGUAGES, useT } from '../lib/i18n';
import SettingsOptionSheet from './SettingsOptionSheet';

type Props = { onClose: () => void };

/**
 * Full-page language picker — shared SettingsOptionSheet (close on right).
 * Covers Settings completely; no half-sheet peek of the list behind.
 */
export default function LanguagePickerSheet({ onClose }: Props) {
  const { t, lang, setLang } = useT();

  return (
    <SettingsOptionSheet onClose={onClose} title={t('settings.chooseLanguage')}>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 pt-2 pb-[3mm]">
        <div className="flex flex-col gap-0 max-w-full min-h-full">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => {
                setLang(l.code);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-md active:bg-white/5 text-left"
            >
              <span className="flex-1 text-[15px] text-[#E6E9EE]">
                {l.label}
                {l.english !== l.label ? (
                  <span className="text-[#8B9099] text-[12px]"> · {l.english}</span>
                ) : null}
              </span>
              {lang === l.code ? <Check size={18} className="text-[#E6E9EE] shrink-0" /> : null}
            </button>
          ))}
        </div>
      </div>
    </SettingsOptionSheet>
  );
}

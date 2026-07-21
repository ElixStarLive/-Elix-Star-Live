/** Worldwide language options for Settings. Full UI translations exist only for some codes; others fall back to English. */
export const WORLD_LANGUAGES = [
  { code: 'en', label: 'English', english: 'English' },
  { code: 'es', label: 'Español', english: 'Spanish' },
  { code: 'zh-CN', label: '简体中文', english: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: '繁體中文', english: 'Chinese (Traditional)' },
  { code: 'hi', label: 'हिन्दी', english: 'Hindi' },
  { code: 'ar', label: 'العربية', english: 'Arabic' },
  { code: 'pt', label: 'Português', english: 'Portuguese' },
  { code: 'pt-BR', label: 'Português (Brasil)', english: 'Portuguese (Brazil)' },
  { code: 'bn', label: 'বাংলা', english: 'Bengali' },
  { code: 'ru', label: 'Русский', english: 'Russian' },
  { code: 'ja', label: '日本語', english: 'Japanese' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
  { code: 'de', label: 'Deutsch', english: 'German' },
  { code: 'fr', label: 'Français', english: 'French' },
  { code: 'ko', label: '한국어', english: 'Korean' },
  { code: 'tr', label: 'Türkçe', english: 'Turkish' },
  { code: 'vi', label: 'Tiếng Việt', english: 'Vietnamese' },
  { code: 'it', label: 'Italiano', english: 'Italian' },
  { code: 'th', label: 'ไทย', english: 'Thai' },
  { code: 'pl', label: 'Polski', english: 'Polish' },
  { code: 'uk', label: 'Українська', english: 'Ukrainian' },
  { code: 'ro', label: 'Română', english: 'Romanian' },
  { code: 'nl', label: 'Nederlands', english: 'Dutch' },
  { code: 'el', label: 'Ελληνικά', english: 'Greek' },
  { code: 'cs', label: 'Čeština', english: 'Czech' },
  { code: 'sv', label: 'Svenska', english: 'Swedish' },
  { code: 'hu', label: 'Magyar', english: 'Hungarian' },
  { code: 'id', label: 'Bahasa Indonesia', english: 'Indonesian' },
  { code: 'ms', label: 'Bahasa Melayu', english: 'Malay' },
  { code: 'fil', label: 'Filipino', english: 'Filipino' },
  { code: 'ur', label: 'اردو', english: 'Urdu' },
  { code: 'fa', label: 'فارسی', english: 'Persian' },
  { code: 'he', label: 'עברית', english: 'Hebrew' },
  { code: 'ta', label: 'தமிழ்', english: 'Tamil' },
  { code: 'te', label: 'తెలుగు', english: 'Telugu' },
  { code: 'mr', label: 'मराठी', english: 'Marathi' },
  { code: 'gu', label: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'kn', label: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'ml', label: 'മലയാളം', english: 'Malayalam' },
  { code: 'sw', label: 'Kiswahili', english: 'Swahili' },
  { code: 'af', label: 'Afrikaans', english: 'Afrikaans' },
  { code: 'am', label: 'አማርኛ', english: 'Amharic' },
  { code: 'ha', label: 'Hausa', english: 'Hausa' },
  { code: 'yo', label: 'Yorùbá', english: 'Yoruba' },
  { code: 'ig', label: 'Igbo', english: 'Igbo' },
  { code: 'zu', label: 'isiZulu', english: 'Zulu' },
  { code: 'ca', label: 'Català', english: 'Catalan' },
  { code: 'sr', label: 'Српски', english: 'Serbian' },
  { code: 'hr', label: 'Hrvatski', english: 'Croatian' },
  { code: 'bg', label: 'Български', english: 'Bulgarian' },
  { code: 'sk', label: 'Slovenčina', english: 'Slovak' },
  { code: 'sl', label: 'Slovenščina', english: 'Slovenian' },
  { code: 'lt', label: 'Lietuvių', english: 'Lithuanian' },
  { code: 'lv', label: 'Latviešu', english: 'Latvian' },
  { code: 'et', label: 'Eesti', english: 'Estonian' },
  { code: 'fi', label: 'Suomi', english: 'Finnish' },
  { code: 'no', label: 'Norsk', english: 'Norwegian' },
  { code: 'da', label: 'Dansk', english: 'Danish' },
  { code: 'is', label: 'Íslenska', english: 'Icelandic' },
  { code: 'ga', label: 'Gaeilge', english: 'Irish' },
  { code: 'sq', label: 'Shqip', english: 'Albanian' },
  { code: 'mk', label: 'Македонски', english: 'Macedonian' },
  { code: 'bs', label: 'Bosanski', english: 'Bosnian' },
  { code: 'ka', label: 'ქართული', english: 'Georgian' },
  { code: 'hy', label: 'Հայերեն', english: 'Armenian' },
  { code: 'az', label: 'Azərbaycan', english: 'Azerbaijani' },
  { code: 'kk', label: 'Қазақ', english: 'Kazakh' },
  { code: 'uz', label: 'Oʻzbek', english: 'Uzbek' },
  { code: 'mn', label: 'Монгол', english: 'Mongolian' },
  { code: 'ne', label: 'नेपाली', english: 'Nepali' },
  { code: 'si', label: 'සිංහල', english: 'Sinhala' },
  { code: 'my', label: 'မြန်မာ', english: 'Burmese' },
  { code: 'km', label: 'ខ្មែរ', english: 'Khmer' },
  { code: 'lo', label: 'ລາວ', english: 'Lao' },
  { code: 'ps', label: 'پښتو', english: 'Pashto' },
  { code: 'ku', label: 'Kurdî', english: 'Kurdish' },
  { code: 'so', label: 'Soomaali', english: 'Somali' },
] as const;

export type LanguageCode = (typeof WORLD_LANGUAGES)[number]['code'];

const CODE_SET = new Set<string>(WORLD_LANGUAGES.map((l) => l.code));

export function isLanguageCode(value: string): value is LanguageCode {
  return CODE_SET.has(value);
}

export function languageShortCode(code: LanguageCode): string {
  const base = code.split('-')[0].toUpperCase();
  if (code === 'zh-CN') return 'CN';
  if (code === 'zh-TW') return 'TW';
  if (code === 'pt-BR') return 'BR';
  return base.length > 3 ? base.slice(0, 3) : base;
}

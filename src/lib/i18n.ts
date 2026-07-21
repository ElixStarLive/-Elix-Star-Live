/**
 * Lightweight i18n runtime.
 *
 * English is the base language and the fallback for any key that is not yet
 * translated in another language (standard i18n behavior — never a fake blank).
 * The active language is the persisted `language` value in useSettingsStore, so
 * switching it in the picker re-renders every component using `useT()`.
 */
import { useCallback } from 'react';
import { languageShortCode, WORLD_LANGUAGES, type LanguageCode } from './languages';
import { useSettingsStore, type AppLanguage } from '../store/useSettingsStore';

export type Lang = AppLanguage;

export const LANGUAGES = WORLD_LANGUAGES;

export const LANGUAGE_SHORT: Record<LanguageCode, string> = Object.fromEntries(
  WORLD_LANGUAGES.map((l) => [l.code, languageShortCode(l.code)]),
) as Record<LanguageCode, string>;

type Dict = Record<string, string>;

const en: Dict = {
  'settings.title': 'Settings',
  'settings.section.account': 'Account',
  'settings.editProfile': 'Edit Profile',
  'settings.privacy': 'Privacy',
  'settings.security': 'Security',
  'settings.deleteAccount': 'Delete Account',
  'settings.section.preferences': 'Preferences',
  'settings.notifications': 'Notifications',
  'settings.liveNotifications': 'Live notifications',
  'settings.darkMode': 'Dark Mode',
  'settings.language': 'Language',
  'settings.section.content': 'Content',
  'settings.videoQuality': 'Video Quality',
  'settings.likedVideos': 'Liked Videos',
  'settings.section.safety': 'Safety',
  'settings.blockedAccounts': 'Blocked Accounts',
  'settings.safetyCenter': 'Safety Center',
  'settings.section.support': 'Support',
  'settings.helpSupport': 'Help & Support',
  'settings.chooseLanguage': 'Choose language',
  'common.terms': 'Terms',
  'common.privacy': 'Privacy',
  'common.guidelines': 'Guidelines',
  'common.logout': 'Log Out',
  'common.delete': 'Delete',
  'common.on': 'On',
  'common.off': 'Off',
  'common.auto': 'Auto',
  'toast.darkModeAlwaysOn': 'Dark mode is always on',
  'toast.videoQualityAuto': 'Video quality is set to auto',
};

const es: Dict = {
  'settings.title': 'Ajustes',
  'settings.section.account': 'Cuenta',
  'settings.editProfile': 'Editar perfil',
  'settings.privacy': 'Privacidad',
  'settings.security': 'Seguridad',
  'settings.deleteAccount': 'Eliminar cuenta',
  'settings.section.preferences': 'Preferencias',
  'settings.notifications': 'Notificaciones',
  'settings.liveNotifications': 'Notificaciones en vivo',
  'settings.darkMode': 'Modo oscuro',
  'settings.language': 'Idioma',
  'settings.section.content': 'Contenido',
  'settings.videoQuality': 'Calidad de vídeo',
  'settings.likedVideos': 'Vídeos que me gustan',
  'settings.section.safety': 'Seguridad',
  'settings.blockedAccounts': 'Cuentas bloqueadas',
  'settings.safetyCenter': 'Centro de seguridad',
  'settings.section.support': 'Soporte',
  'settings.helpSupport': 'Ayuda y soporte',
  'settings.chooseLanguage': 'Elegir idioma',
  'common.terms': 'Términos',
  'common.privacy': 'Privacidad',
  'common.guidelines': 'Normas',
  'common.logout': 'Cerrar sesión',
  'common.delete': 'Eliminar',
  'common.on': 'Activado',
  'common.off': 'Desactivado',
  'common.auto': 'Automático',
  'toast.darkModeAlwaysOn': 'El modo oscuro está siempre activado',
  'toast.videoQualityAuto': 'La calidad de vídeo está en automático',
};

const fr: Dict = {
  'settings.title': 'Paramètres',
  'settings.section.account': 'Compte',
  'settings.editProfile': 'Modifier le profil',
  'settings.privacy': 'Confidentialité',
  'settings.security': 'Sécurité',
  'settings.deleteAccount': 'Supprimer le compte',
  'settings.section.preferences': 'Préférences',
  'settings.notifications': 'Notifications',
  'settings.liveNotifications': 'Notifications en direct',
  'settings.darkMode': 'Mode sombre',
  'settings.language': 'Langue',
  'settings.section.content': 'Contenu',
  'settings.videoQuality': 'Qualité vidéo',
  'settings.likedVideos': 'Vidéos aimées',
  'settings.section.safety': 'Sécurité',
  'settings.blockedAccounts': 'Comptes bloqués',
  'settings.safetyCenter': 'Centre de sécurité',
  'settings.section.support': 'Assistance',
  'settings.helpSupport': 'Aide et assistance',
  'settings.chooseLanguage': 'Choisir la langue',
  'common.terms': 'Conditions',
  'common.privacy': 'Confidentialité',
  'common.guidelines': 'Règles',
  'common.logout': 'Se déconnecter',
  'common.delete': 'Supprimer',
  'common.on': 'Activé',
  'common.off': 'Désactivé',
  'common.auto': 'Auto',
  'toast.darkModeAlwaysOn': 'Le mode sombre est toujours activé',
  'toast.videoQualityAuto': 'La qualité vidéo est en automatique',
};

const pt: Dict = {
  'settings.title': 'Configurações',
  'settings.section.account': 'Conta',
  'settings.editProfile': 'Editar perfil',
  'settings.privacy': 'Privacidade',
  'settings.security': 'Segurança',
  'settings.deleteAccount': 'Excluir conta',
  'settings.section.preferences': 'Preferências',
  'settings.notifications': 'Notificações',
  'settings.liveNotifications': 'Notificações ao vivo',
  'settings.darkMode': 'Modo escuro',
  'settings.language': 'Idioma',
  'settings.section.content': 'Conteúdo',
  'settings.videoQuality': 'Qualidade do vídeo',
  'settings.likedVideos': 'Vídeos curtidos',
  'settings.section.safety': 'Segurança',
  'settings.blockedAccounts': 'Contas bloqueadas',
  'settings.safetyCenter': 'Central de segurança',
  'settings.section.support': 'Suporte',
  'settings.helpSupport': 'Ajuda e suporte',
  'settings.chooseLanguage': 'Escolher idioma',
  'common.terms': 'Termos',
  'common.privacy': 'Privacidade',
  'common.guidelines': 'Diretrizes',
  'common.logout': 'Sair',
  'common.delete': 'Excluir',
  'common.on': 'Ligado',
  'common.off': 'Desligado',
  'common.auto': 'Automático',
  'toast.darkModeAlwaysOn': 'O modo escuro está sempre ativado',
  'toast.videoQualityAuto': 'A qualidade do vídeo está no automático',
};

const de: Dict = {
  'settings.title': 'Einstellungen',
  'settings.section.account': 'Konto',
  'settings.editProfile': 'Profil bearbeiten',
  'settings.privacy': 'Datenschutz',
  'settings.security': 'Sicherheit',
  'settings.deleteAccount': 'Konto löschen',
  'settings.section.preferences': 'Einstellungen',
  'settings.notifications': 'Benachrichtigungen',
  'settings.liveNotifications': 'Live-Benachrichtigungen',
  'settings.darkMode': 'Dunkelmodus',
  'settings.language': 'Sprache',
  'settings.section.content': 'Inhalte',
  'settings.videoQuality': 'Videoqualität',
  'settings.likedVideos': 'Gefällt-mir-Videos',
  'settings.section.safety': 'Sicherheit',
  'settings.blockedAccounts': 'Blockierte Konten',
  'settings.safetyCenter': 'Sicherheitszentrum',
  'settings.section.support': 'Support',
  'settings.helpSupport': 'Hilfe und Support',
  'settings.chooseLanguage': 'Sprache wählen',
  'common.terms': 'Nutzungsbedingungen',
  'common.privacy': 'Datenschutz',
  'common.guidelines': 'Richtlinien',
  'common.logout': 'Abmelden',
  'common.delete': 'Löschen',
  'common.on': 'An',
  'common.off': 'Aus',
  'common.auto': 'Automatisch',
  'toast.darkModeAlwaysOn': 'Der Dunkelmodus ist immer aktiviert',
  'toast.videoQualityAuto': 'Die Videoqualität ist auf automatisch eingestellt',
};

const it: Dict = {
  'settings.title': 'Impostazioni',
  'settings.section.account': 'Account',
  'settings.editProfile': 'Modifica profilo',
  'settings.privacy': 'Privacy',
  'settings.security': 'Sicurezza',
  'settings.deleteAccount': 'Elimina account',
  'settings.section.preferences': 'Preferenze',
  'settings.notifications': 'Notifiche',
  'settings.liveNotifications': 'Notifiche in diretta',
  'settings.darkMode': 'Modalità scura',
  'settings.language': 'Lingua',
  'settings.section.content': 'Contenuti',
  'settings.videoQuality': 'Qualità video',
  'settings.likedVideos': 'Video piaciuti',
  'settings.section.safety': 'Sicurezza',
  'settings.blockedAccounts': 'Account bloccati',
  'settings.safetyCenter': 'Centro sicurezza',
  'settings.section.support': 'Supporto',
  'settings.helpSupport': 'Aiuto e supporto',
  'settings.chooseLanguage': 'Scegli la lingua',
  'common.terms': 'Termini',
  'common.privacy': 'Privacy',
  'common.guidelines': 'Linee guida',
  'common.logout': 'Esci',
  'common.delete': 'Elimina',
  'common.on': 'Attivo',
  'common.off': 'Disattivo',
  'common.auto': 'Automatico',
  'toast.darkModeAlwaysOn': 'La modalità scura è sempre attiva',
  'toast.videoQualityAuto': 'La qualità video è impostata su automatico',
};

const hi: Dict = {
  'settings.title': 'सेटिंग्स',
  'settings.section.account': 'खाता',
  'settings.editProfile': 'प्रोफ़ाइल संपादित करें',
  'settings.privacy': 'गोपनीयता',
  'settings.security': 'सुरक्षा',
  'settings.deleteAccount': 'खाता हटाएँ',
  'settings.section.preferences': 'प्राथमिकताएँ',
  'settings.notifications': 'सूचनाएँ',
  'settings.liveNotifications': 'लाइव सूचनाएँ',
  'settings.darkMode': 'डार्क मोड',
  'settings.language': 'भाषा',
  'settings.section.content': 'सामग्री',
  'settings.videoQuality': 'वीडियो गुणवत्ता',
  'settings.likedVideos': 'पसंद किए गए वीडियो',
  'settings.section.safety': 'सुरक्षा',
  'settings.blockedAccounts': 'अवरुद्ध खाते',
  'settings.safetyCenter': 'सुरक्षा केंद्र',
  'settings.section.support': 'सहायता',
  'settings.helpSupport': 'मदद और सहायता',
  'settings.chooseLanguage': 'भाषा चुनें',
  'common.terms': 'शर्तें',
  'common.privacy': 'गोपनीयता',
  'common.guidelines': 'दिशानिर्देश',
  'common.logout': 'लॉग आउट',
  'common.delete': 'हटाएँ',
  'common.on': 'चालू',
  'common.off': 'बंद',
  'common.auto': 'ऑटो',
  'toast.darkModeAlwaysOn': 'डार्क मोड हमेशा चालू रहता है',
  'toast.videoQualityAuto': 'वीडियो गुणवत्ता ऑटो पर सेट है',
};

const ro: Dict = {
  'settings.title': 'Setări',
  'settings.section.account': 'Cont',
  'settings.editProfile': 'Editează profilul',
  'settings.privacy': 'Confidențialitate',
  'settings.security': 'Securitate',
  'settings.deleteAccount': 'Șterge contul',
  'settings.section.preferences': 'Preferințe',
  'settings.notifications': 'Notificări',
  'settings.liveNotifications': 'Notificări live',
  'settings.darkMode': 'Mod întunecat',
  'settings.language': 'Limbă',
  'settings.section.content': 'Conținut',
  'settings.videoQuality': 'Calitate video',
  'settings.likedVideos': 'Videoclipuri apreciate',
  'settings.section.safety': 'Siguranță',
  'settings.blockedAccounts': 'Conturi blocate',
  'settings.safetyCenter': 'Centru de siguranță',
  'settings.section.support': 'Asistență',
  'settings.helpSupport': 'Ajutor și asistență',
  'settings.chooseLanguage': 'Alege limba',
  'common.terms': 'Termeni',
  'common.privacy': 'Confidențialitate',
  'common.guidelines': 'Reguli',
  'common.logout': 'Deconectare',
  'common.delete': 'Șterge',
  'common.on': 'Activat',
  'common.off': 'Dezactivat',
  'common.auto': 'Automat',
  'toast.darkModeAlwaysOn': 'Modul întunecat este mereu activat',
  'toast.videoQualityAuto': 'Calitatea video este setată pe automat',
};

const TRANSLATED: Partial<Record<Lang, Dict>> = { en, es, fr, pt, de, it, hi, ro };

export function translate(lang: Lang, key: string): string {
  return TRANSLATED[lang]?.[key] ?? en[key] ?? key;
}

/** Keep the document language attribute in sync for accessibility. */
if (typeof document !== 'undefined') {
  const apply = (l: Lang) => { document.documentElement.lang = l; };
  apply(useSettingsStore.getState().language);
  useSettingsStore.subscribe((s) => apply(s.language));
}

export function useT() {
  const lang = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const t = useCallback((key: string) => translate(lang, key), [lang]);
  return { t, lang, setLang: setLanguage };
}

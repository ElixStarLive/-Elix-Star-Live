import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppLanguage = 'en' | 'es' | 'fr' | 'pt' | 'de' | 'it' | 'hi' | 'ro';

interface SettingsState {
  muteAllSounds: boolean;
  notificationsEnabled: boolean;
  liveNotifications: boolean;
  language: AppLanguage;
  setMuteAllSounds: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setLiveNotifications: (value: boolean) => void;
  setLanguage: (value: AppLanguage) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      muteAllSounds: false,
      notificationsEnabled: true,
      liveNotifications: true,
      language: 'en',
      setMuteAllSounds: (value) => set({ muteAllSounds: value }),
      setNotificationsEnabled: (value) => set({ notificationsEnabled: value }),
      setLiveNotifications: (value) => set({ liveNotifications: value }),
      setLanguage: (value) => set({ language: value }),
    }),
    {
      name: 'elix_settings_v1',
      version: 2,
      // v1 shipped with an unused default language of 'ro' (no picker existed).
      // Now that language is applied, migrate that stale default to English so
      // existing users are not unexpectedly switched to Romanian.
      migrate: (persisted, fromVersion) => {
        const state = (persisted as Partial<SettingsState>) || {};
        if (fromVersion < 2 && state.language === 'ro') state.language = 'en';
        return state as SettingsState;
      },
    }
  )
);


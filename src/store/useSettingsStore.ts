import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppLanguage = 'ro' | 'en';

interface SettingsState {
  muteAllSounds: boolean;
  notificationsEnabled: boolean;
  language: AppLanguage;
  setMuteAllSounds: (value: boolean) => void;
  setNotificationsEnabled: (value: boolean) => void;
  setLanguage: (value: AppLanguage) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      muteAllSounds: false,
      notificationsEnabled: true,
      language: 'ro',
      setMuteAllSounds: (value) => set({ muteAllSounds: value }),
      setNotificationsEnabled: (value) => set({ notificationsEnabled: value }),
      setLanguage: (value) => set({ language: value }),
    }),
    {
      name: 'elix_settings_v1',
      version: 1,
    }
  )
);


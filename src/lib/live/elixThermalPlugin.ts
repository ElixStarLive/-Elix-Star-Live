import { registerPlugin } from '@capacitor/core';
import type { ThermalTier } from './liveMediaProfile';

export type ElixThermalState = {
  /** nominal | fair | serious | critical — aligned with iOS ProcessInfo.ThermalState */
  tier: ThermalTier;
  /** Raw platform label for profiling logs. */
  raw: string;
};

type ElixThermalPlugin = {
  getThermalState(): Promise<ElixThermalState>;
  addListener(
    eventName: 'thermalStateChange',
    listener: (state: ElixThermalState) => void,
  ): Promise<{ remove: () => void }>;
};

export const ElixThermal = registerPlugin<ElixThermalPlugin>('ElixThermal', {
  web: () =>
    import('./elixThermalPlugin.web').then((m) => m.default),
});

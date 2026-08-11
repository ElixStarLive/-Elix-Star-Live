import type { ElixThermalState } from './elixThermalPlugin';

/** Web/dev: no OS thermal API — stay nominal. */
const WebElixThermal = {
  async getThermalState(): Promise<ElixThermalState> {
    return { tier: 'nominal', raw: 'web' };
  },
  async addListener(
    _eventName: 'thermalStateChange',
    _listener: (state: ElixThermalState) => void,
  ): Promise<{ remove: () => void }> {
    return { remove: () => {} };
  },
};

export default WebElixThermal;

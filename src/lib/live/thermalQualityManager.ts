/**
 * Thermal-aware Live quality — one manager for host / spectator / battle.
 * Does not disconnect rooms; reduces capture/publish cost under pressure.
 */
import type { Room } from 'livekit-client';
import { Track } from 'livekit-client';
import { ElixThermal, type ElixThermalState } from './elixThermalPlugin';
import {
  applyCaptureTierToVideoTrack,
  getLiveMediaTierConfig,
  setActiveThermalTier,
  type ThermalTier,
} from './liveMediaProfile';

type Registration = {
  getRoom: () => Room | null;
  getCameraVideoTrack: () => MediaStreamTrack | null | undefined;
  getCameraFacing: () => 'user' | 'environment';
  /** When false, skip capture down-tier (spectator subscribe-only). */
  publishesCamera: boolean;
};

let managerRefCount = 0;
let listenerRemove: (() => void) | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const registrations = new Set<Registration>();
let lastAppliedTier: ThermalTier | null = null;

function mapRawToTier(raw: string): ThermalTier {
  const v = raw.trim().toLowerCase();
  if (v === 'critical' || v === '3') return 'critical';
  if (v === 'serious' || v === '2') return 'serious';
  if (v === 'fair' || v === '1') return 'fair';
  return 'nominal';
}

async function readThermalState(): Promise<ThermalTier> {
  try {
    const state: ElixThermalState = await ElixThermal.getThermalState();
    return mapRawToTier(state.tier || state.raw || 'nominal');
  } catch {
    return 'nominal';
  }
}

async function applyTier(tier: ThermalTier): Promise<void> {
  if (tier === lastAppliedTier) return;
  lastAppliedTier = tier;
  setActiveThermalTier(tier);
  const cfg = getLiveMediaTierConfig(tier);

  for (const reg of registrations) {
    if (reg.publishesCamera) {
      const track = reg.getCameraVideoTrack();
      await applyCaptureTierToVideoTrack(track, reg.getCameraFacing(), tier);
    }
    const room = reg.getRoom();
    if (!room || !reg.publishesCamera) continue;
    const pub =
      room.localParticipant.getTrackPublication(Track.Source.Camera) ??
      room.localParticipant.getTrackPublicationByName('camera');
    const localVideo = pub?.track;
    if (localVideo && 'restartTrack' in localVideo && tier !== 'nominal') {
      try {
        await (
          localVideo as {
            restartTrack: (opts?: {
              resolution?: { width: number; height: number; frameRate?: number };
            }) => Promise<void>;
          }
        ).restartTrack({
          resolution: {
            width: cfg.publishPreset.width,
            height: cfg.publishPreset.height,
            frameRate:
              typeof cfg.publishPreset.encoding.maxFramerate === 'number'
                ? cfg.publishPreset.encoding.maxFramerate
                : 30,
          },
        });
      } catch {
        /* keep publishing at current capture if restart unsupported */
      }
    }
  }
}

async function refreshTier(): Promise<void> {
  const tier = await readThermalState();
  await applyTier(tier);
}

export function registerLiveThermalTarget(reg: Registration): () => void {
  registrations.add(reg);
  void refreshTier();
  return () => {
    registrations.delete(reg);
  };
}

export function retainThermalQualityManager(): void {
  if (typeof window === 'undefined') return;
  if (managerRefCount === 0) {
    void refreshTier();
    void ElixThermal.addListener('thermalStateChange', (state) => {
      void applyTier(mapRawToTier(state.tier || state.raw || 'nominal'));
    }).then((handle) => {
      listenerRemove = () => handle.remove();
    });
    pollTimer = window.setInterval(() => {
      void refreshTier();
    }, 45_000);
  }
  managerRefCount += 1;
}

export function releaseThermalQualityManager(): void {
  if (managerRefCount <= 0) return;
  managerRefCount -= 1;
  if (managerRefCount > 0) return;
  listenerRemove?.();
  listenerRemove = null;
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  registrations.clear();
  lastAppliedTier = null;
}

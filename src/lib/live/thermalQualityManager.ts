/**
 * Thermal-aware Live quality — one manager for host / spectator / battle.
 * Does not disconnect rooms; reduces capture/publish/subscribe cost under pressure.
 */
import type { Room } from 'livekit-client';
import { Track } from 'livekit-client';
import { ElixThermal, type ElixThermalState } from './elixThermalPlugin';
import {
  applyCaptureTierToVideoTrack,
  setActiveThermalTier,
  type ThermalTier,
} from './liveMediaProfile';
import { applyRemoteVideoBudget } from './liveRemoteVideoBudget';

type Registration = {
  getRoom: () => Room | null;
  getCameraVideoTrack: () => MediaStreamTrack | null | undefined;
  getCameraFacing: () => 'user' | 'environment';
  /** When false, skip capture down-tier (spectator subscribe-only). */
  publishesCamera: boolean;
  /** Remote publishers currently rendered (e.g. 3 in 4-creator Battle). */
  getBattleRemoteCount?: () => number;
  /**
   * The publish owner's idempotent re-publish. Called only to recover a camera
   * publication that was lost while the broadcast is still connected.
   */
  republishCamera?: () => Promise<void>;
};

let managerRefCount = 0;
let listenerRemove: (() => void) | null = null;
let pollTimer: number | null = null;
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

  for (const reg of registrations) {
    if (reg.publishesCamera) {
      const track = reg.getCameraVideoTrack();
      await applyCaptureTierToVideoTrack(track, reg.getCameraFacing(), tier);
    }
    const room = reg.getRoom();
    if (!room) continue;

    // Always cap remote decode (spectator + host battle tiles) when thermal rises.
    applyRemoteVideoBudget(room, {
      battleRemoteCount: reg.getBattleRemoteCount?.() ?? 0,
    });

  }
}

/**
 * A camera publication can be lost at any time (camera reclaimed by another app,
 * OS interruption, a failed publish), not only when the thermal tier moves, and
 * applyTier is a no-op while the tier holds. The poll therefore owns the sweep so
 * a broadcast cannot sit publishing audio only until the next tier change.
 */
async function sweepDroppedCameraPublications(): Promise<void> {
  for (const reg of registrations) {
    if (!reg.publishesCamera) continue;
    const room = reg.getRoom();
    if (!room) continue;
    await recoverDroppedCameraPublication(reg, room);
  }
}

/**
 * Restore the camera publication when it has lost its track while the room is
 * still connected and a live camera is available.
 *
 * Down-tiering used to call LiveKit's restartTrack here, which stops the camera
 * and re-acquires it. When that re-acquire failed the failure was swallowed and
 * the broadcast carried on publishing microphone audio with no video, which
 * strands every spectator on "Connecting to stream" forever — the spectator only
 * reveals a stream once a remote *video* track arrives. Capture is already
 * lowered by applyCaptureTierToVideoTrack above, which constrains the existing
 * track instead of replacing it, so the publication no longer has to be torn
 * down to shed encode cost.
 *
 * A muted publication is the creator's own camera-off and must stay off.
 */
async function recoverDroppedCameraPublication(reg: Registration, room: Room): Promise<void> {
  if (!reg.republishCamera) return;
  const camera = reg.getCameraVideoTrack();
  if (!camera || camera.readyState !== 'live') return;
  const pub =
    room.localParticipant.getTrackPublication(Track.Source.Camera) ??
    room.localParticipant.getTrackPublicationByName('camera');
  if (pub?.isMuted) return;
  if (pub?.track?.mediaStreamTrack?.readyState === 'live') return;
  try {
    await reg.republishCamera();
  } catch {
    /* the publish owner surfaces its own failures */
  }
}

async function refreshTier(): Promise<void> {
  const tier = await readThermalState();
  await applyTier(tier);
  await sweepDroppedCameraPublications();
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
      void (async () => {
        await applyTier(mapRawToTier(state.tier || state.raw || 'nominal'));
        await sweepDroppedCameraPublications();
      })();
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

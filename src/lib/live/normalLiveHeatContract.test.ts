import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), 'utf8');

describe('Normal Live heat owners', () => {
  it('Live camera enforces 720p/30 on Create handoff and new capture', () => {
    const camera = read('../../features/live/hooks/useLiveCamera.ts');
    expect(camera).toContain('enforceLiveCaptureOnStream');
    const profile = read('./liveMediaProfile.ts');
    expect(profile).toContain('width: { ideal: 1280, max: 1280 }');
    expect(profile).toContain('frameRate: { ideal: 30, max: 30 }');
    expect(profile).toContain('export async function enforceLiveCaptureOnStream');
  });

  it('engagement hook does not tick Date.now into Live tree every second', () => {
    const hook = read('../../hooks/useLiveEngagement.ts');
    expect(hook).not.toContain('setNowMs');
    expect(hook).not.toContain('nowMs');
    expect(hook).toContain('TICK_MS = 18_000');
  });

  it('poll clock lives only in the overlay while the poll sheet is open', () => {
    const overlay = read('../../components/LiveEngagementOverlay.tsx');
    expect(overlay).toContain('if (!showPollSheet || !state.poll?.endsAt) return');
    expect(overlay).not.toMatch(/nowMs:\s*number/);
  });

  it('mission countdown interval runs only while the dock is open', () => {
    const stack = read('../../components/LiveSideMissionStack.tsx');
    expect(stack).toContain('if (!open) return');
    expect(stack).toContain('setRemainMs(msUntilLocalMidnight())');
  });

  it('host does not create hidden audio elements via attach() without a target', () => {
    const host = read('../../features/live/host/useLiveHostController.tsx');
    const fn = host.slice(host.indexOf('const attachRemoteAudio'));
    expect(fn.slice(0, 500)).toContain('if (!el) return');
    expect(fn.slice(0, 500)).not.toContain('track.attach()');
  });
});

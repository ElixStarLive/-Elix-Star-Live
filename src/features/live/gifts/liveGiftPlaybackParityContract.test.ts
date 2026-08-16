import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

const hostController = read('../host/useLiveHostController.tsx');
const spectatorController = read('../spectator/useLiveSpectatorController.tsx');
const hostScreen = read('../host/LiveHostScreen.tsx');
const spectatorScreen = read('../spectator/SpectatorLiveScreen.tsx');
const giftOverlay = read('../../../components/GiftOverlay.tsx');

describe('gift playback parity — creator and spectator', () => {
  it('both controllers own the queue through useLiveGiftPlaybackQueue', () => {
    for (const controller of [hostController, spectatorController]) {
      expect(controller).toContain('} = useLiveGiftPlaybackQueue();');
      expect(controller).toContain('enqueueFromGiftSent,');
    }
  });

  it('both remote gift_sent handlers enqueue the video with the same options', () => {
    for (const controller of [hostController, spectatorController]) {
      const start = controller.indexOf('enqueueFromGiftSent({');
      expect(start).toBeGreaterThan(-1);
      const call = controller.slice(start, start + 400);
      expect(call).toContain('catalogRef: giftsCatalogRef,');
      expect(call).toContain('setGiftsCatalog,');
      expect(call).toContain('trackPlayedVideo: true,');
    }
  });

  it('both local send paths resolve the URL and enqueue it', () => {
    for (const controller of [hostController, spectatorController]) {
      expect(controller).toContain('resolveLocalGiftVideoUrl(');
      expect(controller).toContain('enqueueGiftVideo(');
    }
  });

  it('both screens mount the same GiftOverlay with the same playback props', () => {
    for (const screen of [hostScreen, spectatorScreen]) {
      const start = screen.indexOf('<GiftOverlay');
      expect(start).toBeGreaterThan(-1);
      const mount = screen.slice(start, screen.indexOf('/>', start));
      expect(mount).toContain('key={`gift-${giftKey}`}');
      expect(mount).toContain('videoSrc={currentGift?.video ?? null}');
      expect(mount).toContain('onEnded={handleGiftEnded}');
      expect(mount).toContain('battleSide={currentGift?.battleSide ?? null}');
      expect(mount).toContain('muted={false}');
    }
  });
});

describe('gift overlay playback gate', () => {
  it('mounts the video instead of gating it behind a buffered preload', () => {
    expect(giftOverlay).not.toContain('videoCache');
    expect(giftOverlay).not.toContain('videoReady');
    expect(giftOverlay).toContain('if (!playSrc) return null;');
    expect(giftOverlay).toContain("el.addEventListener('loadeddata', tryPlay");
  });

  it('keeps the locked solo/battle framing contract', () => {
    expect(giftOverlay).toContain('fixed left-0 right-0 mx-auto w-full max-w-[480px]');
    expect(giftOverlay).toContain("height: 'calc(70% - 25mm)'");
    expect(giftOverlay).toContain("objectFit: 'cover'");
  });
});

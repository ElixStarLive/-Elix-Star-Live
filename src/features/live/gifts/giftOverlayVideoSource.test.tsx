// @vitest-environment jsdom
/**
 * Regression: the gift <video> must keep the src React declared in JSX.
 *
 * Teardown used to call removeAttribute('src') + load(). React only writes
 * src during a render commit, so on the StrictMode effect remount (main.tsx
 * wraps the app in StrictMode) the element stayed mounted with no source,
 * fired no media events, and every gift was dropped by the safety timer.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import React, { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { GiftOverlay } from '../../../components/GiftOverlay';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const calls: string[] = [];

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom does not implement media playback; browsers return a promise.
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: function (this: HTMLMediaElement) {
      calls.push(`play:${this.getAttribute('src')}`);
      return Promise.resolve();
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'load', {
    configurable: true,
    value: function (this: HTMLMediaElement) {
      calls.push(`load:${this.getAttribute('src')}`);
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: () => {
      calls.push('pause');
    },
  });
});

const SRC = 'https://elixstorage.b-cdn.net/gifts/test_gift.mp4';

function mountOverlay(strict: boolean) {
  calls.length = 0;
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const overlay = <GiftOverlay videoSrc={SRC} onEnded={() => {}} />;
  act(() => {
    root.render(strict ? <StrictMode>{overlay}</StrictMode> : overlay);
  });
  return { root, video: host.querySelector('video') };
}

describe('gift overlay video source', () => {
  it('keeps the src through a StrictMode remount and still plays', () => {
    const { root, video } = mountOverlay(true);
    expect(video?.getAttribute('src')).toBe(SRC);
    expect(calls.filter((c) => c === `play:${SRC}`).length).toBeGreaterThan(0);
    // Playback must be kicked again after the remount pause.
    expect(calls.lastIndexOf(`play:${SRC}`)).toBeGreaterThan(calls.indexOf('pause'));
    act(() => root.unmount());
  });

  it('keeps the src on a plain mount', () => {
    const { root, video } = mountOverlay(false);
    expect(video?.getAttribute('src')).toBe(SRC);
    act(() => root.unmount());
  });

  it('pauses on unmount without clearing the element source', () => {
    const { root, video } = mountOverlay(false);
    calls.length = 0;
    act(() => root.unmount());
    expect(calls).toContain('pause');
    expect(calls.some((c) => c.startsWith('load:'))).toBe(false);
    expect(video?.getAttribute('src')).toBe(SRC);
  });
});

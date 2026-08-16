import type { RemoteParticipant, RemoteTrack } from 'livekit-client';

/** Detach a remote track from every bound element — stops hidden decoders. */
export function detachRemoteTrack(track: RemoteTrack | null | undefined): void {
  if (!track) return;
  try {
    track.detach();
  } catch {
    /* already detached */
  }
}

export function detachParticipantTracks(participant: RemoteParticipant | null | undefined): void {
  if (!participant) return;
  for (const pub of participant.trackPublications.values()) {
    if (pub.track) detachRemoteTrack(pub.track as RemoteTrack);
  }
}

/**
 * Release a gift / URL video element at teardown.
 *
 * Must never clear the `src` attribute: React declares it in JSX and only
 * writes it during a render commit, so removing it from an element React keeps
 * mounted (every StrictMode effect remount) leaves a source-less element that
 * fires no media events at all. Pausing stops decoding immediately; the media
 * resource is freed when React unmounts the element.
 */
export function releaseVideoElement(el: HTMLVideoElement | null | undefined): void {
  if (!el) return;
  try {
    el.pause();
  } catch {
    /* ignore */
  }
  if (el.srcObject) {
    el.srcObject = null;
  }
}

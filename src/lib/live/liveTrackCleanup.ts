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

/** Release a gift / URL video element decoder. */
export function releaseVideoElement(el: HTMLVideoElement | null | undefined): void {
  if (!el) return;
  try {
    el.pause();
  } catch {
    /* ignore */
  }
  el.removeAttribute('src');
  if (el.srcObject) {
    el.srcObject = null;
  }
  try {
    el.load();
  } catch {
    /* ignore */
  }
}

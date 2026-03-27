import { apiUrl } from "./api";

export type SoundTrack = {
  id: number;
  title: string;
  artist: string;
  duration: string;
  url: string;
  license: string;
  source: string;
  clipStartSeconds: number;
  clipEndSeconds: number;
};

// Fetch sound tracks from Hetzner backend — no hardcoded data, no dead stubs
export async function fetchSoundTracksFromDatabase(): Promise<SoundTrack[]> {
  try {
    const res = await fetch(apiUrl("/api/sounds"), {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as { tracks?: SoundTrack[] };
    return data.tracks ?? [];
  } catch {
    return [];
  }
}

// Default empty track for when no music is selected
export const EMPTY_TRACK: SoundTrack = {
  id: 0,
  title: "No Music",
  artist: "-",
  duration: "0:00",
  url: "",
  license: "-",
  source: "Local",
  clipStartSeconds: 0,
  clipEndSeconds: 0,
};

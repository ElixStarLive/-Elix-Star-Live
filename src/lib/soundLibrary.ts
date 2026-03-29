import { request } from "./apiClient";

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
  const { data, error } = await request<{ tracks?: SoundTrack[] }>("/api/sounds");
  if (error) return [];
  return data?.tracks ?? [];
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

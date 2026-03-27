let cachedStream: MediaStream | null = null;

export function getCachedCameraStream(): MediaStream | null {
  return cachedStream;
}

export function setCachedCameraStream(stream: MediaStream) {
  cachedStream = stream;
}

export function clearCachedCameraStream() {
  cachedStream = null;
}


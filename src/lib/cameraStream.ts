let cachedStream: MediaStream | null = null;

export function getCachedCameraStream(): MediaStream | null {
  return cachedStream;
}

export function setCachedCameraStream(stream: MediaStream) {
  cachedStream = stream;
}

export function clearCachedCameraStream() {
  if (cachedStream) {
    try {
      cachedStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  }
  cachedStream = null;
}


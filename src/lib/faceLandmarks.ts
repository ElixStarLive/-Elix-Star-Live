import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export type FacePose = {
  cx: number;
  cy: number;
  scale: number;
  rotation: number;
};

let landmarker: FaceLandmarker | null = null;
let initPromise: Promise<FaceLandmarker | null> | null = null;

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export async function getFaceLandmarker(): Promise<FaceLandmarker | null> {
  if (landmarker) return landmarker;
  if (!initPromise) {
    initPromise = (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(WASM_BASE);
        const opts = {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU' as const,
          },
          runningMode: 'VIDEO' as const,
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        };
        try {
          landmarker = await FaceLandmarker.createFromOptions(vision, opts);
        } catch {
          landmarker = await FaceLandmarker.createFromOptions(vision, {
            ...opts,
            baseOptions: { ...opts.baseOptions, delegate: 'CPU' },
          });
        }
        return landmarker;
      } catch {
        return null;
      }
    })();
  }
  return initPromise;
}

export function landmarksToFacePose(
  landmarks: Array<{ x: number; y: number }>,
  width: number,
  height: number,
  mirrored: boolean,
): FacePose | null {
  if (!landmarks?.length || landmarks.length < 264) return null;

  const left = landmarks[33];
  const right = landmarks[263];
  const forehead = landmarks[10];
  const chin = landmarks[152];
  if (!left || !right || !forehead || !chin) return null;

  let lx = left.x * width;
  let rx = right.x * width;
  const ly = left.y * height;
  const ry = right.y * height;

  if (mirrored) {
    lx = width - lx;
    rx = width - rx;
  }

  const cx = (lx + rx) / 2;
  const cy = ((forehead.y + chin.y) / 2) * height;
  const faceWidth = Math.hypot(rx - lx, ry - ly);
  const scale = Math.max(faceWidth * 2.35, width * 0.12);
  const rotation = Math.atan2(ry - ly, rx - lx);

  return { cx, cy, scale, rotation };
}

export async function detectFacePose(
  video: HTMLVideoElement,
  width: number,
  height: number,
  mirrored: boolean,
  timestampMs: number,
): Promise<FacePose | null> {
  if (video.readyState < 2 || width < 8 || height < 8) return null;
  const detector = await getFaceLandmarker();
  if (!detector) return null;
  try {
    const result = detector.detectForVideo(video, timestampMs);
    const face = result.faceLandmarks?.[0];
    if (!face) return null;
    return landmarksToFacePose(face, width, height, mirrored);
  } catch {
    return null;
  }
}

export function releaseFaceLandmarker(): void {
  try {
    landmarker?.close();
  } catch {
    /* ignore */
  }
  landmarker = null;
  initPromise = null;
}

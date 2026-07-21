export type FaceAREffectType =
  | 'crown'
  | 'glasses'
  | 'mask'
  | 'ears'
  | 'hearts'
  | 'stars'
  | 'age'
  | 'youth';

export type { FacePose } from './faceLandmarks';
import type { FacePose } from './faceLandmarks';

type FaceAnchor = { cx: number; cy: number; scale: number };

function anchor(w: number, h: number): FaceAnchor {
  return { cx: w * 0.5, cy: h * 0.36, scale: Math.min(w, h) * 0.52 };
}

function resolvePose(pose: FacePose | null | undefined, w: number, h: number): FacePose {
  if (pose) return pose;
  const a = anchor(w, h);
  return { ...a, rotation: 0 };
}

function withFaceTransform(
  ctx: CanvasRenderingContext2D,
  pose: FacePose,
  draw: () => void,
): void {
  ctx.save();
  ctx.translate(pose.cx, pose.cy);
  ctx.rotate(pose.rotation);
  ctx.translate(-pose.cx, -pose.cy);
  draw();
  ctx.restore();
}

function withGlow(
  ctx: CanvasRenderingContext2D,
  color: string,
  blur: number,
  draw: () => void,
) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  draw();
  ctx.restore();
}

function drawCrown(ctx: CanvasRenderingContext2D, a: FaceAnchor, color: string, t: number) {
  const bob = Math.sin(t * 2.4) * 3;
  const s = a.scale;
  const x = a.cx;
  const y = a.cy - s * 0.62 + bob;
  const w = s * 0.72;
  const h = s * 0.22;

  const grad = ctx.createLinearGradient(x - w / 2, y, x + w / 2, y + h);
  grad.addColorStop(0, '#8B6914');
  grad.addColorStop(0.35, color);
  grad.addColorStop(0.7, '#FFF8DC');
  grad.addColorStop(1, '#8B6914');

  withGlow(ctx, `${color}88`, 18, () => {
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y + h * 0.55);
    ctx.lineTo(x - w * 0.38, y);
    ctx.lineTo(x - w * 0.2, y + h * 0.45);
    ctx.lineTo(x, y - h * 0.15);
    ctx.lineTo(x + w * 0.2, y + h * 0.45);
    ctx.lineTo(x + w * 0.38, y);
    ctx.lineTo(x + w / 2, y + h * 0.55);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  const jewels = [-0.28, 0, 0.28];
  jewels.forEach((jx, i) => {
    const jxPos = x + w * jx;
    const jyPos = y + h * (i === 1 ? 0.15 : 0.42);
    ctx.fillStyle = i === 1 ? '#FFFFFF' : color;
    ctx.beginPath();
    ctx.arc(jxPos, jyPos, s * 0.035, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawGlasses(ctx: CanvasRenderingContext2D, a: FaceAnchor, color: string, t: number) {
  const s = a.scale;
  const x = a.cx;
  const y = a.cy + s * 0.02 + Math.sin(t * 1.8) * 1.5;
  const lensR = s * 0.13;
  const gap = s * 0.08;

  withGlow(ctx, `${color}66`, 12, () => {
    ctx.strokeStyle = color;
    ctx.lineWidth = s * 0.025;
    ctx.fillStyle = 'rgba(0,0,0,0.12)';

    [-1, 1].forEach((side) => {
      const lx = x + side * (lensR + gap / 2);
      ctx.beginPath();
      ctx.arc(lx, y, lensR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.moveTo(x - lensR - gap / 2, y);
    ctx.lineTo(x + lensR + gap / 2, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - lensR * 2 - gap, y);
    ctx.lineTo(x - lensR - gap / 2 - s * 0.06, y - s * 0.02);
    ctx.moveTo(x + lensR + gap / 2 + s * 0.06, y - s * 0.02);
    ctx.lineTo(x + lensR * 2 + gap, y);
    ctx.stroke();
  });

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.arc(x - lensR - gap / 2 - lensR * 0.35, y - lensR * 0.35, lensR * 0.18, 0, Math.PI * 2);
  ctx.arc(x + lensR + gap / 2 + lensR * 0.15, y - lensR * 0.4, lensR * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawMask(ctx: CanvasRenderingContext2D, a: FaceAnchor, color: string) {
  const s = a.scale;
  const x = a.cx;
  const y = a.cy + s * 0.05;
  const mw = s * 0.58;
  const mh = s * 0.34;

  withGlow(ctx, `${color}55`, 14, () => {
    const grad = ctx.createLinearGradient(x, y - mh / 2, x, y + mh / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.5, `${color}CC`);
    grad.addColorStop(1, '#1a1028');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - mw / 2, y);
    ctx.quadraticCurveTo(x - mw / 2, y - mh * 0.55, x, y - mh / 2);
    ctx.quadraticCurveTo(x + mw / 2, y - mh * 0.55, x + mw / 2, y);
    ctx.quadraticCurveTo(x + mw * 0.35, y + mh * 0.45, x, y + mh * 0.35);
    ctx.quadraticCurveTo(x - mw * 0.35, y + mh * 0.45, x - mw / 2, y);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  [-0.18, 0.18].forEach((ox) => {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(x + mw * ox, y - mh * 0.05, s * 0.09, s * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawEars(ctx: CanvasRenderingContext2D, a: FaceAnchor, color: string, t: number) {
  const s = a.scale;
  const wiggle = Math.sin(t * 3.5) * 0.08;
  [-1, 1].forEach((side) => {
    const ex = a.cx + side * s * 0.38;
    const ey = a.cy - s * 0.42;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(side * (0.25 + wiggle));
    withGlow(ctx, `${color}77`, 10, () => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.08);
      ctx.quadraticCurveTo(s * 0.14, -s * 0.18, 0, -s * 0.32);
      ctx.quadraticCurveTo(-s * 0.14, -s * 0.18, 0, s * 0.08);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.moveTo(0, s * 0.02);
      ctx.quadraticCurveTo(s * 0.06, -s * 0.08, 0, -s * 0.18);
      ctx.quadraticCurveTo(-s * 0.06, -s * 0.08, 0, s * 0.02);
      ctx.fill();
    });
    ctx.restore();
  });
}

function drawHearts(ctx: CanvasRenderingContext2D, a: FaceAnchor, color: string, t: number) {
  const s = a.scale;
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + t * 1.2;
    const dist = s * (0.28 + 0.06 * Math.sin(t * 2 + i));
    const hx = a.cx + Math.cos(angle) * dist;
    const hy = a.cy + Math.sin(angle) * dist * 0.85 - s * 0.05;
    const hs = s * 0.07 * (1 + 0.15 * Math.sin(t * 4 + i));
    ctx.save();
    ctx.translate(hx, hy);
    ctx.scale(hs, hs);
    withGlow(ctx, `${color}AA`, 10, () => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 3);
      ctx.bezierCurveTo(-8, -4, -14, 4, 0, 14);
      ctx.bezierCurveTo(14, 4, 8, -4, 0, 3);
      ctx.fill();
    });
    ctx.restore();
  }
}

function drawStars(ctx: CanvasRenderingContext2D, a: FaceAnchor, color: string, t: number) {
  const s = a.scale;
  for (let i = 0; i < 10; i++) {
    const phase = t * 2.5 + i * 1.3;
    const angle = (i / 10) * Math.PI * 2 + t;
    const dist = s * (0.22 + 0.12 * Math.abs(Math.sin(phase)));
    const sx = a.cx + Math.cos(angle) * dist;
    const sy = a.cy + Math.sin(angle) * dist * 0.9 - s * 0.08;
    const size = s * 0.035 * (0.6 + 0.4 * Math.abs(Math.sin(phase * 1.7)));
    const alpha = 0.45 + 0.55 * Math.abs(Math.sin(phase * 2.1));
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle + t);
    withGlow(ctx, `${color}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`, 8, () => {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (let p = 0; p < 5; p++) {
        const outer = (p * Math.PI * 2) / 5 - Math.PI / 2;
        const inner = outer + Math.PI / 5;
        ctx.lineTo(Math.cos(outer) * size, Math.sin(outer) * size);
        ctx.lineTo(Math.cos(inner) * size * 0.42, Math.sin(inner) * size * 0.42);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }
}

function drawAgeOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, a: FaceAnchor, t: number) {
  const s = a.scale;
  const x = a.cx;
  const y = a.cy;

  ctx.save();
  ctx.globalAlpha = 0.22;
  const ageGrad = ctx.createRadialGradient(x, y, s * 0.1, x, y, s * 0.55);
  ageGrad.addColorStop(0, 'rgba(120,90,60,0)');
  ageGrad.addColorStop(0.65, 'rgba(90,70,50,0.35)');
  ageGrad.addColorStop(1, 'rgba(60,45,30,0.55)');
  ctx.fillStyle = ageGrad;
  ctx.fillRect(x - s * 0.55, y - s * 0.35, s * 1.1, s * 1.05);
  ctx.restore();

  ctx.strokeStyle = 'rgba(80,60,45,0.35)';
  ctx.lineWidth = 1.2;
  const wrinkles: Array<[number, number, number, number]> = [
    [x - s * 0.22, y - s * 0.18, x + s * 0.22, y - s * 0.16 + Math.sin(t) * 0.5],
    [x - s * 0.18, y - s * 0.08, x + s * 0.18, y - s * 0.06],
    [x - s * 0.3, y + s * 0.04, x - s * 0.08, y + s * 0.1],
    [x + s * 0.08, y + s * 0.1, x + s * 0.3, y + s * 0.04],
    [x - s * 0.12, y + s * 0.18, x + s * 0.12, y + s * 0.2],
  ];
  wrinkles.forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + 2, x2, y2);
    ctx.stroke();
  });

  for (let i = 0; i < 5; i++) {
    const sx = x + (Math.sin(i * 2.1) * s * 0.25);
    const sy = y + s * 0.08 + i * s * 0.06;
    ctx.fillStyle = 'rgba(100,75,55,0.18)';
    ctx.beginPath();
    ctx.arc(sx, sy, s * 0.018, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(180,160,130,0.12)';
  ctx.beginPath();
  ctx.ellipse(x, y + s * 0.28, s * 0.14, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawYouthOverlay(ctx: CanvasRenderingContext2D, a: FaceAnchor, color: string, t: number) {
  const s = a.scale;
  const x = a.cx;
  const y = a.cy;
  const pulse = 0.85 + 0.15 * Math.sin(t * 2.2);

  ctx.save();
  ctx.globalAlpha = 0.28 * pulse;
  const glow = ctx.createRadialGradient(x, y, s * 0.05, x, y, s * 0.62);
  glow.addColorStop(0, `${color}55`);
  glow.addColorStop(0.55, `${color}22`);
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, s * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  [-0.2, 0.2].forEach((ox) => {
    ctx.fillStyle = 'rgba(255,120,140,0.22)';
    ctx.beginPath();
    ctx.ellipse(x + s * ox, y + s * 0.08, s * 0.08, s * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function drawFaceAREffect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effectType: string,
  color: string,
  timeSec: number,
  _mirrored?: boolean,
  facePose?: FacePose | null,
): void {
  if (!width || !height) return;
  const pose = resolvePose(facePose, width, height);
  const a: FaceAnchor = { cx: pose.cx, cy: pose.cy, scale: pose.scale };
  const type = effectType as FaceAREffectType;

  withFaceTransform(ctx, pose, () => {
    switch (type) {
      case 'crown':
        drawCrown(ctx, a, color, timeSec);
        break;
      case 'glasses':
        drawGlasses(ctx, a, color, timeSec);
        break;
      case 'mask':
        drawMask(ctx, a, color);
        break;
      case 'ears':
        drawEars(ctx, a, color, timeSec);
        break;
      case 'hearts':
        drawHearts(ctx, a, color, timeSec);
        break;
      case 'stars':
        drawStars(ctx, a, color, timeSec);
        break;
      case 'age':
        drawAgeOverlay(ctx, width, height, a, timeSec);
        break;
      case 'youth':
        drawYouthOverlay(ctx, a, color, timeSec);
        break;
      default:
        break;
    }
  });
}

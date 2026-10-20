/*
 * 3D faces: the plotted position gives the score and the direction from the centre, but animals
 * differ too much in size for its distance to mean anything. The archer enters roughly how far
 * from the centre the arrow sits instead, and analysis uses that distance in cm.
 */
import { Dimension } from './models';
import { faceRadiusCm, TargetModel } from './targets';

/** Slider steps in cm: fine near the centre, coarser further out. */
export const CENTRE_STEPS = [
  0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80,
];

export function usesCentreDistance(t: TargetModel): boolean {
  return t.kind === '3d';
}

/** Index of the slider step closest to a distance. */
export function nearestStep(cm: number): number {
  let best = 0;
  CENTRE_STEPS.forEach((s, i) => {
    if (Math.abs(s - cm) < Math.abs(CENTRE_STEPS[best] - cm)) best = i;
  });
  return best;
}

/** The point aimed at: the centre of the vital area (where the 10 ring and kill spots sit). */
export function aimCentre(t: TargetModel): { x: number; y: number } {
  const v = t.zones.find((z) => z.name === 'Vital');
  return v ? { x: v.cx, y: v.cy } : { x: 0, y: 0 };
}

/** A first guess at the distance from where the arrow was plotted on the drawn animal. */
export function guessCentreCm(t: TargetModel, diameter: Dimension, x: number, y: number): number {
  const c = aimCentre(t);
  return CENTRE_STEPS[nearestStep(Math.hypot(x - c.x, y - c.y) * faceRadiusCm(t, diameter))];
}

/** The arrow's offset from the aim centre in cm: direction as plotted, distance as entered. */
export function centreOffsetCm(
  t: TargetModel,
  diameter: Dimension,
  s: { x: number; y: number; cm?: number | null },
): { x: number; y: number } {
  const c = aimCentre(t);
  const dx = s.x - c.x;
  const dy = s.y - c.y;
  const len = Math.hypot(dx, dy);
  if (!len) return { x: 0, y: 0 };
  const cm = s.cm ?? len * faceRadiusCm(t, diameter);
  return { x: (dx / len) * cm, y: (dy / len) * cm };
}

/** Ring sizes drawn on the distance grid, in cm. */
const GRID_RINGS = [2, 5, 10, 20, 40, 80];

/** Radius in cm of a distance grid that shows arrows up to `maxCm` from the centre. */
export function gridRadius(maxCm: number): number {
  return [10, 20, 40, 80].find((r) => maxCm <= r * 0.92) ?? 80;
}

/** A plain face of distance rings, for drawing 3D groups in cm instead of on an animal. */
export function centreGrid(radiusCm: number): TargetModel {
  const rings = GRID_RINGS.filter((r) => r <= radiusCm);
  return {
    id: -1,
    name: `Distance from centre, rings at ${rings.join(', ')} cm`,
    kind: '3d',
    zones: rings.map((r, i) => ({
      kind: 'circle',
      r: r / radiusCm,
      cx: 0,
      cy: 0,
      fill: i % 2 ? '#e9eef2' : '#f7f9fa',
      line: '#9aa7b1',
    })),
    styles: [],
    diameters: [],
    realSizeFactor: 1,
    faceRadius: 1,
    faces: [{ x: 0, y: 0 }],
    singleSpotId: -1,
    centerMark: '#5b6b77',
  };
}

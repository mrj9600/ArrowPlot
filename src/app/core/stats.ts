/*
 * Group analysis, adapted from "Shot Group Printer": group centre, spread ellipse, R50/R90,
 * extreme spread, and the score the same arrows would make if the group were centred.
 */
import { centreOffsetCm, gridRadius, usesCentreDistance } from './centre-distance';
import { convert } from './dimension';
import { End, NOT_ENTERED, Round } from './models';
import {
  faceRadiusCm,
  getTarget,
  isFirstHitStyle,
  maxPointsPerShot,
  pointsFor,
  relativeArrowRadius,
  zoneAt,
  zoneLabel,
} from './targets';

export interface PlotShot {
  x: number;
  y: number;
  ring: number;
  label: string;
  points: number;
  max: number;
  positioned: boolean;
  /** Face radius in cm (one spot). */
  rcm: number;
  arrowR: number;
  targetId: number;
  style: number;
  index: number;
  arrowNumber?: string | null;
  distanceM: number | null;
  sessionId: number;
  roundId: number;
  /** Identifies the end (target) the arrow belongs to. */
  endKey: string;
  /** Only the first hit of the end counts (animal rounds). */
  firstHit: boolean;
  /** 3D: x/y are cm from the aim centre (rcm 1), from the entered distance, not the drawing. */
  inCm: boolean;
}

export interface Ellipse {
  a: number;
  b: number;
  ang: number;
}

export interface Analysis {
  n: number;
  nPos: number;
  reached: number;
  total: number;
  /** Average per arrow, or per target when perEnd. */
  avg: number;
  /** All arrows come from rounds where only the first hit counts: averages are per target. */
  perEnd: boolean;
  /** 3D only: draw the group on a distance grid of this radius in cm instead of the face. */
  grid: number | null;
  /** Count per ring label, ordered best first. */
  rings: { label: string; count: number; points: number }[];
  best: { p: number; k: number; avg: number; pct: number }[];
  rref: number;
  distanceM: number | null;
  mixedSize: boolean;
  noPos: boolean;
  mx: number;
  my: number;
  sx: number;
  sy: number;
  ellipse: Ellipse;
  r50: number;
  r90: number;
  meanRadius: number;
  extremeSpread: number;
  centred: number;
  positioned: PlotShot[];
  all: PlotShot[];
}

export function plotShots(
  ends: End[],
  round: Round,
  sessionArrowDiameter: Parameters<typeof relativeArrowRadius>[2],
): PlotShot[] {
  const t = getTarget(round.targetId);
  const rcm = faceRadiusCm(t, round.targetDiameter);
  const arrowR = relativeArrowRadius(t, round.targetDiameter, sessionArrowDiameter);
  const distanceM = round.distance.unit ? convert(round.distance, 'm') : null;
  const firstHit = isFirstHitStyle(t, round.scoringStyle);
  const inCm = usesCentreDistance(t);
  const out: PlotShot[] = [];
  for (const e of ends) {
    for (const s of e.shots) {
      if (s.ring === NOT_ENTERED) continue;
      const p = inCm ? centreOffsetCm(t, round.targetDiameter, s) : s;
      out.push({
        x: p.x,
        y: p.y,
        ring: s.ring,
        label: zoneLabel(t, round.scoringStyle, s.ring, s.index),
        points: pointsFor(t, round.scoringStyle, s.ring, s.index),
        max: maxPointsPerShot(t, round.scoringStyle, s.index),
        positioned: e.exact,
        rcm: inCm ? 1 : rcm,
        arrowR: inCm ? arrowR * rcm : arrowR,
        targetId: round.targetId,
        style: round.scoringStyle,
        index: s.index,
        arrowNumber: s.arrowNumber,
        distanceM,
        sessionId: round.sessionId,
        roundId: round.id!,
        endKey: `${round.id}:${e.index}`,
        firstHit,
        inCm,
      });
    }
  }
  return out;
}

const BEST = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

function median(a: number[]) {
  const b = [...a].sort((x, y) => x - y);
  const m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
}
function quantile(a: number[], q: number) {
  const b = [...a].sort((x, y) => x - y);
  if (!b.length) return NaN;
  const i = (b.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return b[lo] + (b[hi] - b[lo]) * (i - lo);
}

export function analyse(all: PlotShot[]): Analysis {
  const pos = all.filter((s) => s.positioned);
  const rref = (pos[0] ?? all[0])?.rcm ?? 20;
  const dset = new Set(all.map((s) => s.distanceM).filter((d): d is number => d !== null));
  const perEnd = all.length > 0 && all.every((s) => s.firstHit);
  const reached = all.reduce((a, s) => a + s.points, 0);
  const total = all.reduce((a, s) => a + s.max, 0);
  const perMax = all.length ? total / all.length : 10;
  const sorted = all.map((s) => s.points).sort((a, b) => b - a);

  const ringMap = new Map<
    string,
    { label: string; count: number; points: number; order: number }
  >();
  for (const s of all) {
    const key = s.label || '–';
    const e = ringMap.get(key) ?? {
      label: key,
      count: 0,
      points: s.points,
      order: s.ring < 0 ? 999 : s.ring,
    };
    e.count++;
    e.order = Math.min(e.order, s.ring < 0 ? 999 : s.ring);
    ringMap.set(key, e);
  }
  const rings = [...ringMap.values()]
    .sort((a, b) => b.points - a.points || a.order - b.order)
    .map(({ label, count, points }) => ({ label, count, points }));

  const res: Analysis = {
    n: all.length,
    nPos: pos.length,
    reached,
    total,
    avg: perEnd
      ? reached / new Set(all.map((s) => s.endKey)).size
      : all.length
        ? reached / all.length
        : 0,
    perEnd,
    grid:
      pos.length && pos.every((s) => s.inCm)
        ? gridRadius(Math.max(...pos.map((s) => Math.hypot(s.x, s.y))))
        : null,
    rings,
    best: BEST.map((p) => {
      const k = Math.max(1, Math.ceil(all.length * p - 1e-9));
      const sum = sorted.slice(0, k).reduce((a, b) => a + b, 0);
      return {
        p,
        k,
        avg: all.length ? sum / k : NaN,
        pct: all.length ? (100 * sum) / (k * perMax) : NaN,
      };
    }),
    rref,
    distanceM: dset.size === 1 ? [...dset][0] : null,
    mixedSize: new Set(all.map((s) => s.rcm)).size > 1,
    noPos: pos.length < 2,
    mx: 0,
    my: 0,
    sx: 0,
    sy: 0,
    ellipse: { a: 0, b: 0, ang: 0 },
    r50: 0,
    r90: 0,
    meanRadius: 0,
    extremeSpread: 0,
    centred: reached,
    positioned: pos,
    all,
  };
  if (res.noPos) return res;

  // group centre and covariance, in cm
  const xs = pos.map((s) => s.x * s.rcm);
  const ys = pos.map((s) => s.y * s.rcm);
  const mean = (a: number[]) => a.reduce((p, c) => p + c, 0) / a.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const n1 = Math.max(1, xs.length - 1);
  sxx /= n1;
  syy /= n1;
  sxy /= n1;
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(0, tr / 2 - disc);
  const ang = Math.abs(sxy) < 1e-12 ? (sxx >= syy ? 0 : Math.PI / 2) : Math.atan2(l1 - sxx, sxy);

  const d = xs.map((x, i) => Math.hypot(x - mx, ys[i] - my));
  let es = 0;
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++)
      es = Math.max(es, Math.hypot(xs[i] - xs[j], ys[i] - ys[j]));

  // re-score positioned arrows with the group moved to the centre
  const centred = all.reduce((a, s) => {
    // 3D distances are rough and animals differ: re-scoring them would be guesswork.
    if (!s.positioned || s.inCm) return a + s.points;
    const t = getTarget(s.targetId);
    const z = zoneAt(t, s.x - mx / s.rcm, s.y - my / s.rcm, s.arrowR);
    return a + pointsFor(t, s.style, z, s.index);
  }, 0);

  Object.assign(res, {
    mx,
    my,
    sx: Math.sqrt(sxx),
    sy: Math.sqrt(syy),
    ellipse: { a: Math.sqrt(l1), b: Math.sqrt(l2), ang },
    r50: median(d),
    r90: quantile(d, 0.9),
    meanRadius: d.reduce((a, b) => a + b, 0) / d.length,
    extremeSpread: es,
    centred,
  });
  return res;
}

export function offsetText(cm: number, pos: string, neg: string, tol = 0.25): string {
  if (Math.abs(cm) < tol) return 'centred';
  return `${Math.abs(cm).toFixed(1)} cm ${cm > 0 ? pos : neg}`;
}

export function aimAdvice(a: Analysis, sighted: boolean): string {
  const tol = 0.25;
  const h = Math.abs(a.mx) >= tol;
  const v = Math.abs(a.my) >= tol;
  if (!h && !v) return 'The group is centred; no aim change needed.';
  const aim: string[] = [];
  const pin: string[] = [];
  if (h) {
    aim.push(`${Math.abs(a.mx).toFixed(1)} cm ${a.mx > 0 ? 'left' : 'right'}`);
    pin.push(a.mx > 0 ? 'right' : 'left');
  }
  if (v) {
    aim.push(`${Math.abs(a.my).toFixed(1)} cm ${a.my > 0 ? 'higher' : 'lower'}`);
    pin.push(a.my > 0 ? 'down' : 'up');
  }
  return (
    `To centre it, aim ${aim.join(' and ')}.` +
    (sighted ? ` With a sight: move the pin ${pin.join(' and ')} (follow the arrows).` : '')
  );
}

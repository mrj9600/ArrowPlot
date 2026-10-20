import { dim, formatDimension } from './dimension';
import { getTarget } from './targets';
import { LengthUnit, RoundTemplate, StandardRound } from './models';

const r = (
  distance: number,
  unit: LengthUnit,
  targetId: number,
  diameterCm: number,
  shotsPerEnd: number,
  endCount: number,
  scoringStyle = 0,
): RoundTemplate => ({
  distance: dim(distance, unit),
  targetId,
  scoringStyle,
  targetDiameter: dim(diameterCm, 'cm'),
  shotsPerEnd,
  endCount,
});

const WA = 'World Archery';

/** A starter set of common rounds. Users can add their own; MyTargets imports add theirs. */
export const BUILT_IN_ROUNDS: Omit<StandardRound, 'id'>[] = [
  {
    name: 'WA 18 m (40 cm)',
    club: WA,
    rounds: [r(18, 'm', 0, 40, 3, 10), r(18, 'm', 0, 40, 3, 10)],
  },
  {
    name: 'WA 18 m (vertical 3 spot)',
    club: WA,
    rounds: [r(18, 'm', 5, 40, 3, 10), r(18, 'm', 5, 40, 3, 10)],
  },
  {
    name: 'WA 18 m compound (3 spot)',
    club: WA,
    rounds: [r(18, 'm', 5, 40, 3, 10, 2), r(18, 'm', 5, 40, 3, 10, 2)],
  },
  {
    name: 'WA 25 m (60 cm)',
    club: WA,
    rounds: [r(25, 'm', 0, 60, 3, 10), r(25, 'm', 0, 60, 3, 10)],
  },
  { name: 'WA 70 m (720)', club: WA, rounds: [r(70, 'm', 0, 122, 6, 6), r(70, 'm', 0, 122, 6, 6)] },
  { name: 'WA 60 m (720)', club: WA, rounds: [r(60, 'm', 0, 122, 6, 6), r(60, 'm', 0, 122, 6, 6)] },
  {
    name: 'WA 50 m (720, 122 cm)',
    club: WA,
    rounds: [r(50, 'm', 0, 122, 6, 6), r(50, 'm', 0, 122, 6, 6)],
  },
  {
    name: 'WA 50 m compound (720)',
    club: WA,
    rounds: [r(50, 'm', 2, 80, 6, 6, 2), r(50, 'm', 2, 80, 6, 6, 2)],
  },
  {
    name: 'WA 40 m (720, 122 cm)',
    club: WA,
    rounds: [r(40, 'm', 0, 122, 6, 6), r(40, 'm', 0, 122, 6, 6)],
  },
  {
    name: 'WA 30 m (720, 80 cm)',
    club: WA,
    rounds: [r(30, 'm', 0, 80, 6, 6), r(30, 'm', 0, 80, 6, 6)],
  },
  {
    name: 'WA 1440 (90 m)',
    club: WA,
    rounds: [
      r(90, 'm', 0, 122, 6, 6),
      r(70, 'm', 0, 122, 6, 6),
      r(50, 'm', 0, 80, 6, 6),
      r(30, 'm', 0, 80, 6, 6),
    ],
  },
  {
    name: 'WA 1440 (70 m)',
    club: WA,
    rounds: [
      r(70, 'm', 0, 122, 6, 6),
      r(60, 'm', 0, 122, 6, 6),
      r(50, 'm', 0, 80, 6, 6),
      r(30, 'm', 0, 80, 6, 6),
    ],
  },
  {
    name: 'WA field (12 + 12)',
    club: WA,
    rounds: [r(30, 'm', 13, 60, 3, 12), r(30, 'm', 13, 60, 3, 12)],
  },
  { name: 'Vegas 300', club: 'NFAA', rounds: [r(20, 'yd', 4, 40, 3, 10)] },
  { name: 'NFAA indoor 300', club: 'NFAA', rounds: [r(20, 'yd', 11, 40, 5, 12)] },
  { name: 'Portsmouth', club: 'Archery GB', rounds: [r(20, 'yd', 0, 60, 3, 20)] },
  { name: 'Worcester', club: 'NFAA', rounds: [r(20, 'yd', 12, 40.64, 5, 12)] },
].map((s) => ({ ...s, builtIn: true }));

/** One line per round, e.g. "18 m · WA full face 40cm · 10 × 3 arrows". */
export function describeRound(r: RoundTemplate): string {
  const ends = r.endCount ? `${r.endCount} × ${r.shotsPerEnd}` : `open × ${r.shotsPerEnd}`;
  return [
    formatDimension(r.distance),
    `${getTarget(r.targetId).name} ${formatDimension(r.targetDiameter)}`,
    `${ends} arrows`,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Total arrows in a round definition, or null when a round has no fixed end count. */
export function arrowCount(s: StandardRound): number | null {
  return s.rounds.every((r) => r.endCount)
    ? s.rounds.reduce((a, r) => a + r.endCount * r.shotsPerEnd, 0)
    : null;
}

/** One line for a whole round definition, e.g. "70 m / 60 m · WA full face 122cm · 72 arrows". */
export function summarizeRound(s: StandardRound): string {
  const uniq = (l: string[]) => [...new Set(l)];
  const dists = uniq(s.rounds.map((r) => formatDimension(r.distance))).join(' / ');
  const faces = uniq(
    s.rounds.map((r) => `${getTarget(r.targetId).name} ${formatDimension(r.targetDiameter)}`),
  ).join(' / ');
  const n = arrowCount(s);
  return `${dists} · ${faces} · ${n ? `${n} arrows` : 'open-ended'}`;
}

/** A round without its end count, e.g. "18 m · WA full face 40cm · 3 arrows per end". */
export function describeRoundSetup(r: RoundTemplate): string {
  return [
    formatDimension(r.distance),
    `${getTarget(r.targetId).name} ${formatDimension(r.targetDiameter)}`,
    `${r.shotsPerEnd} arrows per end`,
  ]
    .filter(Boolean)
    .join(' · ');
}

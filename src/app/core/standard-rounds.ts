import { dim, formatDimension } from './dimension';
import { faceLabel } from './targets';
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
    rounds: [r(18, 'm', 0, 40, 3, 10)],
  },
  {
    name: 'WA 18 m (vertical 3 spot)',
    club: WA,
    rounds: [r(18, 'm', 5, 40, 3, 10)],
  },
  {
    name: 'WA 18 m compound (3 spot)',
    club: WA,
    rounds: [r(18, 'm', 5, 40, 3, 10, 2)],
  },
  {
    name: 'WA 25 m (60 cm)',
    club: WA,
    rounds: [r(25, 'm', 0, 60, 3, 10)],
  },
  // 122 cm face at 70, 60, 50 or 40 m: pick the distance when starting the session.
  { name: 'WA 122 cm', club: WA, rounds: [r(70, 'm', 0, 122, 6, 6)] },
  {
    name: 'WA 50 m compound',
    club: WA,
    rounds: [r(50, 'm', 2, 80, 6, 6, 2)],
  },
  {
    name: 'WA 30 m (80 cm)',
    club: WA,
    rounds: [r(30, 'm', 0, 80, 6, 6)],
  },
  {
    name: 'WA field',
    club: WA,
    // Field distances change from target to target, so the round has none.
    rounds: [{ ...r(30, 'm', 13, 60, 3, 12), distance: dim(-1, null) }],
  },
  { name: 'Vegas 300', club: 'NFAA', rounds: [r(20, 'yd', 4, 40, 3, 10)] },
].map((s) => ({ ...s, builtIn: true }));

/** One line per round, e.g. "18 m · WA full face 40cm · 10 × 3 arrows". */
export function describeRound(r: RoundTemplate): string {
  const ends = r.endCount ? `${r.endCount} × ${r.shotsPerEnd}` : `open × ${r.shotsPerEnd}`;
  return [formatDimension(r.distance), faceLabel(r.targetId, r.targetDiameter), `${ends} arrows`]
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
  const dists = uniq(s.rounds.map((r) => formatDimension(r.distance)).filter(Boolean)).join(' / ');
  const faces = uniq(s.rounds.map((r) => faceLabel(r.targetId, r.targetDiameter))).join(' / ');
  const n = arrowCount(s);
  return [dists, faces, n ? `${n} arrows` : 'open-ended'].filter(Boolean).join(' · ');
}

/** A round's face and arrows per end, e.g. "WA full face 40cm · 3 arrows per end". */
export function describeRoundSetup(r: RoundTemplate): string {
  return `${faceLabel(r.targetId, r.targetDiameter)} · ${r.shotsPerEnd} arrows per end`;
}

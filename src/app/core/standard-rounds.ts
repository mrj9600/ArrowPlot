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
    round: r(18, 'm', 0, 40, 3, 10),
  },
  {
    name: 'WA 18 m (vertical 3 spot)',
    club: WA,
    round: r(18, 'm', 5, 40, 3, 10),
  },
  {
    name: 'WA 18 m compound (3 spot)',
    club: WA,
    round: r(18, 'm', 5, 40, 3, 10, 2),
  },
  {
    name: 'WA 25 m (60 cm)',
    club: WA,
    round: r(25, 'm', 0, 60, 3, 10),
  },
  // 122 cm face at 70, 60, 50 or 40 m: pick the distance when starting the session.
  { name: 'WA 122 cm', club: WA, round: r(70, 'm', 0, 122, 6, 6) },
  {
    name: 'WA 50 m compound',
    club: WA,
    round: r(50, 'm', 2, 80, 6, 6, 2),
  },
  {
    name: 'WA 30 m (80 cm)',
    club: WA,
    round: r(30, 'm', 0, 80, 6, 6),
  },
  {
    name: 'WA field',
    club: WA,
    // Field distances change from target to target, so the round has none.
    round: { ...r(30, 'm', 13, 60, 3, 12), distance: dim(-1, null) },
  },
  { name: 'Vegas 300', club: 'NFAA', round: r(20, 'yd', 4, 40, 3, 10) },
].map((s) => ({ ...s, builtIn: true }));

/** One line per round, e.g. "18 m · WA full face 40cm · 10 × 3 arrows". */
export function describeRound(r: RoundTemplate): string {
  const ends = r.endCount ? `${r.endCount} × ${r.shotsPerEnd}` : `open × ${r.shotsPerEnd}`;
  return [formatDimension(r.distance), faceLabel(r.targetId, r.targetDiameter), `${ends} arrows`]
    .filter(Boolean)
    .join(' · ');
}

/** A round's face and arrows per end, e.g. "WA full face 40cm · 3 arrows per end". */
export function describeRoundSetup(r: RoundTemplate): string {
  return `${faceLabel(r.targetId, r.targetDiameter)} · ${r.shotsPerEnd} arrows per end`;
}

/**
 * Splits a definition with several parts (e.g. MyTargets' WA 1440 at 90/70/50/30 m) into one
 * definition per distinct part, named after what tells them apart: "WA 1440 (90 m)".
 */
export function splitRoundDefinition(
  name: string,
  parts: RoundTemplate[],
): { name: string; round: RoundTemplate }[] {
  const seen = new Set<string>();
  const distinct = parts.filter((p) => {
    const key = JSON.stringify(p);
    return !seen.has(key) && !!seen.add(key);
  });
  if (distinct.length <= 1) return distinct.map((round) => ({ name, round }));
  const unique = (label: (p: RoundTemplate) => string) =>
    new Set(distinct.map(label)).size === distinct.length && distinct.every((p) => label(p));
  const byDistance = (p: RoundTemplate) => formatDimension(p.distance);
  const byFace = (p: RoundTemplate) => faceLabel(p.targetId, p.targetDiameter);
  const byBoth = (p: RoundTemplate) => [byDistance(p), byFace(p)].filter(Boolean).join(', ');
  const label = [byDistance, byFace, byBoth].find(unique);
  return distinct.map((round, i) => ({
    name: `${name} (${label ? label(round) : `part ${i + 1}`})`,
    round,
  }));
}

import { dim } from './dimension';
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

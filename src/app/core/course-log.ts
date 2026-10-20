/*
 * Course log for 3D and field targets: the distance the archer judged, the measured distance,
 * the shooting angle and the conditions at the target. Analysis shows how far off the judging
 * is, and which conditions or angles make it (or the shot) go wrong.
 */
import { CourseLog, End, Round } from './models';
import { getTarget, maxPointsPerShot, scoreEnd } from './targets';

export interface Condition {
  key: string;
  label: string;
}

/** Things known to fool distance judging or upset the shot, grouped for the picker. */
export const CONDITION_GROUPS: { name: string; items: Condition[] }[] = [
  {
    name: 'Light',
    items: [
      { key: 'bright', label: 'Very bright' },
      { key: 'dark', label: 'Very dark' },
      { key: 'lightToDark', label: 'Light to dark' },
      { key: 'darkToLight', label: 'Dark to light' },
      { key: 'tunnel', label: 'Tunnel' },
      { key: 'shade', label: 'Target in shade' },
      { key: 'sunlit', label: 'Target in sun' },
      { key: 'backlit', label: 'Sun in the eyes' },
    ],
  },
  {
    name: 'Target',
    items: [
      { key: 'lightAnimal', label: 'Light animal' },
      { key: 'darkAnimal', label: 'Dark animal' },
      { key: 'small', label: 'Small target' },
      { key: 'large', label: 'Large target' },
      { key: 'hidden', label: 'Partly hidden' },
    ],
  },
  {
    name: 'Terrain',
    items: [
      { key: 'dip', label: 'Across a dip' },
      { key: 'water', label: 'Over water' },
      { key: 'open', label: 'Open ground' },
      { key: 'forest', label: 'Dense forest' },
      { key: 'groundHidden', label: 'Ground not visible' },
    ],
  },
  {
    name: 'Stance',
    items: [
      { key: 'sideSlope', label: 'Side slope' },
      { key: 'uneven', label: 'Uneven footing' },
      { key: 'kneeling', label: 'Kneeling' },
      { key: 'gap', label: 'Through a gap' },
    ],
  },
];

const LABELS = new Map(CONDITION_GROUPS.flatMap((g) => g.items.map((c) => [c.key, c.label])));
export const conditionLabel = (key: string) => LABELS.get(key) ?? key;

/** Angle presets in degrees (+ uphill, − downhill). */
export const ANGLE_PRESETS = [
  { deg: -25, label: 'Steep down' },
  { deg: -15, label: 'Down' },
  { deg: -5, label: 'Slight down' },
  { deg: 0, label: 'Level' },
  { deg: 5, label: 'Slight up' },
  { deg: 15, label: 'Up' },
  { deg: 25, label: 'Steep up' },
];

export function angleText(deg: number): string {
  if (Math.abs(deg) < 3) return 'Level';
  const kind = Math.abs(deg) <= 7 ? 'slightly ' : Math.abs(deg) >= 20 ? 'steeply ' : '';
  return `${Math.abs(deg)}° ${kind}${deg > 0 ? 'uphill' : 'downhill'}`;
}

/** Angle groups used in the analysis. */
const ANGLE_BUCKETS = [
  { label: 'Steep downhill (20°+)', test: (d: number) => d <= -20 },
  { label: 'Downhill', test: (d: number) => d <= -3 && d > -20 },
  { label: 'Level', test: (d: number) => Math.abs(d) < 3 },
  { label: 'Uphill', test: (d: number) => d >= 3 && d < 20 },
  { label: 'Steep uphill (20°+)', test: (d: number) => d >= 20 },
];

const BANDS = [10, 20, 30, 40, 50, Infinity];

export const isEmptyLog = (l: CourseLog | null | undefined) =>
  !l || (l.estimated == null && l.measured == null && l.angle == null && !l.conditions?.length);

export interface LogEntry {
  log: CourseLog;
  points: number;
  max: number;
}

/** One entry per end (target) that has a course log, with what the end scored. */
export function logEntries(rounds: Round[], endsByRound: (id: number) => End[]): LogEntry[] {
  const out: LogEntry[] = [];
  for (const r of rounds) {
    const t = getTarget(r.targetId);
    for (const e of endsByRound(r.id!)) {
      if (isEmptyLog(e.log)) continue;
      const s = scoreEnd(t, r.scoringStyle, e.shots);
      out.push({
        log: e.log!,
        points: s.reached,
        max: s.total || maxPointsPerShot(t, r.scoringStyle),
      });
    }
  }
  return out;
}

export interface JudgingRow {
  label: string;
  /** Targets with both a judged and a measured distance. */
  n: number;
  /** Mean signed error in m (+ = judged too far) and in % of the measured distance. */
  bias: number;
  biasPct: number;
  /** Mean absolute error in m. */
  off: number;
  /** Targets in the group (also those without distances) and their average score. */
  targets: number;
  score: number;
}

export interface CourseLogAnalysis {
  all: JudgingRow;
  byDistance: JudgingRow[];
  byCondition: JudgingRow[];
  byAngle: JudgingRow[];
}

function row(label: string, entries: LogEntry[]): JudgingRow {
  const judged = entries.filter((e) => e.log.estimated != null && e.log.measured);
  const err = judged.map((e) => e.log.estimated! - e.log.measured!);
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  return {
    label,
    n: judged.length,
    bias: mean(err),
    biasPct: mean(judged.map((e, i) => (100 * err[i]) / e.log.measured!)),
    off: mean(err.map(Math.abs)),
    targets: entries.length,
    score: mean(entries.map((e) => e.points)),
  };
}

export function analyseCourseLog(entries: LogEntry[]): CourseLogAnalysis {
  const measured = entries.filter((e) => e.log.measured);
  const byDistance = BANDS.map((hi, i) => {
    const lo = i ? BANDS[i - 1] : 0;
    const label = hi === Infinity ? `${lo} m and more` : `${lo}–${hi} m`;
    return row(
      label,
      measured.filter((e) => e.log.measured! >= lo && e.log.measured! < hi),
    );
  }).filter((r) => r.targets);
  const keys = [...new Set(entries.flatMap((e) => e.log.conditions ?? []))];
  const byCondition = keys
    .map((k) =>
      row(
        conditionLabel(k),
        entries.filter((e) => e.log.conditions?.includes(k)),
      ),
    )
    .sort((a, b) => b.targets - a.targets);
  const angled = entries.filter((e) => e.log.angle != null);
  const byAngle = ANGLE_BUCKETS.map((b) =>
    row(
      b.label,
      angled.filter((e) => b.test(e.log.angle!)),
    ),
  ).filter((r) => r.targets);
  return { all: row('All targets', entries), byDistance, byCondition, byAngle };
}

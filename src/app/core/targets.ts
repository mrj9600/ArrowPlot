/*
 * Target faces and scoring.
 *
 * Geometry follows the published face specifications (World Archery, NFAA, IFAA, …): ring sizes are
 * computed from how each face is defined, e.g. a WA 5-ring face is the full face cut off outside
 * the 6 ring. 3D and animal faces are drawn as simple stylised shapes.
 *
 * For reading MyTargets backups, faces keep MyTargets' numeric target ids, the order of their
 * scoring zones (zone 0 = innermost) and the order of their scoring styles, because backups store
 * shots as (target id, style index, zone index).
 */
import { convert, dim, formatDimension } from './dimension';
import { Dimension, MISS, NOT_ENTERED, Shot } from './models';

export type TargetKind = 'target' | 'field' | '3d';

interface ZoneBase {
  fill: string;
  /** Shown on 3D and animal faces, where zones are not plain rings (e.g. "Vital", "Body"). */
  name?: string;
  /** Colour of the zone's outer line, or null for no visible line. */
  line: string | null;
}
export interface CircleZone extends ZoneBase {
  kind: 'circle';
  r: number;
  cx: number;
  cy: number;
}
export interface EllipseZone extends ZoneBase {
  kind: 'ellipse';
  rx: number;
  ry: number;
  cx: number;
  cy: number;
}
export type Zone = CircleZone | EllipseZone;

export interface ScoringStyle {
  name: string;
  showAsX: boolean;
  /**
   * points[arrow][zone]. A single row applies to every arrow. Several rows are an animal-round
   * style: only the first scoring arrow of an end counts, with the row for its arrow number.
   */
  points: number[][];
  /** Points for a miss, when it is not 0 (e.g. a miss costs a point). */
  miss?: number;
}

export interface TargetModel {
  id: number;
  name: string;
  kind: TargetKind;
  zones: Zone[];
  styles: ScoringStyle[];
  diameters: Dimension[];
  /** Diameter of one scoring face relative to the nominal face size (5-ring 40 cm → 0.5). */
  realSizeFactor: number;
  /** Radius of one spot in whole-face drawing units, and where the spots sit. */
  faceRadius: number;
  faces: { x: number; y: number }[];
  /** The single-spot face used when drawing a group. */
  singleSpotId: number;
  centerMark?: string;
  /** Zones whose line is not drawn for a scoring style (e.g. the X line for 10-zone counting). */
  hideZone?: (zone: number, style: number) => boolean;
}

/* ---------------- colours ---------------- */

const GOLD = '#fbe04a';
const RED = '#e9443b';
const BLUE = '#1ea1dc';
const BLACK = '#1d1d1d';
const WHITE = '#ffffff';
const NAVY = '#1d4fa3';
const INK = '#2a2a2a';
const GREEN = '#3a9d4a';
const ORANGE = '#f2994a';
const TAN = '#c9a27a';
const BODY = '#8a6a4f';
const LIGHT = '#e8e8e8';

const circle = (r: number, fill: string, line: string | null = INK, cx = 0, cy = 0): Zone => ({
  kind: 'circle',
  r,
  cx,
  cy,
  fill,
  line,
});
const ellipse = (
  rx: number,
  ry: number,
  fill: string,
  line: string | null = INK,
  cx = 0,
  cy = 0,
): Zone => ({
  kind: 'ellipse',
  rx,
  ry,
  cx,
  cy,
  fill,
  line,
});

/* ---------------- scoring styles ---------------- */

function zoneText(
  style: { showAsX: boolean; points: number[][] },
  zone: number,
  arrow: number,
): string {
  const row = style.points[Math.min(arrow, style.points.length - 1)];
  if (zone < 0 || zone >= row.length) return 'M';
  if (zone === 0 && style.showAsX) return 'X';
  return row[zone] ? String(row[zone]) : 'M';
}

/** "X, 10, 9, …" — the distinct zone labels from the centre out. */
function autoName(showAsX: boolean, points: number[][]): string {
  const s = { showAsX, points };
  const out: string[] = [];
  for (let z = 0; z < points[0].length; z++) {
    const t = points.map((_, a) => zoneText(s, z, a)).join('/');
    if (out.at(-1) !== t) out.push(t);
  }
  return out.join(', ');
}

const style = (name: string | null, showAsX: boolean, points: number[]): ScoringStyle => ({
  name: name ?? autoName(showAsX, [points]),
  showAsX,
  points: [points],
});
const animalStyle = (points: number[][]): ScoringStyle => ({
  name: autoName(false, points),
  showAsX: false,
  points,
});

/* ---------------- WA ring faces ---------------- */

/** Score of each WA zone from the centre: X, 10, 9, … 1. */
const WA_SCORES = [10, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
const WA_COLOUR = (score: number) =>
  score >= 9 ? GOLD : score >= 7 ? RED : score >= 5 ? BLUE : score >= 3 ? BLACK : WHITE;
/** Imperial-style values by colour band: gold 9, red 7, blue 5, black 3, white 1. */
const IMPERIAL = (score: number) => [0, 1, 1, 3, 3, 5, 5, 7, 7, 9, 9][score];

/**
 * The scoring styles a MyTargets backup can refer to on WA ring faces, in MyTargets' index order.
 * Each maps a zone's WA score (X counted as 11) to points.
 */
const WA_STYLE_DEFS: {
  name: string;
  showAsX: boolean;
  pts: (s: number, isX: boolean) => number;
}[] = [
  { name: 'Recurve (X, 10–1)', showAsX: true, pts: (s) => s },
  { name: 'Recurve (10–1, no X)', showAsX: false, pts: (s) => s },
  { name: 'Compound (small 10)', showAsX: false, pts: (s, x) => (x ? 10 : s === 10 ? 9 : s) },
  { name: 'X = 11', showAsX: false, pts: (s, x) => (x ? 11 : s) },
  { name: '5-zone (5–1, X shown)', showAsX: true, pts: (s) => Math.ceil(s / 2) },
  { name: 'Imperial (9-7-5-3-1)', showAsX: false, pts: (s) => IMPERIAL(s) },
  { name: 'Colours reversed', showAsX: false, pts: (s) => [0, 10, 10, 8, 8, 6, 6, 4, 4, 2, 1][s] },
];

/**
 * A WA face showing rings `lowest`…10 (lowest = 1 for the full face). The face radius is where
 * ring `lowest` ends on the full face, so every ring keeps its size relative to the X.
 */
function waRingFace(lowest: number, styleCount: number) {
  const scores = WA_SCORES.slice(0, 12 - lowest);
  const outer = (11 - lowest) / 10;
  const zones = scores.map((s, i) => {
    const r = (i === 0 ? 0.05 : (11 - s) / 10) / outer;
    // The line between the two black rings is white; every other line is dark.
    return circle(r, WA_COLOUR(s), s === 4 ? '#d9d9d9' : INK);
  });
  const styles = WA_STYLE_DEFS.slice(0, styleCount).map((d) =>
    style(
      d.name,
      d.showAsX,
      scores.map((s, i) => d.pts(s, i === 0)),
    ),
  );
  return { zones, styles, realSizeFactor: outer };
}

/** With the "10–1" style the X line is not drawn; with the compound style the large 10 line is not. */
const waHide = (zone: number, s: number) => (s === 1 && zone === 0) || (s === 2 && zone === 1);

/* ---------------- multi-spot layouts ---------------- */

/** Lays out spots of `spotCm` diameter at centre positions (cm), scaled to fit -1..1. */
function layout(spotCm: number, centresCm: [number, number][]) {
  const r = spotCm / 2;
  const ext = Math.max(...centresCm.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y)) + r));
  return { faceRadius: r / ext, faces: centresCm.map(([x, y]) => ({ x: x / ext, y: y / ext })) };
}

/** WA triple faces: 20 cm spots, centres 22 cm apart (on the 40 cm face; scales with size). */
const VERTICAL_3 = layout(20, [
  [0, -22],
  [0, 0],
  [0, 22],
]);
const TRIANGLE_3 = layout(20, [
  [-11, 9.5],
  [0, -9.5],
  [11, 9.5],
]);
const TRIANGLE_3_DOWN = layout(22, [
  [0, -10.5],
  [-12, 10.5],
  [12, 10.5],
]);
const PYRAMID_6 = layout(15, [
  [0, -24],
  [-17, -7],
  [17, -7],
  [0, 4],
  [-11, 21],
  [11, 21],
]);
const FIVE_SPOT = layout(16, [
  [-15, -15],
  [15, -15],
  [0, 0],
  [-15, 15],
  [15, 15],
]);

/* ---------------- faces ---------------- */

const cm = (...v: number[]) => v.map((x) => dim(x, 'cm'));
/** MyTargets' unitless 3D sizes: -6 mini … -2 extra large. */
const SIZES_3D = [-6, -5, -4, -3, -2].map((v) => dim(v, null));
const SIZES_ANIMAL = [-5, -4, -3, -2].map((v) => dim(v, null));

/**
 * "Yellow 12 · 10 ring 10 · Vital 8 · Body 5" from named zones. Zones sharing a name (or a small
 * spot and the ring around it) with the same points are listed once.
 */
function namedStyleName(zones: Zone[], s: ScoringStyle): string {
  const pts = (z: number) => s.points.map((row) => row[z]).join('/');
  const groups = new Map<string, { full: string; pts: string }[]>();
  zones.forEach((z, i) => {
    const base = z.name!.replace(/^Small (\w)/, (_, c: string) => c.toUpperCase());
    let g = groups.get(base);
    if (!g) groups.set(base, (g = []));
    g.push({ full: z.name!, pts: pts(i) });
  });
  const parts: string[] = [];
  for (const [base, g] of groups) {
    if (new Set(g.map((x) => x.pts)).size === 1) {
      parts.push(`${base} ${g[0].pts}`);
      continue;
    }
    for (const x of g) {
      const text = `${x.full} ${x.pts}`;
      if (!parts.includes(text)) parts.push(text);
    }
  }
  if (s.miss) parts.push(`Miss ${s.miss}`);
  const arrows = ['1st', '2nd', '3rd'].slice(0, s.points.length).join('/');
  return (s.points.length > 1 ? `${arrows} arrow: ` : '') + parts.join(' · ');
}

function face(
  m: Partial<TargetModel> & Pick<TargetModel, 'id' | 'name' | 'zones' | 'styles' | 'diameters'>,
): TargetModel {
  const styles = m.zones.every((z) => z.name)
    ? m.styles.map((s) => ({ ...s, name: namedStyleName(m.zones, s) }))
    : m.styles;
  return {
    kind: 'target',
    realSizeFactor: 1,
    faceRadius: 1,
    faces: [{ x: 0, y: 0 }],
    singleSpotId: m.id,
    ...m,
    styles,
  };
}

const full = waRingFace(1, 7);
const six = waRingFace(5, 6);
const five = waRingFace(6, 6);
const three = waRingFace(8, 6);
const waCommon = { centerMark: INK, hideZone: waHide };

/** WA field face: gold spot (X + 5) a fifth of the diameter, then four black rings. */
const waFieldZones = [
  circle(0.1, GOLD),
  circle(0.2, GOLD),
  circle(0.4, BLACK, WHITE),
  circle(0.6, BLACK, WHITE),
  circle(0.8, BLACK, WHITE),
  circle(1, BLACK, WHITE),
];
const waFieldStyles = [
  style(null, true, [5, 5, 4, 3, 2, 1]),
  style(null, false, [6, 5, 4, 3, 2, 1]),
];

/**
 * NFAA field face: black centre (X, 5), white middle (4), black outer (3). The middle and outer
 * bands each count as two zones in MyTargets backups, split halfway with no visible line.
 */
const nfaaFieldZones = (lines: boolean) => [
  circle(0.1, BLACK, WHITE),
  circle(0.2, BLACK, lines ? WHITE : null),
  circle(0.4, WHITE, lines ? INK : null),
  circle(0.6, WHITE, INK),
  circle(0.8, BLACK, lines ? WHITE : null),
  circle(1, BLACK, WHITE),
];

/** Stylised 3D animal: body, heart-shaped vital area drawn as an ellipse, 10 ring and kill spots. */
const named = (z: Zone, name: string): Zone => ({ ...z, name });
const BODY_ZONE = named(ellipse(1, 0.72, BODY, '#6b5039'), 'Body');
const VITAL = named(ellipse(0.62, 0.5, TAN, INK, 0.05, 0.05), 'Vital');
const TEN = named(circle(0.34, BLUE, INK, 0.05, 0.05), '10 ring');
const COLOUR_NAME: Record<string, string> = { [GOLD]: 'Yellow', [RED]: 'Red', [GREEN]: 'Green' };
/** A kill spot: small ones are "Small yellow" etc., the larger ring around it just "Yellow". */
const spotPair = (r: number, colour: string, at: [number, number]) => {
  const n = COLOUR_NAME[colour] ?? 'Spot';
  return named(circle(r, colour, INK, at[0], at[1]), r < 0.08 ? `Small ${n.toLowerCase()}` : n);
};
const CENTRE: [number, number] = [0.05, 0.05];
const UPPER: [number, number] = [0.05, -0.17];
const LOWER: [number, number] = [0.05, 0.27];
const OFFSIDE: [number, number] = [-0.62, -0.42];

/** Animal faces: oval vital area on the animal outline. */
const ANIMAL_BODY = named(ellipse(1, 0.75, LIGHT, '#999'), 'Body');
const ANIMAL_VITAL = named(ellipse(0.55, 0.38, ORANGE, INK), 'Vital');
const ANIMAL_SPOT = named(circle(0.15, '#ffe500'), 'Spot');

export const TARGETS: TargetModel[] = [
  face({ id: 0, name: 'WA full face', ...full, diameters: cm(40, 60, 80, 92, 122), ...waCommon }),
  face({ id: 1, name: 'WA 6 ring', ...six, diameters: cm(40, 60, 80, 92, 122), ...waCommon }),
  face({ id: 2, name: 'WA 5 ring', ...five, diameters: cm(40, 60, 80, 92, 122), ...waCommon }),
  face({ id: 3, name: 'WA 3 ring', ...three, diameters: cm(40, 60, 80, 92, 122), ...waCommon }),
  face({
    id: 4,
    name: 'Vegas 3 spot',
    ...five,
    diameters: cm(40, 60),
    ...TRIANGLE_3,
    singleSpotId: 2,
    ...waCommon,
  }),
  face({
    id: 5,
    name: 'WA vertical 3 spot',
    ...five,
    diameters: cm(40, 60),
    ...VERTICAL_3,
    singleSpotId: 2,
    ...waCommon,
  }),
  face({
    id: 6,
    name: 'WA 3 ring 3 spot',
    ...three,
    diameters: cm(40, 60),
    ...TRIANGLE_3,
    singleSpotId: 3,
    ...waCommon,
  }),
  face({
    id: 7,
    name: 'NFAA field',
    kind: 'field',
    zones: nfaaFieldZones(false),
    styles: [style(null, true, [5, 5, 4, 4, 3, 3]), style(null, false, [6, 5, 4, 4, 3, 3])],
    diameters: cm(20, 35, 50, 65),
    centerMark: WHITE,
  }),
  face({
    id: 8,
    name: 'NFAA expert field',
    kind: 'field',
    zones: nfaaFieldZones(true),
    styles: [style(null, true, [6, 5, 4, 3, 2, 1])],
    diameters: cm(20, 35, 50, 65),
    centerMark: WHITE,
  }),
  face({
    id: 9,
    name: 'NFAA hunter',
    kind: 'field',
    zones: [
      circle(0.1, WHITE),
      circle(0.2, WHITE, null),
      circle(0.6, BLACK, WHITE),
      circle(1, BLACK, WHITE),
    ],
    styles: [style(null, true, [5, 5, 4, 3]), style(null, false, [6, 5, 4, 3])],
    diameters: cm(20, 35, 50, 65),
    centerMark: INK,
  }),
  face({
    id: 10,
    name: 'NFAA indoor',
    zones: [
      circle(0.1, WHITE),
      circle(0.2, WHITE),
      circle(0.4, NAVY, WHITE),
      circle(0.6, NAVY, WHITE),
      circle(0.8, NAVY, WHITE),
      circle(1, NAVY, WHITE),
    ],
    styles: [
      style(null, true, [5, 5, 4, 3, 2, 1]),
      style(null, false, [6, 5, 4, 3, 2, 1]),
      style(null, false, [7, 5, 4, 3, 2, 1]),
    ],
    diameters: cm(40),
    centerMark: INK,
  }),
  face({
    id: 11,
    name: 'NFAA indoor 5 spot',
    zones: [
      circle(0.25, WHITE),
      circle(0.5, WHITE),
      circle(0.75, NAVY, WHITE),
      circle(1, NAVY, null),
    ],
    styles: [
      style(null, true, [5, 5, 4, 4]),
      style(null, false, [6, 6, 5, 4]),
      style(null, false, [7, 6, 5, 4]),
    ],
    diameters: cm(40),
    ...FIVE_SPOT,
    centerMark: INK,
  }),
  face({
    id: 12,
    name: 'Worcester',
    zones: [0.2, 0.4, 0.6, 0.8, 1].map((r, i) => circle(r, i === 0 ? WHITE : BLACK, WHITE)),
    styles: [style(null, false, [5, 4, 3, 2, 1])],
    diameters: [dim(16, 'in')],
    centerMark: INK,
  }),
  face({
    id: 13,
    name: 'WA field',
    kind: 'field',
    zones: waFieldZones,
    styles: waFieldStyles,
    diameters: cm(20, 40, 60, 80),
    centerMark: INK,
  }),
  face({
    id: 14,
    name: 'Hit or miss',
    zones: [circle(0.3, GOLD), circle(1, '#f0b3b3')],
    styles: [style(null, false, [1, 0])],
    diameters: cm(30, 96),
    centerMark: INK,
  }),
  face({
    id: 15,
    name: 'ASA 3D',
    kind: '3d',
    zones: [
      spotPair(0.05, GOLD, UPPER),
      spotPair(0.05, GOLD, LOWER),
      spotPair(0.11, GOLD, UPPER),
      spotPair(0.11, GOLD, LOWER),
      TEN,
      VITAL,
      BODY_ZONE,
    ],
    styles: [style(null, false, [12, 12, 12, 12, 10, 8, 5])],
    diameters: SIZES_3D,
  }),
  face({
    id: 16,
    name: 'ASA 3D (14)',
    kind: '3d',
    zones: [
      spotPair(0.05, GREEN, OFFSIDE),
      spotPair(0.11, GREEN, OFFSIDE),
      spotPair(0.05, GOLD, UPPER),
      spotPair(0.05, GOLD, LOWER),
      spotPair(0.11, GOLD, UPPER),
      spotPair(0.11, GOLD, LOWER),
      TEN,
      VITAL,
      BODY_ZONE,
    ],
    styles: [style(null, false, [14, 14, 12, 12, 12, 12, 10, 8, 5])],
    diameters: SIZES_3D,
  }),
  face({
    id: 17,
    name: 'IBO 3D',
    kind: '3d',
    zones: [spotPair(0.05, RED, CENTRE), spotPair(0.11, RED, CENTRE), TEN, VITAL, BODY_ZONE],
    styles: [style(null, false, [11, 11, 10, 8, 5])],
    diameters: SIZES_3D,
  }),
  face({
    id: 18,
    name: 'NFAS 3D',
    kind: '3d',
    zones: [spotPair(0.05, RED, CENTRE), spotPair(0.11, RED, CENTRE), TEN, VITAL, BODY_ZONE],
    styles: [style(null, false, [24, 24, 20, 16, 0])],
    diameters: SIZES_3D,
  }),
  face({
    id: 19,
    name: 'DAIR 3D',
    kind: '3d',
    zones: [
      spotPair(0.05, GREEN, OFFSIDE),
      spotPair(0.11, GREEN, OFFSIDE),
      spotPair(0.05, GOLD, UPPER),
      spotPair(0.05, GOLD, LOWER),
      spotPair(0.05, RED, CENTRE),
      spotPair(0.11, RED, CENTRE),
      spotPair(0.11, GOLD, UPPER),
      spotPair(0.11, GOLD, LOWER),
      TEN,
      VITAL,
      BODY_ZONE,
    ],
    styles: [
      style(null, false, [8, 8, 12, 12, 12, 12, 11, 11, 10, 8, 0]),
      style(null, false, [14, 14, 12, 12, 12, 12, 11, 11, 10, 8, 0]),
      style(null, false, [8, 8, 12, 12, 12, 12, 10, 10, 10, 8, 0]),
      style(null, false, [14, 14, 12, 12, 12, 12, 10, 10, 10, 8, 0]),
      style(null, false, [14, 14, 11, 11, 10, 10, 10, 10, 10, 8, 5]),
    ],
    diameters: SIZES_3D,
  }),
  face({
    id: 20,
    name: 'IFAA animal',
    kind: '3d',
    zones: [ANIMAL_VITAL, ANIMAL_BODY],
    styles: [
      animalStyle([
        [20, 18],
        [16, 14],
        [12, 10],
      ]),
      animalStyle([
        [20, 15],
        [15, 10],
      ]),
      animalStyle([
        [20, 16],
        [14, 10],
        [8, 4],
      ]),
      animalStyle([
        [15, 12],
        [10, 7],
        [5, 2],
      ]),
    ],
    diameters: SIZES_ANIMAL,
  }),
  face({
    id: 21,
    name: 'NFAA animal',
    kind: '3d',
    zones: [ANIMAL_SPOT, ANIMAL_VITAL, ANIMAL_BODY],
    styles: [
      animalStyle([
        [21, 20, 18],
        [17, 16, 14],
        [13, 12, 10],
      ]),
      style(null, false, [20, 16, 10]),
      style(null, false, [15, 12, 7]),
      animalStyle([
        [20, 18, 16],
        [14, 12, 10],
        [8, 6, 4],
      ]),
      animalStyle([
        [20, 18, 16],
        [12, 10, 8],
        [6, 4, 2],
      ]),
      animalStyle([
        [15, 10, 5],
        [12, 7, 2],
      ]),
    ],
    diameters: SIZES_ANIMAL,
  }),
  face({
    id: 22,
    name: 'NFAS field',
    kind: 'field',
    zones: [ANIMAL_SPOT, ANIMAL_VITAL, ANIMAL_BODY],
    styles: [
      animalStyle([
        [24, 20, 16],
        [14, 14, 10],
        [8, 8, 4],
      ]),
    ],
    diameters: SIZES_ANIMAL,
  }),
  face({
    id: 23,
    name: 'Beursault',
    zones: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => circle(k / 8, WHITE, k % 2 ? '#999' : INK)),
    styles: [style(null, false, [4, 4, 3, 3, 2, 2, 1, 1])],
    diameters: cm(48),
    centerMark: INK,
  }),
  face({
    id: 24,
    name: 'SCA period',
    zones: [circle(0.15, GOLD), circle(0.45, GREEN), circle(1, WHITE)],
    styles: [style(null, false, [8, 4, 2])],
    diameters: cm(60),
    centerMark: INK,
  }),
  face({
    id: 25,
    name: 'WA field 3 spot',
    kind: 'field',
    zones: waFieldZones,
    styles: waFieldStyles,
    diameters: cm(20, 40, 60, 80),
    ...VERTICAL_3,
    singleSpotId: 13,
    centerMark: INK,
  }),
  face({
    id: 26,
    name: 'WA Danage 3 spot',
    ...three,
    diameters: cm(40, 60),
    ...TRIANGLE_3_DOWN,
    singleSpotId: 3,
    ...waCommon,
  }),
  face({
    id: 27,
    name: 'WA Danage 6 spot',
    ...three,
    diameters: cm(40, 60),
    ...PYRAMID_6,
    singleSpotId: 3,
    ...waCommon,
  }),
  face({
    id: 28,
    name: 'DBSC blowpipe',
    zones: [circle(1 / 3, GOLD), circle(2 / 3, RED), circle(1, NAVY)],
    styles: [style(null, false, [7, 5, 3])],
    diameters: cm(18),
  }),
  // Ids from 100 are ArrowPlot's own (not in MyTargets), added for scoring kinds other apps use.
  face({
    id: 100,
    name: '3D (10-8-5)',
    kind: '3d',
    zones: [named(circle(0.2, RED, INK, 0.05, 0.05), 'Kill'), VITAL, BODY_ZONE],
    styles: [
      style(null, false, [10, 8, 5]),
      // Two arrows, only the first hit counts (10/8/5, then 7/5/2).
      animalStyle([
        [10, 8, 5],
        [7, 5, 2],
      ]),
    ],
    diameters: SIZES_3D,
  }),
  face({
    id: 101,
    name: '3D (5-3, body -1)',
    kind: '3d',
    // A body hit or a miss costs a point.
    zones: [named(circle(0.2, RED, INK, 0.05, 0.05), 'Kill'), VITAL, BODY_ZONE],
    styles: [{ ...style(null, false, [5, 3, -1]), miss: -1 }],
    diameters: SIZES_3D,
  }),
];

const BY_ID = new Map(TARGETS.map((t) => [t.id, t]));

/** Display order used in pickers: common faces first. */
export const TARGET_PICKER_ORDER = [
  0, 1, 2, 3, 5, 4, 6, 26, 27, 13, 25, 10, 11, 7, 8, 9, 12, 14, 23, 24, 28, 15, 16, 17, 18, 19, 20,
  21, 22, 100, 101,
];

export function getTarget(id: number): TargetModel {
  return BY_ID.get(id) ?? BY_ID.get(0)!;
}

/** Faces with real sizes (cm/in); 3D and animal faces have none to choose. */
export function hasFaceSizes(t: TargetModel): boolean {
  return t.diameters.some((d) => d.unit !== null);
}

/** Size used for faces without real sizes (3D and animal faces). */
export const FIXED_3D_SIZE = dim(-4, null);

/** "WA full face 40cm", or just "IBO 3D" for faces without a size. */
export function faceLabel(targetId: number, diameter: Dimension): string {
  const size = formatDimension(diameter);
  return size ? `${getTarget(targetId).name} ${size}` : getTarget(targetId).name;
}

export function getStyle(t: TargetModel, styleIndex: number): ScoringStyle {
  return t.styles[Math.min(Math.max(0, styleIndex), t.styles.length - 1)];
}

const rowFor = (s: ScoringStyle, arrow: number) => s.points[Math.min(arrow, s.points.length - 1)];

/** Points for a zone. The arrow number only matters for animal-round styles. */
export function pointsFor(t: TargetModel, styleIndex: number, ring: number, arrow = 0): number {
  const row = rowFor(getStyle(t, styleIndex), arrow);
  if (ring === MISS) return getStyle(t, styleIndex).miss ?? 0;
  return ring >= 0 && ring < row.length ? row[ring] : 0;
}

export function maxPointsPerShot(t: TargetModel, styleIndex: number, arrow = 0): number {
  return Math.max(...rowFor(getStyle(t, styleIndex), arrow));
}

export function zoneLabel(t: TargetModel, styleIndex: number, ring: number, arrow = 0): string {
  return ring === NOT_ENTERED ? '' : zoneText(getStyle(t, styleIndex), ring, arrow);
}

export interface EndScore {
  reached: number;
  total: number;
}

/** Animal-round styles: up to N arrows, only the first one that hits scores. */
export function isFirstHitStyle(t: TargetModel, styleIndex: number): boolean {
  return getStyle(t, styleIndex).points.length > 1;
}

/**
 * Whether a first-hit end is finished: it stops at the first arrow that scores, which needs all
 * arrows before it entered (as misses); an end without a hit needs every arrow.
 */
export function firstHitEndComplete(t: TargetModel, styleIndex: number, shots: Shot[]): boolean {
  if (!shots.length) return false;
  for (const sh of [...shots].sort((a, b) => a.index - b.index)) {
    if (sh.ring === NOT_ENTERED) return false;
    if (pointsFor(t, styleIndex, sh.ring, sh.index) > 0) return true;
  }
  return true;
}

/**
 * Score of one end. Normal styles add every arrow. Animal-round styles score only the first arrow
 * that hits, at the value for its arrow number, out of the first arrow's maximum.
 */
export function scoreEnd(t: TargetModel, styleIndex: number, shots: Shot[]): EndScore {
  const s = getStyle(t, styleIndex);
  if (s.points.length > 1) {
    const first = shots.find(
      (sh) => sh.ring !== NOT_ENTERED && pointsFor(t, styleIndex, sh.ring, sh.index) > 0,
    );
    return {
      reached: first ? pointsFor(t, styleIndex, first.ring, first.index) : 0,
      total: Math.max(...s.points[0]),
    };
  }
  return shots.reduce(
    (acc, sh) => ({
      reached:
        acc.reached + (sh.ring === NOT_ENTERED ? 0 : pointsFor(t, styleIndex, sh.ring, sh.index)),
      total: acc.total + maxPointsPerShot(t, styleIndex, sh.index),
    }),
    { reached: 0, total: 0 },
  );
}

/**
 * Half the width of a dividing line. Rules count an arrow touching the line as the higher score,
 * and printed lines are up to 2 mm wide, so the arrow reaches the higher zone 1 mm further out.
 */
const HALF_LINE_MM = 1;
const DEFAULT_ARROW = dim(5, 'mm');

/** Real diameter of one scoring face (one spot) in mm. Unitless 3D sizes use nominal sizes. */
function scoringFaceMm(t: TargetModel, targetDiameter: Dimension): number {
  if (targetDiameter.unit === null) return convert(targetDiameter, 'mm');
  return convert(targetDiameter, 'mm') * t.realSizeFactor;
}

/**
 * How far beyond a zone's edge an arrow centre may be and still score that zone, in face-radius
 * units: the arrow's own radius plus half a dividing line.
 */
export function relativeArrowRadius(
  t: TargetModel,
  targetDiameter: Dimension,
  arrowDiameter: Dimension | null,
): number {
  const a = arrowDiameter?.unit ? arrowDiameter : DEFAULT_ARROW;
  const faceR = scoringFaceMm(t, targetDiameter) / 2;
  return faceR > 0 ? (convert(a, 'mm') / 2 + HALF_LINE_MM) / faceR : 0.01;
}

/** Real radius of one scoring face (one spot) in cm. */
export function faceRadiusCm(t: TargetModel, targetDiameter: Dimension): number {
  return scoringFaceMm(t, targetDiameter) / 20;
}

/** Does a point lie within `reach` of the zone (i.e. touch it)? */
function touches(z: Zone, x: number, y: number, reach: number): boolean {
  if (z.kind === 'circle') return Math.hypot(x - z.cx, y - z.cy) < z.r + reach;
  const rx = z.rx + reach;
  const ry = z.ry + reach;
  return ((x - z.cx) / rx) ** 2 + ((y - z.cy) / ry) ** 2 < 1;
}

/** The best zone a shot touches (spot-relative coordinates), or MISS. */
export function zoneAt(t: TargetModel, x: number, y: number, reach: number): number {
  const i = t.zones.findIndex((z) => touches(z, x, y, reach));
  return i < 0 ? MISS : i;
}

export interface SelectableZone {
  ring: number;
  label: string;
  points: number;
  fill: string;
  /** Names of the zones this button stands for, on faces with named zones ("Yellow / Red"). */
  name?: string;
}

/** Keypad buttons, best first; zones that read the same (e.g. X and 10 without X) share a button. */
export function selectableZones(t: TargetModel, styleIndex: number, arrow = 0): SelectableZone[] {
  const rings = [...t.zones.keys(), MISS];
  const out: SelectableZone[] = [];
  for (const ring of rings) {
    const label = zoneLabel(t, styleIndex, ring, arrow);
    if (out.some((z) => z.label === label)) continue;
    const names = [
      ...new Set(
        t.zones
          .filter((z, i) => z.name && zoneLabel(t, styleIndex, i, arrow) === label)
          .map((z) => z.name!.replace(/^Small (\w)/, (_, c: string) => c.toUpperCase())),
      ),
    ];
    out.push({
      ring,
      label,
      points: pointsFor(t, styleIndex, ring, arrow),
      fill: ring === MISS ? '#9aa3ab' : t.zones[ring].fill,
      name: names.length ? names.join(' / ') : undefined,
    });
  }
  return out;
}

/** Text colour that reads on a zone colour. */
export function contrastOn(fill: string): string {
  const n = parseInt(fill.slice(1), 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#111' : '#fff';
}

export function shotColor(t: TargetModel, ring: number): string {
  return ring >= 0 && ring < t.zones.length ? contrastOn(t.zones[ring].fill) : '#111';
}

/** Arrows go round the spots in order: arrow 1 on spot 1, arrow 2 on spot 2, … */
export function spotOf(t: TargetModel, shotIndex: number): number {
  return shotIndex % t.faces.length;
}

/** Converts spot-relative coordinates to coordinates on the whole (multi-spot) face. */
export function toFaceCoords(t: TargetModel, shotIndex: number, x: number, y: number) {
  const f = t.faces[spotOf(t, shotIndex)];
  return { x: f.x + x * t.faceRadius, y: f.y + y * t.faceRadius };
}

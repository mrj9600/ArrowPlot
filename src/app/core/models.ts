/** Units match MyTargets' Dimension.Unit abbreviations so imported values round-trip. */
export type LengthUnit = 'm' | 'yd' | 'cm' | 'in' | 'mm' | 'ft';

/**
 * A length. MyTargets stores 3D/animal target sizes as negative "virtual" values with no unit
 * (-6 mini … -2 extra large); `unit: null` keeps that.
 */
export interface Dimension {
  value: number;
  unit: LengthUnit | null;
}

export type BowType = 'recurve' | 'compound' | 'longbow' | 'barebow' | 'horsebow' | 'yumi';
export const BOW_TYPES: BowType[] = [
  'recurve',
  'compound',
  'longbow',
  'barebow',
  'horsebow',
  'yumi',
];

export interface SightMark {
  distance: Dimension;
  value: string;
}

export interface Bow {
  id?: number;
  name: string;
  type: BowType;
  /** Free-text tuning fields (brand, drawWeight, braceHeight, …), see BOW_FIELDS. */
  fields: Record<string, string>;
  sightMarks: SightMark[];
  imageId?: number;
  sourceRef?: string;
}

export interface Arrow {
  id?: number;
  name: string;
  diameter: Dimension;
  maxArrowNumber: number;
  /** Free-text fields (length, spine, weight, …), see ARROW_FIELDS. */
  fields: Record<string, string>;
  imageId?: number;
  sourceRef?: string;
}

export type Weather = 'sunny' | 'partlyCloudy' | 'cloudy' | 'lightRain' | 'rain';
export const WEATHER: Weather[] = ['sunny', 'partlyCloudy', 'cloudy', 'lightRain', 'rain'];

export interface Score {
  reached: number;
  total: number;
  shots: number;
  /** Ends (targets) shot. */
  ends?: number;
  /** Scored per target, not per arrow (animal rounds where only the first hit counts). */
  perEnd?: boolean;
}

export interface Session {
  id?: number;
  title: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  bowId?: number | null;
  arrowId?: number | null;
  standardRoundId?: number | null;
  arrowNumbering: boolean;
  /** Arrow numbers offered when numbering; null/absent = all of the arrow set's numbers. */
  arrowNumbers?: string[] | null;
  indoor: boolean;
  weather?: Weather | null;
  /** Beaufort 0-12. */
  windSpeed?: number;
  /** 0-7, clockwise from N, as in MyTargets. */
  windDirection?: number;
  location: string;
  comment: string;
  /** Where the session came from: entered here, a MyTargets backup or a MantisX export. */
  source: 'manual' | 'mytargets' | 'mantisx' | 'archdps';
  /** Stable reference into the source ("mt:<file>:<id>", "mantis:<session id>") to detect re-imports. */
  sourceRef?: string;
  /** Cached totals, kept up to date by the repository. */
  score: Score;
  createdAt: number;
}

export interface Round {
  id?: number;
  sessionId: number;
  index: number;
  shotsPerEnd: number;
  maxEndCount?: number | null;
  distance: Dimension;
  targetId: number;
  scoringStyle: number;
  targetDiameter: Dimension;
  comment: string;
  score: Score;
  /** 3D and field: the target (post) the round started at; empty = 1. */
  startTarget?: number | null;
  /** Rounds without an end count: the course's last target, after which numbering goes to 1. */
  wrapAt?: number | null;
}

/**
 * Shot coordinates follow MyTargets: relative to the scoring face radius (1 = outer edge),
 * x to the right, y down. On multi-spot faces they are relative to the spot the arrow is in
 * (spot = shot index % spot count).
 */
export interface Shot {
  index: number;
  x: number;
  y: number;
  /** Zone index, 0 = innermost. -1 = miss, -2 = not entered yet. */
  ring: number;
  arrowNumber?: string | null;
  /** 3D faces: roughly how far from the centre the arrow sits, in cm (the plot gives direction). */
  cm?: number | null;
}

export const MISS = -1;
export const NOT_ENTERED = -2;

export interface End {
  id?: number;
  roundId: number;
  index: number;
  /** True when the shots have positions on the face, false when only rings were entered. */
  exact: boolean;
  /** HH:MM:SS of when the end was saved. */
  saveTime?: string | null;
  comment: string;
  shots: Shot[];
  imageIds?: number[];
}

export interface StoredImage {
  id?: number;
  blob: Blob;
  fileName: string;
}

export interface RoundTemplate {
  distance: Dimension;
  targetId: number;
  scoringStyle: number;
  targetDiameter: Dimension;
  shotsPerEnd: number;
  endCount: number;
  /** Only when creating a session: the target to start at (3D and field). */
  startTarget?: number;
}

export interface StandardRound {
  id?: number;
  name: string;
  /** Organisation label, e.g. "World Archery". */
  club: string;
  /** One round; a session shooting several (e.g. two distances) adds the next with Add round. */
  round: RoundTemplate;
  builtIn: boolean;
  sourceRef?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export const BOW_FIELDS: { key: string; label: string; types?: BowType[] }[] = [
  { key: 'brand', label: 'Brand' },
  { key: 'size', label: 'Size' },
  { key: 'drawWeight', label: 'Draw weight' },
  {
    key: 'braceHeight',
    label: 'Brace height',
    types: ['recurve', 'longbow', 'barebow', 'horsebow', 'yumi'],
  },
  { key: 'tiller', label: 'Tiller', types: ['recurve', 'barebow'] },
  { key: 'limbs', label: 'Limbs', types: ['recurve', 'barebow'] },
  { key: 'sight', label: 'Sight', types: ['recurve', 'compound'] },
  { key: 'stabilizer', label: 'Stabilizer', types: ['recurve', 'compound'] },
  { key: 'clicker', label: 'Clicker', types: ['recurve'] },
  { key: 'button', label: 'Button', types: ['recurve'] },
  { key: 'string', label: 'String' },
  { key: 'nockingPoint', label: 'Nocking point', types: ['recurve', 'barebow'] },
  { key: 'letoffWeight', label: 'Let-off weight', types: ['compound'] },
  { key: 'arrowRest', label: 'Arrow rest', types: ['recurve', 'compound'] },
  { key: 'restHorizontalPosition', label: 'Rest horizontal position', types: ['compound'] },
  { key: 'restVerticalPosition', label: 'Rest vertical position', types: ['compound'] },
  { key: 'restStiffness', label: 'Rest stiffness', types: ['compound'] },
  { key: 'camSetting', label: 'Cam setting', types: ['compound'] },
  { key: 'scopeMagnification', label: 'Scope magnification', types: ['compound'] },
  { key: 'description', label: 'Notes' },
];

export const ARROW_FIELDS: { key: string; label: string }[] = [
  { key: 'length', label: 'Length' },
  { key: 'material', label: 'Material' },
  { key: 'spine', label: 'Spine' },
  { key: 'weight', label: 'Weight' },
  { key: 'tipWeight', label: 'Tip weight' },
  { key: 'vanes', label: 'Vanes' },
  { key: 'nock', label: 'Nock' },
  { key: 'comment', label: 'Notes' },
];

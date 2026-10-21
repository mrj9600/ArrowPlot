/*
 * Scoresheet import: an AI model (Claude, ChatGPT, …) reads a photo of a handwritten scoresheet
 * with the instructions from scoresheet-prompt.ts and answers with JSON in the format below.
 * This file checks that JSON and turns it into sessions, rounds and ends.
 */
import { dim } from '../dimension';
import { CourseLog, Dimension, End, LengthUnit, MISS, NOT_ENTERED, Shot } from '../models';
import { Repo } from '../repo.service';
import { db } from '../db';
import {
  getStyle,
  getTarget,
  hasFaceSizes,
  FIXED_3D_SIZE,
  isFirstHitStyle,
  pointsFor,
  scoreEnd,
  selectableZones,
  TargetModel,
  TARGETS,
} from '../targets';

export const SHEET_FORMAT = 'arrowplot-scoresheet';
export const SHEET_VERSION = 1;

export interface SheetLength {
  value: number;
  unit: string;
}
export interface SheetEnd {
  /** Arrow values as written: "X", "10" … "1", "M"; on 3D the points ("11", "8", "M"). */
  arrows?: (string | number)[] | null;
  /** The end total as written on the sheet. */
  total?: number | null;
  /** 3D and field: the target (post) number written for this end. */
  target?: number | null;
  /** 3D and field: judged and measured distance in metres, when written. */
  judged?: number | null;
  measured?: number | null;
  note?: string | null;
}
export interface SheetRound {
  face: number;
  scoring?: number | null;
  faceSize?: SheetLength | null;
  distance?: SheetLength | null;
  arrowsPerEnd: number;
  ends: SheetEnd[];
  writtenTotal?: number | null;
}
export interface SheetSession {
  date?: string | null;
  title?: string | null;
  location?: string | null;
  notes?: string | null;
  rounds: SheetRound[];
}
export interface SheetJson {
  format: string;
  version: number;
  sessions: SheetSession[];
  /** Things the model was unsure about, for the archer to check. */
  uncertain?: string[];
}

export interface PlannedRound {
  model: TargetModel;
  style: number;
  diameter: Dimension;
  distance: Dimension;
  shotsPerEnd: number;
  startTarget: number;
  ends: End[];
  reached: number;
  writtenTotal: number | null;
  /** Ends whose written total differs from the arrows, "end 3: arrows 27, written 28". */
  endMismatches: string[];
  /** Ends imported from a total only (no arrows), so the rings are a guess. */
  fromTotals: number;
}
export interface PlannedSession {
  date: string;
  title: string;
  location: string;
  notes: string;
  rounds: PlannedRound[];
}
export interface SheetPlan {
  sessions: PlannedSession[];
  uncertain: string[];
  problems: string[];
}

/** Finds the JSON in a pasted answer, which may sit in a ```json block or between other text. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('No JSON found. Paste the whole answer.');
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (e) {
    throw new Error(`The JSON could not be read: ${(e as Error).message}`);
  }
}

const UNITS: Record<string, LengthUnit> = { m: 'm', yd: 'yd', cm: 'cm', in: 'in' };
function length(l: SheetLength | null | undefined, allowed: LengthUnit[]): Dimension | null {
  const unit = UNITS[String(l?.unit ?? '').toLowerCase()];
  const value = Number(l?.value);
  return unit && allowed.includes(unit) && value > 0 ? dim(value, unit) : null;
}

/** The face size closest to what the sheet says, or the face's usual size. */
function faceSize(model: TargetModel, l: SheetLength | null | undefined): Dimension {
  if (!hasFaceSizes(model)) return FIXED_3D_SIZE;
  const want = length(l, ['cm', 'in']);
  const sizes = model.diameters.filter((d) => d.unit !== null);
  if (!want) return sizes[0];
  const cm = (d: Dimension) => (d.unit === 'in' ? d.value * 2.54 : d.value);
  return sizes.reduce((a, b) => (Math.abs(cm(b) - cm(want)) < Math.abs(cm(a) - cm(want)) ? b : a));
}

const norm = (v: string | number) => String(v).trim().toUpperCase();

/** The zone for a written value, best zone first when several read the same. */
function ringFor(model: TargetModel, style: number, value: string | number, arrow: number) {
  const v = norm(value);
  if (v === 'M' || v === '-' || v === '') return MISS;
  const zones = selectableZones(model, style, arrow);
  // "0" is a zone worth nothing (e.g. the body on NFAS), or else a miss.
  if (v === '0') return zones.find((z) => z.points === 0 && z.ring !== MISS)?.ring ?? MISS;
  const hit =
    zones.find((z) => norm(z.label) === v) ??
    zones.find((z) => z.name && z.name.toUpperCase().split(' / ').includes(v)) ??
    (v === 'X' ? zones[0] : undefined);
  return hit ? hit.ring : null;
}

/** Splits an end total into arrow values, highest first (when only totals were written). */
function splitTotal(model: TargetModel, style: number, total: number, n: number): number[] | null {
  const zones = selectableZones(model, style).sort((a, b) => b.points - a.points);
  const out: number[] = [];
  let left = total;
  for (let i = 0; i < n; i++) {
    const per = left / (n - i);
    const z = zones.find((x) => x.points <= Math.ceil(per)) ?? zones.at(-1)!;
    out.push(z.ring);
    left -= z.points;
  }
  return left === 0 ? out : null;
}

function planRound(r: SheetRound, where: string, problems: string[]): PlannedRound | null {
  const model = TARGETS.find((t) => t.id === Number(r.face));
  if (!model) {
    problems.push(`${where}: unknown face ${r.face}.`);
    return null;
  }
  const style = Math.min(Math.max(0, Number(r.scoring ?? 0) || 0), model.styles.length - 1);
  const firstHit = isFirstHitStyle(model, style);
  const shotsPerEnd = Math.max(
    1,
    Math.round(
      Number(r.arrowsPerEnd) || Math.max(1, ...(r.ends ?? []).map((e) => e.arrows?.length ?? 0)),
    ),
  );
  const ends: End[] = [];
  const endMismatches: string[] = [];
  let fromTotals = 0;
  let reached = 0;
  (r.ends ?? []).forEach((e, i) => {
    const label = `${where}, end ${i + 1}`;
    let rings: number[] | null = null;
    if (e.arrows?.length) {
      rings = [];
      for (const [k, v] of e.arrows.entries()) {
        const ring = ringFor(model, style, v, k);
        if (ring === null) {
          problems.push(`${label}: "${v}" is not a value on ${model.name}; counted as a miss.`);
        }
        rings.push(ring ?? MISS);
      }
    } else if (e.total != null) {
      fromTotals++;
      if (firstHit) {
        // The first arrow whose zone gives this many points; the arrows before it missed.
        const t = Number(e.total);
        rings = [];
        for (let k = 0; k < shotsPerEnd && t > 0; k++) {
          const z = selectableZones(model, style, k).find((x) => x.points === t);
          rings.push(z ? z.ring : MISS);
          if (z) break;
        }
        const last = rings.length - 1;
        if (t > 0 && pointsFor(model, style, rings[last] ?? MISS, last) !== t)
          problems.push(`${label}: no arrow scores ${t} on ${model.name}.`);
        if (!rings.length) rings = Array(shotsPerEnd).fill(MISS);
      } else {
        rings = splitTotal(model, style, Number(e.total), shotsPerEnd);
        if (!rings) {
          problems.push(`${label}: ${e.total} can't be made from ${shotsPerEnd} arrows; skipped.`);
          return;
        }
      }
    } else {
      problems.push(`${label}: no arrows and no total; skipped.`);
      return;
    }
    const shots: Shot[] = Array.from({ length: Math.max(shotsPerEnd, rings.length) }, (_, k) => ({
      index: k,
      x: 0,
      y: 0,
      ring: k < rings!.length ? rings![k] : NOT_ENTERED,
    }));
    const s = scoreEnd(model, style, shots).reached;
    reached += s;
    if (e.total != null && e.arrows?.length && Number(e.total) !== s)
      endMismatches.push(`end ${i + 1}: arrows make ${s}, written ${e.total}`);
    const log: CourseLog = {
      estimated: Number(e.judged) > 0 ? Number(e.judged) : null,
      measured: Number(e.measured) > 0 ? Number(e.measured) : null,
    };
    ends.push({
      roundId: 0,
      index: ends.length,
      exact: false,
      saveTime: null,
      comment: String(e.note ?? '').trim(),
      shots,
      log: log.estimated || log.measured ? log : null,
    });
  });
  if (!ends.length) {
    problems.push(`${where}: no ends to import.`);
    return null;
  }
  const first = Number(r.ends?.[0]?.target);
  return {
    model,
    style,
    diameter: faceSize(model, r.faceSize),
    distance: length(r.distance, ['m', 'yd']) ?? dim(-1, null),
    shotsPerEnd,
    startTarget: first > 1 ? first : 1,
    ends,
    reached,
    writtenTotal: r.writtenTotal != null ? Number(r.writtenTotal) : null,
    endMismatches,
    fromTotals,
  };
}

/** Checks the model's answer and works out what would be imported, without saving anything. */
export function planSheet(json: unknown): SheetPlan {
  const j = json as Partial<SheetJson>;
  if (!j || typeof j !== 'object' || !Array.isArray(j.sessions))
    throw new Error('This is not a scoresheet answer: "sessions" is missing.');
  if (j.format && j.format !== SHEET_FORMAT)
    throw new Error(`Unknown format "${j.format}", expected "${SHEET_FORMAT}".`);
  const problems: string[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const sessions = j.sessions.map((s, i): PlannedSession => {
    const where = j.sessions!.length > 1 ? `Session ${i + 1}` : 'Session';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(s.date ?? '')) ? s.date! : today;
    if (date !== s.date) problems.push(`${where}: no date on the sheet; today is filled in, change it below if needed.`);
    const rounds = (s.rounds ?? [])
      .map((r, k) =>
        planRound(r, s.rounds.length > 1 ? `${where}, round ${k + 1}` : where, problems),
      )
      .filter((r): r is PlannedRound => !!r);
    return {
      date,
      title: String(s.title ?? '').trim() || 'Scoresheet',
      location: String(s.location ?? '').trim(),
      notes: String(s.notes ?? '').trim(),
      rounds,
    };
  });
  return {
    sessions: sessions.filter((s) => s.rounds.length),
    uncertain: (j.uncertain ?? []).map(String),
    problems,
  };
}

export async function importSheet(
  plan: SheetPlan,
  gear: { bowId: number | null; arrowId: number | null },
  repo: Repo,
): Promise<number[]> {
  const ids: number[] = [];
  for (const s of plan.sessions) {
    const id = await repo.createSession(
      {
        title: s.title,
        date: s.date,
        bowId: gear.bowId,
        arrowId: gear.arrowId,
        standardRoundId: null,
        arrowNumbering: false,
        indoor: true,
        weather: null,
        location: s.location,
        comment: s.notes,
        source: 'scoresheet',
      },
      s.rounds.map((r) => ({
        distance: r.distance,
        targetId: r.model.id,
        scoringStyle: r.style,
        targetDiameter: r.diameter,
        shotsPerEnd: r.shotsPerEnd,
        endCount: r.ends.length,
        startTarget: r.startTarget,
      })),
    );
    const rounds = await repo.roundsOf(id);
    for (const [k, r] of s.rounds.entries()) {
      await db.ends.bulkAdd(r.ends.map((e) => ({ ...e, roundId: rounds[k].id! })));
      await repo.recomputeRound(rounds[k].id!);
    }
    ids.push(id);
  }
  return ids;
}

/** Values a style accepts, for the instructions: per arrow on first-hit styles. */
export function styleValues(model: TargetModel, style: number): string[][] {
  const s = getStyle(model, style);
  return s.points.map((_, arrow) => {
    const zones = selectableZones(model, style, arrow);
    const labels = zones.map((z) => z.label);
    // A zone worth nothing reads "M" like a miss; on the sheet it is written "0".
    if (model.zones.some((_, i) => pointsFor(model, style, i, arrow) === 0))
      labels.splice(labels.indexOf('M'), 0, '0');
    return labels;
  });
}

/*
 * Import of MantisX archery shot exports (CSV). Columns used: "Session ID", "Date", "Time Stamp",
 * "Target X", "Target Y" (0..1 across the whole face, 0.5 = centre, y down) and "Target Score"
 * (X, 10 … 1, M). MantisX scores an arrow by its centre point on a WA full face.
 */
import { db } from '../db';
import { dim } from '../dimension';
import { Dimension, End, MISS, Shot, Session } from '../models';
import { Repo } from '../repo.service';
import { getTarget, pointsFor, relativeArrowRadius, zoneAt } from '../targets';

export interface MantisShot {
  ts: string;
  /** Relative to the face radius, MyTargets convention. */
  x: number;
  y: number;
  /** WA full face zone: 0 = X, 1 = 10 … 10 = 1, -1 = miss. */
  ring: number;
}

export interface MantisSession {
  sid: string;
  start: Date;
  date: string;
  shots: MantisShot[];
  /** Rows in the file for this session, including shots without a plotted position. */
  totalRows: number;
  /** Already imported as its own session. */
  imported?: Session;
  /** A score-only session on the same day with exactly the same scores. */
  match?: Session;
  matchRoundIds?: number[];
}

export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(f);
      f = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      out.push(row);
      row = [];
      f = '';
    } else f += c;
  }
  if (f || row.length) {
    row.push(f);
    out.push(row);
  }
  return out;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function mantisRing(s: string): number {
  const v = s.trim().toUpperCase();
  if (v === 'X' || v === '11') return 0;
  if (v === '' || v === 'M' || v === '0') return MISS;
  const n = parseInt(v, 10);
  return isFinite(n) && n >= 1 && n <= 10 ? 11 - n : MISS;
}

function stamp(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s.trim().replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

export function parseMantis(text: string): MantisSession[] {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const hi = rows.findIndex((r) => r.includes('Target X') && r.includes('Target Score'));
  if (hi < 0)
    throw new Error(
      'This CSV has no "Target X" / "Target Score" columns. Is it a MantisX shot export?',
    );
  const H = rows[hi].map((h) => h.trim());
  const col = (n: string) => H.indexOf(n);
  const cS = col('Session ID');
  const cD = col('Date');
  const cT = col('Time Stamp');
  const cX = col('Target X');
  const cY = col('Target Y');
  const cP = col('Target Score');
  const sessions = new Map<string, MantisSession>();
  const totals = new Map<string, number>();
  for (const r of rows.slice(hi + 1)) {
    if (r.length < H.length - 1) continue;
    const sid = cS >= 0 ? r[cS] : 'session';
    if (!sid) continue;
    totals.set(sid, (totals.get(sid) ?? 0) + 1);
    const x = parseFloat(r[cX]);
    const y = parseFloat(r[cY]);
    if (!isFinite(x) || !isFinite(y)) continue; // shot without a plotted position
    if (!sessions.has(sid)) {
      const d = stamp(r[cD]) ?? stamp(r[cT]);
      if (!d) continue;
      sessions.set(sid, { sid, start: d, date: isoDate(d), shots: [], totalRows: 0 });
    }
    sessions.get(sid)!.shots.push({
      ts: cT >= 0 ? r[cT] : '',
      x: (x - 0.5) * 2,
      y: (y - 0.5) * 2,
      ring: mantisRing(r[cP] ?? ''),
    });
  }
  for (const s of sessions.values()) {
    s.totalRows = totals.get(s.sid) ?? s.shots.length;
    s.shots.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  }
  return [...sessions.values()].sort((a, b) => b.start.getTime() - a.start.getTime());
}

const ringKey = (rings: number[]) => [...rings].sort((a, b) => a - b).join(',');

/** Marks MantisX sessions already imported, and finds score-only WA full-face ArrowPlot sessions they belong to. */
export async function annotateSessions(sessions: MantisSession[]): Promise<void> {
  const imported = await db.sessions.where('sourceRef').startsWith('mantis:').toArray();
  const byRef = new Map(imported.map((t) => [t.sourceRef, t]));
  const used = new Set<string>();
  for (const s of sessions) {
    s.imported = byRef.get(`mantis:${s.sid}`);
    s.match = undefined;
    if (s.imported) used.add(s.sid);
  }
  const dates = [...new Set(sessions.map((s) => s.date))];
  const candidates = await db.sessions.where('date').anyOf(dates).toArray();
  for (const t of candidates) {
    if (t.source === 'mantisx') continue;
    const rounds = (await db.rounds.where('sessionId').equals(t.id!).toArray()).filter(
      (r) => r.targetId === 0,
    );
    if (!rounds.length) continue;
    const ends = (
      await db.ends
        .where('roundId')
        .anyOf(rounds.map((r) => r.id!))
        .toArray()
    ).filter((e) => e.shots.length);
    if (!ends.length || ends.some((e) => e.exact)) continue;
    const want = ringKey(ends.flatMap((e) => e.shots.map((s) => s.ring)));
    const same = sessions.filter((s) => s.date === t.date && !used.has(s.sid));
    const pick = same.find((s) => ringKey(s.shots.map((m) => m.ring)) === want);
    if (pick) {
      pick.match = t;
      pick.matchRoundIds = rounds.map((r) => r.id!);
      used.add(pick.sid);
    }
  }
}

export interface MantisImportOptions {
  title: string;
  bowId: number | null;
  arrowId: number | null;
  arrowDiameter: Dimension | null;
  distance: Dimension;
  faceCm: number;
  scoringStyle: number;
  shotsPerEnd: number;
  /** Nudge line cutters so ArrowPlot gives each arrow the ring MantisX gave it. */
  keepMantisScore: boolean;
}

export interface PlannedShot extends MantisShot {
  z: number;
  pts: number;
}

export interface MantisPlan {
  ends: PlannedShot[][];
  reached: number;
  total: number;
  mantisPoints: number;
  moved: number;
  maxMoveMm: number;
  leftOut: number;
}

/** Works out scores and ends for a new ArrowPlot session from a MantisX session, without writing anything. */
export function planSession(s: MantisSession, o: MantisImportOptions): MantisPlan {
  const t = getTarget(0);
  const arrowR = relativeArrowRadius(t, dim(o.faceCm, 'cm'), o.arrowDiameter);
  // How far past a ring edge a shot still touches it (arrow radius + half a dividing line).
  const touch = arrowR;
  const n = Math.floor(s.shots.length / o.shotsPerEnd) * o.shotsPerEnd;
  let moved = 0;
  let maxMoveMm = 0;
  const shots: PlannedShot[] = s.shots.slice(0, n).map((m) => {
    let x = m.x;
    let y = m.y;
    let z = zoneAt(t, x, y, arrowR);
    if (o.keepMantisScore && z >= 0 && (m.ring < 0 || z < m.ring)) {
      // ArrowPlot counts this as a line cutter but MantisX did not: slide it outwards.
      const inner = m.ring < 0 ? 1 : m.ring === 1 ? 0.05 : (m.ring - 1) / 10;
      const r = Math.hypot(x, y);
      const rNew = inner + touch + 0.0005;
      if (r > 0 && rNew > r) {
        x = (x / r) * rNew;
        y = (y / r) * rNew;
        z = zoneAt(t, x, y, arrowR);
        moved++;
        maxMoveMm = Math.max(maxMoveMm, (((rNew - r) * o.faceCm) / 2) * 10);
      }
    } else if (o.keepMantisScore && m.ring >= 0 && (z < 0 || z > m.ring)) {
      // MantisX gave a higher ring than the plotted spot: slide it inwards onto that line.
      const outer = m.ring === 0 ? 0.05 : m.ring / 10;
      const r = Math.hypot(x, y);
      const rNew = Math.max(0, outer + touch - 0.0005);
      if (r > rNew) {
        x = (x / r) * rNew;
        y = (y / r) * rNew;
        z = zoneAt(t, x, y, arrowR);
        moved++;
        maxMoveMm = Math.max(maxMoveMm, (((r - rNew) * o.faceCm) / 2) * 10);
      }
    }
    return { ...m, x, y, z, pts: pointsFor(t, o.scoringStyle, z) };
  });
  const ends: PlannedShot[][] = [];
  for (let i = 0; i < shots.length; i += o.shotsPerEnd)
    ends.push(shots.slice(i, i + o.shotsPerEnd));
  const max = Math.max(...t.styles[o.scoringStyle].points[0]);
  return {
    ends,
    reached: shots.reduce((a, s) => a + s.pts, 0),
    total: shots.length * max,
    mantisPoints: shots.reduce((a, s) => a + pointsFor(t, o.scoringStyle, s.ring), 0),
    moved,
    maxMoveMm,
    leftOut: s.shots.length - n,
  };
}

function timeOf(ts: string): string | null {
  const d = stamp(ts);
  return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}` : null;
}

export async function createSessionFromMantis(
  s: MantisSession,
  o: MantisImportOptions,
  repo: Repo,
): Promise<number> {
  const plan = planSession(s, o);
  if (!plan.ends.length)
    throw new Error('This session has fewer arrows with a position than one end.');
  const sessionId = await repo.createSession(
    {
      title: o.title || 'MantisX',
      date: s.date,
      bowId: o.bowId,
      arrowId: o.arrowId,
      standardRoundId: null,
      arrowNumbering: false,
      indoor: false,
      weather: null,
      location: '',
      comment: `Imported from MantisX session ${s.sid} (${pad2(s.start.getHours())}:${pad2(s.start.getMinutes())}).`,
      source: 'mantisx',
      sourceRef: `mantis:${s.sid}`,
    },
    [
      {
        distance: o.distance,
        targetId: 0,
        scoringStyle: o.scoringStyle,
        targetDiameter: dim(o.faceCm, 'cm'),
        shotsPerEnd: o.shotsPerEnd,
        endCount: plan.ends.length,
      },
    ],
  );
  const [round] = await repo.roundsOf(sessionId);
  await db.ends.bulkAdd(
    plan.ends.map((es, i): End => ({
      roundId: round.id!,
      index: i,
      exact: true,
      saveTime: timeOf(es[es.length - 1].ts),
      comment: '',
      shots: es.map((m, j): Shot => ({ index: j, x: m.x, y: m.y, ring: m.z, arrowNumber: null })),
    })),
  );
  await repo.recomputeRound(round.id!);
  return sessionId;
}

/**
 * Puts MantisX positions onto the arrows of a session entered as scores only. Each arrow gets the
 * position of a MantisX shot with the same ring, so scores do not change.
 */
export async function addPositionsToSession(s: MantisSession, repo: Repo): Promise<number> {
  if (!s.match || !s.matchRoundIds) throw new Error('No matching session.');
  const pool = s.shots.map((m) => ({ ...m }));
  let n = 0;
  for (const roundId of s.matchRoundIds) {
    for (const e of await repo.endsOf(roundId)) {
      const shots = e.shots.map((sh) => {
        const i = pool.findIndex((m) => m.ring === sh.ring);
        if (i < 0) return sh;
        const m = pool.splice(i, 1)[0];
        n++;
        return { ...sh, x: m.x, y: m.y };
      });
      await db.ends.update(e.id!, { shots, exact: true });
    }
  }
  const t = s.match;
  const note = `Arrow positions from MantisX session ${s.sid}.`;
  await db.sessions.update(t.id!, { comment: t.comment ? `${t.comment}\n${note}` : note });
  return n;
}

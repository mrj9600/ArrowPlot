/*
 * Import of 3D SKill Board backups (Android package "dpe.archDPS", by 3DTurnier). A backup is a
 * zip holding archDPS.sqlite. Sessions are "events"; each archer in an event is an "eventplayer"
 * with a scoring type ("counttype"); every scored arrow is an "eventresult" row giving the target
 * (end) number, arrow number, the hit zone ("kill", 1 = best) and its points.
 */
import JSZip from 'jszip';
import { db } from '../db';
import { dim } from '../dimension';
import { Dimension, End, MISS, Shot } from '../models';
import { Repo } from '../repo.service';
import { getTarget, scoreEnd } from '../targets';
import { getSql, query, tables } from './sqlite';

/** How one archDPS scoring type maps onto an ArrowPlot face. */
interface TypeMap {
  label: string;
  targetId: number;
  style: number;
  /** archDPS hit zone (1 = best, 0 = miss) and points → ArrowPlot zone index. */
  zone: (kill: number, points: number) => number;
  /** archDPS stores tap positions we can convert (WA 10-ring face only). */
  positions?: boolean;
  /** Face size to use; null = ask (10-ring face). */
  diameter: Dimension | null;
}

const byKill = (k: number) => (k > 0 ? k - 1 : MISS);
const MEDIUM_3D = dim(-4, null);

/** archDPS built-in scoring types by id. Unknown ids are reported and skipped. */
const TYPES: Record<number, TypeMap> = {
  10000: {
    label: '3D, 2 arrows count (11/10/8/5)',
    targetId: 17,
    style: 0,
    zone: (k) => [MISS, 0, 2, 3, 4][k] ?? MISS,
    diameter: MEDIUM_3D,
  },
  10100: {
    label: '3D, 1 arrow (11/10/8/5)',
    targetId: 17,
    style: 0,
    zone: (k) => [MISS, 0, 2, 3, 4][k] ?? MISS,
    diameter: MEDIUM_3D,
  },
  10500: {
    label: '10-ring target face',
    targetId: 0,
    style: 0,
    zone: byKill,
    positions: true,
    diameter: null,
  },
  10400: { label: 'Field 6-ring', targetId: 13, style: 1, zone: byKill, diameter: dim(40, 'cm') },
  11271: {
    label: 'IFAA 3D, 3 arrows (first hit)',
    targetId: 20,
    style: 0,
    zone: byKill,
    diameter: dim(-4, null),
  },
  11273: {
    label: '3D, 1 arrow (20/16/10)',
    targetId: 21,
    style: 1,
    zone: byKill,
    diameter: dim(-4, null),
  },
  11272: {
    label: '3D, 2 arrows count (10/8/5)',
    targetId: 100,
    style: 0,
    zone: byKill,
    diameter: MEDIUM_3D,
  },
  10751: {
    label: 'Fita 3D, 2 arrows (first hit)',
    targetId: 100,
    style: 1,
    zone: byKill,
    diameter: MEDIUM_3D,
  },
  10863: {
    label: 'DGS 3D (5/3, body and miss -1)',
    targetId: 101,
    style: 0,
    // Body hits (zone 3) and misses that cost a point both count -1.
    zone: (k, p) => (k === 1 ? 0 : k === 2 ? 1 : k === 3 || p < 0 ? 2 : MISS),
    diameter: MEDIUM_3D,
  },
};

/**
 * Tap positions on the 10-ring face are pixels from the centre with y down; a full 40 cm face
 * is about this many pixels in radius (fitted against the scored rings).
 */
const FULL_FACE_RADIUS_PX = 490;

export interface ArchResult {
  eventId: number;
  playerId: number;
  target: number;
  arrow: number;
  kill: number;
  points: number;
  x: number | null;
  y: number | null;
}

export interface ArchSession {
  eventId: number;
  ref: string;
  playerId: number;
  name: string;
  date: string;
  location: string;
  typeId: number;
  arrowsPerTarget: number;
  /** archDPS's own total, for checking. */
  total: number;
}

export interface ArchPlayer {
  id: number;
  name: string;
  sessions: number;
  arrows: number;
}

export interface ArchDpsFile {
  fileName: string;
  players: ArchPlayer[];
  sessions: ArchSession[];
  results: Map<string, ArchResult[]>;
}

export interface ImportOptions {
  /** Distance and face size for 10-ring face sessions (archDPS does not record them). */
  discDistance: Dimension;
  discDiameter: Dimension;
}

export interface PlannedSession {
  session: ArchSession;
  type: TypeMap;
  ends: End[];
  shotsPerEnd: number;
  reached: number;
  matches: boolean;
  exists: boolean;
}

export interface ArchPlan {
  planned: PlannedSession[];
  skipped: { session: ArchSession; reason: string }[];
  byType: { label: string; sessions: number }[];
}

const key = (eventId: number, playerId: number) => `${eventId}:${playerId}`;
const str = (v: unknown) => (v == null ? '' : String(v)).trim();

export async function readArchDps(file: File): Promise<ArchDpsFile> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bytes: Uint8Array | null = null;
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const zip = await JSZip.loadAsync(buf);
    const entry = Object.values(zip.files).find((f) => !f.dir && /\.sqlite$/i.test(f.name));
    if (!entry)
      throw new Error('This zip has no archDPS.sqlite inside. Is it a 3D SKill Board backup?');
    bytes = await entry.async('uint8array');
  } else if (new TextDecoder().decode(buf.slice(0, 15)) === 'SQLite format 3') {
    bytes = buf;
  } else {
    throw new Error('This is not a 3D SKill Board backup (expected a .zip or archDPS.sqlite).');
  }

  const SQL = await getSql();
  const sdb = new SQL.Database(bytes);
  try {
    const t = tables(sdb);
    for (const need of ['event', 'eventplayer', 'eventresult']) {
      if (!t.has(need))
        throw new Error('This database has no scores. Is it a 3D SKill Board backup?');
    }
    const names = new Map<number, string>();
    if (t.has('players')) {
      for (const r of query(sdb, 'select id, name from players'))
        names.set(Number(r['id']), str(r['name']));
    }
    const sessions: ArchSession[] = query(
      sdb,
      `select e.id eid, e.name, e.date, e.objectId oid, ${t.has('location') ? 'l.name' : "''"} loc,
              ep.playerid pid, ep.playername pname, ep.counttypeid ct, ep.arr2trgt apt, ep.sumpoints total
       from eventplayer ep join event e on e.id = ep.eventid
       ${t.has('location') ? 'left join location l on l.id = e.locationid' : ''}
       order by e.date, e.id`,
    ).map((r) => {
      const pid = Number(r['pid']);
      if (!names.get(pid) && str(r['pname'])) names.set(pid, str(r['pname']));
      return {
        eventId: Number(r['eid']),
        ref: `archdps:${str(r['oid']) || r['eid']}:${pid}`,
        playerId: pid,
        name: str(r['name']),
        date: str(r['date']).slice(0, 10),
        location: str(r['loc']),
        typeId: Number(r['ct']),
        arrowsPerTarget: Number(r['apt'] ?? 0),
        total: Number(r['total'] ?? 0),
      };
    });

    const results = new Map<string, ArchResult[]>();
    // N = arrow by arrow, C = counted per target; X / I rows are targets not shot.
    for (const r of query(
      sdb,
      `select eventid, playerid, targetidx, arrownr, kill, points, coordx, coordy
       from eventresult where resulttype in ('N', 'C') order by eventid, playerid, targetidx, arrownr, id`,
    )) {
      const res: ArchResult = {
        eventId: Number(r['eventid']),
        playerId: Number(r['playerid']),
        target: Number(r['targetidx']),
        arrow: Number(r['arrownr'] ?? 0),
        kill: Number(r['kill'] ?? 0),
        points: Number(r['points'] ?? 0),
        x: r['coordx'] == null ? null : Number(r['coordx']),
        y: r['coordy'] == null ? null : Number(r['coordy']),
      };
      const k = key(res.eventId, res.playerId);
      let l = results.get(k);
      if (!l) results.set(k, (l = []));
      l.push(res);
    }

    const players = [...new Set(sessions.map((s) => s.playerId))]
      .map((id) => ({
        id,
        name: names.get(id) || `Archer ${id}`,
        sessions: sessions.filter((s) => s.playerId === id).length,
        arrows: sessions
          .filter((s) => s.playerId === id)
          .reduce((a, s) => a + (results.get(key(s.eventId, id))?.length ?? 0), 0),
      }))
      .sort((a, b) => b.sessions - a.sessions);
    return { fileName: file.name, players, sessions, results };
  } finally {
    sdb.close();
  }
}

/** Turns one archer's sessions into ArrowPlot rounds and ends, and checks the totals. */
export function planArchDps(
  file: ArchDpsFile,
  playerId: number,
  existingRefs: Set<string>,
): ArchPlan {
  const plan: ArchPlan = { planned: [], skipped: [], byType: [] };
  const counts = new Map<string, number>();
  for (const s of file.sessions.filter((x) => x.playerId === playerId)) {
    const type = TYPES[s.typeId];
    const rows = file.results.get(key(s.eventId, playerId)) ?? [];
    if (!type) {
      plan.skipped.push({ session: s, reason: `unknown scoring type ${s.typeId}` });
      continue;
    }
    if (!rows.length) {
      plan.skipped.push({ session: s, reason: 'no arrows' });
      continue;
    }
    counts.set(type.label, (counts.get(type.label) ?? 0) + 1);
    const model = getTarget(type.targetId);
    const byTarget = new Map<number, ArchResult[]>();
    for (const r of rows) {
      let l = byTarget.get(r.target);
      if (!l) byTarget.set(r.target, (l = []));
      l.push(r);
    }
    const ends: End[] = [];
    let reached = 0;
    let shotsPerEnd = Math.max(1, s.arrowsPerTarget);
    for (const [, arrows] of [...byTarget.entries()].sort((a, b) => a[0] - b[0])) {
      // Arrow numbers decide points on first-hit styles; counted rows all say 1, so number in order.
      const numbered =
        new Set(arrows.map((a) => a.arrow)).size === arrows.length &&
        arrows.every((a) => a.arrow > 0);
      const shots: Shot[] = arrows.map((a, i) => {
        const hasPos = !!type.positions && a.x !== null && a.y !== null && (a.x !== 0 || a.y !== 0);
        return {
          index: numbered ? a.arrow - 1 : i,
          x: hasPos ? a.x! / FULL_FACE_RADIUS_PX : 0,
          y: hasPos ? a.y! / FULL_FACE_RADIUS_PX : 0,
          ring: type.zone(a.kill, a.points),
        };
      });
      shotsPerEnd = Math.max(shotsPerEnd, ...shots.map((x) => x.index + 1));
      const exact =
        !!type.positions &&
        arrows.every((a) => a.x !== null && a.y !== null && (a.x !== 0 || a.y !== 0));
      reached += scoreEnd(model, type.style, shots).reached;
      ends.push({ roundId: 0, index: ends.length, exact, saveTime: null, comment: '', shots });
    }
    plan.planned.push({
      session: s,
      type,
      ends,
      shotsPerEnd,
      reached,
      matches: reached === s.total,
      exists: existingRefs.has(s.ref),
    });
  }
  plan.byType = [...counts.entries()]
    .map(([label, sessions]) => ({ label, sessions }))
    .sort((a, b) => b.sessions - a.sessions);
  return plan;
}

export async function existingArchRefs(): Promise<Set<string>> {
  const l = await db.trainings.where('sourceRef').startsWith('archdps:').toArray();
  return new Set(l.map((t) => t.sourceRef!));
}

export async function importArchDps(
  plan: ArchPlan,
  opts: ImportOptions,
  repo: Repo,
): Promise<number> {
  let n = 0;
  for (const p of plan.planned) {
    if (p.exists) continue;
    const s = p.session;
    const disc = p.type.diameter === null;
    const id = await repo.createTraining(
      {
        title: s.name || s.location || '3D SKill Board',
        date: s.date,
        bowId: null,
        arrowId: null,
        standardRoundId: null,
        arrowNumbering: false,
        indoor: true,
        weather: null,
        location: s.location,
        comment: '',
        source: 'archdps',
        sourceRef: s.ref,
      },
      [
        {
          distance: disc ? opts.discDistance : dim(-1, null),
          targetId: p.type.targetId,
          scoringStyle: p.type.style,
          targetDiameter: p.type.diameter ?? opts.discDiameter,
          shotsPerEnd: p.shotsPerEnd,
          endCount: p.ends.length,
        },
      ],
    );
    const [round] = await repo.roundsOf(id);
    await db.ends.bulkAdd(p.ends.map((e) => ({ ...e, roundId: round.id! })));
    await repo.recomputeRound(round.id!);
    n++;
  }
  return n;
}

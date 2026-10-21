/*
 * Import of MyTargets backups. A backup is a zip with the app's Room database ("/data.db",
 * schema v26) plus photo files referenced by BowImage / ArrowImage / EndImage.
 * A bare data.db is accepted as well.
 */
import JSZip from 'jszip';
import { db } from '../db';
import { parseDimension } from '../dimension';
import { Arrow, Bow, BOW_TYPES, End, Round, Shot, Session, WEATHER } from '../models';
import { EMPTY_SCORE, Repo } from '../repo.service';
import { splitRoundDefinition } from '../standard-rounds';
import { columns, getSql, query, Row, tables } from './sqlite';

/**
 * MyTargets' own names for a session table and the round column pointing to it. They are part of
 * MyTargets' database schema, so they must be spelled exactly like this to read its backups.
 */
const MT_SESSION_TABLE = 'Training';
const MT_SESSION_COLUMN = 'trainingId';

interface MtSession {
  row: Row;
  rounds: { row: Row; ends: { row: Row; shots: Row[]; images: string[] }[] }[];
  ref: string;
  exists: boolean;
}

export interface MyTargetsPreview {
  fileName: string;
  sessions: MtSession[];
  bows: Row[];
  arrows: Row[];
  bowImages: Map<number, string>;
  arrowImages: Map<number, string>;
  standardRounds: Map<number, { row: Row; templates: Row[] }>;
  sightMarks: Row[];
  files: Map<string, Uint8Array>;
  newCount: number;
  existingCount: number;
  firstDate?: string;
  lastDate?: string;
  shotCount: number;
}

export interface MyTargetsResult {
  sessions: number;
  bows: number;
  arrows: number;
  images: number;
  skipped: number;
}

const str = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => (v == null ? null : Number(v));
const baseName = (n: string) => n.slice(n.lastIndexOf('/') + 1);

export async function readMyTargetsBackup(file: File): Promise<MyTargetsPreview> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const files = new Map<string, Uint8Array>();
  let dbBytes: Uint8Array | null = null;
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const zip = await JSZip.loadAsync(buf);
    for (const f of Object.values(zip.files)) {
      if (f.dir) continue;
      const bytes = await f.async('uint8array');
      if (/\.db$/i.test(f.name) && (!dbBytes || /(^|\/)data\.db$/i.test(f.name))) dbBytes = bytes;
      else files.set(baseName(f.name), bytes);
    }
    if (!dbBytes) throw new Error('This zip has no database inside. Is it a MyTargets backup?');
  } else if (new TextDecoder().decode(buf.slice(0, 15)) === 'SQLite format 3') {
    dbBytes = buf;
  } else {
    throw new Error('This is not a MyTargets backup (expected a .zip or data.db file).');
  }

  const SQL = await getSql();
  const sdb = new SQL.Database(dbBytes);
  try {
    const t = tables(sdb);
    for (const need of [MT_SESSION_TABLE, 'Round', 'End', 'Shot']) {
      if (!t.has(need))
        throw new Error(`This database has no ${need} table. Is it a MyTargets backup?`);
    }
    const has = (table: string) => t.has(table);
    const sessionCols = columns(sdb, MT_SESSION_TABLE);

    const sessionsRows = query(sdb, `select * from ${MT_SESSION_TABLE} order by date, id`);
    const roundRows = query(sdb, `select * from Round order by ${MT_SESSION_COLUMN}, "index", id`);
    const endRows = query(sdb, `select * from "End" order by roundId, "index", id`);
    const shotRows = query(sdb, `select * from Shot order by endId, "index", id`);
    const endImages = has('EndImage') ? query(sdb, `select fileName, endId from EndImage`) : [];
    const bows = has('Bow') ? query(sdb, `select * from Bow order by id`) : [];
    const arrows = has('Arrow') ? query(sdb, `select * from Arrow order by id`) : [];
    const sightMarks = has('SightMark') ? query(sdb, `select * from SightMark`) : [];
    const bowImages = new Map<number, string>();
    if (has('BowImage'))
      for (const r of query(sdb, `select fileName, bowId from BowImage order by id`))
        if (!bowImages.has(Number(r['bowId'])))
          bowImages.set(Number(r['bowId']), str(r['fileName']));
    const arrowImages = new Map<number, string>();
    if (has('ArrowImage'))
      for (const r of query(sdb, `select fileName, arrowId from ArrowImage order by id`))
        if (!arrowImages.has(Number(r['arrowId'])))
          arrowImages.set(Number(r['arrowId']), str(r['fileName']));

    const standardRounds = new Map<number, { row: Row; templates: Row[] }>();
    if (has('StandardRound') && sessionCols.has('standardRoundId')) {
      const used = new Set(
        sessionsRows
          .filter((r) => r['standardRoundId'] != null)
          .map((r) => Number(r['standardRoundId'])),
      );
      for (const r of query(sdb, `select * from StandardRound`)) {
        if (used.has(Number(r['id'])))
          standardRounds.set(Number(r['id']), { row: r, templates: [] });
      }
      if (has('RoundTemplate')) {
        for (const r of query(
          sdb,
          `select * from RoundTemplate order by standardRoundId, "index"`,
        )) {
          standardRounds.get(Number(r['standardRoundId']))?.templates.push(r);
        }
      }
    }

    const shotsByEnd = group(shotRows, 'endId');
    const imagesByEnd = group(endImages, 'endId');
    const endsByRound = group(endRows, 'roundId');
    const roundsBySession = group(roundRows, MT_SESSION_COLUMN);

    const existingRefs = new Set(
      (await db.sessions.where('sourceRef').startsWith('mt:').toArray()).map((x) => x.sourceRef),
    );
    let shotCount = 0;
    const sessions: MtSession[] = sessionsRows.map((row) => {
      const ref = `mt:${row['id']}|${row['date']}|${row['title']}`;
      const rounds = (roundsBySession.get(Number(row['id'])) ?? []).map((rr) => ({
        row: rr,
        ends: (endsByRound.get(Number(rr['id'])) ?? []).map((er) => {
          const shots = shotsByEnd.get(Number(er['id'])) ?? [];
          shotCount += shots.length;
          return {
            row: er,
            shots,
            images: (imagesByEnd.get(Number(er['id'])) ?? []).map((i) => str(i['fileName'])),
          };
        }),
      }));
      return { row, rounds, ref, exists: existingRefs.has(ref) };
    });
    const existingCount = sessions.filter((x) => x.exists).length;
    return {
      fileName: file.name,
      sessions,
      bows,
      arrows,
      bowImages,
      arrowImages,
      standardRounds,
      sightMarks,
      files,
      newCount: sessions.length - existingCount,
      existingCount,
      firstDate: sessions[0] ? str(sessions[0].row['date']) : undefined,
      lastDate: sessions.length ? str(sessions[sessions.length - 1].row['date']) : undefined,
      shotCount,
    };
  } finally {
    sdb.close();
  }
}

function group(rows: Row[], key: string): Map<number, Row[]> {
  const m = new Map<number, Row[]>();
  for (const r of rows) {
    const k = Number(r[key]);
    let l = m.get(k);
    if (!l) m.set(k, (l = []));
    l.push(r);
  }
  return m;
}

function mime(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
}

/**
 * Writes the backup into ArrowPlot. Sessions already imported from an earlier backup
 * (same MyTargets id, date and title) are skipped unless `replaceExisting` is set.
 */
export async function importMyTargets(
  p: MyTargetsPreview,
  repo: Repo,
  replaceExisting: boolean,
): Promise<MyTargetsResult> {
  const res: MyTargetsResult = { sessions: 0, bows: 0, arrows: 0, images: 0, skipped: 0 };
  const newIds: number[] = [];
  const addImage = async (fileName: string): Promise<number | undefined> => {
    const bytes = p.files.get(baseName(fileName));
    if (!bytes) return undefined;
    res.images++;
    return db.images.add({
      blob: new Blob([bytes as BlobPart], { type: mime(fileName) }),
      fileName: baseName(fileName),
    });
  };

  if (replaceExisting) {
    for (const t of p.sessions.filter((x) => x.exists)) {
      const old = await db.sessions.where('sourceRef').equals(t.ref).toArray();
      for (const o of old) await repo.deleteSession(o.id!);
      t.exists = false;
    }
  }

  await db.transaction(
    'rw',
    [db.bows, db.arrows, db.sessions, db.rounds, db.ends, db.images, db.standardRounds],
    async () => {
      // Equipment: reuse what an earlier import created, matched by MyTargets id + name.
      const bowMap = new Map<number, number>();
      for (const b of p.bows) {
        const ref = `mt:bow:${b['id']}|${b['name']}`;
        const found = await db.bows.where('sourceRef').equals(ref).first();
        if (found) {
          bowMap.set(Number(b['id']), found.id!);
          continue;
        }
        const fields: Record<string, string> = {};
        for (const k of [
          'brand',
          'size',
          'braceHeight',
          'tiller',
          'limbs',
          'sight',
          'drawWeight',
          'stabilizer',
          'clicker',
          'button',
          'string',
          'nockingPoint',
          'letoffWeight',
          'arrowRest',
          'restHorizontalPosition',
          'restVerticalPosition',
          'restStiffness',
          'camSetting',
          'scopeMagnification',
          'description',
        ]) {
          if (b[k]) fields[k] = str(b[k]);
        }
        const img = p.bowImages.get(Number(b['id']));
        const bow: Bow = {
          name: str(b['name']) || 'Bow',
          type: BOW_TYPES[Number(b['type'] ?? 0)] ?? 'recurve',
          fields,
          sightMarks: p.sightMarks
            .filter((s) => s['bowId'] === b['id'])
            .map((s) => ({ distance: parseDimension(str(s['distance'])), value: str(s['value']) })),
          imageId: img ? await addImage(img) : undefined,
          sourceRef: ref,
        };
        bowMap.set(Number(b['id']), await db.bows.add(bow));
        res.bows++;
      }
      const arrowMap = new Map<number, number>();
      for (const a of p.arrows) {
        const ref = `mt:arrow:${a['id']}|${a['name']}`;
        const found = await db.arrows.where('sourceRef').equals(ref).first();
        if (found) {
          arrowMap.set(Number(a['id']), found.id!);
          continue;
        }
        const fields: Record<string, string> = {};
        for (const k of [
          'length',
          'material',
          'spine',
          'weight',
          'tipWeight',
          'vanes',
          'nock',
          'comment',
        ])
          if (a[k]) fields[k] = str(a[k]);
        const img = p.arrowImages.get(Number(a['id']));
        const arrow: Arrow = {
          name: str(a['name']) || 'Arrows',
          diameter: parseDimension(str(a['diameter']) || '5.0 mm'),
          maxArrowNumber: Number(a['maxArrowNumber'] ?? 12),
          fields,
          imageId: img ? await addImage(img) : undefined,
          sourceRef: ref,
        };
        arrowMap.set(Number(a['id']), await db.arrows.add(arrow));
        res.arrows++;
      }
      const srMap = new Map<number, number>();
      // ArrowPlot definitions hold one round: a MyTargets definition with several parts becomes
      // one definition per distinct part. Its sessions link to the first.
      for (const [id, sr] of p.standardRounds) {
        const parts = splitRoundDefinition(
          str(sr.row['name']),
          sr.templates.map((t) => ({
            distance: parseDimension(str(t['distance'])),
            targetId: Number(t['targetId']),
            scoringStyle: Number(t['targetScoringStyleIndex']),
            targetDiameter: parseDimension(str(t['targetDiameter'])),
            shotsPerEnd: Number(t['shotsPerEnd']),
            endCount: Number(t['endCount']),
          })),
        );
        for (const [i, part] of parts.entries()) {
          const ref = `mt:sr:${id}:${i}|${part.name}`;
          const found = await db.standardRounds.where('sourceRef').equals(ref).first();
          const sid =
            found?.id ??
            (await db.standardRounds.add({
              ...part,
              club: 'MyTargets',
              builtIn: false,
              sourceRef: ref,
            }));
          if (i === 0) srMap.set(id, sid);
        }
      }

      for (const t of p.sessions) {
        if (t.exists) {
          res.skipped++;
          continue;
        }
        const r = t.row;
        const session: Session = {
          title: str(r['title']) || 'Session',
          date: str(r['date']),
          bowId: r['bowId'] != null ? (bowMap.get(Number(r['bowId'])) ?? null) : null,
          arrowId: r['arrowId'] != null ? (arrowMap.get(Number(r['arrowId'])) ?? null) : null,
          standardRoundId:
            r['standardRoundId'] != null ? (srMap.get(Number(r['standardRoundId'])) ?? null) : null,
          arrowNumbering: Number(r['arrowNumbering'] ?? 0) === 1,
          indoor: Number(r['indoor'] ?? 0) === 1,
          weather:
            r['weather'] != null && Number(r['indoor'] ?? 0) !== 1
              ? (WEATHER[Number(r['weather'])] ?? null)
              : null,
          windSpeed: num(r['windSpeed']) ?? 0,
          windDirection: num(r['windDirection']) ?? 0,
          location: str(r['location']),
          comment: str(r['comment']),
          source: 'mytargets',
          sourceRef: t.ref,
          score: { ...EMPTY_SCORE },
          createdAt: Date.now(),
        };
        const sessionId = await db.sessions.add(session);
        newIds.push(sessionId);
        for (const rr of t.rounds) {
          const round: Round = {
            sessionId,
            index: Number(rr.row['index']),
            shotsPerEnd: Number(rr.row['shotsPerEnd']),
            maxEndCount: num(rr.row['maxEndCount']),
            distance: parseDimension(str(rr.row['distance'])),
            targetId: Number(rr.row['targetId']),
            scoringStyle: Number(rr.row['targetScoringStyleIndex'] ?? 0),
            targetDiameter: parseDimension(str(rr.row['targetDiameter'])),
            comment: str(rr.row['comment']),
            score: { ...EMPTY_SCORE },
          };
          const roundId = await db.rounds.add(round);
          for (const er of rr.ends) {
            const imageIds: number[] = [];
            for (const f of er.images) {
              const id = await addImage(f);
              if (id) imageIds.push(id);
            }
            const end: End = {
              roundId,
              index: Number(er.row['index']),
              exact: Number(er.row['exact'] ?? 0) === 1,
              saveTime: er.row['saveTime'] != null ? str(er.row['saveTime']) : null,
              comment: str(er.row['comment']),
              shots: er.shots.map((s): Shot => ({
                index: Number(s['index']),
                x: Number(s['x'] ?? 0),
                y: Number(s['y'] ?? 0),
                ring: Number(s['scoringRing']),
                arrowNumber: s['arrowNumber'] != null ? str(s['arrowNumber']) : null,
              })),
              imageIds: imageIds.length ? imageIds : undefined,
            };
            await db.ends.add(end);
          }
        }
        res.sessions++;
      }
    },
  );

  // Totals are recomputed with ArrowPlot's scoring rather than trusting the cached columns.
  for (const id of newIds) {
    for (const r of await repo.roundsOf(id)) await repo.recomputeRound(r.id!);
  }
  return res;
}

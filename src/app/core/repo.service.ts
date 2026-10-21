import { Injectable, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { liveQuery } from 'dexie';
import { from } from 'rxjs';
import { db } from './db';
import { Arrow, Bow, End, Round, RoundTemplate, Score, StandardRound, Session } from './models';
import { BUILT_IN_ROUNDS } from './standard-rounds';
import { getTarget, isFirstHitStyle, scoreEnd, upgradeFace } from './targets';

export const EMPTY_SCORE: Score = { reached: 0, total: 0, shots: 0, ends: 0, perEnd: false };

/** Turns a Dexie query into a signal that updates whenever the data changes. */
export function live<T>(query: () => Promise<T>, initial: T): Signal<T> {
  return toSignal(from(liveQuery(query)), { initialValue: initial });
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function nowTime(): string {
  return new Date().toTimeString().slice(0, 8);
}

@Injectable({ providedIn: 'root' })
export class Repo {
  readonly db = db;

  async init(): Promise<void> {
    if ((await db.standardRounds.count()) === 0) {
      await db.standardRounds.bulkAdd(BUILT_IN_ROUNDS as StandardRound[]);
    }
    // Rounds and definitions on a face that is now a scoring of another face move over.
    for (const r of await db.rounds.filter((r) => upgradeFace({ ...r })).toArray()) {
      upgradeFace(r);
      await db.rounds.put(r);
      await this.recomputeRound(r.id!);
    }
    await db.standardRounds
      .filter((s) => upgradeFace({ ...s.round }))
      .modify((s) => void upgradeFace(s.round));
    // Scores saved before ends were counted: fill them in once.
    const stale = await db.rounds.filter((r) => r.score.ends === undefined).toArray();
    for (const r of stale) await this.recomputeRound(r.id!);
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted()))
        await navigator.storage.persist();
    } catch {
      /* not supported */
    }
  }

  // ---------- sessions ----------

  sessionsNewestFirst(): Promise<Session[]> {
    return db.sessions
      .orderBy('date')
      .reverse()
      .toArray()
      .then((ts) =>
        ts.sort((a, b) =>
          a.date === b.date ? (b.id ?? 0) - (a.id ?? 0) : a.date < b.date ? 1 : -1,
        ),
      );
  }

  async createSession(
    t: Omit<Session, 'id' | 'score' | 'createdAt'>,
    rounds: RoundTemplate[],
  ): Promise<number> {
    return db.transaction('rw', db.sessions, db.rounds, async () => {
      const id = await db.sessions.add({
        ...t,
        score: { ...EMPTY_SCORE },
        createdAt: Date.now(),
      } as Session);
      await db.rounds.bulkAdd(
        rounds.map((r, i): Round => ({
          sessionId: id,
          index: i,
          shotsPerEnd: r.shotsPerEnd,
          maxEndCount: r.endCount || null,
          distance: r.distance,
          targetId: r.targetId,
          scoringStyle: r.scoringStyle,
          targetDiameter: r.targetDiameter,
          comment: '',
          score: { ...EMPTY_SCORE },
          startTarget: r.startTarget && r.startTarget > 1 ? r.startTarget : null,
        })),
      );
      return id;
    });
  }

  async updateSession(t: Session): Promise<void> {
    await db.sessions.put(t);
  }

  async deleteSession(id: number): Promise<void> {
    await db.transaction('rw', [db.sessions, db.rounds, db.ends, db.images], async () => {
      const rounds = await db.rounds.where('sessionId').equals(id).toArray();
      for (const r of rounds) await this.deleteEnds(r.id!);
      await db.rounds.where('sessionId').equals(id).delete();
      await db.sessions.delete(id);
    });
  }

  // ---------- rounds ----------

  roundsOf(sessionId: number): Promise<Round[]> {
    return db.rounds.where('sessionId').equals(sessionId).sortBy('index');
  }

  async addRound(sessionId: number, tpl: RoundTemplate): Promise<number> {
    const existing = await this.roundsOf(sessionId);
    return db.rounds.add({
      sessionId,
      index: existing.length,
      shotsPerEnd: tpl.shotsPerEnd,
      maxEndCount: tpl.endCount || null,
      distance: tpl.distance,
      targetId: tpl.targetId,
      scoringStyle: tpl.scoringStyle,
      targetDiameter: tpl.targetDiameter,
      comment: '',
      score: { ...EMPTY_SCORE },
      startTarget: tpl.startTarget && tpl.startTarget > 1 ? tpl.startTarget : null,
    });
  }

  async updateRound(r: Round): Promise<void> {
    await db.rounds.put(r);
    await this.recomputeRound(r.id!);
  }

  async deleteRound(id: number): Promise<void> {
    const r = await db.rounds.get(id);
    if (!r) return;
    await db.transaction('rw', [db.sessions, db.rounds, db.ends, db.images], async () => {
      await this.deleteEnds(id);
      await db.rounds.delete(id);
      const rest = await this.roundsOf(r.sessionId);
      await Promise.all(rest.map((x, i) => db.rounds.update(x.id!, { index: i })));
      await this.recomputeSession(r.sessionId);
    });
  }

  // ---------- ends ----------

  endsOf(roundId: number): Promise<End[]> {
    return db.ends.where('roundId').equals(roundId).sortBy('index');
  }

  async saveEnd(e: End): Promise<number> {
    const id = await db.ends.put(e);
    await this.recomputeRound(e.roundId);
    return id;
  }

  async deleteEnd(id: number): Promise<void> {
    const e = await db.ends.get(id);
    if (!e) return;
    await db.ends.delete(id);
    if (e.imageIds?.length) await db.images.bulkDelete(e.imageIds);
    const rest = await this.endsOf(e.roundId);
    await Promise.all(rest.map((x, i) => db.ends.update(x.id!, { index: i })));
    await this.recomputeRound(e.roundId);
  }

  private async deleteEnds(roundId: number) {
    const ends = await db.ends.where('roundId').equals(roundId).toArray();
    const imgs = ends.flatMap((e) => e.imageIds ?? []);
    if (imgs.length) await db.images.bulkDelete(imgs);
    await db.ends.where('roundId').equals(roundId).delete();
  }

  // ---------- cached scores ----------

  async recomputeRound(roundId: number): Promise<void> {
    const r = await db.rounds.get(roundId);
    if (!r) return;
    const t = getTarget(r.targetId);
    const ends = await this.endsOf(roundId);
    const score = { ...EMPTY_SCORE, perEnd: isFirstHitStyle(t, r.scoringStyle) };
    for (const e of ends) {
      const s = scoreEnd(t, r.scoringStyle, e.shots);
      const shot = e.shots.filter((x) => x.ring !== -2).length;
      score.reached += s.reached;
      score.total += s.total;
      score.shots += shot;
      if (shot) score.ends! += 1;
    }
    await db.rounds.update(roundId, { score });
    await this.recomputeSession(r.sessionId);
  }

  async recomputeSession(sessionId: number): Promise<void> {
    const rounds = await this.roundsOf(sessionId);
    const score = rounds.reduce(
      (a, r) => ({
        reached: a.reached + r.score.reached,
        total: a.total + r.score.total,
        shots: a.shots + r.score.shots,
        ends: a.ends! + (r.score.ends ?? 0),
        perEnd: a.perEnd,
      }),
      {
        ...EMPTY_SCORE,
        // Per target only when every round that has been shot is a first-hit round.
        perEnd:
          rounds.some((r) => r.score.ends) &&
          rounds.filter((r) => r.score.ends).every((r) => r.score.perEnd),
      },
    );
    await db.sessions.update(sessionId, { score });
  }

  // ---------- equipment ----------

  bows(): Promise<Bow[]> {
    return db.bows.orderBy('name').toArray();
  }
  arrows(): Promise<Arrow[]> {
    return db.arrows.orderBy('name').toArray();
  }
  async saveBow(b: Bow): Promise<number> {
    return db.bows.put(b);
  }
  async saveArrow(a: Arrow): Promise<number> {
    return db.arrows.put(a);
  }
  async deleteBow(id: number): Promise<void> {
    const b = await db.bows.get(id);
    await db.transaction('rw', db.bows, db.sessions, db.images, async () => {
      await db.sessions.where('bowId').equals(id).modify({ bowId: null });
      if (b?.imageId) await db.images.delete(b.imageId);
      await db.bows.delete(id);
    });
  }
  async deleteArrow(id: number): Promise<void> {
    const a = await db.arrows.get(id);
    await db.transaction('rw', db.arrows, db.sessions, db.images, async () => {
      await db.sessions.where('arrowId').equals(id).modify({ arrowId: null });
      if (a?.imageId) await db.images.delete(a.imageId);
      await db.arrows.delete(id);
    });
  }

  // ---------- standard rounds ----------

  standardRounds(): Promise<StandardRound[]> {
    return db.standardRounds.toArray().then((l) => l.sort((a, b) => a.name.localeCompare(b.name)));
  }

  async saveStandardRound(s: StandardRound): Promise<number> {
    return db.standardRounds.put(s);
  }

  /** Deletes a round definition; sessions shot with it keep their rounds. */
  async deleteStandardRound(id: number): Promise<void> {
    await db.transaction('rw', db.standardRounds, db.sessions, async () => {
      await db.sessions.filter((t) => t.standardRoundId === id).modify({ standardRoundId: null });
      await db.standardRounds.delete(id);
    });
  }

  // ---------- settings ----------

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const s = await db.settings.get(key);
    return (s?.value as T) ?? fallback;
  }
  async setSetting(key: string, value: unknown): Promise<void> {
    await db.settings.put({ key, value });
  }
}

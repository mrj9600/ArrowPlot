import { Injectable, Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { liveQuery } from 'dexie';
import { from } from 'rxjs';
import { db } from './db';
import { Arrow, Bow, End, Round, RoundTemplate, Score, StandardRound, Training } from './models';
import { BUILT_IN_ROUNDS } from './standard-rounds';
import { getTarget, scoreEnd } from './targets';

export const EMPTY_SCORE: Score = { reached: 0, total: 0, shots: 0 };

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
    try {
      if (navigator.storage?.persist && !(await navigator.storage.persisted()))
        await navigator.storage.persist();
    } catch {
      /* not supported */
    }
  }

  // ---------- trainings ----------

  trainingsNewestFirst(): Promise<Training[]> {
    return db.trainings
      .orderBy('date')
      .reverse()
      .toArray()
      .then((ts) =>
        ts.sort((a, b) =>
          a.date === b.date ? (b.id ?? 0) - (a.id ?? 0) : a.date < b.date ? 1 : -1,
        ),
      );
  }

  async createTraining(
    t: Omit<Training, 'id' | 'score' | 'createdAt'>,
    rounds: RoundTemplate[],
  ): Promise<number> {
    return db.transaction('rw', db.trainings, db.rounds, async () => {
      const id = await db.trainings.add({
        ...t,
        score: { ...EMPTY_SCORE },
        createdAt: Date.now(),
      } as Training);
      await db.rounds.bulkAdd(
        rounds.map((r, i): Round => ({
          trainingId: id,
          index: i,
          shotsPerEnd: r.shotsPerEnd,
          maxEndCount: r.endCount || null,
          distance: r.distance,
          targetId: r.targetId,
          scoringStyle: r.scoringStyle,
          targetDiameter: r.targetDiameter,
          comment: '',
          score: { ...EMPTY_SCORE },
        })),
      );
      return id;
    });
  }

  async updateTraining(t: Training): Promise<void> {
    await db.trainings.put(t);
  }

  async deleteTraining(id: number): Promise<void> {
    await db.transaction('rw', [db.trainings, db.rounds, db.ends, db.images], async () => {
      const rounds = await db.rounds.where('trainingId').equals(id).toArray();
      for (const r of rounds) await this.deleteEnds(r.id!);
      await db.rounds.where('trainingId').equals(id).delete();
      await db.trainings.delete(id);
    });
  }

  // ---------- rounds ----------

  roundsOf(trainingId: number): Promise<Round[]> {
    return db.rounds.where('trainingId').equals(trainingId).sortBy('index');
  }

  async addRound(trainingId: number, tpl: RoundTemplate): Promise<number> {
    const existing = await this.roundsOf(trainingId);
    return db.rounds.add({
      trainingId,
      index: existing.length,
      shotsPerEnd: tpl.shotsPerEnd,
      maxEndCount: tpl.endCount || null,
      distance: tpl.distance,
      targetId: tpl.targetId,
      scoringStyle: tpl.scoringStyle,
      targetDiameter: tpl.targetDiameter,
      comment: '',
      score: { ...EMPTY_SCORE },
    });
  }

  async updateRound(r: Round): Promise<void> {
    await db.rounds.put(r);
    await this.recomputeRound(r.id!);
  }

  async deleteRound(id: number): Promise<void> {
    const r = await db.rounds.get(id);
    if (!r) return;
    await db.transaction('rw', [db.trainings, db.rounds, db.ends, db.images], async () => {
      await this.deleteEnds(id);
      await db.rounds.delete(id);
      const rest = await this.roundsOf(r.trainingId);
      await Promise.all(rest.map((x, i) => db.rounds.update(x.id!, { index: i })));
      await this.recomputeTraining(r.trainingId);
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
    const score = { ...EMPTY_SCORE };
    for (const e of ends) {
      const s = scoreEnd(t, r.scoringStyle, e.shots);
      score.reached += s.reached;
      score.total += s.total;
      score.shots += e.shots.filter((x) => x.ring !== -2).length;
    }
    await db.rounds.update(roundId, { score });
    await this.recomputeTraining(r.trainingId);
  }

  async recomputeTraining(trainingId: number): Promise<void> {
    const rounds = await this.roundsOf(trainingId);
    const score = rounds.reduce(
      (a, r) => ({
        reached: a.reached + r.score.reached,
        total: a.total + r.score.total,
        shots: a.shots + r.score.shots,
      }),
      { ...EMPTY_SCORE },
    );
    await db.trainings.update(trainingId, { score });
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
    await db.transaction('rw', db.bows, db.trainings, db.images, async () => {
      await db.trainings.where('bowId').equals(id).modify({ bowId: null });
      if (b?.imageId) await db.images.delete(b.imageId);
      await db.bows.delete(id);
    });
  }
  async deleteArrow(id: number): Promise<void> {
    const a = await db.arrows.get(id);
    await db.transaction('rw', db.arrows, db.trainings, db.images, async () => {
      await db.trainings.where('arrowId').equals(id).modify({ arrowId: null });
      if (a?.imageId) await db.images.delete(a.imageId);
      await db.arrows.delete(id);
    });
  }

  // ---------- standard rounds ----------

  standardRounds(): Promise<StandardRound[]> {
    return db.standardRounds
      .toArray()
      .then((l) =>
        l.sort(
          (a, b) =>
            Number(b.builtIn) - Number(a.builtIn) ||
            a.club.localeCompare(b.club) ||
            a.name.localeCompare(b.name),
        ),
      );
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

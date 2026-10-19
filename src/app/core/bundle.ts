import { db } from './db';
import { Arrow, Bow, End, Round, Training } from './models';
import { analyse, Analysis, plotShots } from './stats';

export interface TrainingBundle {
  training: Training;
  rounds: Round[];
  ends: Map<number, End[]>;
  bow: Bow | null;
  arrow: Arrow | null;
}

export async function loadTraining(id: number): Promise<TrainingBundle | null> {
  const training = await db.trainings.get(id);
  if (!training) return null;
  const rounds = await db.rounds.where('trainingId').equals(id).sortBy('index');
  const allEnds = await db.ends
    .where('roundId')
    .anyOf(rounds.map((r) => r.id!))
    .toArray();
  const ends = new Map<number, End[]>(rounds.map((r) => [r.id!, []]));
  for (const e of allEnds.sort((a, b) => a.index - b.index)) ends.get(e.roundId)?.push(e);
  const bow = training.bowId ? ((await db.bows.get(training.bowId)) ?? null) : null;
  const arrow = training.arrowId ? ((await db.arrows.get(training.arrowId)) ?? null) : null;
  return { training, rounds, ends, bow, arrow };
}

export function analyseBundle(b: TrainingBundle, roundIds?: number[]): Analysis {
  const rounds = roundIds ? b.rounds.filter((r) => roundIds.includes(r.id!)) : b.rounds;
  return analyse(
    rounds.flatMap((r) => plotShots(b.ends.get(r.id!) ?? [], r, b.arrow?.diameter ?? null)),
  );
}

export const isSighted = (bow: Bow | null) => bow?.type === 'recurve' || bow?.type === 'compound';

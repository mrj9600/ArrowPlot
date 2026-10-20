import { db } from './db';
import { Arrow, Bow, End, Round, Session } from './models';
import { analyse, Analysis, plotShots } from './stats';

export interface SessionBundle {
  session: Session;
  rounds: Round[];
  ends: Map<number, End[]>;
  bow: Bow | null;
  arrow: Arrow | null;
}

export async function loadSession(id: number): Promise<SessionBundle | null> {
  const session = await db.sessions.get(id);
  if (!session) return null;
  const rounds = await db.rounds.where('sessionId').equals(id).sortBy('index');
  const allEnds = await db.ends
    .where('roundId')
    .anyOf(rounds.map((r) => r.id!))
    .toArray();
  const ends = new Map<number, End[]>(rounds.map((r) => [r.id!, []]));
  for (const e of allEnds.sort((a, b) => a.index - b.index)) ends.get(e.roundId)?.push(e);
  const bow = session.bowId ? ((await db.bows.get(session.bowId)) ?? null) : null;
  const arrow = session.arrowId ? ((await db.arrows.get(session.arrowId)) ?? null) : null;
  return { session, rounds, ends, bow, arrow };
}

export function analyseBundle(b: SessionBundle, roundIds?: number[]): Analysis {
  const rounds = roundIds ? b.rounds.filter((r) => roundIds.includes(r.id!)) : b.rounds;
  return analyse(
    rounds.flatMap((r) => plotShots(b.ends.get(r.id!) ?? [], r, b.arrow?.diameter ?? null)),
  );
}

export const isSighted = (bow: Bow | null) => bow?.type === 'recurve' || bow?.type === 'compound';

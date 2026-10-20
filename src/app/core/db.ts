import Dexie, { Table } from 'dexie';
import { Arrow, Bow, End, Round, Setting, StandardRound, StoredImage, Session } from './models';

export class ArrowPlotDb extends Dexie {
  bows!: Table<Bow, number>;
  arrows!: Table<Arrow, number>;
  sessions!: Table<Session, number>;
  rounds!: Table<Round, number>;
  ends!: Table<End, number>;
  images!: Table<StoredImage, number>;
  standardRounds!: Table<StandardRound, number>;
  settings!: Table<Setting, string>;

  constructor() {
    super('arrowplot');
    // Version 2 renamed the session table and its round index; older data is not carried over.
    this.version(2).stores({
      bows: '++id, name, sourceRef',
      arrows: '++id, name, sourceRef',
      sessions: '++id, date, bowId, arrowId, sourceRef',
      rounds: '++id, sessionId, [sessionId+index]',
      ends: '++id, roundId, [roundId+index]',
      images: '++id',
      standardRounds: '++id, name, sourceRef',
      settings: 'key',
    });
  }
}

export const db = new ArrowPlotDb();

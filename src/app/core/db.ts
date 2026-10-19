import Dexie, { Table } from 'dexie';
import { Arrow, Bow, End, Round, Setting, StandardRound, StoredImage, Training } from './models';

export class ArrowPlotDb extends Dexie {
  bows!: Table<Bow, number>;
  arrows!: Table<Arrow, number>;
  trainings!: Table<Training, number>;
  rounds!: Table<Round, number>;
  ends!: Table<End, number>;
  images!: Table<StoredImage, number>;
  standardRounds!: Table<StandardRound, number>;
  settings!: Table<Setting, string>;

  constructor() {
    super('arrowplot');
    this.version(1).stores({
      bows: '++id, name, sourceRef',
      arrows: '++id, name, sourceRef',
      trainings: '++id, date, bowId, arrowId, sourceRef',
      rounds: '++id, trainingId, [trainingId+index]',
      ends: '++id, roundId, [roundId+index]',
      images: '++id',
      standardRounds: '++id, name, sourceRef',
      settings: 'key',
    });
  }
}

export const db = new ArrowPlotDb();

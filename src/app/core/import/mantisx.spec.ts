import { dim } from '../dimension';
import { mantisRing, MantisImportOptions, parseCsv, parseMantis, planSession } from './mantisx';

const CSV = [
  'MantisX Archery Export',
  '',
  'Session ID,Date,Time Stamp,Shot #,Target X,Target Y,Target Score',
  '7,2026-10-15 18:05:00,2026-10-15 18:05:10.000,1,0.5,0.5,X',
  '7,2026-10-15 18:05:00,2026-10-15 18:06:10.000,2,0.55,0.5,10',
  '7,2026-10-15 18:05:00,2026-10-15 18:07:10.000,3,,,8',
  '7,2026-10-15 18:05:00,2026-10-15 18:08:10.000,4,0.5,0.9,2',
].join('\r\n');

const options: MantisImportOptions = {
  title: 'MantisX',
  bowId: null,
  arrowId: null,
  arrowDiameter: dim(5, 'mm'),
  distance: dim(18, 'm'),
  faceCm: 40,
  scoringStyle: 0,
  shotsPerEnd: 3,
  keepMantisScore: true,
};

describe('MantisX import', () => {
  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,"b,c","d ""e"""\n1,2,3')).toEqual([
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('maps MantisX scores to WA zones', () => {
    expect([
      mantisRing('X'),
      mantisRing('10'),
      mantisRing('1'),
      mantisRing('M'),
      mantisRing(''),
    ]).toEqual([0, 1, 10, -1, -1]);
  });

  it('groups shots by session and converts positions to face radius units', () => {
    const [s] = parseMantis(CSV);
    expect(s.sid).toBe('7');
    expect(s.date).toBe('2026-10-15');
    expect(s.totalRows).toBe(4);
    expect(s.shots.length).toBe(3); // one shot has no position
    expect(s.shots[1].x).toBeCloseTo(0.1);
    expect(s.shots[2].y).toBeCloseTo(0.8);
  });

  it('keeps the MantisX score for arrows on a line when asked', () => {
    const [s] = parseMantis(CSV);
    // The second arrow sits exactly on the 10/9 line; MantisX scored it 10.
    const plan = planSession(s, options);
    expect(plan.ends.length).toBe(1);
    expect(plan.reached).toBe(plan.mantisPoints);
    expect(plan.ends[0].map((x) => x.z)).toEqual([0, 1, 9]);
  });

  it('rejects files without target columns', () => {
    expect(() => parseMantis('a,b\n1,2')).toThrowError(/Target X/);
  });
});

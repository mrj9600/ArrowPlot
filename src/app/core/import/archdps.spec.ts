import { MISS } from '../models';
import { ArchDpsFile, ArchResult, ArchSession, planArchDps } from './archdps';

function file(sessions: Partial<ArchSession>[], results: Partial<ArchResult>[]): ArchDpsFile {
  const full = sessions.map((s, i): ArchSession => ({
    eventId: i + 1,
    ref: `archdps:${i + 1}:1`,
    playerId: 1,
    name: 'Course',
    date: '2026-07-10',
    location: '',
    typeId: 10000,
    arrowsPerTarget: 2,
    total: 0,
    ...s,
  }));
  const map = new Map<string, ArchResult[]>();
  for (const r of results) {
    const res: ArchResult = {
      eventId: 1,
      playerId: 1,
      target: 1,
      arrow: 1,
      kill: 0,
      points: 0,
      x: null,
      y: null,
      ...r,
    };
    const k = `${res.eventId}:${res.playerId}`;
    map.set(k, [...(map.get(k) ?? []), res]);
  }
  return { fileName: 'test', players: [], sessions: full, results: map };
}

describe('3D SKill Board import', () => {
  it('scores 3D sessions where both arrows count (11/10/8/5)', () => {
    const f = file(
      [{ total: 11 + 8 + 10 + 5 }],
      [
        { target: 1, arrow: 1, kill: 1, points: 11 },
        { target: 1, arrow: 2, kill: 3, points: 8 },
        { target: 2, arrow: 1, kill: 2, points: 10 },
        { target: 2, arrow: 2, kill: 4, points: 5 },
      ],
    );
    const [p] = planArchDps(f, 1, new Set()).planned;
    expect(p.type.targetId).toBe(17);
    expect(p.ends.length).toBe(2);
    expect(p.reached).toBe(34);
    expect(p.matches).toBe(true);
  });

  it('counts only the first hit on IFAA rounds, by arrow number', () => {
    const f = file(
      [{ typeId: 11271, arrowsPerTarget: 1, total: 16 }],
      [
        { target: 1, arrow: 1, kill: 0, points: 0 },
        { target: 1, arrow: 2, kill: 1, points: 16 },
      ],
    );
    const [p] = planArchDps(f, 1, new Set()).planned;
    expect(p.ends[0].shots.map((s) => [s.index, s.ring])).toEqual([
      [0, MISS],
      [1, 0],
    ]);
    expect(p.reached).toBe(16);
    expect(p.shotsPerEnd).toBe(2);
  });

  it('keeps negative points on DGS rounds', () => {
    const f = file(
      [{ typeId: 10863, arrowsPerTarget: 1, total: 5 + 3 - 1 - 1 }],
      [
        { target: 1, kill: 1, points: 5 },
        { target: 2, kill: 2, points: 3 },
        { target: 3, kill: 3, points: -1 },
        { target: 4, kill: 0, points: -1 },
      ],
    );
    const [p] = planArchDps(f, 1, new Set()).planned;
    expect(p.reached).toBe(6);
    expect(p.matches).toBe(true);
  });

  it('converts 10-ring tap positions and marks complete ends as plotted', () => {
    const f = file(
      [{ typeId: 10500, arrowsPerTarget: 3, total: 27 }],
      [
        { target: 1, arrow: 1, kill: 3, points: 9, x: 49, y: -49 },
        { target: 1, arrow: 2, kill: 3, points: 9, x: 0, y: 70 },
        { target: 1, arrow: 3, kill: 3, points: 9, x: -60, y: 0 },
      ],
    );
    const [p] = planArchDps(f, 1, new Set()).planned;
    expect(p.ends[0].exact).toBe(true);
    expect(p.ends[0].shots[0].x).toBeCloseTo(0.1);
    expect(p.ends[0].shots[0].y).toBeCloseTo(-0.1);
    expect(p.ends[0].shots[0].ring).toBe(2);
  });

  it('numbers counted arrows in order and skips unknown scoring types', () => {
    const f = file(
      [
        { typeId: 10500, arrowsPerTarget: 3, total: 19 },
        { typeId: 99999, total: 0 },
      ],
      [
        { target: 1, arrow: 1, kill: 2, points: 10 },
        { target: 1, arrow: 1, kill: 3, points: 9 },
        { target: 1, arrow: 1, kill: 0, points: 0 },
        { eventId: 2, target: 1, arrow: 1, kill: 1, points: 5 },
      ],
    );
    const plan = planArchDps(f, 1, new Set(['archdps:1:1']));
    expect(plan.planned[0].ends[0].shots.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(plan.planned[0].exists).toBe(true);
    expect(plan.skipped.map((s) => s.reason)).toEqual(['unknown scoring type 99999']);
  });
});

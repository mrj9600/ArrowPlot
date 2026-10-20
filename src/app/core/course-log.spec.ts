import { analyseCourseLog, angleText, LogEntry } from './course-log';

const e = (
  estimated: number,
  measured: number,
  extra: Partial<LogEntry['log']> = {},
  points = 10,
) => ({
  log: { estimated, measured, ...extra },
  points,
  max: 11,
});

describe('course log analysis', () => {
  it('shows how far off judging is, overall and by distance', () => {
    const a = analyseCourseLog([e(22, 20), e(18, 20), e(33, 30)]);
    expect(a.all.n).toBe(3);
    expect(a.all.bias).toBeCloseTo(1);
    expect(a.all.off).toBeCloseTo(7 / 3);
    expect(a.byDistance.map((r) => r.label)).toEqual(['20–30 m', '30–40 m']);
    expect(a.byDistance[1].biasPct).toBeCloseTo(10);
  });

  it('groups by condition and by angle, scoring targets without distances too', () => {
    const a = analyseCourseLog([
      e(25, 20, { conditions: ['dark', 'darkAnimal'], angle: -25 }, 5),
      e(20, 20, { conditions: ['dark'], angle: 0 }, 11),
      { log: { angle: -22 }, points: 8, max: 11 },
    ]);
    const dark = a.byCondition.find((r) => r.label === 'Very dark')!;
    expect(dark.n).toBe(2);
    expect(dark.biasPct).toBeCloseTo(12.5);
    const steep = a.byAngle.find((r) => r.label.startsWith('Steep downhill'))!;
    expect(steep.targets).toBe(2);
    expect(steep.score).toBeCloseTo(6.5);
  });

  it('describes angles in words', () => {
    expect(angleText(0)).toBe('Level');
    expect(angleText(-25)).toBe('25° steeply downhill');
    expect(angleText(5)).toBe('5° slightly uphill');
  });
});

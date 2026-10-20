import { endLimit, targetNumber, usesTargetNumbers } from './numbering';

describe('target numbering', () => {
  it('wraps to 1 after the last target when the end count is known', () => {
    const r = { startTarget: 17, maxEndCount: 24, wrapAt: null };
    expect([0, 7, 8, 23].map((i) => targetNumber(r, i))).toEqual([17, 24, 1, 16]);
  });

  it('counts up from the start without an end count until the course size is known', () => {
    expect(targetNumber({ startTarget: 5, maxEndCount: null, wrapAt: null }, 30)).toBe(35);
    const known = { startTarget: 25, maxEndCount: null, wrapAt: 28 };
    expect([0, 3, 4, 5].map((i) => targetNumber(known, i))).toEqual([25, 28, 1, 2]);
  });

  it('ends a wrapped open-ended round when the start target comes back', () => {
    expect(endLimit({ maxEndCount: null, wrapAt: null })).toBeNull();
    expect(endLimit({ maxEndCount: null, wrapAt: 28 })).toBe(28);
    expect(endLimit({ maxEndCount: 12, wrapAt: null })).toBe(12);
  });

  it('starts at 1 by default and only applies to 3D and field faces', () => {
    expect(targetNumber({ startTarget: null, maxEndCount: 10, wrapAt: null }, 0)).toBe(1);
    expect(usesTargetNumbers({ targetId: 17 })).toBe(true);
    expect(usesTargetNumbers({ targetId: 13 })).toBe(true);
    expect(usesTargetNumbers({ targetId: 0 })).toBe(false);
  });
});

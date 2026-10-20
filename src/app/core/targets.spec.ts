import { dim } from './dimension';
import { MISS, NOT_ENTERED, Shot } from './models';
import {
  firstHitEndComplete,
  getTarget,
  isFirstHitStyle,
  relativeArrowRadius,
  scoreEnd,
  selectableZones,
  zoneAt,
  zoneLabel,
} from './targets';

const shot = (index: number, ring: number): Shot => ({ index, x: 0, y: 0, ring });

describe('targets', () => {
  const full = getTarget(0);

  it('scores WA full face zones (X = 10, M = 0)', () => {
    const s = scoreEnd(full, 0, [shot(0, 0), shot(1, 1), shot(2, 10), shot(3, MISS)]);
    expect(s).toEqual({ reached: 10 + 10 + 1 + 0, total: 40 });
    expect(zoneLabel(full, 0, 0)).toBe('X');
    expect(zoneLabel(full, 1, 0)).toBe('10');
    expect(zoneLabel(full, 0, MISS)).toBe('M');
  });

  it('counts not-entered arrows towards the maximum only', () => {
    expect(scoreEnd(full, 0, [shot(0, 2), shot(1, NOT_ENTERED)])).toEqual({
      reached: 9,
      total: 20,
    });
  });

  it('gives line cutters the higher ring, using arrow radius plus half a line', () => {
    const r = relativeArrowRadius(full, dim(40, 'cm'), dim(5, 'mm'));
    expect(r).toBeCloseTo((2.5 + 1) / 200);
    // Centre exactly on the 10/9 line (radius 0.1): the arrow touches the 10.
    expect(zoneAt(full, 0.1, 0, r)).toBe(1);
    // Clearly inside the 9, more than an arrow radius from the line.
    expect(zoneAt(full, 0.13, 0, r)).toBe(2);
    expect(zoneAt(full, 1.2, 0, r)).toBe(MISS);
  });

  it('uses the real size of reduced faces', () => {
    const fiveRing = getTarget(2);
    // A 40 cm 5-ring face is 20 cm across, so the reach is twice as big relative to it.
    expect(relativeArrowRadius(fiveRing, dim(40, 'cm'), dim(5, 'mm'))).toBeCloseTo((2.5 + 1) / 100);
    // Its rings keep their real size: the 10 ring is 4 cm across on both faces.
    expect((fiveRing.zones[1] as { r: number }).r * fiveRing.realSizeFactor).toBeCloseTo(0.1);
  });

  it('collapses equal labels on the keypad', () => {
    const labels = selectableZones(full, 1).map((z) => z.label);
    expect(labels).toEqual(['10', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'M']);
  });

  it('scores arrow-aware animal faces by the first hit only', () => {
    const ifaa = getTarget(20);
    // Style 0: first arrow 20/18, second 16/14, third 12/10.
    expect(scoreEnd(ifaa, 0, [shot(0, MISS), shot(1, 0), shot(2, 0)])).toEqual({
      reached: 16,
      total: 20,
    });
  });

  it('keeps the MyTargets zone and style layout for imported shots', () => {
    // [target id, zone count, style count] as MyTargets backups expect them.
    const layout: [number, number, number][] = [
      [0, 11, 7],
      [1, 7, 6],
      [2, 6, 6],
      [3, 4, 6],
      [4, 6, 6],
      [5, 6, 6],
      [6, 4, 6],
      [7, 6, 2],
      [8, 6, 1],
      [9, 4, 2],
      [10, 6, 3],
      [11, 4, 3],
      [12, 5, 1],
      [13, 6, 2],
      [14, 2, 1],
      [15, 7, 1],
      [16, 9, 1],
      [17, 5, 1],
      [18, 5, 1],
      [19, 11, 5],
      [20, 2, 4],
      [21, 3, 6],
      [22, 3, 1],
      [23, 8, 1],
      [24, 3, 1],
      [25, 6, 2],
      [26, 4, 6],
      [27, 4, 6],
      [28, 3, 1],
    ];
    for (const [id, zones, styles] of layout) {
      const t = getTarget(id);
      expect([t.id, t.zones.length, t.styles.length]).toEqual([id, zones, styles]);
    }
    expect(getTarget(5).faces.length).toBe(3);
    expect(getTarget(11).faces.length).toBe(5);
    expect(getTarget(27).faces.length).toBe(6);
  });

  it('finishes first-hit ends at the first scoring arrow', () => {
    const ifaa = getTarget(20);
    const end = (rings: number[]) => rings.map((r, i) => shot(i, r));
    expect(isFirstHitStyle(ifaa, 0)).toBe(true);
    expect(isFirstHitStyle(full, 0)).toBe(false);
    // Hit with the first arrow: done, the other two are not shot.
    expect(firstHitEndComplete(ifaa, 0, end([0, NOT_ENTERED, NOT_ENTERED]))).toBe(true);
    // Miss, then a hit: done.
    expect(firstHitEndComplete(ifaa, 0, end([MISS, 1, NOT_ENTERED]))).toBe(true);
    // Hit entered for arrow 2 but arrow 1 missing: not done.
    expect(firstHitEndComplete(ifaa, 0, end([NOT_ENTERED, 1, NOT_ENTERED]))).toBe(false);
    // Three misses: done; two misses: not yet.
    expect(firstHitEndComplete(ifaa, 0, end([MISS, MISS, MISS]))).toBe(true);
    expect(firstHitEndComplete(ifaa, 0, end([MISS, MISS, NOT_ENTERED]))).toBe(false);
    // Second arrow in the body: 14 points.
    expect(scoreEnd(ifaa, 0, end([MISS, 1, NOT_ENTERED])).reached).toBe(14);
  });

  it('names 3D scoring and keypad buttons after the zones', () => {
    expect(getTarget(19).styles[0].name).toBe(
      'Green 8 · Small yellow 12 · Yellow 11 · Red 12 · 10 ring 10 · Vital 8 · Body 0',
    );
    expect(getTarget(15).styles[0].name).toBe('Yellow 12 · 10 ring 10 · Vital 8 · Body 5');
    expect(getTarget(20).styles[0].name).toBe('1st/2nd/3rd arrow: Vital 20/16/12 · Body 18/14/10');
    // WA faces keep their own names.
    expect(getTarget(0).styles[0].name).toBe('Recurve (X, 10–1)');
    const keys = selectableZones(getTarget(19), 0).map((z) => `${z.label}:${z.name ?? ''}`);
    expect(keys).toEqual([
      '8:Green / Vital',
      '12:Yellow / Red',
      '11:Yellow',
      '10:10 ring',
      'M:Body',
    ]);
  });
});

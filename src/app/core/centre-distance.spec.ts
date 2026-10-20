import { centreOffsetCm, gridRadius, guessCentreCm, nearestStep } from './centre-distance';
import { FIXED_3D_SIZE, getTarget } from './targets';

describe('centre distance (3D)', () => {
  const ibo = getTarget(17);

  it('snaps to the nearest slider step', () => {
    expect(nearestStep(0.2)).toBe(0);
    expect(nearestStep(7.2)).toBe(nearestStep(8));
    expect(nearestStep(500)).toBe(nearestStep(80));
  });

  it('measures from the centre of the vital area', () => {
    expect(guessCentreCm(ibo, FIXED_3D_SIZE, 0.05, 0.05)).toBe(0);
    expect(guessCentreCm(ibo, FIXED_3D_SIZE, 0.05, 0.3)).toBeGreaterThan(0);
  });

  it('keeps the plotted direction with the entered distance', () => {
    const p = centreOffsetCm(ibo, FIXED_3D_SIZE, { x: 0.05, y: 0.55, cm: 6 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(6);
    const left = centreOffsetCm(ibo, FIXED_3D_SIZE, { x: -0.95, y: 0.05, cm: 40 });
    expect(left.x).toBeCloseTo(-40);
  });

  it('picks a grid that fits the arrows', () => {
    expect(gridRadius(4)).toBe(10);
    expect(gridRadius(15)).toBe(20);
    expect(gridRadius(70)).toBe(80);
  });
});

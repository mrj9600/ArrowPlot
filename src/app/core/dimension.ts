import { Dimension, LengthUnit } from './models';

/** Units per metre. */
const FACTOR: Record<LengthUnit, number> = {
  cm: 100,
  in: 39.3701,
  m: 1,
  yd: 1.09361,
  ft: 3.28084,
  mm: 1000,
};

/** Nominal body size of 3D animals per size class, in cm (used only to size the drawing). */
const NOMINAL_3D_CM: Record<number, number> = { [-6]: 25, [-5]: 40, [-4]: 60, [-3]: 80, [-2]: 100 };

export const dim = (value: number, unit: LengthUnit | null): Dimension => ({ value, unit });

/** Parses MyTargets' "<value> <unit>" strings, e.g. "18.0 m", "-4.0 null". */
export function parseDimension(s: string | null | undefined): Dimension {
  if (!s) return { value: -1, unit: null };
  const i = s.indexOf(' ');
  const value = parseFloat(i < 0 ? s : s.slice(0, i));
  const u = (i < 0 ? '' : s.slice(i + 1).trim()) as LengthUnit;
  const unit = u in FACTOR ? u : null;
  return { value: isFinite(value) ? value : -1, unit: value < 0 ? null : unit };
}

export function formatDimension(d: Dimension | null | undefined): string {
  if (!d) return '';
  // -1 means not recorded (e.g. imported sessions without a distance): show nothing.
  if (d.value === -1) return '';
  // Unitless 3D size classes are not shown: a 3D round has animals of every size.
  if (d.unit === null) return '';
  const v = Math.round(d.value * 10) / 10;
  return `${v}${d.unit === 'm' || d.unit === 'yd' ? ' ' : ''}${d.unit}`;
}

export function convert(d: Dimension, unit: LengthUnit): number {
  if (d.unit === null) {
    // Unitless 3D/animal sizes (-6 mini … -2 extra large): nominal animal sizes.
    const nominalCm = NOMINAL_3D_CM[Math.round(d.value)] ?? 50;
    return convert({ value: nominalCm, unit: 'cm' }, unit);
  }
  return (d.value * FACTOR[unit]) / FACTOR[d.unit];
}

export const sameDimension = (a: Dimension, b: Dimension) =>
  a.unit === b.unit && Math.abs(a.value - b.value) < 1e-6;

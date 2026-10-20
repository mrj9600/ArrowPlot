import { Score } from './models';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtDate(iso: string, withDay = false): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const day = withDay ? `${DAYS[new Date(y, m - 1, d).getDay()]} ` : '';
  return `${day}${d} ${MONTHS[m - 1]} ${y}`;
}

export function fmtMonth(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '–');
/** Average per arrow, or per target on rounds where only the first hit counts. */
export const avg = (s: Score) =>
  s.perEnd && s.ends
    ? `${(s.reached / s.ends).toFixed(2)}/target`
    : s.shots
      ? (s.reached / s.shots).toFixed(2)
      : '–';
export const f1 = (v: number) => (isFinite(v) ? v.toFixed(1) : '–');

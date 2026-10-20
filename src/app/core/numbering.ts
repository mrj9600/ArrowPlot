import { Round } from './models';
import { getTarget } from './targets';

/** 3D and field rounds are scored per target (post) and can start anywhere on the course. */
export function usesTargetNumbers(r: Pick<Round, 'targetId'>): boolean {
  const kind = getTarget(r.targetId).kind;
  return kind === '3d' || kind === 'field';
}

/**
 * The target number of the n-th end shot (0-based). Starting at target 17 of 24, ends go
 * 17 … 24, 1 … 16. Without an end count numbering only wraps once the course size is known.
 */
export function targetNumber(
  r: Pick<Round, 'startTarget' | 'maxEndCount' | 'wrapAt'>,
  endIndex: number,
): number {
  const start = r.startTarget || 1;
  const course = r.maxEndCount || r.wrapAt || 0;
  return course ? ((start - 1 + endIndex) % course) + 1 : start + endIndex;
}

/**
 * How many ends the round has, if known: its end count, or the course size once an
 * open-ended course round has wrapped around (it is done when the start target comes back).
 */
export function endLimit(r: Pick<Round, 'maxEndCount' | 'wrapAt'>): number | null {
  return r.maxEndCount || r.wrapAt || null;
}

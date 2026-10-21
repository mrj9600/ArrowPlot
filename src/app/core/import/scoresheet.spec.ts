import { MISS, NOT_ENTERED } from '../models';
import { extractJson, planSheet } from './scoresheet';
import { scoresheetPrompt } from './scoresheet-prompt';

const sheet = (rounds: unknown[], extra = {}) => ({
  format: 'arrowplot-scoresheet',
  version: 1,
  sessions: [{ date: '2026-10-18', title: 'Test', rounds }],
  ...extra,
});

describe('scoresheet import', () => {
  it('finds the JSON inside a chat answer', () => {
    const j = extractJson('Here it is:\n```json\n{"a": 1}\n```\nDone.');
    expect(j).toEqual({ a: 1 });
  });

  it('reads WA ends and checks them against the written totals', () => {
    const p = planSheet(
      sheet([
        {
          face: 0,
          scoring: 0,
          faceSize: { value: 40, unit: 'cm' },
          distance: { value: 18, unit: 'm' },
          arrowsPerEnd: 3,
          writtenTotal: 57,
          ends: [
            { arrows: ['X', '10', '9'], total: 29 },
            { arrows: ['10', '9', 'M'], total: 20 },
          ],
        },
      ]),
    );
    const r = p.sessions[0].rounds[0];
    expect(r.ends.map((e) => e.shots.map((s) => s.ring))).toEqual([
      [0, 1, 2],
      [1, 2, MISS],
    ]);
    expect(r.reached).toBe(48);
    expect(r.endMismatches).toEqual(['end 2: arrows make 19, written 20']);
    expect(r.diameter.value).toBe(40);
  });

  it('spreads a field total over the arrows and starts at the written target', () => {
    const p = planSheet(
      sheet([
        {
          face: 13,
          arrowsPerEnd: 3,
          ends: [
            { target: 9, total: 14 },
            { target: 10, total: 6 },
          ],
        },
      ]),
    );
    const r = p.sessions[0].rounds[0];
    expect(r.startTarget).toBe(9);
    expect(r.fromTotals).toBe(2);
    expect(r.reached).toBe(20);
  });

  it('handles first-hit 3D ends, from arrows or from the total', () => {
    const p = planSheet(
      sheet([
        {
          face: 20,
          scoring: 0,
          arrowsPerEnd: 3,
          ends: [{ arrows: ['M', '16'], judged: 30, measured: 27 }, { total: 20 }],
        },
      ]),
    );
    const [a, b] = p.sessions[0].rounds[0].ends;
    expect(a.shots[2].ring).toBe(NOT_ENTERED);
    expect(a.log).toEqual({ estimated: 30, measured: 27 });
    expect(p.sessions[0].rounds[0].reached).toBe(16 + 20);
    expect(b.shots[0].ring).not.toBe(MISS);
  });

  it('reports values that are not on the face', () => {
    const p = planSheet(sheet([{ face: 17, arrowsPerEnd: 1, ends: [{ arrows: ['12'] }] }]));
    expect(p.problems[0]).toContain('"12" is not a value on 3D (4 zones)');
  });

  it('lists every face in the instructions', () => {
    const text = scoresheetPrompt();
    expect(text).toContain('face 100: 3D (3 zones)');
    expect(text).toContain('arrow 2:');
  });
});

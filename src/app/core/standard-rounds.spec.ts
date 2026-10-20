import { dim } from './dimension';
import { RoundTemplate } from './models';
import { splitRoundDefinition } from './standard-rounds';

const part = (m: number, cm = 122): RoundTemplate => ({
  distance: dim(m, 'm'),
  targetId: 0,
  scoringStyle: 0,
  targetDiameter: dim(cm, 'cm'),
  shotsPerEnd: 6,
  endCount: 6,
});

describe('splitRoundDefinition', () => {
  it('keeps a one-part definition as it is', () => {
    expect(splitRoundDefinition('WA 70 m', [part(70)])).toEqual([
      { name: 'WA 70 m', round: part(70) },
    ]);
  });

  it('drops repeated parts and names the rest by distance', () => {
    const split = splitRoundDefinition('WA 1440', [part(90), part(90), part(70), part(50, 80)]);
    expect(split.map((s) => s.name)).toEqual([
      'WA 1440 (90 m)',
      'WA 1440 (70 m)',
      'WA 1440 (50 m)',
    ]);
  });

  it('names parts at the same distance by face', () => {
    const split = splitRoundDefinition('Mixed', [part(18, 40), part(18, 60)]);
    expect(split.map((s) => s.name)).toEqual([
      'Mixed (WA full face 40cm)',
      'Mixed (WA full face 60cm)',
    ]);
  });

  it('collapses identical parts into one', () => {
    expect(splitRoundDefinition('2 × 18 m', [part(18), part(18)]).map((s) => s.name)).toEqual([
      '2 × 18 m',
    ]);
  });
});

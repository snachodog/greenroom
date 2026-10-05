import { describe, it, expect } from 'vitest';
import { similarity, isDuplicate } from '../server/dedupe.js';

describe('dedupe', () => {
  it('scores identical text as 1', () => {
    expect(similarity('what game is this', 'What game is this?')).toBe(1);
  });
  it('scores unrelated text low', () => {
    expect(similarity('what game is this', 'love the new overlay colors')).toBeLessThan(0.2);
  });
  it('scores empty text as 0', () => {
    expect(similarity('', 'hello')).toBe(0);
  });
  it('flags near duplicates above 0.6', () => {
    expect(isDuplicate('how long have you played this game', ['how long have you been playing this game'])).toBe(true);
  });
  it('keeps distinct messages', () => {
    expect(isDuplicate('nice play', ['what mic are you using', 'first time here'])).toBe(false);
  });
});

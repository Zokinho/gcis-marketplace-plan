import { describe, it, expect } from 'vitest';
import { calculateProximity, getProximityLabel } from '../utils/proximity';

describe('calculateProximity', () => {
  it('returns 100 when bid equals asking price', () => {
    expect(calculateProximity(100, 100)).toBe(100);
  });

  it('returns 100 when bid is above asking price', () => {
    expect(calculateProximity(120, 100)).toBe(100);
  });

  it('returns 90 when bid is at 95% of asking price', () => {
    expect(calculateProximity(95, 100)).toBe(90);
  });

  it('returns 90 when bid is exactly 90% of asking price', () => {
    expect(calculateProximity(90, 100)).toBe(90);
  });

  it('returns 75 when bid is at 85% of asking price', () => {
    expect(calculateProximity(85, 100)).toBe(75);
  });

  it('returns 75 when bid is exactly 80% of asking price', () => {
    expect(calculateProximity(80, 100)).toBe(75);
  });

  it('returns 60 when bid is at 75% of asking price', () => {
    expect(calculateProximity(75, 100)).toBe(60);
  });

  it('returns 60 when bid is exactly 70% of asking price', () => {
    expect(calculateProximity(70, 100)).toBe(60);
  });

  it('returns ratio * 100 when bid is at 50% of asking price', () => {
    expect(calculateProximity(50, 100)).toBe(50);
  });

  it('returns minimum of 10 when bid is at 10% of asking price', () => {
    expect(calculateProximity(10, 100)).toBe(10);
  });

  it('returns minimum 10 even for very low bids (below 10%)', () => {
    expect(calculateProximity(5, 100)).toBe(10);
  });

  it('returns 50 when seller price is 0', () => {
    expect(calculateProximity(100, 0)).toBe(50);
  });

  it('returns 50 when seller price is null/undefined (falsy)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(calculateProximity(100, null as any)).toBe(50);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(calculateProximity(100, undefined as any)).toBe(50);
  });
});

describe('getProximityLabel', () => {
  it('returns "Strong offer" for score 100', () => {
    expect(getProximityLabel(100)).toBe('Strong offer');
  });

  it('returns "Strong offer" for score 90', () => {
    expect(getProximityLabel(90)).toBe('Strong offer');
  });

  it('returns "Competitive" for score 75', () => {
    expect(getProximityLabel(75)).toBe('Competitive');
  });

  it('returns "Competitive" for score 89', () => {
    expect(getProximityLabel(89)).toBe('Competitive');
  });

  it('returns "Below market" for score 60', () => {
    expect(getProximityLabel(60)).toBe('Below market');
  });

  it('returns "Below market" for score 74', () => {
    expect(getProximityLabel(74)).toBe('Below market');
  });

  it('returns "Significantly below asking" for score 50', () => {
    expect(getProximityLabel(50)).toBe('Significantly below asking');
  });

  it('returns "Significantly below asking" for score 10', () => {
    expect(getProximityLabel(10)).toBe('Significantly below asking');
  });
});

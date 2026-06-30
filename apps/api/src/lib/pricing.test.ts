import { describe, it, expect } from 'vitest';
import { estimateCostUsd } from './pricing.js';

describe('estimateCostUsd', () => {
  it('computes chat cost from per-MTok input/output rates', () => {
    // claude-opus-4-8 = $5/MTok in, $25/MTok out → 1M+1M = $30
    expect(estimateCostUsd('claude-opus-4-8', 1_000_000, 1_000_000)).toBeCloseTo(30, 6);
  });

  it('embedding models have no output cost', () => {
    expect(estimateCostUsd('text-embedding-3-small', 1_000_000, 0)).toBeCloseTo(0.02, 6);
  });

  it('unknown / fake models cost 0', () => {
    expect(estimateCostUsd('fake', 999_999, 999_999)).toBe(0);
    expect(estimateCostUsd('text-embedding-3-small', 0, 0)).toBe(0);
  });

  it('rounds to 6 decimal places (matches Decimal(10,6))', () => {
    const cost = estimateCostUsd('claude-opus-4-8', 1, 1);
    expect(cost).toBe(Math.round(cost * 1_000_000) / 1_000_000);
  });
});

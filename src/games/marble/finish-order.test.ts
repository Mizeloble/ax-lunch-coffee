import { describe, it, expect } from 'vitest';
import { orderCrossings, type Crossing } from './finish-order';

const c = (idx: number, y: number, key: number): Crossing => ({ idx, y, key });

describe('orderCrossings', () => {
  it('ranks the marble deepest past the goal line first', () => {
    const out = orderCrossings([c(0, 10.1, 0.5), c(1, 10.4, 0.5), c(2, 10.2, 0.5)]);
    expect(out.map((x) => x.idx)).toEqual([1, 2, 0]);
  });

  it('does not favour low marble indices', () => {
    // The regression this exists for: marble index is room join order, so ranking
    // by index would make the earliest joiner win every photo finish.
    const out = orderCrossings([c(0, 10.0, 0.9), c(7, 10.0, 0.1)]);
    expect(out.map((x) => x.idx)).toEqual([7, 0]);
  });

  it('is independent of the order crossings were collected in', () => {
    const crossings = [c(3, 10.2, 0.4), c(1, 10.9, 0.1), c(5, 10.2, 0.2), c(0, 9.8, 0.7)];
    const forward = orderCrossings(crossings).map((x) => x.idx);
    const reversed = orderCrossings([...crossings].reverse()).map((x) => x.idx);
    expect(reversed).toEqual(forward);
  });

  it('breaks exact ties by the seeded key, deterministically', () => {
    const tied = [c(2, 10.0, 0.8), c(4, 10.0, 0.2), c(6, 10.0, 0.5)];
    expect(orderCrossings(tied).map((x) => x.idx)).toEqual([4, 6, 2]);
    expect(orderCrossings(tied).map((x) => x.idx)).toEqual([4, 6, 2]);
  });

  it('leaves the caller-s array alone', () => {
    const crossings = [c(0, 10.0, 0.9), c(1, 10.5, 0.1)];
    orderCrossings(crossings);
    expect(crossings.map((x) => x.idx)).toEqual([0, 1]);
  });

  it('handles the common cases of zero and one crossing', () => {
    expect(orderCrossings([])).toEqual([]);
    expect(orderCrossings([c(3, 10.0, 0.5)]).map((x) => x.idx)).toEqual([3]);
  });
});

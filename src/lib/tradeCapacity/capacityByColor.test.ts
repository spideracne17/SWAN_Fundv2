import { describe, it, expect } from 'vitest';
import { getCapacityByColor } from './capacityByColor';

describe('getCapacityByColor', () => {
  const totalSlots = 10;

  it('returns full capacity for GREEN', () => {
    const result = getCapacityByColor('GREEN', totalSlots);
    expect(result).toEqual({ color: 'GREEN', max_new_positions: 10 });
  });

  it('returns half capacity (rounded down) for YELLOW', () => {
    const result = getCapacityByColor('YELLOW', totalSlots);
    expect(result).toEqual({ color: 'YELLOW', max_new_positions: 5 });
  });

  it('returns half capacity rounded down for odd totalSlots in YELLOW', () => {
    const result = getCapacityByColor('YELLOW', 7);
    expect(result).toEqual({ color: 'YELLOW', max_new_positions: 3 });
  });

  it('returns 1 for RED regardless of totalSlots', () => {
    const result = getCapacityByColor('RED', totalSlots);
    expect(result).toEqual({ color: 'RED', max_new_positions: 1 });
  });

  it('returns 0 for BLACK regardless of totalSlots', () => {
    const result = getCapacityByColor('BLACK', totalSlots);
    expect(result).toEqual({ color: 'BLACK', max_new_positions: 0 });
  });

  it('handles zero totalSlots correctly', () => {
    expect(getCapacityByColor('GREEN', 0)).toEqual({ color: 'GREEN', max_new_positions: 0 });
    expect(getCapacityByColor('YELLOW', 0)).toEqual({ color: 'YELLOW', max_new_positions: 0 });
    expect(getCapacityByColor('RED', 0)).toEqual({ color: 'RED', max_new_positions: 1 });
    expect(getCapacityByColor('BLACK', 0)).toEqual({ color: 'BLACK', max_new_positions: 0 });
  });
});

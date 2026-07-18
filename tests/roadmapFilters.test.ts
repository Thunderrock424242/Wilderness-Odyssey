import { describe, expect, it } from 'vitest';
import { ROADMAP_ITEMS } from '../src/data/roadmap';
import { filterRoadmap } from '../src/lib/roadmapFilters';

describe('roadmap filtering', () => {
  it('filters by category and status', () => {
    const result = filterRoadmap(ROADMAP_ITEMS, { category: 'Water System', status: 'In Development' });
    expect(result.map((item) => item.id)).toEqual(['sph-water-performance']);
  });

  it('searches titles, descriptions, milestones, and dependencies', () => {
    expect(filterRoadmap(ROADMAP_ITEMS, { query: 'bunker' }).some((item) => item.id === 'worldgen-bunker-placement')).toBe(true);
    expect(filterRoadmap(ROADMAP_ITEMS, { query: 'hardware' }).some((item) => item.id === 'sph-water-performance')).toBe(true);
  });
});

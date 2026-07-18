import { describe, expect, it } from 'vitest';
import { slugify, tagUrl, transmissionUrl, withBase } from '../src/lib/urls';

describe('base-aware URL generation', () => {
  it('prefixes internal routes exactly once', () => {
    expect(withBase('/roadmap/', '/Wilderness-Odyssey/')).toBe('/Wilderness-Odyssey/roadmap/');
    expect(withBase('/', '/Wilderness-Odyssey/')).toBe('/Wilderness-Odyssey/');
  });

  it('preserves external URLs and fragments', () => {
    expect(withBase('https://example.com', '/Wilderness-Odyssey/')).toBe('https://example.com');
    expect(withBase('#track', '/Wilderness-Odyssey/')).toBe('#track');
  });

  it('builds stable transmission and tag URLs', () => {
    expect(transmissionUrl('water-report', '/Wilderness-Odyssey/')).toBe('/Wilderness-Odyssey/transmissions/water-report/');
    expect(slugify('Water System')).toBe('water-system');
    expect(tagUrl('Water System', '/Wilderness-Odyssey/')).toBe('/Wilderness-Odyssey/tags/water-system/');
  });
});

import { describe, expect, it } from 'vitest';
import { unwrapApiEnvelope } from '../src/lib/admin/api';
import {
  buildTransmissionMediaPath,
  createTransmissionDraft,
  generateTransmissionMarkdown,
  normalizeTags,
  transmissionSlug,
  validateTransmission,
} from '../src/lib/admin/cms';

const validInput = () => ({
  ...createTransmissionDraft('Mason', new Date('2026-08-26T12:00:00Z')),
  slug: 'field-report-seven',
  title: 'Field Report Seven',
  description: 'A detailed update from beyond the bunker doors.',
  tags: ['worldgen', 'testing'],
  relatedRoadmapItem: 'first-alpha-foundation',
  bodyMarkdown: '## Signal received\n\nThe surface remains active.',
});

describe('admin transmission helpers', () => {
  it('generates stable slugs and scoped media paths', () => {
    expect(transmissionSlug('  Echo Earth: First Look! ')).toBe('echo-earth-first-look');
    expect(buildTransmissionMediaPath('Echo Earth First Look', 'Portal Capture 01.PNG')).toBe('/images/transmissions/echo-earth-first-look/portal-capture-01.png');
  });

  it('normalizes and deduplicates tags', () => {
    expect(normalizeTags(' Worldgen, testing, WORLDGEN, , lore ')).toEqual(['worldgen', 'testing', 'lore']);
  });

  it('validates roadmap references and slug collisions', () => {
    const input = validInput();
    expect(validateTransmission(input, ['first-alpha-foundation'], [])).toEqual([]);
    expect(validateTransmission({ ...input, relatedRoadmapItem: 'invented-phase' }, ['first-alpha-foundation'], [])).toContain('Choose a valid roadmap item.');
    expect(validateTransmission(input, ['first-alpha-foundation'], ['field-report-seven'])).toContain('The slug “field-report-seven” is already in use.');
  });

  it('serializes the existing content schema without editor-only preview URLs', () => {
    const markdown = generateTransmissionMarkdown({
      ...validInput(),
      coverImage: '/images/transmissions/field-report-seven/cover.webp',
      coverPreviewUrl: 'data:image/webp;base64,preview',
      galleryImages: [{ src: '/images/transmissions/field-report-seven/ruin.webp', previewUrl: 'blob:preview', alt: 'Overgrown concrete ruin', caption: 'Sector seven' }],
    });
    expect(markdown).toContain('relatedRoadmapItem: "first-alpha-foundation"');
    expect(markdown).toContain('galleryImages:\n  - src: "/images/transmissions/field-report-seven/ruin.webp"');
    expect(markdown).toContain('## Signal received');
    expect(markdown).not.toContain('data:image');
    expect(markdown).not.toContain('blob:preview');
  });
});

describe('admin API payload conversion', () => {
  it('accepts documented envelopes and direct JSON payloads', () => {
    expect(unwrapApiEnvelope({ data: { authenticated: true } })).toEqual({ authenticated: true });
    expect(unwrapApiEnvelope({ authenticated: false })).toEqual({ authenticated: false });
  });
});

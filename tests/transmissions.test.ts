import { describe, expect, it } from 'vitest';
import type { Transmission } from '../src/lib/transmissions';
import { getPublishedTransmissions } from '../src/lib/transmissions';

const entry = (id: string, publishedAt: string, draft = false) => ({
  id,
  data: { publishedAt: new Date(`${publishedAt}T00:00:00Z`), draft },
}) as unknown as Transmission;

describe('transmission publishing rules', () => {
  it('excludes drafts', () => {
    expect(getPublishedTransmissions([entry('published', '2026-01-01'), entry('draft', '2026-02-01', true)]).map((item) => item.id)).toEqual(['published']);
  });

  it('sorts newest first with stable id ordering for equal dates', () => {
    const result = getPublishedTransmissions([
      entry('older', '2026-01-01'),
      entry('z-equal', '2026-03-01'),
      entry('a-equal', '2026-03-01'),
    ]);
    expect(result.map((item) => item.id)).toEqual(['a-equal', 'z-equal', 'older']);
  });
});

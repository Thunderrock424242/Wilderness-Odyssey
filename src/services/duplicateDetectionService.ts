import type { EmbedBuilder } from 'discord.js';
import { getDb } from '../db';
import { truncate } from '../utils/embeds';

export type DuplicateHintType = 'known_issue' | 'bug' | 'crash' | 'performance';

export interface DuplicateHint {
  type: DuplicateHintType;
  publicId: string;
  title: string;
  status: string | null;
  score: number;
  reason: string;
  url?: string | null;
}

interface Candidate {
  type: DuplicateHintType;
  publicId: string;
  title: string;
  body: string;
  status: string | null;
  modpackVersion: string | null;
  url?: string | null;
}

const stopWords = new Set([
  'about',
  'after',
  'again',
  'also',
  'because',
  'before',
  'being',
  'could',
  'does',
  'during',
  'from',
  'game',
  'have',
  'into',
  'just',
  'like',
  'minecraft',
  'modpack',
  'near',
  'need',
  'only',
  'pack',
  'please',
  'same',
  'that',
  'then',
  'there',
  'this',
  'when',
  'with',
  'wilderness',
  'would'
]);

export function findDuplicateHints(input: {
  type: 'bug' | 'crash' | 'performance';
  text: string;
  modpackVersion?: string | null;
  likelyCause?: string | null;
  excludePublicId?: string | null;
  limit?: number;
}): DuplicateHint[] {
  const tokens = tokenize([
    input.text,
    input.likelyCause ?? '',
    input.modpackVersion ?? ''
  ].join(' '));

  if (tokens.size < 3 && !input.likelyCause?.trim()) {
    return [];
  }

  const candidates = duplicateCandidates(input.excludePublicId);
  const hints = candidates
    .map((candidate) => scoreCandidate(candidate, tokens, input))
    .filter((hint): hint is DuplicateHint => Boolean(hint))
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 3);

  return hints.filter((hint) => hint.score >= 0.28);
}

export function duplicateHintsText(hints: DuplicateHint[]): string {
  if (hints.length === 0) {
    return 'No strong local duplicate matches found.';
  }

  return hints
    .map((hint) => {
      const score = Math.round(hint.score * 100);
      const target = hint.url ? `[${hint.publicId}](${hint.url})` : hint.publicId;
      return `${target} (${hint.type}, ${hint.status ?? 'n/a'}, ${score}%) - ${truncate(hint.title, 160)}\n${hint.reason}`;
    })
    .join('\n\n')
    .slice(0, 1024);
}

export function addDuplicateHintsField(embed: EmbedBuilder, hints: DuplicateHint[]): EmbedBuilder {
  if (hints.length === 0) {
    return embed;
  }

  return embed.addFields({
    name: 'Possible duplicates',
    value: duplicateHintsText(hints)
  });
}

function duplicateCandidates(excludePublicId?: string | null): Candidate[] {
  const database = getDb();
  const exclude = excludePublicId?.trim().toUpperCase() ?? null;

  const knownIssues = database.prepare(`
    SELECT
      'known_issue' AS type,
      CAST(id AS TEXT) AS publicId,
      title,
      description AS body,
      status,
      affected_versions AS modpackVersion,
      external_url AS url
    FROM known_issues
    WHERE status NOT IN ('fixed', 'wontfix', 'rejected')
    ORDER BY id DESC
    LIMIT 80
  `).all() as unknown as Candidate[];

  const bugs = database.prepare(`
    SELECT
      'bug' AS type,
      public_id AS publicId,
      happened AS title,
      happened || ' ' || expected || ' ' || steps || ' ' || COALESCE(bug_context, '') || ' ' || COALESCE(location, '') || ' ' || COALESCE(anomaly_context, '') AS body,
      status,
      modpack_version AS modpackVersion,
      NULL AS url
    FROM bug_reports
    WHERE public_id IS NOT NULL AND (@exclude IS NULL OR public_id != @exclude)
    ORDER BY id DESC
    LIMIT 80
  `).all({ exclude }) as unknown as Candidate[];

  const crashes = database.prepare(`
    SELECT
      'crash' AS type,
      public_id AS publicId,
      likely_cause AS title,
      likely_cause || ' ' || COALESCE(activity, '') || ' ' || COALESCE(steps, '') || ' ' || substr(redacted_log, 1, 6000) AS body,
      status,
      NULL AS modpackVersion,
      NULL AS url
    FROM crash_reports
    WHERE public_id IS NOT NULL AND (@exclude IS NULL OR public_id != @exclude)
    ORDER BY id DESC
    LIMIT 80
  `).all({ exclude }) as unknown as Candidate[];

  const performance = database.prepare(`
    SELECT
      'performance' AS type,
      public_id AS publicId,
      lag_location AS title,
      lag_location || ' ' || activity || ' ' || COALESCE(cpu_gpu, '') || ' ' || COALESCE(java_version, '') || ' ' || COALESCE(launcher, '') || ' ' || COALESCE(shaders, '') AS body,
      status,
      modpack_version AS modpackVersion,
      NULL AS url
    FROM performance_reports
    WHERE public_id IS NOT NULL AND (@exclude IS NULL OR public_id != @exclude)
    ORDER BY id DESC
    LIMIT 80
  `).all({ exclude }) as unknown as Candidate[];

  return [...knownIssues, ...bugs, ...crashes, ...performance];
}

function scoreCandidate(
  candidate: Candidate,
  sourceTokens: Set<string>,
  input: {
    type: 'bug' | 'crash' | 'performance';
    modpackVersion?: string | null;
    likelyCause?: string | null;
  }
): DuplicateHint | null {
  const candidateTokens = tokenize(`${candidate.title} ${candidate.body} ${candidate.modpackVersion ?? ''}`);
  if (candidateTokens.size === 0) {
    return null;
  }

  const overlap = [...sourceTokens].filter((token) => candidateTokens.has(token));
  let score = overlap.length / Math.max(6, Math.min(sourceTokens.size, candidateTokens.size));
  const reasons: string[] = [];

  if (overlap.length > 0) {
    reasons.push(`Shared terms: ${overlap.slice(0, 6).join(', ')}`);
  }

  if (candidate.type === 'known_issue') {
    score += 0.12;
    reasons.push('Already tracked as a known issue.');
  }

  if (candidate.type === input.type) {
    score += 0.1;
  }

  if (
    input.modpackVersion
    && candidate.modpackVersion
    && candidate.modpackVersion.toLowerCase().includes(input.modpackVersion.toLowerCase())
  ) {
    score += 0.16;
    reasons.push(`Version match: ${input.modpackVersion}`);
  }

  if (
    input.likelyCause
    && candidate.title.toLowerCase().includes(input.likelyCause.toLowerCase())
  ) {
    score += 0.3;
    reasons.push('Crash signature match.');
  }

  return {
    type: candidate.type,
    publicId: candidate.type === 'known_issue' ? `Known issue #${candidate.publicId}` : candidate.publicId,
    title: candidate.title,
    status: candidate.status,
    score: Math.min(0.99, score),
    reason: reasons.length > 0 ? reasons.join(' ') : 'Similar wording in recent reports.',
    url: candidate.url
  };
}

function tokenize(value: string): Set<string> {
  const tokens = value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9_.-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) =>
      token.length >= 3
      && !stopWords.has(token)
      && !/^\d+$/.test(token)
    )
    .slice(0, 160);

  return new Set(tokens);
}

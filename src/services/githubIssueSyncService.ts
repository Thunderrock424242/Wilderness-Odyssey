import { config } from '../config';
import type { KnownIssueRecord } from '../types';
import { truncate } from '../utils/embeds';
import { upsertKnownIssueFromExternal } from './knownIssuesService';

interface GitHubIssueLabel {
  name: string;
}

interface GitHubIssueUser {
  login: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: string;
  labels: GitHubIssueLabel[];
  user: GitHubIssueUser | null;
  pull_request?: unknown;
}

export interface GitHubKnownIssueImportResult {
  imported: KnownIssueRecord[];
  skipped: number;
  repository: string;
}

export async function importKnownIssuesFromGitHub(input: {
  limit?: number;
  addedBy: string;
}): Promise<GitHubKnownIssueImportResult> {
  const repository = config.github.repository?.trim();
  if (!repository) {
    throw new Error('GITHUB_REPOSITORY is not configured.');
  }

  const issues = await fetchGitHubIssues(repository, Math.min(Math.max(input.limit ?? 50, 1), 100));
  const knownLabels = new Set(config.github.knownIssueLabels.map((label) => label.toLowerCase()));
  const imported: KnownIssueRecord[] = [];
  let skipped = 0;

  for (const issue of issues) {
    if (issue.pull_request) {
      skipped += 1;
      continue;
    }

    const labels = issue.labels.map((label) => label.name);
    if (!labels.some((label) => knownLabels.has(label.toLowerCase()))) {
      skipped += 1;
      continue;
    }

    imported.push(upsertKnownIssueFromExternal({
      externalKey: `github:${repository}#${issue.number}`,
      externalUrl: issue.html_url,
      title: `GH-${issue.number}: ${issue.title}`.slice(0, 240),
      description: githubIssueDescription(issue),
      status: issueStatusFromLabels(labels),
      severity: severityFromLabels(labels),
      affectedVersions: affectedVersionsFromLabels(labels),
      fixedInVersion: fixedVersionFromLabels(labels),
      addedBy: input.addedBy
    }));
  }

  return { imported, skipped, repository };
}

async function fetchGitHubIssues(repository: string, limit: number): Promise<GitHubIssue[]> {
  const url = new URL(`/repos/${repository}/issues`, config.github.apiBaseUrl);
  url.searchParams.set('state', 'open');
  url.searchParams.set('per_page', String(limit));
  url.searchParams.set('sort', 'updated');
  url.searchParams.set('direction', 'desc');

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Wilderness-Odyssey-Discord-Bot'
  };

  if (config.github.token) {
    headers.Authorization = `Bearer ${config.github.token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub returned HTTP ${response.status}. Check GITHUB_REPOSITORY, labels, and token access.`);
  }

  const body = await response.json() as unknown;
  if (!Array.isArray(body)) {
    throw new Error('GitHub returned an unexpected response.');
  }

  return body as GitHubIssue[];
}

function githubIssueDescription(issue: GitHubIssue): string {
  const body = issue.body?.trim()
    ? truncate(issue.body, 1200)
    : 'No GitHub issue body was provided.';

  return [
    body,
    '',
    `GitHub issue: ${issue.html_url}`,
    issue.user ? `Opened by: ${issue.user.login}` : null
  ].filter(Boolean).join('\n');
}

function issueStatusFromLabels(labels: string[]): string {
  const normalized = labels.map((label) => label.toLowerCase());
  if (normalized.some((label) => ['solved', 'fixed', 'fix ready'].includes(label))) {
    return 'solved';
  }

  if (normalized.some((label) => ['investigating', 'in progress', 'triage'].includes(label))) {
    return 'investigating';
  }

  return 'open';
}

function severityFromLabels(labels: string[]): string {
  const normalized = labels.map((label) => label.toLowerCase());
  for (const severity of ['critical', 'high', 'medium', 'low']) {
    if (normalized.some((label) => label === severity || label === `severity:${severity}`)) {
      return severity;
    }
  }

  return 'medium';
}

function affectedVersionsFromLabels(labels: string[]): string | null {
  const versions = labels
    .map((label) => versionLabelValue(label, ['version:', 'affected:', 'pack:', 'v']))
    .filter((value): value is string => Boolean(value));

  return versions.length > 0 ? versions.join(', ') : null;
}

function fixedVersionFromLabels(labels: string[]): string | null {
  const versions = labels
    .map((label) => versionLabelValue(label, ['fixed-in:', 'fixed:', 'target:']))
    .filter((value): value is string => Boolean(value));

  return versions.length > 0 ? versions.join(', ') : null;
}

function versionLabelValue(label: string, prefixes: string[]): string | null {
  const trimmed = label.trim();
  const lower = trimmed.toLowerCase();
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix) && trimmed.length > prefix.length) {
      return trimmed.slice(prefix.length).trim();
    }
  }

  return null;
}

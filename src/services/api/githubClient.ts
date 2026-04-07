/**
 * GitHub Releases Client — Fetches and parses changelogs for packages
 * to extract breaking changes, features, and fixes.
 */
import type { ChangelogEntry, BreakingChange, ConsumerRef } from '../../types';
import { diff as semverDiff } from 'semver';

const GITHUB_API_BASE = 'https://api.github.com';

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

/**
 * Resolve the GitHub repo URL for an npm package by reading its
 * package.json repository field.
 */
export function resolveGitHubRepo(
  packageJson: Record<string, any>,
): { owner: string; repo: string } | null {
  const repoField = packageJson.repository;
  if (!repoField) return null;

  let url: string;
  if (typeof repoField === 'string') {
    url = repoField;
  } else if (typeof repoField === 'object' && repoField.url) {
    url = repoField.url;
  } else {
    return null;
  }

  // Parse GitHub URLs
  const match = url.match(
    /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/,
  );
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

/**
 * Fetch releases from GitHub for a given package.
 * Returns releases between currentVersion and latestVersion.
 */
export async function fetchReleases(
  owner: string,
  repo: string,
  options?: { perPage?: number; token?: string },
): Promise<GitHubRelease[]> {
  const perPage = options?.perPage ?? 30;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (options?.token) {
    headers.Authorization = `token ${options.token}`;
  }

  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases?per_page=${perPage}`,
      { headers },
    );

    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const releases: GitHubRelease[] = await response.json();
    return releases.filter((r) => !r.draft);
  } catch (error: any) {
    console.warn(`Failed to fetch releases for ${owner}/${repo}: ${error.message}`);
    return [];
  }
}

/** Parse a release body into a structured changelog entry */
export function parseReleaseBody(
  release: GitHubRelease,
): ChangelogEntry {
  const body = release.body || '';
  const breakingChanges: BreakingChange[] = [];
  const features: string[] = [];
  const fixes: string[] = [];

  const lines = body.split('\n');
  let currentSection: 'breaking' | 'features' | 'fixes' | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect section headers
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('breaking change') ||
      lower.includes('breaking:') ||
      lower.includes('## breaking') ||
      lower.includes('### breaking')
    ) {
      currentSection = 'breaking';
      continue;
    }
    if (
      lower.includes('## feature') ||
      lower.includes('### feature') ||
      lower.includes('## added') ||
      lower.includes('### added')
    ) {
      currentSection = 'features';
      continue;
    }
    if (
      lower.includes('## fix') ||
      lower.includes('### fix') ||
      lower.includes('## bug') ||
      lower.includes('### bug')
    ) {
      currentSection = 'fixes';
      continue;
    }
    if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
      currentSection = null;
      continue;
    }

    // Parse list items
    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (!listMatch) continue;

    const content = listMatch[1];

    // Auto-detect breaking changes from prefixes
    if (
      content.toLowerCase().startsWith('breaking:') ||
      content.toLowerCase().startsWith('breaking change:') ||
      content.includes('BREAKING')
    ) {
      breakingChanges.push({
        description: content,
        affectedApis: extractApisFromText(content),
        affectsUser: false,
        affectedCallSites: [],
      });
      continue;
    }

    switch (currentSection) {
      case 'breaking':
        breakingChanges.push({
          description: content,
          affectedApis: extractApisFromText(content),
          affectsUser: false,
          affectedCallSites: [],
        });
        break;
      case 'features':
        features.push(content);
        break;
      case 'fixes':
        fixes.push(content);
        break;
      default:
        // Try to categorize by common commit prefixes
        if (content.startsWith('feat') || content.startsWith('feature')) {
          features.push(content);
        } else if (content.startsWith('fix')) {
          fixes.push(content);
        }
    }
  }

  return {
    version: extractVersionFromTag(release.tag_name),
    date: release.published_at,
    breakingChanges,
    features,
    fixes,
    rawBody: body,
  };
}

/**
 * Match breaking changes against user's call-sites
 */
export function matchBreakingChangesToCallSites(
  breakingChanges: BreakingChange[],
  usedExports: string[],
  consumers: Map<string, ConsumerRef[]>,
): BreakingChange[] {
  return breakingChanges.map((bc) => {
    const matchedCallSites: ConsumerRef[] = [];
    let affectsUser = false;

    for (const api of bc.affectedApis) {
      if (usedExports.includes(api)) {
        affectsUser = true;
        const refs = consumers.get(api);
        if (refs) matchedCallSites.push(...refs);
      }
    }

    // Heuristic: if no specific APIs matched, check description against used exports
    if (!affectsUser && bc.affectedApis.length === 0) {
      const descLower = bc.description.toLowerCase();
      for (const exp of usedExports) {
        if (exp.length > 3 && descLower.includes(exp.toLowerCase())) {
          affectsUser = true;
          const refs = consumers.get(exp);
          if (refs) matchedCallSites.push(...refs);
        }
      }
    }

    return { ...bc, affectsUser, affectedCallSites: matchedCallSites };
  });
}

/** Extract API/function names from changelog text */
function extractApisFromText(text: string): string[] {
  const apis: string[] = [];
  // Match backtick-quoted identifiers
  const backtickMatches = text.matchAll(/`([a-zA-Z_$][\w$.]*)`/g);
  for (const match of backtickMatches) {
    apis.push(match[1]);
  }
  // Match common function-like patterns
  const fnMatches = text.matchAll(/\b([a-zA-Z_$][\w$]*)\(\)/g);
  for (const match of fnMatches) {
    apis.push(match[1]);
  }
  return [...new Set(apis)];
}

function extractVersionFromTag(tag: string): string {
  return tag.replace(/^v/, '');
}

/**
 * Get relevant releases between two versions
 */
export function getRelevantReleases(
  releases: GitHubRelease[],
  currentVersion: string,
  targetVersion?: string,
): GitHubRelease[] {
  return releases.filter((r) => {
    const version = extractVersionFromTag(r.tag_name);
    if (!version) return false;
    try {
      const semver = require('semver');
      return semver.gt(version, currentVersion) &&
        (!targetVersion || semver.lte(version, targetVersion));
    } catch {
      return false;
    }
  });
}

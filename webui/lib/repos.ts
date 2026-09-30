// Gallery logic (spec §4.6). Client-safe: only type imports from atlas.ts, which uses Node's fs.
import type { Skill } from "./atlas.ts";
import { matchesSkill, type SkillText } from "./filter.ts";

export type RepoSummary = {
  file: string;
  name: string;
  skillCount: number;
  categories: { agent?: number; product?: number; test?: number } | null;
  lastUpdated: string | null;
};

export type RepoMatch = { match: boolean; byName: boolean; matchingSkills: number };

// summarizeRepo describes one index file: display name (first skill's owner/repo, else the file
// name), skill count, how many skills have each category, and the newest commit date (UTC day).
export function summarizeRepo(file: string, skills: Skill[]): RepoSummary {
  let categories: RepoSummary["categories"] = null;
  let newest = -Infinity;
  for (const s of skills) {
    if (s.categories) {
      categories ??= {};
      for (const c of new Set(s.categories)) {
        if (c === "agent" || c === "product" || c === "test") categories[c] = (categories[c] ?? 0) + 1;
      }
    }
    const t = Date.parse(s.commit_date);
    if (t > newest) newest = t;
  }
  return {
    file,
    name: skills[0]?.repo || file,
    skillCount: skills.length,
    categories,
    lastUpdated: Number.isFinite(newest) ? new Date(newest).toISOString().slice(0, 10) : null,
  };
}

// matchRepo applies the gallery search: a repository matches by its display or file name, or
// through its skills (the §4.3 rule: name or description only). A blank q matches everything.
export function matchRepo(summary: RepoSummary, skills: SkillText[], q: string): RepoMatch {
  const needle = q.trim().toLowerCase();
  if (!needle) return { match: true, byName: false, matchingSkills: 0 };
  const byName = [summary.name, summary.file].some((f) => f.toLowerCase().includes(needle));
  const matchingSkills = skills.filter((s) => matchesSkill(s, needle)).length;
  return { match: byName || matchingSkills > 0, byName, matchingSkills };
}

// repoPath is the URL of a repository's skill browser; file is the index file name without .json.
export const repoPath = (file: string) => `/repos/${encodeURIComponent(file)}`;

// cardHref links a card to its repository, prefilling the skill filter only when the repository
// matched through its skills and not by name, so a name match shows all of its skills.
export function cardHref(file: string, m: RepoMatch, q: string): string {
  const base = repoPath(file);
  return !m.byName && m.matchingSkills > 0 ? `${base}?q=${encodeURIComponent(q.trim())}` : base;
}

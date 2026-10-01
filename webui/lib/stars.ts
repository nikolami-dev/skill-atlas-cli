// Starred skills (spec §4.7). Client-safe: stars live in the browser's localStorage only.
import type { Skill } from "./atlas.ts";
import type { RepoSummary } from "./repos.ts";

export const STARS_KEY = "skill-atlas:stars";

// starKey identifies a skill by its index file name and primary path, the pair ?skill= URLs use.
// A file name never contains "/", so the key is unambiguous.
export const starKey = (file: string, path: string) => `${file}/${path}`;

// parseStars reads the stored JSON array of keys. Anything else means no stars; entries that
// aren't strings are dropped and duplicates count once, in the order they were starred.
export function parseStars(raw: string | null): string[] {
  let v: unknown;
  try {
    v = JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
  return Array.isArray(v) ? [...new Set(v.filter((k): k is string => typeof k === "string"))] : [];
}

// toggleStar removes key if it is starred and appends it otherwise, returning a new array.
export const toggleStar = (stars: string[], key: string) =>
  stars.includes(key) ? stars.filter((k) => k !== key) : [...stars, key];

// starredFirst moves the starred skills of one repository to the front, keeping the given (name)
// order within the starred and the unstarred group.
export function starredFirst<T extends { path: string }>(file: string, skills: T[], stars: ReadonlySet<string>): T[] {
  const isStarred = (s: T) => stars.has(starKey(file, s.path));
  return [...skills.filter(isStarred), ...skills.filter((s) => !isStarred(s))];
}

export type StarredSkill = { file: string; repoName: string; name: string; path: string };

// starredSkills lists the starred skills of all repositories for the home-page widget, sorted by
// repository display name, then skill name. Stars of skills no longer in an index are skipped.
export function starredSkills(
  repos: { summary: Pick<RepoSummary, "file" | "name">; skills: Pick<Skill, "name" | "path">[] }[],
  stars: ReadonlySet<string>,
): StarredSkill[] {
  return repos
    .flatMap(({ summary, skills }) =>
      skills
        .filter((s) => stars.has(starKey(summary.file, s.path)))
        .map((s) => ({ file: summary.file, repoName: summary.name, name: s.name, path: s.path })),
    )
    .sort((a, b) => a.repoName.localeCompare(b.repoName) || a.name.localeCompare(b.name));
}

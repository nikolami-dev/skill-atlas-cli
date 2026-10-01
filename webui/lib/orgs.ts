// Owner-scan summaries (spec §3.3) and the organization widget's rows (§4.8). No Node APIs.
import { repoPath } from "./repos.ts";

// OrgSummary is ~/.skill-atlas/orgs/{owner}.json, written by `skill-atlas scan https://github.com/{owner}`.
// repos lists only repositories with skills, most skills first.
export type OrgSummary = {
  owner: string;
  scanned_at: string;
  repos_scanned: number;
  repos: { repo: string; file: string; skills: number }[];
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

// parseOrgSummary returns the summary in text, or null when it isn't valid JSON of that shape.
export function parseOrgSummary(text: string): OrgSummary | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(v) || typeof v.owner !== "string" || typeof v.scanned_at !== "string" ||
    typeof v.repos_scanned !== "number" || !Array.isArray(v.repos)) return null;
  const valid = v.repos.every((r) => isObject(r) && typeof r.repo === "string" && typeof r.file === "string" && typeof r.skills === "number");
  return valid ? (v as OrgSummary) : null;
}

// orgRows gives the widget rows in summary order. A row links to its repository only when the index
// file exists (files = listRepos()), so a deleted index never becomes a link to a 404.
export function orgRows(org: OrgSummary, files: string[]): { repo: string; skills: number; href: string | null }[] {
  const known = new Set(files);
  return org.repos.map((r) => ({ repo: r.repo, skills: r.skills, href: known.has(r.file) ? repoPath(r.file) : null }));
}

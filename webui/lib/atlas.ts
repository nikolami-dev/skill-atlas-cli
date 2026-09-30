import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// Skill is one entry of a skill-atlas CLI index file (~/.skill-atlas/{owner}-{repo}.json).
// paths and categories are missing in indexes written by older CLI versions.
export type Skill = {
  repo: string;
  name: string;
  description: string;
  path: string;
  paths?: string[];
  categories?: string[];
  commit_sha: string;
  commit_date: string;
};

export const atlasDir = () => process.env.SKILL_ATLAS_DIR || join(homedir(), ".skill-atlas");

// listRepos returns the index file names without ".json", sorted. A missing directory means no repos.
export async function listRepos(): Promise<string[]> {
  try {
    const files = await readdir(/*turbopackIgnore: true*/ atlasDir());
    return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort((a, b) => a.localeCompare(b));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

// loadSkills returns the repo's skills sorted by name, or null for a repo that isn't in listRepos
// (so a request param is never used as a raw file path). Throws on unreadable or invalid JSON.
export async function loadSkills(repo: string): Promise<Skill[] | null> {
  if (!(await listRepos()).includes(repo)) return null;
  const skills = JSON.parse(await readFile(/*turbopackIgnore: true*/ join(atlasDir(), repo + ".json"), "utf8"));
  if (!Array.isArray(skills)) throw new Error(`${repo}.json is not a JSON array`);
  return (skills as Skill[]).sort((a, b) => a.name.localeCompare(b.name));
}

const ref = (s: Skill) => s.commit_sha || "HEAD";
const escapePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export const rawUrl = (s: Skill) => `https://raw.githubusercontent.com/${s.repo}/${ref(s)}/${escapePath(s.path)}`;
export const githubUrl = (s: Skill, path = s.path) => `https://github.com/${s.repo}/blob/${ref(s)}/${escapePath(path)}`;

// fetchSkillContent returns the raw SKILL.md text from GitHub. Throws on network or HTTP errors.
export async function fetchSkillContent(s: Skill): Promise<string> {
  // Pinned to commit_sha, so the content never changes and can be cached forever.
  const res = await fetch(rawUrl(s), { cache: s.commit_sha ? "force-cache" : "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

// stripFrontmatter removes a leading "---" YAML block.
export const stripFrontmatter = (md: string) => md.replace(/^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/, "");

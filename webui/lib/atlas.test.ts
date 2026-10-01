import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { listRepos, loadOrgs, loadSkills, rawUrl, stripFrontmatter } from "./atlas.ts";
import type { Skill } from "./atlas.ts";

const skill = (name: string, path: string): Skill =>
  ({ repo: "JetBrains/kotlin", name, description: "", path, commit_sha: "abc", commit_date: "" });

test("index loading", async () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-"));
  process.env.SKILL_ATLAS_DIR = dir;
  writeFileSync(join(dir, "JetBrains-kotlin.json"), JSON.stringify([skill("b", "x/b/SKILL.md"), skill("a", "x/a/SKILL.md")]));
  writeFileSync(join(dir, "broken.json"), "{not json");
  writeFileSync(join(dir, "notes.txt"), "");
  writeFileSync(join(tmpdir(), "outside.json"), "[]");

  assert.deepEqual(await listRepos(), ["broken", "JetBrains-kotlin"]);
  assert.deepEqual((await loadSkills("JetBrains-kotlin"))?.map((s) => s.name), ["a", "b"]);
  assert.equal(await loadSkills("nope"), null);
  assert.equal(await loadSkills("../outside"), null);
  await assert.rejects(loadSkills("broken"));

  process.env.SKILL_ATLAS_DIR = join(dir, "missing");
  assert.deepEqual(await listRepos(), []);
});

test("organization summaries", async () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-"));
  process.env.SKILL_ATLAS_DIR = dir;
  assert.deepEqual(await loadOrgs(), []); // no orgs/ directory

  const org = { owner: "JetBrains", scanned_at: "2026-10-01T09:30:00Z", repos_scanned: 2, repos: [] };
  mkdirSync(join(dir, "orgs"));
  writeFileSync(join(dir, "orgs", "JetBrains.json"), JSON.stringify(org));
  writeFileSync(join(dir, "orgs", "acme.json"), JSON.stringify({ owner: 1 }));
  writeFileSync(join(dir, "orgs", "notes.txt"), "");
  writeFileSync(join(dir, "JetBrains-kotlin.json"), "[]");

  assert.deepEqual(await loadOrgs(), [{ file: "acme", org: null }, { file: "JetBrains", org }]);
  assert.deepEqual(await listRepos(), ["JetBrains-kotlin"]);
});

test("frontmatter and urls", () => {
  assert.equal(stripFrontmatter("---\nname: x\ndescription: a: b\n---\n# Body\n---\nmore"), "# Body\n---\nmore");
  assert.equal(stripFrontmatter("---\r\nname: x\r\n---\r\nBody"), "Body");
  assert.equal(stripFrontmatter("# No frontmatter\n---\nx"), "# No frontmatter\n---\nx");
  assert.equal(rawUrl(skill("a", ".claude/skills/a b/SKILL.md")),
    "https://raw.githubusercontent.com/JetBrains/kotlin/abc/.claude/skills/a%20b/SKILL.md");
});

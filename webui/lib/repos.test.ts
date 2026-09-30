import assert from "node:assert/strict";
import { test } from "node:test";
import type { Skill } from "./atlas.ts";
import { cardHref, matchRepo, summarizeRepo } from "./repos.ts";

const skill = (name: string, description: string, extra: Partial<Skill> = {}): Skill => ({
  repo: "JetBrains/kotlin",
  name,
  description,
  path: `.claude/skills/${name}/SKILL.md`,
  commit_sha: "abc",
  commit_date: "2026-08-25T18:59:09Z",
  ...extra,
});

const kotlin = [
  skill("build-bump-gradle-version", "Bumps the Gradle wrapper", { categories: ["agent"], commit_date: "2026-09-29T17:03:14Z" }),
  skill("minimize-repro", "Makes a minimal reproduction", { categories: ["agent", "test"], paths: ["a/SKILL.md", "tests/b/SKILL.md"] }),
  skill("ship-it", "Release it", { categories: ["product", "agent"], commit_date: "2026-08-05T12:07:41+02:00" }),
];

test("summarizeRepo counts skills and categories and finds the newest date", () => {
  assert.deepEqual(summarizeRepo("JetBrains-kotlin", kotlin), {
    file: "JetBrains-kotlin",
    name: "JetBrains/kotlin",
    skillCount: 3,
    categories: { agent: 3, product: 1, test: 1 },
    lastUpdated: "2026-09-29",
  });
});

test("summarizeRepo handles empty and older indexes", () => {
  assert.deepEqual(summarizeRepo("empty", []), { file: "empty", name: "empty", skillCount: 0, categories: null, lastUpdated: null });
  const old = [skill("a", "", { commit_date: "" }), skill("b", "", { commit_date: "" })];
  const s = summarizeRepo("old", old);
  assert.equal(s.categories, null, "no categories field → null");
  assert.equal(s.lastUpdated, null, "no dates → null");
  assert.equal(s.name, "JetBrains/kotlin");
});

test("summarizeRepo counts a skill once per category even if listed twice", () => {
  assert.deepEqual(summarizeRepo("x", [skill("a", "", { categories: ["agent", "agent"] })]).categories, { agent: 1 });
});

test("matchRepo matches by display name and by file name", () => {
  const s = summarizeRepo("JetBrains-kotlin", kotlin);
  assert.deepEqual(matchRepo(s, kotlin, "jetbrains/KOTLIN"), { match: true, byName: true, matchingSkills: 0 });
  assert.deepEqual(matchRepo(s, kotlin, "brains-kot"), { match: true, byName: true, matchingSkills: 0 });
});

test("matchRepo matches by skill name and description, counting matching skills", () => {
  const s = summarizeRepo("JetBrains-kotlin", kotlin);
  assert.deepEqual(matchRepo(s, kotlin, "gradle"), { match: true, byName: false, matchingSkills: 1 });
  assert.deepEqual(matchRepo(s, kotlin, "  REPRODUCTION "), { match: true, byName: false, matchingSkills: 1 });
  assert.deepEqual(matchRepo(s, kotlin, "m"), { match: true, byName: false, matchingSkills: 2 }); // bump, minimize
});

test("matchRepo does not match on paths or categories only", () => {
  const s = summarizeRepo("JetBrains-kotlin", kotlin);
  assert.equal(matchRepo(s, kotlin, "tests/b").match, false, "path");
  assert.equal(matchRepo(s, kotlin, "agent").match, false, "category"); // not "product": it is inside "reproduction"
});

test("matchRepo: blank q matches everything, unknown q matches nothing", () => {
  const s = summarizeRepo("JetBrains-kotlin", kotlin);
  assert.deepEqual(matchRepo(s, kotlin, "   "), { match: true, byName: false, matchingSkills: 0 });
  assert.deepEqual(matchRepo(s, kotlin, "zzqx"), { match: false, byName: false, matchingSkills: 0 });
});

test("cardHref carries q only for skill-only matches", () => {
  assert.equal(cardHref("JetBrains-kotlin", { match: true, byName: false, matchingSkills: 3 }, " gradle "), "/repos/JetBrains-kotlin?q=gradle");
  assert.equal(cardHref("JetBrains-kotlin", { match: true, byName: true, matchingSkills: 3 }, "kotlin"), "/repos/JetBrains-kotlin");
  assert.equal(cardHref("a b", { match: true, byName: false, matchingSkills: 0 }, ""), "/repos/a%20b");
});

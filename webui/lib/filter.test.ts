import assert from "node:assert/strict";
import { test } from "node:test";
import type { Skill } from "./atlas.ts";
import { matchesSkill } from "./filter.ts";

const s: Skill = {
  repo: "JetBrains/kotlin",
  name: "build-bump-gradle-version",
  description: "Bumps the Wrapper version",
  path: ".claude/skills/bump/SKILL.md",
  paths: [".claude/skills/bump/SKILL.md", ".agents/skills/mirror/SKILL.md"],
  categories: ["agent", "product"],
  commit_sha: "abc",
  commit_date: "",
};

test("matches in name", () => {
  assert.ok(matchesSkill(s, "gradle"));
});

test("matches in description", () => {
  assert.ok(matchesSkill(s, "wrapper"));
});

test("does not match on path or category only", () => {
  assert.equal(matchesSkill(s, "mirror"), false, "non-primary path");
  assert.equal(matchesSkill(s, ".claude/skills"), false, "primary path");
  const noPaths: Skill = { ...s, paths: undefined };
  assert.equal(matchesSkill(noPaths, "skills/bump"), false, "path when paths is missing");
  assert.equal(matchesSkill(s, "product"), false, "category");
});

test("case-insensitive and trimmed", () => {
  assert.ok(matchesSkill(s, "GRADLE"));
  assert.ok(matchesSkill(s, "WrApPeR"));
  assert.ok(matchesSkill(s, "  gradle \t"));
});

test("blank q matches everything", () => {
  assert.ok(matchesSkill(s, ""));
  assert.ok(matchesSkill(s, "   "));
});

test("no match", () => {
  assert.equal(matchesSkill(s, "maven"), false);
  assert.equal(matchesSkill({ ...s, description: "" }, "wrapper"), false);
});

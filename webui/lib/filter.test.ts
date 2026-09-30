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

test("matches each field", () => {
  assert.ok(matchesSkill(s, "", "gradle"), "name");
  assert.ok(matchesSkill(s, "", "wrapper"), "description");
  assert.ok(matchesSkill(s, "", "mirror"), "non-primary path");
  assert.ok(matchesSkill(s, "", "product"), "category");
  assert.ok(matchesSkill(s, "---\nname: x\n---\nuses KaImplementationDetail", "kaimplementation"), "content only");
  assert.ok(matchesSkill(s, "---\nfoo: frontvalue\n---\n", "frontvalue"), "frontmatter content");
  assert.ok(matchesSkill({ ...s, paths: undefined }, "", "skills/bump"), "path when paths is missing");
});

test("case-insensitive and trimmed", () => {
  assert.ok(matchesSkill(s, "", "GRADLE"));
  assert.ok(matchesSkill(s, "Body Text", "body text"));
  assert.ok(matchesSkill(s, "", "  gradle \t"));
});

test("blank q matches everything", () => {
  assert.ok(matchesSkill(s, "", ""));
  assert.ok(matchesSkill(s, "", "   "));
});

test("no match", () => {
  assert.equal(matchesSkill(s, "some body", "maven"), false);
  assert.equal(matchesSkill({ ...s, categories: undefined, description: "" }, "", "test"), false);
});

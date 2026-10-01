import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStars, STARS_KEY, starKey, starredFirst, starredSkills, toggleStar } from "./stars.ts";

const skill = (name: string) => ({ name, path: `.claude/skills/${name}/SKILL.md` });

// In name order, as loadSkills returns them.
const kotlin = ["analysis-api-mark-internal-apis", "build-bump-gradle-version", "build-tools-bump-gradle-in-tests", "minimize-repro"].map(skill);
const repos = [
  { summary: { file: "JetBrains-kotlin", name: "JetBrains/kotlin" }, skills: kotlin },
  { summary: { file: "JetBrains-android", name: "JetBrains/android" }, skills: ["jewel-ui", "write-evals"].map(skill) },
  { summary: { file: "broken", name: "broken" }, skills: [] },
];

test("starKey joins the index file name and the primary path", () => {
  assert.equal(STARS_KEY, "skill-atlas:stars");
  assert.equal(starKey("JetBrains-kotlin", "a/b/SKILL.md"), "JetBrains-kotlin/a/b/SKILL.md");
});

test("parseStars reads a JSON array of keys and tolerates anything else", () => {
  assert.deepEqual(parseStars('["r/a", "r/b"]'), ["r/a", "r/b"]);
  assert.deepEqual(parseStars(null), [], "missing");
  assert.deepEqual(parseStars("not json"), [], "invalid JSON");
  assert.deepEqual(parseStars('{"r/a": true}'), [], "not an array");
  assert.deepEqual(parseStars('["r/a", 1, null, {"k": "r/b"}, "r/b"]'), ["r/a", "r/b"], "non-strings dropped");
  assert.deepEqual(parseStars('["r/b", "r/a", "r/b"]'), ["r/b", "r/a"], "duplicates once, order kept");
});

test("toggleStar appends a new key, removes an existing one, and doesn't mutate its input", () => {
  const stars = ["r/a"];
  assert.deepEqual(toggleStar(stars, "r/b"), ["r/a", "r/b"]);
  assert.deepEqual(toggleStar(["r/a", "r/b"], "r/a"), ["r/b"]);
  assert.deepEqual(stars, ["r/a"]);
});

test("starredFirst puts starred skills first and keeps name order in both groups", () => {
  const stars = new Set([starKey("JetBrains-kotlin", kotlin[3].path), starKey("JetBrains-kotlin", kotlin[2].path)]);
  assert.deepEqual(
    starredFirst("JetBrains-kotlin", kotlin, stars).map((s) => s.name),
    ["build-tools-bump-gradle-in-tests", "minimize-repro", "analysis-api-mark-internal-apis", "build-bump-gradle-version"],
  );
  assert.deepEqual(starredFirst("JetBrains-kotlin", kotlin, new Set()), kotlin, "no stars → unchanged");
});

test("starredFirst ignores a star of another repository with the same path", () => {
  const stars = new Set([starKey("JetBrains-android", kotlin[3].path)]);
  assert.deepEqual(starredFirst("JetBrains-kotlin", kotlin, stars), kotlin);
});

test("starredSkills lists stars across repositories by repository name, then skill name", () => {
  const stars = new Set([
    starKey("JetBrains-kotlin", kotlin[2].path),
    starKey("JetBrains-android", ".claude/skills/write-evals/SKILL.md"),
    starKey("JetBrains-kotlin", kotlin[0].path),
    starKey("JetBrains-android", ".claude/skills/jewel-ui/SKILL.md"),
  ]);
  assert.deepEqual(starredSkills(repos, stars), [
    { file: "JetBrains-android", repoName: "JetBrains/android", name: "jewel-ui", path: ".claude/skills/jewel-ui/SKILL.md" },
    { file: "JetBrains-android", repoName: "JetBrains/android", name: "write-evals", path: ".claude/skills/write-evals/SKILL.md" },
    { file: "JetBrains-kotlin", repoName: "JetBrains/kotlin", name: "analysis-api-mark-internal-apis", path: kotlin[0].path },
    { file: "JetBrains-kotlin", repoName: "JetBrains/kotlin", name: "build-tools-bump-gradle-in-tests", path: kotlin[2].path },
  ]);
});

test("starredSkills skips stale stars and error repositories", () => {
  const stars = new Set([
    starKey("JetBrains-gone", kotlin[0].path), // unknown index file
    starKey("JetBrains-kotlin", ".claude/skills/removed/SKILL.md"), // unknown path
    starKey("broken", "x/SKILL.md"), // invalid index: no skills
  ]);
  assert.deepEqual(starredSkills(repos, stars), []);
  assert.deepEqual(starredSkills(repos, new Set()), [], "no stars");
});

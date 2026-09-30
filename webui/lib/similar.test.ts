import assert from "node:assert/strict";
import { test } from "node:test";
import { similarities } from "./similar.ts";

const score = (pairs: { a: string; b: string; score: number }[], a: string, b: string) =>
  pairs.find((p) => (p.a === a && p.b === b) || (p.a === b && p.b === a))!.score;

test("identical and disjoint texts", () => {
  const pairs = similarities([
    { key: "a", text: "Bump the Gradle version" },
    { key: "b", text: "bump the gradle VERSION!" },
    { key: "c", text: "kotlin compiler diagnostics" },
  ]);
  assert.ok(Math.abs(score(pairs, "a", "b") - 1) < 1e-9);
  assert.equal(score(pairs, "a", "c"), 0);
});

test("rare shared words score higher than common ones", () => {
  const pairs = similarities([
    { key: "a", text: "the skill gradle wrapper" },
    { key: "b", text: "the skill gradle wrapper upgrade" },
    { key: "c", text: "the skill kotlin" },
    { key: "d", text: "the skill compiler" },
  ]);
  assert.ok(score(pairs, "a", "b") > score(pairs, "c", "d"));
  assert.ok(score(pairs, "c", "d") > 0);
});

test("every pair once, scores within 0..1, empty text scores 0", () => {
  const docs = ["x y", "alpha beta alpha", "beta gamma", "", "a !"].map((text, i) => ({ key: `k${i}`, text }));
  const pairs = similarities(docs);
  assert.equal(pairs.length, 10);
  const seen = new Set(pairs.map((p) => [p.a, p.b].sort().join("|")));
  assert.equal(seen.size, 10);
  for (const p of pairs) {
    assert.notEqual(p.a, p.b);
    assert.ok(p.score >= 0 && p.score <= 1);
  }
  // "x y" and "a !" have no tokens of length >= 2.
  for (const k of ["k0", "k3", "k4"]) assert.ok(pairs.filter((p) => p.a === k || p.b === k).every((p) => p.score === 0));
  assert.deepEqual(similarities([]), []);
  assert.deepEqual(similarities([{ key: "a", text: "" }, { key: "b", text: "" }]), [{ a: "a", b: "b", score: 0 }]);
});

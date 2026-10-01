import assert from "node:assert/strict";
import { test } from "node:test";
import { orgRows, parseOrgSummary, type OrgSummary } from "./orgs.ts";

const valid: OrgSummary = {
  owner: "JetBrains",
  scanned_at: "2026-10-01T09:30:00Z",
  repos_scanned: 683,
  repos: [
    { repo: "JetBrains/MPS", file: "JetBrains-MPS", skills: 41 },
    { repo: "JetBrains/a b", file: "JetBrains-a b", skills: 1 },
  ],
};

test("parseOrgSummary accepts a valid summary", () => {
  assert.deepEqual(parseOrgSummary(JSON.stringify(valid)), valid);
  assert.deepEqual(parseOrgSummary(JSON.stringify({ ...valid, repos: [] }))?.repos, []);
});

test("parseOrgSummary rejects anything else", () => {
  const without = (key: string) => Object.fromEntries(Object.entries(valid).filter(([k]) => k !== key));
  const repo = valid.repos[0];
  for (const bad of [
    "{not json",
    "null",
    "[]",
    '"JetBrains"',
    JSON.stringify(without("owner")),
    JSON.stringify({ ...valid, owner: 1 }),
    JSON.stringify(without("scanned_at")),
    JSON.stringify({ ...valid, scanned_at: null }),
    JSON.stringify(without("repos_scanned")),
    JSON.stringify({ ...valid, repos_scanned: "683" }),
    JSON.stringify(without("repos")),
    JSON.stringify({ ...valid, repos: {} }),
    JSON.stringify({ ...valid, repos: [null] }),
    JSON.stringify({ ...valid, repos: [{ ...repo, repo: 1 }] }),
    JSON.stringify({ ...valid, repos: [{ file: repo.file, skills: 1 }] }),
    JSON.stringify({ ...valid, repos: [{ ...repo, file: null }] }),
    JSON.stringify({ ...valid, repos: [{ ...repo, skills: "41" }] }),
  ]) {
    assert.equal(parseOrgSummary(bad), null, bad);
  }
});

test("orgRows keeps the file order and links only to existing indexes", () => {
  assert.deepEqual(orgRows(valid, ["JetBrains-a b", "JetBrains-kotlin"]), [
    { repo: "JetBrains/MPS", skills: 41, href: null },
    { repo: "JetBrains/a b", skills: 1, href: "/repos/JetBrains-a%20b" },
  ]);
  assert.deepEqual(orgRows({ ...valid, repos: [] }, ["JetBrains-MPS"]), []);
});

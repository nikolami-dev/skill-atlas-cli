# Skill Atlas CLI — Specification

## 1. Summary
`skill-atlas` is a command-line tool that scans a public GitHub repository, or every repository
of an owner (an organization such as JetBrains, or a user), finds the agent skill files they
contain (e.g. `SKILL.md`), and lists them with their metadata.

## 2. Tech constraints
- Language: Go (latest stable). Single static binary named `skill-atlas`.
- Concurrency: use goroutines for all independent network calls (fetching file
  contents, fetching commit info). Bound concurrency (e.g. worker pool of ~10).
- Repository access: GitHub REST API over HTTPS. Do NOT clone the repo.
- Auth: if env var `GITHUB_TOKEN` is set, send it as `Authorization: Bearer <token>`.
  Without it, requests are anonymous (60 req/h limit); on HTTP 403/429 rate-limit
  errors print a clear message suggesting `GITHUB_TOKEN`.

## 3. Commands

### 3.1 `skill-atlas scan <github-url> [--json]`

**Input**
- `<github-url>` (required): HTTPS URL of a GitHub repo, e.g. `https://github.com/JetBrains/kotlin`.
  Accept optional trailing `/`, `.git`, or `/tree/<branch>/...` suffix; use the given
  branch if present, otherwise the repo's default branch.
- An **owner URL** `https://github.com/{owner}` (optional trailing `/`, nothing else) scans every
  repository of that owner instead: see §3.2. Every other URL shape keeps the behaviour below.
- `--json` (optional): print JSON instead of a table.
- Missing/invalid URL → print usage to stderr, exit code 2.

**Skill file detection**
- A skill file is any file, in any directory, whose base name matches
  `SKILL.md` or `SKILLS.md` case-insensitively, AND that starts with a `---` YAML
  frontmatter block containing `name` or `description`. Files without it (e.g. a docs
  page `docs/skills.md`) are not skills and are skipped.
- Get the full file list with one call:
  `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`.
- If the response has `"truncated": true` (large repos such as JetBrains/kotlin), list that
  tree non-recursively and repeat the recursive call for each subtree (by SHA) in parallel.

**Duplicates**
- Files with identical content (same git blob SHA from the tree listing) are ONE skill.
  E.g. `.agents/skills/x/SKILL.md` and `.claude/skills/x/SKILL.md` → one entry with both paths.
- Fetch content and commit info once per unique blob, using the primary path
  (the alphabetically first path).
- Same name but different content → separate entries.

**Categories** (per path; a skill's `categories` is the sorted set over all its paths)
- `test`: any directory above the skill's own folder is `test`, `tests`, `testdata`,
  `test-data`, `__tests__`, ends with `Test`/`Tests` (e.g. `jvmTest`), or ends with
  `-test(s)`/`_test(s)`. The skill's own folder (e.g. `mps-tests/`) does not count.
- `agent`: otherwise, if the top-level directory starts with `.` (`.claude`, `.agents`, …)
  or is `agent`/`agents`, or the file is at the repo root.
- `product`: everything else (e.g. skills shipped in plugin resources).

**Per skill, collect (fetch in parallel)**
| Field          | Source |
|----------------|--------|
| `repo`         | `{owner}/{repo}` |
| `name`         | YAML frontmatter `name`; fallback: parent directory name (repo name for a root-level file) |
| `description`  | YAML frontmatter `description`; fallback: empty string |
| `path`         | Primary path (first of `paths`) |
| `paths`        | All paths with this content, sorted |
| `categories`   | Sorted distinct categories of `paths` |
| `commit_sha`   | SHA of the most recent commit that touched the primary path (`GET /repos/{owner}/{repo}/commits?path={path}&per_page=1`) |
| `commit_date`  | Committer date of that commit (RFC 3339) |

**Storage**
- Write the result to `~/.skill-atlas/{owner}-{repo}.json` (create the directory if
  missing, overwrite the file). Content: JSON array of the objects above, sorted by `path`.

**Output (stdout)**
- Default: a table with columns `NAME | CATEGORY | DESCRIPTION | PATH | COMMIT` (short SHA,
  7 chars), description truncated to ~60 chars, PATH suffixed with `(+N copies)` for duplicates. Followed by a line `Found N skills in {owner}/{repo}`.
- With `--json`: the same JSON array that is written to the storage file.
- No skills found → print `Found 0 skills in {owner}/{repo}`, exit code 0.
- Network/API error → message to stderr, exit code 1.

### 3.2 Owner scan: `skill-atlas scan https://github.com/{owner} [--json]`
Scans every repository of an organization (e.g. `https://github.com/JetBrains`) or a user.

**Repositories**
- List them with `GET /users/{owner}/repos?type=owner&per_page=100&page={n}` for n = 1, 2, …,
  until a page is empty. This endpoint works for organizations and users alike.
- Skip forks (`"fork": true`): their skills belong to the upstream repository. Archived
  repositories are included.
- Scan each repository on its `default_branch` from the listing (no extra lookup), exactly as §3.1
  does: same detection, duplicates, categories and fields.
- Do NOT use GitHub code search: it is incomplete (`org:JetBrains filename:SKILL.md` finds 1 of the
  6 skills of `JetBrains/android` that the tree listing finds), limited to 10 requests per minute,
  and capped at 1000 results.
- Repositories are scanned concurrently. The one request limit of §2 (~10) covers all requests of
  all repositories together.

**Errors**
- An empty repository (the tree request answers HTTP 409) has 0 skills. It is not an error.
- Any other error in one repository: print `skill-atlas: {owner}/{repo}: {error}` to stderr, leave
  that repository out of the summary (including `repos_scanned`), and go on with the others. The
  output and storage below still happen; the exit code is then 1.
- A rate-limit error (§2) in any repository fails the whole scan: print the rate-limit message,
  exit code 1, and write NO files.
- Unknown owner (the listing answers 404) → message to stderr, exit code 1.

**Storage**
- For each repository with at least 1 skill: `~/.skill-atlas/{owner}-{repo}.json`, byte-identical
  to what `skill-atlas scan https://github.com/{owner}/{repo}` writes (§3.1).
- A repository with 0 skills gets no file. An existing file of an earlier scan is left untouched.
- The summary `~/.skill-atlas/orgs/{owner}.json` (create `orgs/` if missing, overwrite the file),
  indented like the index files:
  ```json
  {
    "owner": "JetBrains",
    "scanned_at": "2026-10-01T09:30:00Z",
    "repos_scanned": 683,
    "repos": [
      { "repo": "JetBrains/MPS", "file": "JetBrains-MPS", "skills": 41 }
    ]
  }
  ```
  | Field           | Meaning |
  |-----------------|---------|
  | `owner`         | `{owner}` as written in the URL |
  | `scanned_at`    | when the scan finished, UTC, RFC 3339 with seconds |
  | `repos_scanned` | non-fork repositories scanned without error, including those with 0 skills |
  | `repos`         | ONLY the repositories with at least 1 skill, sorted by `skills` descending, then `repo` |
  | `repos[].repo`  | `{owner}/{name}`, `name` from the listing |
  | `repos[].file`  | the index file name without `.json`, i.e. `{owner}-{name}` |
  | `repos[].skills`| number of skills in that index file |

**Output (stdout)**
- Default: a table with columns `REPO | SKILLS`, one row per entry of `repos`, in that order,
  followed by `Found N skills in M of K repositories of {owner}` (N = sum of `skills`,
  M = number of `repos`, K = `repos_scanned`). With no repository with skills, only that line.
- With `--json`: the same JSON that is written to the summary file.

## 4. Out of scope
- Private repos beyond what `GITHUB_TOKEN` gives access to. An owner scan lists public
  repositories only.
- Non-GitHub hosts.
- Other commands (only `scan` for now).
- Owner scan: forks, incremental rescans (only changed repositories), pinning an owner scan to a
  point in time, deleting index files of repositories that no longer have skills, a code-search
  shortcut, filtering repositories by name or topic.

## 5. Testing

### Unit tests
- URL parsing (plain, trailing slash, `.git`, `/tree/<branch>/...`, owner-only with and without a
  trailing slash, invalid).
- Skill file matching (`SKILL.md`, `skills.md`, `Skill.MD` match; `SKILL.txt`, `MYSKILL.md` do not).
- Frontmatter parsing, including the directory-name fallback and skipping files without frontmatter.
- Categories (incl. a skill folder named `*-tests` under `.agents/` staying `agent`).
- Merging identical copies into one skill.
- Owner scan (§3.2) against a fake GitHub API (`httptest`; the API base URL is a variable for this):
  listing pages read until an empty page; forks skipped; an empty repository (409) counts as scanned
  with 0 skills; a repository with 0 skills gets no index file; the index file of a repository with
  skills equals the single-repository scan's; the summary's fields and order; the `Found …` line
  and `--json` output; a failing repository → exit code 1, reported on stderr, left out of the
  summary, the others still stored; a rate-limit error → exit code 1 and no files written.

### E2E tests
Behind build tag `e2e` (`go test -tags e2e ./...`). Every skill in every test must have
non-empty `name`, `path`, `paths`, `categories`, `commit_sha`, `commit_date`.
All are pinned to a commit via `/tree/<sha>` so upstream changes can't break them, except the
"Default branch" case, which uses a plain URL and only a loose assertion.

**Recorded API responses.** The pinned cases MUST NOT call the GitHub API by default. They run the
real CLI code (`run`, in-process) against recorded responses, so they need no token and can't hit a
rate limit. A live run of the old suite made 605 requests (measured 2026-10-01), against the
Actions token's 1,000 an hour per repository.
- Recordings: `testdata/e2e/{owner}-{repo}.json.gz`, one per pinned repo (both MPS cases share
  one). Each is a gzipped JSON object mapping a request's path and query
  (`/repos/…/git/trees/…?recursive=1`) to `{ "status", "body" }`.
- Replay (`e2e_recording_test.go`, `useRecording(t, name)`): the test swaps
  `http.DefaultClient.Transport`, so production code is unchanged. A request that isn't recorded
  fails the scan with `no recorded response for GET … ; re-record with E2E_RECORD=1`; nothing falls
  through to the network.
- `E2E_RECORD=1` runs the pinned cases against the live API (with `GITHUB_TOKEN`; 501 requests)
  and rewrites each recording when its test passes. Re-record when the CLI's requests change or a
  case is added. Recording twice gives the same bytes (sorted keys, no gzip timestamp).
- Recordings are minimized on write; the full tree listings are ~140 MB of JSON, ~18 MB gzipped.
  - Tree listings keep only entries whose file name contains `skill` (any case), so every skill-file
    candidate and near miss stays (e.g. koog's `docs/docs/skills.md`). Level listings (the
    truncation fallback) also keep the subtrees that lead to such a file; listings of other subtrees
    are dropped. Entries keep only `path`, `type`, `sha`; `truncated` is kept, so the Kotlin case
    still walks the truncation fallback.
  - Commit lists keep only `sha` and `commit.committer.date`. File contents are kept unchanged.
  - Result: 172 KB for all four repos. The replayed `--json` output of every pinned case is
    byte-identical to a live scan (checked when recording).
- The "Default branch" case is the only live test (besides any owner-scan test, which can't be
  pinned). It uses the small `JetBrains/koog` (11 requests). With the "Owner scan" case (5
  requests), a whole E2E run makes 16 API requests (measured 2026-10-01), so with the Actions token
  CI can run about 60 times an hour.

| Case | URL | Expect |
|------|-----|--------|
| Basic | `https://github.com/JetBrains/kotlin/tree/197871e7256b81028d7dbce42eaee642a36900d0` | Exactly 6 skills, all under `.claude/skills/`. `~/.skill-atlas/JetBrains-kotlin.json` exists and matches stdout. |
| Default branch | `https://github.com/JetBrains/koog` (no `/tree/`, so the default branch is looked up; live API) | At least 1 skill found. Unpinned, so no exact count. |
| Duplicates in `.claude` and `.agents` | `https://github.com/JetBrains/MPS/tree/49d37b63488a0a8e42eb0130cb867fd508f398ac` | Exactly 41 skills, no name listed twice; each has both `.agents/skills/<dir>/SKILL.md` and `.claude/skills/<dir>/SKILL.md` in `paths`. |
| Part of the product | same MPS commit | Exactly 32 skills have a path under `plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/`; exactly those have `product` in `categories`. |
| Test data | `https://github.com/JetBrains/koog/tree/16d83270f8a7f25358ae0165466f14e70416c428` | Exactly 4 skills: 2 under `.claude/skills/` with `[agent]`, 2 under `integration-tests/src/jvmTest/resources/skills/` with `[test]`. `docs/docs/skills.md` (no frontmatter) is not listed. |
| Unusual folder | `https://github.com/JetBrains/android/tree/4f0a5e1cb653c29f81c6b77eff885a6e81622cf4` | Exactly 6 skills, all under `agent/skills/` with `[agent]`. `agent/skills/android-studio-evals/SKILL.md` is named `write-evals` (frontmatter wins over folder name). |
| Owner scan | `https://github.com/nikolami-dev` (a small owner; unpinned like "Default branch", because an owner's repositories can't be pinned) | Exit code 0. `~/.skill-atlas/orgs/nikolami-dev.json` exists and equals stdout of `--json`; `repos_scanned` ≥ 1; `repos` contains `nikolami-dev/skill-atlas-cli` with `skills` ≥ 1; every `repos[].file` has an index file with exactly `skills` entries. A JetBrains-wide scan (~1–2k requests) does not fit CI's token limit of 1000 requests per hour, so it is checked manually (§6). |

## 6. Definition of Done
- All tests pass locally
- Manual owner scan: `GITHUB_TOKEN=… skill-atlas scan https://github.com/JetBrains` exits 0, and its
  summary lists at least 20 repositories with skills, including `JetBrains/kotlin`, `JetBrains/MPS`,
  `JetBrains/koog` and `JetBrains/android`. The PR records the numbers it printed (the `Found …`
  line) and how long it took.
- A pull request is open and CI is green for its latest commit
- Red CI: read the logs, fix, push to the same branch again

## 7. Change workflow (applies to the whole repo, incl. `webui/`)
- Every change goes through a pull request. NEVER push directly to `main`, even with admin rights.
- Steps: branch off the latest `main` → commit → push the branch → `gh pr create` → watch CI.
- `main` is protected: the `cli` and `webui` CI checks must pass and the branch must be up to
  date with `main` before the PR can be merged.
- One logical change per PR. The PR description follows `.github/pull_request_template.md`
  (Summary, Visual demonstration, Architecture changes, Tests, Limitations). For user-visible
  changes, follow the `recording-pr-demos` skill; GIFs go on the `pr-assets` branch (media only,
  never merged).
- Required checks on `main`: `cli`, `webui` and `visual` (the web UI screenshot comparison, see
  `.spec/webui.md` §6). Visual changes are accepted only by the reviewer: the label
  `approve-screenshots`, then "Approve and run workflows" for the bot's baseline commit.

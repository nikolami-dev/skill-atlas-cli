# Skill Atlas CLI — Specification

## 1. Summary
`skill-atlas` is a command-line tool that scans a public GitHub repository, finds the
agent skill files it contains (e.g. `SKILL.md`), and lists them with their metadata.

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
- `--json` (optional): print JSON instead of a table.
- Missing/invalid URL → print usage to stderr, exit code 2.

**Skill file detection**
- A skill file is any file, in any directory, whose base name matches
  `SKILL.md` or `SKILLS.md` case-insensitively.
- Get the full file list with one call:
  `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`.
- If the response has `"truncated": true` (large repos such as JetBrains/kotlin), list that
  tree non-recursively and repeat the recursive call for each subtree (by SHA) in parallel.

**Per skill, collect (fetch in parallel)**
| Field          | Source |
|----------------|--------|
| `repo`         | `{owner}/{repo}` |
| `name`         | YAML frontmatter `name`; fallback: parent directory name |
| `description`  | YAML frontmatter `description`; fallback: empty string |
| `path`         | Path of the file in the repo |
| `commit_sha`   | SHA of the most recent commit that touched the file (`GET /repos/{owner}/{repo}/commits?path={path}&per_page=1`) |
| `commit_date`  | Committer date of that commit (RFC 3339) |

**Storage**
- Write the result to `~/.skill-atlas/{owner}-{repo}.json` (create the directory if
  missing, overwrite the file). Content: JSON array of the objects above, sorted by `path`.

**Output (stdout)**
- Default: a table with columns `NAME | DESCRIPTION | PATH | COMMIT` (short SHA, 7 chars),
  description truncated to ~60 chars. Followed by a line `Found N skills in {owner}/{repo}`.
- With `--json`: the same JSON array that is written to the storage file.
- No skills found → print `Found 0 skills in {owner}/{repo}`, exit code 0.
- Network/API error → message to stderr, exit code 1.

## 4. Out of scope
- Private repos beyond what `GITHUB_TOKEN` gives access to.
- Non-GitHub hosts.
- Other commands (only `scan` for now).

## 5. Testing

### Unit tests
- URL parsing (plain, trailing slash, `.git`, `/tree/<branch>/...`, invalid).
- Skill file matching (`SKILL.md`, `skills.md`, `Skill.MD` match; `SKILL.txt`, `MYSKILL.md` do not).
- Frontmatter parsing, including the directory-name fallback.

### E2E test
- Run `skill-atlas scan https://github.com/JetBrains/kotlin --json`.
- Expect exactly 6 skills, all under `.claude/skills/`
  (see https://github.com/JetBrains/kotlin/tree/master/.claude/skills).
- Each must have non-empty `name`, `path`, `commit_sha`, `commit_date`.
- `~/.skill-atlas/JetBrains-kotlin.json` exists and matches stdout.
- Skip the E2E test if the network isn't available (e.g. behind a build tag `e2e`).

## Definition of Done
- All tests pass locally
- Pushed; CI is green for this commit
- Red CI: read the logs, fix, push again

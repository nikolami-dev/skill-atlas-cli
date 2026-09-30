# Skill Atlas Web UI — Specification

## 1. Summary
A local Next.js web app that browses the skill indexes produced by the
`skill-atlas` CLI (`skill-atlas scan <github-url>`, see `.spec/cli.md`)
and shows the content of each skill file.

Lives in the `webui/` directory of this repo; all `npm` commands below run from `webui/`.

## 2. Tech constraints
- Node.js 24. Next.js (latest, App Router, TypeScript). Pages are React Server Components; client
  JS only where interaction requires it (the repo selector).
- Markdown rendering: `react-markdown` + `remark-gfm`. Plain CSS, no UI framework.
- Read-only. No database, no auth, no writes to disk.

## 3. Data source

### 3.1 Index files
- Directory: `$SKILL_ATLAS_DIR`, default `~/.skill-atlas` (where the CLI stores results).
- Each `{owner}-{repo}.json` file is one repo. Content: JSON array of skills as written by the CLI:

| Field         | Type       | Notes |
|---------------|------------|-------|
| `repo`        | string     | `{owner}/{repo}` |
| `name`        | string     | |
| `description` | string     | may be empty |
| `path`        | string     | primary path of the skill file |
| `paths`       | string[]   | all identical copies; optional (older CLI output lacks it) |
| `categories`  | string[]   | `agent` / `product` / `test`; optional (older CLI output lacks it) |
| `commit_sha`  | string     | last commit touching `path` |
| `commit_date` | string     | RFC 3339 |

- Files are read on every request, so a new `scan` shows up after a page reload.
- A file that isn't valid JSON appears in the repo list, and selecting it shows an error message; it does not crash the app.

### 3.2 Skill content
- The index does not contain file contents. Content is fetched server-side from
  `https://raw.githubusercontent.com/{repo}/{commit_sha}/{path}` (each path segment URL-encoded).
  Pinned to `commit_sha`, so the response is immutable and cached (`force-cache`).
  If `commit_sha` is empty, `HEAD` is used and the response is not cached.
- The leading `---` YAML frontmatter is stripped before rendering (name and description are
  shown from the index instead).
- Fetch failure (network, 404) → the main panel shows an error message with a link to the file on GitHub.

## 4. UI

### 4.1 Routing
Single page `/` driven by query params:
- `?repo={file name without .json}` — e.g. `JetBrains-kotlin`. Missing → first repo (alphabetical).
- `&skill={path}` — primary `path` of a skill in that repo. Missing → empty-state message.
- Unknown `repo` or `skill` → 404. Params are matched against the index only; they are
  never used directly as a file path or URL (no path traversal).

### 4.2 Layout
```
+-------------------------------------------------------------+
| Skill Atlas                           [ repo selector v ]   |  header
+----------------+--------------------------------------------+
| skill-a        |  skill-b                                   |
| > skill-b      |  description                               |
| skill-c        |  path · categories · commit (date)         |
| ...            |  ----------------------------------------  |
|                |  rendered SKILL.md body                    |
+----------------+--------------------------------------------+
   sidebar                    main
```
- **Header**: app title. If there is more than one repo, a `<select>` of repos (labelled by
  index file name, e.g. `JetBrains-kotlin`); changing it navigates to that repo. With exactly one
  repo, the repo name is shown as text.
- **Sidebar**: skills of the selected repo, sorted by name, each a link with the skill name
  and its categories. The selected skill is highlighted. Sidebar scrolls independently.
- **Main**: for the selected skill — name, description, primary path (link to GitHub at the
  commit), other copies (`paths` minus `path`), categories, short commit SHA and date, then
  the rendered markdown body.
- **Empty states**: no index files → message explaining how to run `skill-atlas scan`;
  repo with 0 skills → "No skills found"; no skill selected → "Select a skill".

## 5. Out of scope
- Running scans from the UI, search/filtering, editing skills, deployment.

## 6. Testing
- `npm test`: unit tests (Node test runner) for index loading — repo listing, unknown/traversal
  repo names rejected, invalid JSON reported as an error, frontmatter stripping, raw-content URL building.
- Manual: `npm run dev` with at least one index in `~/.skill-atlas`, check header, sidebar
  and content render; `npm run build` passes.

## 7. Definition of Done
- `npm test` and `npm run build` pass locally.
- CI (`.github/workflows/ci.yml`, job `webui`) runs `npm ci`, `npm test` and `npm run build`; it is green for the pushed commit.
- The page renders the existing `JetBrains-kotlin.json` index with skill content loaded from GitHub.

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
Two pages, both driven by query params:
- `/` — skill browser.
  - `?repo={file name without .json}` — e.g. `JetBrains-kotlin`. Missing → first repo (alphabetical).
  - `&skill={path}` — primary `path` of a skill in that repo. Missing → empty-state message.
  - `&q={keyword}` — skill filter (§4.3). Missing or blank → no filtering.
- `/similar` — similar skills in a repo (§4.4).
  - `?repo=` — same rules as on `/`.
- Unknown `repo` or `skill` → 404. Params are matched against the index only; they are
  never used directly as a file path or URL (no path traversal).

### 4.2 Layout
```
+-------------------------------------------------------------+
| Skill Atlas   Skills | Similar         [ repo selector v ]   |  header
+----------------+--------------------------------------------+
| [filter.....]  |  skill-b                                   |
| skill-a        |  description                               |
| > skill-b      |  path · categories · commit (date)         |
| skill-c        |  similar skills (top 5, %)                 |
| ...            |  ----------------------------------------  |
|                |  rendered SKILL.md body                    |
+----------------+--------------------------------------------+
   sidebar                    main
```
- **Header**: app title, then a navbar with two links, **Skills** (`/?repo=…`) and **Similar**
  (`/similar?repo=…`), both keeping the current repo; the link of the current page is highlighted.
  If there is more than one repo, a `<select>` of repos (labelled by
  index file name, e.g. `JetBrains-kotlin`); changing it navigates to that repo on the current page (`/` or `/similar`). With exactly one
  repo, the repo name is shown as text.
- **Sidebar**: the filter box (§4.3), then the skills of the selected repo, sorted by name, each a
  link with the skill name and its categories. The selected skill is highlighted. Sidebar scrolls
  independently.
- **Main**: for the selected skill — name, description, primary path (link to GitHub at the
  commit), other copies (`paths` minus `path`), categories, short commit SHA and date, the
  "Similar skills" section (§4.4), then the rendered markdown body.
- **Empty states**: no index files → message explaining how to run `skill-atlas scan`;
  repo with 0 skills → "No skills found"; no skill selected → "Select a skill".

### 4.3 Feature: filter skills
Filter the sidebar by a keyword in a skill's name or description.
- **UI**: a text input at the top of the sidebar, placeholder `Filter skills…`, prefilled with `q`.
  It is a plain GET `<form>` (fields `repo` and `q`), so it works without client JS; submitting
  navigates to `/?repo=…&q=…`. When `q` is set, show `N of M skills` under the input and a
  "Clear" link (`/?repo=…`).
- **Matching**: case-insensitive substring match of the trimmed `q` against the skill's `name` and
  `description` (both from the index) ONLY. A skill matches if either contains `q`. Paths,
  categories and the SKILL.md content are NOT searched, so filtering never fetches content.
- **Links**: while filtering, sidebar skill links keep `q` (`/?repo=…&skill=…&q=…`), so the filter
  survives selecting a skill. The selected skill stays shown in main even if it doesn't match.
- **Empty result**: `No skills match "{q}"`.
- **Code**: matching logic is a pure function in `lib/filter.ts`
  (`matchesSkill(s: Skill, q: string): boolean`), unit-tested in `lib/filter.test.ts`.

### 4.4 Feature: similar skills
Compare the SKILL.md files of the selected repo with each other and show how similar they are.
- **Scope**: all skills of the selected repo (one index file). Identical copies are already merged
  by the CLI, so every skill is compared once.
- **Algorithm**: TF-IDF cosine similarity.
  - Document = the skill's full raw SKILL.md content (frontmatter included, so name and description count).
  - Tokens: lowercase the text, split on anything that isn't a letter or digit (`/[^\p{L}\p{N}]+/u`),
    drop tokens shorter than 2 characters. No stemming, no stop-word list (IDF down-weights common words).
  - Term weight: `tf × idf`, where `tf` = count of the term in the document and
    `idf = ln((1 + N) / (1 + df)) + 1` (N = number of documents, df = documents containing the term).
  - Similarity = cosine of the two weight vectors; percentage = `Math.round(cosine × 100)`.
  - A document with no tokens has similarity 0 with everything.
- **Content**: fetched with `fetchSkillContent`, all skills in parallel. Skills whose content
  can't be fetched are left out, and the page shows a note listing them.
- **Similar page** (`/similar?repo=…`, reached from the **Similar** navbar link): a table of skill
  pairs `Skill A | Skill B | Similarity` for all pairs with similarity ≥ 30%, sorted by similarity
  descending, then by names. Skill names link to `/?repo=…&skill={path}`. A pair is listed once
  (A–B, not also B–A). Fewer than 2 skills → "Need at least 2 skills to compare"; no pair ≥ 30% →
  "No similar skills (≥ 30%)". Uses the same header (navbar, repo selector) and no sidebar.
- **Skill page section**: "Similar skills" in main (after the metadata, before the markdown body)
  lists the top 5 other skills of the repo by similarity, highest first, each as a link and a
  percentage; skills at 0% are omitted. Rendered inside `<Suspense>` so the skill body doesn't wait for it.
- **Code**: the algorithm is a pure function in `lib/similar.ts`
  (`similarities(docs: { key: string; text: string }[]): { a: string; b: string; score: number }[]`,
  returning every pair once with `score` in 0..1), unit-tested in `lib/similar.test.ts`.

### 4.5 Shared building blocks (already on `main`; reuse, don't duplicate)
- `app/Shell.tsx` — page frame (header with title, navbar, repo selector). The navbar is added here.
- `fetchSkillContent(s)` in `lib/atlas.ts` — cached raw SKILL.md fetch pinned to `commit_sha`.
- The two features are built in parallel on separate branches: the filter touches the sidebar in
  `app/page.tsx` and `lib/filter*.ts`; similar skills touches `app/Shell.tsx`, `app/RepoSelect.tsx`,
  `app/similar/`, the main panel in `app/page.tsx` and `lib/similar*.ts`. Keep edits to those areas.

## 5. Out of scope
- Running scans from the UI, editing skills, deployment.
- Filter: searching paths, categories or SKILL.md content; regex/fuzzy matching, ranking by relevance. Similarity: comparing across repos,
  semantic/embedding similarity, configurable threshold.

## 6. Testing
- `npm test`: unit tests (Node test runner) for index loading — repo listing, unknown/traversal
  repo names rejected, invalid JSON reported as an error, frontmatter stripping, raw-content URL building.
- `lib/filter.test.ts`: matches in name, matches in description, does NOT match on path or
  category only, case-insensitive, trimmed `q`, blank `q` matches everything, no match.
- `lib/similar.test.ts`: identical texts → 1, disjoint texts → 0, a pair sharing rare words scores
  higher than a pair sharing only words that appear in every document, every pair returned once,
  empty text → 0, scores within 0..1.
- Manual: `npm run dev` with at least one index in `~/.skill-atlas`, check header, navbar, sidebar,
  filter, Similar page and content render; `npm run build` passes.

## 7. Definition of Done
- `npm test` and `npm run build` pass locally.
- CI (`.github/workflows/ci.yml`, job `webui`) runs `npm ci`, `npm test` and `npm run build`; it is green for the latest commit of the pull request.
- The change is in a pull request, never pushed directly to `main` (see `.spec/cli.md` §7, Change workflow).
- The page renders the existing `JetBrains-kotlin.json` index with skill content loaded from GitHub.
- Filter: on `JetBrains-kotlin`, `q=gradle` (and `q=GRADLE`) lists exactly 3 skills:
  `build-bump-gradle-version`, `build-tools-bump-gradle-api`, `build-tools-bump-gradle-in-tests`.
  `analysis-api-mark-internal-apis` is NOT listed ("gradle" appears only in its body).
- Similar: `/similar?repo=JetBrains-kotlin` shows 8 pairs ≥ 30%; the top 3 are the pairs among the
  three Gradle-bump skills (76%, 75%, 68%).

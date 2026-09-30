# Skill Atlas Web UI — Specification

## 1. Summary
A local Next.js web app that browses the skill indexes produced by the
`skill-atlas` CLI (`skill-atlas scan <github-url>`, see `.spec/cli.md`).
The home page shows every indexed repository as a card, with an instant search across
repositories and their skills (§4.6). Opening a repository shows its skills and the content of
each skill file.

Lives in the `webui/` directory of this repo; all `npm` commands below run from `webui/`.

## 2. Tech constraints
- Node.js 24. Next.js (latest, App Router, TypeScript). Pages are React Server Components; client
  JS only where interaction requires it (the gallery search, §4.6).
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
- A repository's **display name** is the `repo` field (`owner/repo`) of the first skill in its index
  file. For an empty or unreadable index, the display name is the file name without `.json`.
- A file that isn't valid JSON appears in the gallery as an error card (§4.6), and opening it shows
  an error message; it does not crash the app.

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
`{repo}` below is the index file name without `.json` (e.g. `JetBrains-kotlin`), URL-encoded in links.
- `/` — repository gallery (§4.6).
  - `?q={keyword}` — gallery search. Missing or blank → all repositories.
- `/repos/{repo}` — skill browser for one repository.
  - `?skill={path}` — primary `path` of a skill in that repo. Missing → empty-state message.
  - `?q={keyword}` — skill filter (§4.3). Missing or blank → no filtering.
- `/repos/{repo}/similar` — similar skills in that repository (§4.4).
- Unknown `repo` or `skill` → 404. `{repo}` and params are matched against `listRepos()` and the
  index only; they are never used directly as a file path or URL (no path traversal).
- **Old URLs redirect** (permanent, 308) so existing links keep working:
  `/?repo=X&skill=…&q=…` → `/repos/X?skill=…&q=…` (keeping whichever of `skill`/`q` are present),
  and `/similar?repo=X` → `/repos/X/similar`. `/?q=…` without `repo` is the gallery, not a redirect.

### 4.2 Layout
Gallery (`/`):
```
+-------------------------------------------------------------+
| Skill Atlas                                                  |  header
+-------------------------------------------------------------+
| [ Search repositories and skills…            ]  [Clear]      |
| N of M repositories            (only while searching)        |
| +-----------------+ +-----------------+ +-----------------+  |
| | JetBrains/kotlin| | JetBrains/MPS   | | ...             |  |  cards
| | 6 skills        | | 41 skills       | |                 |  |
| | 6 agent         | | 41 agent · 32 p…| |                 |  |
| | Updated 2026-.. | | Updated 2026-.. | |                 |  |
| | 3 matching skills | ...             | |                 |  |
| +-----------------+ +-----------------+ +-----------------+  |
+-------------------------------------------------------------+
```
Inside a repository (`/repos/{repo}` and `/repos/{repo}/similar`):
```
+-------------------------------------------------------------+
| Skill Atlas › JetBrains/kotlin     Skills | Similar          |  header
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
- **Header**: the app title always links to `/` (the gallery). Inside a repository it is followed
  by a breadcrumb `› {display name}` and a navbar with two links, **Skills** (`/repos/{repo}`) and
  **Similar** (`/repos/{repo}/similar`); the link of the current page is highlighted. The gallery
  header has no breadcrumb and no navbar. There is NO repository `<select>`: repositories are
  switched through the gallery.
- **Sidebar**: the filter box (§4.3), then the skills of the selected repo, sorted by name, each a
  link with the skill name and its categories. The selected skill is highlighted. Sidebar scrolls
  independently.
- **Main**: for the selected skill — name, description, primary path (link to GitHub at the
  commit), other copies (`paths` minus `path`), categories, short commit SHA and date, the
  "Similar skills" section (§4.4), then the rendered markdown body.
- **Empty states**: no index files → the gallery shows a message explaining how to run
  `skill-atlas scan`; repo with 0 skills → "No skills found"; no skill selected → "Select a skill".

### 4.3 Feature: filter skills
Filter the sidebar by a keyword in a skill's name or description.
- **UI**: a text input at the top of the sidebar, placeholder `Filter skills…`, prefilled with `q`.
  It is a plain GET `<form>` (field `q`, action `/repos/{repo}`), so it works without client JS;
  submitting navigates to `/repos/{repo}?q=…`. When `q` is set, show `N of M skills` under the
  input and a "Clear" link (`/repos/{repo}`).
- **Matching**: case-insensitive substring match of the trimmed `q` against the skill's `name` and
  `description` (both from the index) ONLY. A skill matches if either contains `q`. Paths,
  categories and the SKILL.md content are NOT searched, so filtering never fetches content.
- **Links**: while filtering, sidebar skill links keep `q` (`/repos/{repo}?skill=…&q=…`), so the filter
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
- **Similar page** (`/repos/{repo}/similar`, reached from the **Similar** navbar link): a table of skill
  pairs `Skill A | Skill B | Similarity` for all pairs with similarity ≥ 30%, sorted by similarity
  descending, then by names. Skill names link to `/repos/{repo}?skill={path}`. A pair is listed once
  (A–B, not also B–A). Fewer than 2 skills → "Need at least 2 skills to compare"; no pair ≥ 30% →
  "No similar skills (≥ 30%)". Uses the same header (breadcrumb, navbar) and no sidebar.
- **Skill page section**: "Similar skills" in main (after the metadata, before the markdown body)
  lists the top 5 other skills of the repo by similarity, highest first, each as a link
  (`/repos/{repo}?skill={path}`) and a
  percentage; skills at 0% are omitted. Rendered inside `<Suspense>` so the skill body doesn't wait for it.
- **Code**: the algorithm is a pure function in `lib/similar.ts`
  (`similarities(docs: { key: string; text: string }[]): { a: string; b: string; score: number }[]`,
  returning every pair once with `score` in 0..1), unit-tested in `lib/similar.test.ts`.

### 4.5 Shared building blocks (already on `main`; reuse, don't duplicate)
- `app/Shell.tsx` — page frame (header with title, breadcrumb, navbar).
- `fetchSkillContent(s)` in `lib/atlas.ts` — cached raw SKILL.md fetch pinned to `commit_sha`.
- `listRepos()` / `loadSkills(repo)` in `lib/atlas.ts` — index listing and loading.
- `matchesSkill(s, q)` in `lib/filter.ts` — the one matching rule for skills (§4.3), reused by §4.6.

### 4.6 Feature: repository gallery and search
The home page shows all indexed repositories at once, as cards, with an instant search.
- **Cards**: one per index file, in a responsive grid (`grid-template-columns:
  repeat(auto-fill, minmax(260px, 1fr))`), in `listRepos()` order (alphabetical by file name,
  `localeCompare`). The whole card is one link to `/repos/{repo}` and shows:
  - the display name (§3.1), e.g. `JetBrains/kotlin`;
  - the skill count, `N skills` (`1 skill` for one);
  - category counts, `N agent · N product · N test`: the number of skills that have each category,
    in that order, omitting categories with 0. Omitted entirely for indexes without `categories`;
  - `Updated YYYY-MM-DD`: the newest `commit_date` of its skills, as a UTC date. Omitted if no
    skill has a date;
  - while searching, `K matching skills` (`1 matching skill`) when K > 0 (see below).
- **Invalid index** (unreadable or not a JSON array): an error card, `Cannot read {file}.json`,
  linking to `/repos/{repo}`, which shows the error as today. It matches the search only by file name.
- **Search input**: above the grid, placeholder `Search repositories and skills…`, prefilled from
  `?q=`. With a non-blank `q`: a line `N of M repositories` and a **Clear** control that empties
  the input and shows all cards. No card matches → `No repositories match "{q}"`.
- **Matching**: `q` is trimmed; matching is a case-insensitive substring match (the same rule as
  §4.3). For each repository:
  - `byName` = the display name OR the file name contains `q`;
  - `matchingSkills` = the number of its skills for which `matchesSkill(s, q)` is true (name or
    description; NOT paths, categories or content);
  - the repository is shown if `byName` OR `matchingSkills > 0`. Blank `q` → all shown.
- **Card link while searching**: `/repos/{repo}?q={q}` (the skill filter prefilled) only when the
  repository matched through its skills and NOT by name (`!byName && matchingSkills > 0`).
  Otherwise the plain `/repos/{repo}`, so a name match shows all of its skills.
- **Instant behaviour**:
  - The server renders the page with `q` from the URL already applied (correct without JS).
  - A client component `app/RepoGallery.tsx` receives, from the server page, each repository's
    summary plus its skills' `name` and `description` only, and re-filters on every keystroke,
    with no fetches and no server round trip.
  - On each change it updates the URL with `history.replaceState` (`/?q=…`, or `/` when blank),
    so the URL is shareable and survives reload, without adding a history entry per keystroke.
- **Code**: pure functions in `lib/repos.ts`, unit-tested in `lib/repos.test.ts`:
  - `summarizeRepo(file: string, skills: Skill[]): RepoSummary`, where `RepoSummary` is
    `{ file, name, skillCount, categories: { agent?: number; product?: number; test?: number } | null, lastUpdated: string | null }`
    (`categories` is `null` when no skill has `categories`; `lastUpdated` is `YYYY-MM-DD` or `null`);
  - `matchRepo(summary: RepoSummary, skills: Skill[], q: string): { match: boolean; byName: boolean; matchingSkills: number }`.
  Both must be importable from the client component: `lib/repos.ts` may import only *types* from
  `lib/atlas.ts` (which uses Node's `fs`), plus `matchesSkill` from `lib/filter.ts`.
- **Files**: this feature is built on one branch.
  - `app/page.tsx` becomes the gallery, and handles the `?repo=` redirect.
  - The current `app/page.tsx` moves to `app/repos/[repo]/page.tsx`, and `app/similar/page.tsx` to
    `app/repos/[repo]/similar/page.tsx`. `app/similar/page.tsx` then only redirects.
  - New: `app/RepoGallery.tsx`, `lib/repos.ts`, `lib/repos.test.ts`.
  - `app/Shell.tsx` gets the breadcrumb and the new navbar links. `app/RepoSelect.tsx` is deleted.
  - Every internal link moves to the new URLs: sidebar, filter form and Clear, the Similar table,
    the "Similar skills" section.
  - Also update the example in `.claude/skills/recording-pr-demos/record-webui.mjs` (it uses
    `/?repo=…`), and record the PR's demo GIF with that skill.

## 5. Out of scope
- Running scans from the UI, editing skills, deployment.
- Gallery: sorting or paging cards, favourites, fuzzy/regex search, searching paths, categories
  or SKILL.md content, a repository selector in the header.
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
- `lib/repos.test.ts`:
  - `summarizeRepo`: skill count, category counts, newest date, an empty index, an older index
    without `categories` (→ `null`) and without dates (→ `null`);
  - `matchRepo`: match by display name, by file name, by skill name, by skill description; NOT by
    a path or category only; case-insensitive and trimmed `q`; blank `q` matches all; the
    `matchingSkills` count; `byName` true/false.
- **Visual / demo test** (`npm run test:visual`, CI job `visual`, required):
  `e2e/demo.spec.ts` with Playwright (`@playwright/test`, version pinned exactly).
  - It runs the DoD scenario on the committed fixtures `e2e/fixtures/` (the four pinned scans of §7):
    gallery → search `gradle` → repository → skill page → Similar → Back.
  - Each key moment asserts its state, then takes a named screenshot (`expect.soft(...).toHaveScreenshot`),
    compared with `e2e/__screenshots__/`.
  - Deterministic: fixed viewport 1280×720, scale 1, `en-US`, UTC, animations off; no sleeps before a
    screenshot.
  - Screenshots are compared only in CI, inside `mcr.microsoft.com/playwright:<same version>-noble`;
    locally they are ignored (macOS renders differently). The test's video is the PR's demo GIF.
  - Differences are shown as expected / actual / diff in a sticky PR comment. The reviewer accepts
    them with the label `approve-screenshots`, which regenerates and commits the baselines in CI.
- Manual: `npm run dev` with at least two indexes, check the gallery (cards, instant search, the
  URL updating without history entries, Clear), a card opening its repository, the breadcrumb,
  navbar, sidebar, filter, Similar page, content render, and the old-URL redirects;
  `npm run build` passes.

## 7. Definition of Done
- `npm test` and `npm run build` pass locally.
- CI (`.github/workflows/ci.yml`, job `webui`) runs `npm ci`, `npm test` and `npm run build`; it is green for the latest commit of the pull request.
- The change is in a pull request, never pushed directly to `main` (see `.spec/cli.md` §7, Change workflow).
- **DoD data**: `SKILL_ATLAS_DIR` = a temp dir holding the indexes of these four pinned scans
  (`skill-atlas scan <url>` with `HOME` pointing at a temp dir):
  `https://github.com/JetBrains/kotlin/tree/197871e7256b81028d7dbce42eaee642a36900d0`,
  `https://github.com/JetBrains/MPS/tree/49d37b63488a0a8e42eb0130cb867fd508f398ac`,
  `https://github.com/JetBrains/koog/tree/16d83270f8a7f25358ae0165466f14e70416c428`,
  `https://github.com/JetBrains/android/tree/4f0a5e1cb653c29f81c6b77eff885a6e81622cf4`.
- Gallery `/` shows exactly 4 cards, in this order:
  | Card | Skills | Categories | Updated |
  |---|---|---|---|
  | `JetBrains/android` | 6 skills | 6 agent | 2026-09-21 |
  | `JetBrains/koog` | 4 skills | 2 agent · 2 test | 2026-08-20 |
  | `JetBrains/kotlin` | 6 skills | 6 agent | 2026-09-29 |
  | `JetBrains/MPS` | 41 skills | 41 agent · 32 product | 2026-09-26 |
- Search `q=gradle` (also `GRADLE`, ` Gradle `): `1 of 4 repositories`, only `JetBrains/kotlin`
  with `3 matching skills`, linking to `/repos/JetBrains-kotlin?q=gradle`. That page shows
  `3 of 6 skills`.
- Search `q=kotlin`: `3 of 4 repositories`:
  - `JetBrains/koog`, `2 matching skills`, linking to `/repos/JetBrains-koog?q=kotlin`;
  - `JetBrains/kotlin`, `3 matching skills`, with a **plain** link `/repos/JetBrains-kotlin`
    (matched by name);
  - `JetBrains/MPS`, `2 matching skills`, linking to `/repos/JetBrains-MPS?q=kotlin`.
- Search `q=mps`: `3 of 4 repositories`: android (K=1, via "dumps"), kotlin (K=2, via "Bumps"),
  and MPS by name (K=34). Plain substring matching is intended, not a bug. Search `q=koog`: only `JetBrains/koog`, with a plain link.
  Search `q=zzqx`: `No repositories match "zzqx"`.
- Typing in the search updates the cards without a page load, and the URL becomes `/?q=…`; the
  browser Back button does not step through keystrokes.
- Search `gradle`, open the kotlin card, then press Back: the gallery shows the search `gradle` and
  its 1 card again (the initial search value is read from the current URL, not from props).
- `/?repo=JetBrains-kotlin&q=gradle` redirects to `/repos/JetBrains-kotlin?q=gradle`, and
  `/similar?repo=JetBrains-kotlin` to `/repos/JetBrains-kotlin/similar`. `/repos/..%2F..%2Fetc` → 404.
- `/repos/JetBrains-kotlin` renders the skill browser with skill content loaded from GitHub; its
  header shows `Skill Atlas › JetBrains/kotlin` and the Skills | Similar navbar, and no `<select>`.
- Filter: on `/repos/JetBrains-kotlin`, `q=gradle` (and `q=GRADLE`) lists exactly 3 skills:
  `build-bump-gradle-version`, `build-tools-bump-gradle-api`, `build-tools-bump-gradle-in-tests`.
  `analysis-api-mark-internal-apis` is NOT listed ("gradle" appears only in its body).
- Similar: `/repos/JetBrains-kotlin/similar` shows 8 pairs ≥ 30%; the top 3 are the pairs among the
  three Gradle-bump skills (76%, 75%, 68%).

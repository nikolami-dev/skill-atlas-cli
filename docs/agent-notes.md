# Agent notes

Shared knowledge for anyone (human or agent) working on this repo: workflows, conventions and
pitfalls that the code and specs don't show. Read this before every task (see `AGENTS.md`).

Last updated: 2026-09-30

## Workflow

- **Specs first.** A feature starts as a change to `.spec/cli.md` or `.spec/webui.md`, usually in
  its own PR and merged before the implementation. If a requirement changes during implementation,
  update the spec in the same PR as the code. Agents implement from the spec alone, so it must
  answer every question in advance:
  - Write for an LLM to read: numbered sections, MUST/NOT wording, exact formulas and field names,
    an out-of-scope list, required tests, and a Definition of Done.
  - Put concrete expected results in the DoD (counts, percentages, exact skill names), and compute
    them against real data before committing. Never estimate: a guess (31 vs the real 32) once put
    a wrong number in a spec.
  - When features are built in parallel, the spec assigns each feature its files (see
    `.spec/webui.md` §4.5). Move shared code out first, so the branches don't touch the same code.
- **Narrowed requirements are applied literally.** If a requirement is narrowed in a few words
  (e.g. "filter by name and description, not the content"), apply the words literally, say in one
  line what else that excludes (there: paths and categories too), and update the spec's rule,
  out-of-scope list, tests and DoD numbers together.
- **Pull requests only.** Never push to `main`; see `.spec/cli.md` §7 (Change workflow). Rules:
  - one logical change per PR;
  - the description fills in every section of `.github/pull_request_template.md` (Summary, Visual
    demonstration, Architecture changes, Tests, Limitations), writing `n/a — <reason>` rather than
    deleting a section. For `gh pr create --body-file`, start from a copy of the template, because
    GitHub only prefills it in the browser;
  - for a user-visible change, the agent records the demo GIF with the `recording-pr-demos` skill
    (`.claude/skills/recording-pr-demos/`). Pushing GIFs to the `pr-assets` branch is the one allowed
    push outside a PR: that branch holds only media, is never merged, and has no CI;
  - if CI is red, read the logs, fix, and push to the same branch;
  - if two PRs conflict, rebase the second onto `origin/main` after the first is merged, rerun the
    tests, and `git push --force-with-lease`, only ever to feature branches.

## Repo conventions

- Go CLI at the repo root (run `go` commands there); Next.js 16 web UI in `webui/` (run `npm`
  commands there). CI (`.github/workflows/ci.yml`) has two jobs, `cli` and `webui`, and `main`
  requires both. The `webui` job uses Node 24.
- The Go E2E tests (`go test -tags e2e ./...`) call the GitHub API. Run them with
  `GITHUB_TOKEN=$(gh auth token)`, or they hit the anonymous limit of 60 requests an hour.
- Pin every E2E test with exact expectations to a commit (`https://github.com/<owner>/<repo>/tree/<sha>`),
  so upstream changes can't turn CI red. The only live-URL test is `TestScanDefaultBranch`, which
  covers the default-branch lookup and only asserts that at least one skill is found.
- When checking server-rendered pages with `curl`, strip React's `<!-- -->` text separators first
  (`sed 's/<!-- -->//g'`). Otherwise `76%` shows up as `76<!-- -->%` and a grep finds nothing.
- Don't commit editor swap files (e.g. `.page.tsx.swp` from vim) or `webui/next-env.d.ts`, which is
  generated. Add files to a commit explicitly.

## Parallel agents in Docker `sbx` sandboxes

Independent features can be built in parallel: one headless Claude Code agent per feature, each
in its own git worktree and `sbx` sandbox, with model access through a local proxy (JetBrains
Central). The filter and similar-skills features (PRs #4 and #5) were built this way.

- **Setup:** a launcher script, kept outside the repo and run from the repo root on an up-to-date
  `main` as `sbx-sandbox.sh <name> -d`, does three things:
  - creates the worktree `../<name>` on branch `<name>`;
  - gets a proxy key;
  - creates the sandbox with `ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL` set, mounting the
    worktree plus the main repo's `.git`.

  `-d` (detached) is needed when the script runs without a terminal.
- **Network policy:** `sbx policy init balanced` allows npm, GitHub and GitHub raw content, but not
  the proxy. Add `sbx policy allow network host.docker.internal:<port>` and
  `sbx policy allow network localhost:<port>` (the Central proxy port, 19516 by default). The
  sandbox checks requests under both names, so both rules are needed.
- **Launching:** start each agent with
  `sbx exec -w <worktree> <name> claude -p "$(cat prompt.md)" --dangerously-skip-permissions --output-format stream-json --verbose > agent.jsonl`.
  Claude Code's auto-mode safety check blocks an agent from launching other agents with
  `--dangerously-skip-permissions`, so a human runs this command. Don't try to work around it.
- **The prompt says:**
  - the agent is headless and nobody can answer questions, so it decides from the spec;
  - which spec section to implement, and which files it may touch;
  - where to insert CSS (a separate place for each feature, never the end of the file);
  - loop `npm test` and `npm run build` until green, and check the DoD on a production server with
    `SKILL_ATLAS_DIR` pointing at a temp dir. Include the index JSON in the prompt, because the
    sandbox can't see the host's `~/.skill-atlas`;
  - commit to the current branch, but don't push or open a PR;
  - end with a report of files, tests and DoD results.
- **Pitfalls:**
  - Sandboxes ship Node 22, which can't run the `.ts` tests. Agents install Node 24 inside the
    sandbox, and it's only on `PATH` in login shells (`bash -l -c`).
  - `sbx ls` shows the container status, not the agent's. To see whether an agent is running, use
    `sbx exec <name> pgrep -x claude`. It's finished when the log's last line has `"type":"result"`.
  - A worktree used by a sandbox holds Linux `node_modules`, so run `npm ci` again on the host
    before testing there.
  - `sbx rm` asks for confirmation. Without a terminal, stop the sandboxes first, then run
    `sbx rm --force <name>...`, naming each one (never `--all`).
  - An agent can't do the "PR open, CI green" DoD items, because it's told not to push. Its report
    saying so is expected, not a failure.
- **Afterwards,** on the host: review each diff, rerun the tests and build, check the DoD live,
  push each branch and open one PR per feature. Once they're merged:
  - remove the sandboxes (`sbx rm --force`) and the worktrees (`git worktree remove`);
  - delete the merged branches locally and on GitHub.

## Keeping this file current

- Update this file **in the same PR** as the change it describes, and bump `Last updated`.
- Only shared, reusable knowledge belongs here. This repo is **public**: no personal data, emails,
  local paths, machine setup details or secrets. Those go into your private agent memory.

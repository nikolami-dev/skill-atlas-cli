# Agent instructions (whole repo)

## Memory: ALWAYS read it before a task, ALWAYS keep it up to date

Memory has two parts:
- **Shared notes:** [`docs/agent-notes.md`](docs/agent-notes.md), in this repo. Workflows,
  conventions and pitfalls that are useful to anyone. Versioned, and changed through PRs.
- **Private memory:** your tool's own per-user memory for this project, if it has one (Claude Code:
  its automatic project memory, index `MEMORY.md`). Personal preferences, machine setup, local
  paths, and your own open items.

- **ALWAYS read memory BEFORE starting ANY task**, not just at session start:
  - Read `docs/agent-notes.md` in full. Then read the private memory index and open every memory
    whose description relates to the task (when unsure, open it), always including open items and
    workflow rules. Do this before planning, asking questions, or touching code.
  - Read the files again each time rather than relying on an earlier read, because another session
    or a merged PR may have changed them.
  - Memory describes what was true when it was written. Check it against the repo (files,
    `git log`, `gh pr list`) before relying on it, and fix whatever is stale.
- **ALWAYS update memory as soon as something changes**, not "later":
  - a decision or requirement changes, or the user corrects you;
  - a user preference or workflow rule is stated or confirmed;
  - an open item is resolved, or a new one appears;
  - setup changes: tools, sandboxes, network policy, CI, branch protection, paths.
- **Where each update goes:**
  - **Shared and reusable** (anyone would benefit): `docs/agent-notes.md`, in the same PR as the
    change it describes (or a small PR of its own), with `Last updated` bumped.
  - **Personal or machine-specific:** private memory, immediately.
  - This repo is **public**. Never put personal data, emails, local paths, machine details or
    secrets (tokens, API keys) into it.
- **Before your final reply of every task** (and whenever a PR is opened or merged), check whether
  either part is now stale, and fix it.
- **How to write private memories:**
  - Update the existing file instead of creating a duplicate, and delete memories that turn out to
    be wrong.
  - Use absolute dates (`2026-09-30`), never "today".
  - Keep the index in sync (one line per memory).
  - Never store anything the repo already records (code, specs, git history, `docs/agent-notes.md`).
- **Worktrees and sandboxes:** agents in `../<worktree>` or in an `sbx` sandbox can read
  `docs/agent-notes.md`, but not the private memory of the main checkout. They put any personal or
  machine-specific finding in their final report, and the main session saves it.

## Other rules
- Every change goes through a pull request; never push to `main`. See `.spec/cli.md` §7 (Change workflow).
- Specs come first: `.spec/cli.md` (Go CLI at the root) and `.spec/webui.md` (Next.js app in `webui/`).
  `webui/AGENTS.md` has the Next.js-specific rules.

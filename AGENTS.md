# Agent instructions (whole repo)

## Memory: ALWAYS read it before a task, ALWAYS keep it up to date

The persistent memory lives in
`~/.claude/projects/-Users-nikola-micic-IdeaProjects-skill-atlas-cli/memory/`.
`MEMORY.md` is the index (one line per memory), and each memory is its own file.

- **ALWAYS read memory BEFORE starting ANY task**, not just at session start:
  - Read `MEMORY.md`, then open every memory whose description relates to the task. When unsure,
    open it. Do this before planning, asking questions, or touching code. Another session may have
    changed memory since you last looked, so read the files again rather than relying on an earlier
    read.
  - Always check `open-items.md` and the feedback memories (workflow rules such as PR-only).
  - Memories describe what was true when they were written. Check them against the repo (files,
    `git log`, `gh pr list`) before relying on them, and fix any memory that turns out to be stale.
- **ALWAYS update memory as soon as something changes, in the same session, not "later":**
  - a decision or requirement changes, or the user corrects you;
  - a user preference or workflow rule is stated or confirmed;
  - an open item is resolved, or a new one appears (keep `open-items.md` current);
  - setup changes: tools, sandboxes, network policy, CI, branch protection, paths.
- **Before your final reply of every task** (and whenever a PR is opened or merged), check whether
  any memory is now stale, and fix it.
- **How to write it:**
  - Update the existing file instead of creating a duplicate. Delete memories that turn out to be
    wrong.
  - Use absolute dates (`2026-09-30`), never "today" or "yesterday".
  - Keep the `MEMORY.md` entry in sync (one line, `- [Title](file.md) — hook`).
  - For feedback and project memories, add `**Why:**` and `**How to apply:**`.
- **Never store:** secrets (tokens, API keys, the Central key), or anything the repo already records
  (code, specs, git history). Store the non-obvious part: why, the decision, the pitfall.
- **Worktrees and sandboxes:** memory belongs to the main checkout path, so agents in `../<worktree>`
  or in an `sbx` sandbox can't see it. Such agents put what they learned in their final report, and
  the main session writes it to memory.

## Other rules
- Every change goes through a pull request; never push to `main`. See `.spec/cli.md` §7 (Change workflow).
- Specs come first: `.spec/cli.md` (Go CLI at the root) and `.spec/webui.md` (Next.js app in `webui/`).
  `webui/AGENTS.md` has the Next.js-specific rules.

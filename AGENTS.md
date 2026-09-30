# Agent instructions (whole repo)

## Memory: ALWAYS keep it up to date

The persistent memory lives in
`~/.claude/projects/-Users-nikola-micic-IdeaProjects-skill-atlas-cli/memory/`.
`MEMORY.md` is the index (one line per memory), and each memory is its own file.

- **At the start of a session**, read `MEMORY.md` and the memories relevant to the task. Memories
  describe what was true when they were written, so check them against the repo (files, `git log`,
  `gh pr list`) before relying on them.
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

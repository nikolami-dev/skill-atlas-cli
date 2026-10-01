# Review a pull request

Review this PR and post its findings in one comment.

## 1. Investigate before judging

Always read, before forming any opinion:
1. the original issue, with its comments;
2. the PR description, with its comments;
3. linked issues, with their comments;
4. the spec section the PR implements (`.spec/cli.md` or `.spec/webui.md`) and `docs/agent-notes.md`;
5. the changed files, and enough surrounding code to form your own model of the correct solution.

Judge the diff against that model (right problem, right layer, fits this codebase), not against
the diff's own framing.

## 2. Report only what the author must act on

Report a finding only when all three criteria hold:
- the author must act before merge: a bug, security gap, broken invariant, or maintenance trap;
- you can name the specific failure scenario;
- you can name the proper fix.

Observations below this bar are investigation, not report: drop them. They cost the author
attention without changing their actions, and reporting them trains readers to skim your real
findings.

## 3. Post all findings in one comment

- Post every finding in a single PR comment, and nothing else: no inline comments, no review
  verdict, no greeting or summary. `gh pr comment <number> --body-file findings.md`
- Each finding has three short parts (problem, failure scenario, suggested fix) and anchors on a
  `path:line`. A finding about the change as a whole anchors on its most representative line.
- Prefix a finding with `Blocking:` when it must be fixed before merge, and list Blocking findings
  first:

  ```markdown
  **Blocking:** `webui/app/page.tsx:42`
  - Problem: …
  - Failure scenario: …
  - Fix: …
  ```
- No findings: post nothing.
- Never add the `approve-screenshots` label or approve workflow runs: accepting screenshot changes
  is the human reviewer's call (see `docs/agent-notes.md`).

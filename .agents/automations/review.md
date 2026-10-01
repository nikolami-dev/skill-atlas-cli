# Review a pull request

Review this PR and submit a verdict with inline comments.

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

## 3. Post each finding as an inline comment

- Three short parts: problem, failure scenario, suggested fix.
- A finding about the change as a whole anchors on its most representative line.
- Prefix a finding with `Blocking:` when it must be fixed before merge.

## 4. Verdict

- **Request changes** if any finding is Blocking; otherwise **Approve**, even with findings posted.
- The review body is exactly one warm, friendly, short sentence stating the outcome only: approval
  when there are no blocking findings, or request changes when blocking inline findings must be
  addressed before merge. Never praise, justify, summarize, or restate inline comments.

## 5. Submitting

- Submit the verdict, the body and all inline comments as one review:
  `gh api repos/{owner}/{repo}/pulls/<number>/reviews --input review.json`, where `review.json` is
  `{"event": "APPROVE" | "REQUEST_CHANGES", "body": "…", "comments": [{"path": "…", "line": N, "side": "RIGHT", "body": "…"}]}`.
- Anchor inline comments on lines inside the diff; GitHub rejects any other line.
- GitHub doesn't let a PR's author approve or request changes on their own PR. If it rejects the
  event for that reason, submit the same review with `"event": "COMMENT"`.
- Never add the `approve-screenshots` label or approve workflow runs: accepting screenshot changes
  is the human reviewer's call (see `docs/agent-notes.md`).

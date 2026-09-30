---
name: recording-pr-demos
description: Use when opening or updating a pull request in skill-atlas-cli whose change is visible in the web UI or in CLI output, when the `visual` CI check fails or reports screenshot differences, or when filling in the "Visual demonstration" section of the PR template.
---

# Recording PR demos

## Overview
Every PR with a user-visible change shows it working as a GIF in its description.

| Change in | Where the demo comes from | Checked by |
|---|---|---|
| `webui/` | **CI**: the Playwright test `webui/e2e/demo.spec.ts` records video and screenshots | the required `visual` check, which compares screenshots with the baselines |
| Go CLI | **local**: `cli-demo.tape` (vhs), uploaded by hand | the Go E2E tests (no screenshot comparison) |

`gh` can't attach files, and a video linked by URL doesn't play inline, so every GIF lives on the
`pr-assets` branch and is embedded by its raw URL. `pr-assets` holds only media, is never merged,
and has no CI; pushing to it is not a push to `main`.

## Web UI: the demo is a test
`webui/e2e/demo.spec.ts` is the demo. It runs against the committed fixtures `webui/e2e/fixtures/`
(the pinned scans from the spec's DoD), with a fixed viewport, locale and timezone. Each key moment
is a `test.step`: it **asserts the expected state first**, then takes a named screenshot with
`expect.soft(page).toHaveScreenshot("NN-name.png")`.

1. **Extend the test** for the new feature: add steps for its key moments, following the
   existing ones. Keep the demo scenario the spec's DoD scenario.
2. **Run it locally**: `cd webui && npm run test:visual`. Locally, screenshots are *not* compared
   (macOS renders differently from CI), but every assertion runs and a video is written to
   `test-results/`.
3. **Push.** In CI, the `visual` job reruns the test in the pinned container
   `mcr.microsoft.com/playwright:v1.63.0-noble`. `visual-report` then posts one sticky PR comment with
   the demo GIF and, for each changed screenshot, **expected | actual | diff**. New screenshots show
   "no baseline yet".
4. **Embed the GIF** from that comment in the PR description, under "Visual demonstration", with a
   one-line caption.
5. **Hand the diff to the reviewer.** If screenshots changed on purpose, say which ones and why in
   the PR. The reviewer approves by adding the label **`approve-screenshots`**. CI then regenerates
   the baselines, commits them to the branch, and reruns. **Never add that label yourself**:
   approving visual changes is the reviewer's decision. To reject, the reviewer asks for a fix, and
   you push one.
6. **After an approval,** run `git pull` before pushing again, because the bot committed to your branch.

## CLI: a local terminal recording
With `D=/tmp/demo`, `B=$(git branch --show-current)`, `SHA=$(git rev-parse --short HEAD)`, and
`export GITHUB_TOKEN=$(gh auth token)` set **before** anything changes `HOME`:
1. **Tools** (once): `brew install vhs` (this also installs ffmpeg and ttyd).
2. **Record**:
   `sed "s|/tmp/demo/cli.gif|$D/cli-$SHA.gif|" .claude/skills/recording-pr-demos/cli-demo.tape > $D/cli-demo.tape`.
   Adapt the on-camera commands (pinned `/tree/<sha>` URLs) and the `Height`. Then, from the repo root:
   `vhs validate $D/cli-demo.tape && vhs $D/cli-demo.tape`.
3. **Check every frame**: `ffmpeg -i $D/cli-$SHA.gif -vf fps=1 $D/frame-%02d.png`, then look at all
   of them:
   - no token, `/Users/…` path, username or email;
   - the table doesn't wrap;
   - under about 20 s and 5 MB.
4. **Upload**:
   ```sh
   git fetch origin pr-assets; [ -d ../pr-assets ] || git worktree add ../pr-assets pr-assets
   [ "$(git -C ../pr-assets branch --show-current)" = pr-assets ] || { echo "../pr-assets is not the pr-assets worktree"; exit 1; }
   git -C ../pr-assets pull --ff-only && mkdir -p ../pr-assets/$B && cp $D/cli-$SHA.gif ../pr-assets/$B/
   git -C ../pr-assets add . && { git -C ../pr-assets diff --cached --quiet || git -C ../pr-assets commit -m "CLI demo for $B"; } && git -C ../pr-assets push origin pr-assets
   ```
   Then embed `https://raw.githubusercontent.com/nikolami-dev/skill-atlas-cli/pr-assets/$B/cli-$SHA.gif`.
5. **Clean up**: `find $D -maxdepth 1 -name 'frame-*.png' -delete`. Use `find`, not a glob: in zsh, a glob that matches nothing aborts the whole command.

## Common mistakes
| Mistake | Fix |
|---|---|
| A fixed sleep before a screenshot | Assert the state (`toHaveCount`, `toHaveText`, `toHaveURL`) instead. `toHaveScreenshot` waits for a stable page; pauses only go *after* a screenshot, for video viewers. |
| Hard (non-soft) screenshot assertions | The first difference would hide all later ones. Use `expect.soft(page).toHaveScreenshot`. |
| Updating baselines locally (`--update-snapshots` on a Mac) | macOS renders fonts differently, so CI would fail forever. Only the approval workflow writes baselines, in the pinned container. |
| Live data (a fresh scan, unpinned URLs) in the test | Results change over time. Use `webui/e2e/fixtures/` and pinned `commit_sha`s. |
| Changing the Playwright version in only one place | Change `@playwright/test` in `package.json` together with both container tags (`ci.yml`, `approve-screenshots.yml`), and let the reviewer approve the new baselines. |
| The `visual` job fails but the comment shows no screenshot difference | That's a functional failure (an assertion). Open the HTML report in the run's `visual-results` artifact. |
| Adding `approve-screenshots` yourself | Never. Ask the reviewer. |
| Pushing to the branch while an approval runs | The approval stops ("branch moved"). Wait for CI on the new commit; the reviewer then labels again. |
| `Type`-ing a token in a tape, or an unquoted `Output /tmp/…` | The token ends up in the GIF, and an unquoted path is a vhs parse error. Pass the token in the environment, and quote the path. |
| Fixed `Sleep` after a network command in a tape | Use `Wait+Screen@90s /regex/` on the expected output. |
| `HOME=$D GITHUB_TOKEN=$(gh auth token) …` on one line | `gh` looks for its login under the new `HOME` and finds none. Export the token first. |

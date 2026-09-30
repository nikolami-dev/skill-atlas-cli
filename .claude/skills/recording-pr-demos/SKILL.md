---
name: recording-pr-demos
description: Use when opening or updating a pull request in skill-atlas-cli whose change is visible in the web UI or in CLI output, or when filling in the "Visual demonstration" section of the PR template.
---

# Recording PR demos

## Overview
Every PR with a user-visible change shows it working as a GIF in its description. `gh` can't
attach files, and a video linked by URL doesn't play inline, so record, convert to GIF, push the GIF
to the `pr-assets` branch, and embed its raw URL. Demonstrate the DoD scenario from the spec
(`.spec/cli.md` / `.spec/webui.md`, section "Definition of Done"), with the same data and pinned URLs.

| Change in | Record with | GIF |
|---|---|---|
| `webui/` | `record-webui.mjs` (Playwright and Chrome), then ffmpeg | `$D/webui-$SHA.gif` |
| Go CLI | `cli-demo.tape` (vhs) | `$D/cli-$SHA.gif` |

Record on the host. `sbx` sandboxes have no Chrome, so the main session records after pulling the
branch. If a GIF can't be made, write `n/a — <reason>` in the PR section and say who will record it.

## Steps
All commands use these variables. Set them in the PR branch's checkout, and get the token
before anything changes `HOME`:
```sh
REPO=$(git rev-parse --show-toplevel); B=$(git branch --show-current); SHA=$(git rev-parse --short HEAD); D=/tmp/demo
export GITHUB_TOKEN=$(gh auth token)
PORT=3000; while lsof -ti tcp:$PORT >/dev/null; do PORT=$((PORT+1)); done   # a port nobody else is using
```
0. **Tools**, once per machine: `brew install ffmpeg vhs`, then
   `mkdir -p $D && cd $D && npm i playwright-core && npx playwright-core install ffmpeg`.
   Playwright records video with its own ffmpeg build. Google Chrome must be installed.
1. **Fresh start and data.** Build the index with the branch's own CLI, because older indexes may
   lack new fields:
   ```sh
   rm -rf $D/video $D/*.gif $D/frame-*.png $D/.skill-atlas; cd $REPO && go build -o $D/skill-atlas .
   HOME=$D $D/skill-atlas scan <pinned /tree/<sha> URL from the DoD>   # must end with "Found N skills" 
   ```
   The index is written to `$D/.skill-atlas/<owner>-<repo>.json`. The web UI's `repo=` value is
   that file name without `.json`.
2. **Web UI**
   ```sh
   cd $REPO/webui && npm ci && npm run build
   SKILL_ATLAS_DIR=$D/.skill-atlas npx next start -p $PORT > $D/server.log 2>&1 &
   until curl -sf localhost:$PORT >/dev/null; do sleep 1; done; grep -q EADDRINUSE $D/server.log && echo "port taken"
   cp $REPO/.claude/skills/recording-pr-demos/record-webui.mjs $D/   # then adapt its steps block
   cd $D && WEBM=$(node record-webui.mjs http://localhost:$PORT)
   ffmpeg -y -i "$WEBM" -vf "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" -loop 0 $D/webui-$SHA.gif
   pkill -f "next start -p $PORT"
   ```
3. **CLI**
   ```sh
   sed "s|/tmp/demo/cli.gif|$D/cli-$SHA.gif|" $REPO/.claude/skills/recording-pr-demos/cli-demo.tape > $D/cli-demo.tape
   # adapt the on-camera commands (and Height to the number of output lines), then:
   vhs validate $D/cli-demo.tape && cd $REPO && vhs $D/cli-demo.tape
   ```
4. **Check every GIF**: `ffmpeg -i <gif> -vf fps=1 $D/frame-%02d.png`, then look at **every**
   frame. Check that:
   - no token, `/Users/…` path, username or email appears (commit author emails included);
   - the final state is on screen;
   - the table doesn't wrap;
   - `ffprobe` shows under about 20 s, and the file is under about 5 MB.
5. **Upload** from `$REPO`. `pr-assets` holds only media, is never merged, and has no CI; pushing to
   it is not a push to `main`. Keep the branch name as-is: slashes become subfolders.
   ```sh
   cd $REPO && git fetch origin pr-assets     # missing? first time only: git worktree add --orphan -b pr-assets ../pr-assets
   [ -d ../pr-assets ] || git worktree add ../pr-assets pr-assets
   [ "$(git -C ../pr-assets branch --show-current)" = pr-assets ] || { echo "../pr-assets is not the pr-assets worktree"; exit 1; }
   git -C ../pr-assets pull --ff-only && mkdir -p ../pr-assets/$B && cp $D/webui-$SHA.gif $D/cli-$SHA.gif ../pr-assets/$B/
   git -C ../pr-assets add . && { git -C ../pr-assets diff --cached --quiet || git -C ../pr-assets commit -m "Demo for $B"; } && git -C ../pr-assets push origin pr-assets
   for f in webui cli; do curl -sI https://raw.githubusercontent.com/nikolami-dev/skill-atlas-cli/pr-assets/$B/$f-$SHA.gif | grep -i content-type; done   # expect image/gif
   ```
6. **Embed** one GIF per line in "Visual demonstration", web UI first, each with a one-line
   caption saying what the viewer sees:
   `![web UI: <what it shows>](https://raw.githubusercontent.com/nikolami-dev/skill-atlas-cli/pr-assets/<branch>/webui-<sha>.gif)`
7. **Clean up**: `pkill -f "next start -p $PORT"; rm -rf $D/video $D/frame-*.png $D/.skill-atlas $D/skill-atlas`.
   Keep `../pr-assets` and `$D/node_modules` for next time.

## Common mistakes
| Mistake | Fix |
|---|---|
| Embedding `.webm`/`.mp4` by URL | It doesn't play inline. Convert to GIF. |
| No `palettegen` in ffmpeg | The GIF is blurry and several times larger. |
| Pausing before the page shows the new state | Wait on a URL, selector or condition (see the comment in `record-webui.mjs`). |
| Fixed `Sleep` after a network command in a tape | Use `Wait+Screen@90s /regex/` on the expected output. |
| Terminal too narrow, so table rows wrap | Raise `Width` / lower `FontSize`, and check the last frame. |
| Unquoted `Output /tmp/…` in a tape | It's a vhs parse error. Quote the path, and run `vhs validate` first. |
| `Type`-ing a token or `export GITHUB_TOKEN=…` in a tape | It ends up in the GIF. Pass it in the environment of `vhs`. |
| Reusing a GIF name after re-recording | raw.githubusercontent.com caches old files. Names carry `$SHA`, so re-record after a new commit. |
| `HOME=$D GITHUB_TOKEN=$(gh auth token) …` on one line | `gh` then looks for its login under the new `HOME` and finds none, so the scan is rate-limited. Export the token first. |
| Assuming port 3000 is free | If another server already listens there, `curl` succeeds against it and you record the wrong app. Use the free `$PORT`. |
| Killing a server you didn't start, or building while one runs from `webui/` | Only `pkill` your own `next start -p $PORT`. `npm run build` rewrites `webui/.next`; if the user runs a server from there, tell them to restart it. |
| Running `record-webui.mjs` from the repo | Node can't find `playwright-core` there. Run the copy in `$D`. |

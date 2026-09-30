#!/usr/bin/env bash
# visual-report.sh — run by the CI `visual-report` job after the `visual` job.
# Turns the demo video into a GIF, publishes it and any screenshot differences (expected / actual /
# diff) to the pr-assets branch, and creates or updates one sticky comment on the PR.
# Env: GH_TOKEN REPO BRANCH SHA RESULT RUN_URL; artifact downloaded to ./visual-results.
set -euxo pipefail  # -x: every step shows in the job log, so a hang is visible

marker="<!-- visual-report -->"
label="approve-screenshots"
results=visual-results/test-results
short=${SHA:0:7}
dir="$BRANCH/ci/$short"
raw="https://raw.githubusercontent.com/$REPO/pr-assets/$dir"

pr=$(gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number --jq '.[0].number // empty')
if [ -z "$pr" ]; then
  echo "No open PR for $BRANCH; nothing to report."
  exit 0
fi

out=$(mktemp -d)

# Demo GIF from the test's video (palette keeps it sharp and small).
video=$(find "$results" -name video.webm 2>/dev/null | head -1 || true)
if [ -n "$video" ]; then
  if ! command -v ffmpeg >/dev/null; then
    # Bounded: apt can otherwise wait silently for the runner's package lock.
    timeout 180 sudo apt-get -o DPkg::Lock::Timeout=60 update -qq
    timeout 180 sudo apt-get -o DPkg::Lock::Timeout=60 install -y -qq ffmpeg >/dev/null
  fi
  timeout 120 ffmpeg -nostdin -y -loglevel error -i "$video" \
    -vf "fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" -loop 0 "$out/demo.gif"
fi

# Screenshot differences: Playwright writes <name>-actual.png (plus -expected/-diff when a baseline exists).
rows=""
count=0
while IFS= read -r actual; do
  name=$(basename "$actual" -actual.png)
  folder=$(dirname "$actual")
  cp "$actual" "$out/$name-actual.png"
  expected="_no baseline yet_"
  diff="—"
  if [ -f "$folder/$name-expected.png" ]; then
    cp "$folder/$name-expected.png" "$out/$name-expected.png"
    expected="<img src=\"$raw/$name-expected.png\" width=\"280\">"
  fi
  if [ -f "$folder/$name-diff.png" ]; then
    cp "$folder/$name-diff.png" "$out/$name-diff.png"
    diff="<img src=\"$raw/$name-diff.png\" width=\"280\">"
  fi
  rows+="| \`$name\` | $expected | <img src=\"$raw/$name-actual.png\" width=\"280\"> | $diff |"$'\n'
  count=$((count + 1))
done < <(find "$results" -name '*-actual.png' 2>/dev/null | sort)

# Publish the images to pr-assets (media only, never merged, no CI). Retry on concurrent pushes.
if [ -n "$(ls -A "$out")" ]; then
  timeout 120 git clone -q --depth 1 --branch pr-assets "https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git" assets
  mkdir -p "assets/$dir" && cp "$out"/* "assets/$dir/"
  git -C assets -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    add -A && git -C assets -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit -q -m "Visual report for $BRANCH at $short" || true
  for attempt in 1 2 3 4 5; do
    timeout 60 git -C assets push -q origin pr-assets && break
    timeout 60 git -C assets pull -q --rebase origin pr-assets
    [ "$attempt" = 5 ] && { echo "Could not push to pr-assets"; exit 1; }
  done
fi

# Comment body.
case "$RESULT" in
  success) status="✅ **All screenshots match the baselines.**" ;;
  failure)
    if [ "$count" -gt 0 ]; then
      status="❌ **$count screenshot(s) differ from the baselines** (or have none yet)."
    else
      status="❌ **The demo test failed before any screenshot differed** — a functional failure, not a visual change. See the run."
    fi ;;
  *) status="⚠️ The visual job ended with \`$RESULT\`." ;;
esac

body="$marker
## Visual check for \`$short\`
$status
"
if [ -f "$out/demo.gif" ]; then
  body+="
### Demo (recorded by CI)
![demo]($raw/demo.gif)

Embed it in the PR description's *Visual demonstration*: \`![demo]($raw/demo.gif)\`
"
fi
if [ "$count" -gt 0 ]; then
  body+="
### Screenshot differences
| Screenshot | Expected (baseline) | Actual (this commit) | Diff |
|---|---|---|---|
$rows
**Approve** these changes: add the label \`$label\` — CI regenerates the baselines and commits them to this branch; then click **Approve and run workflows** on the held CI run for that commit.
**Reject**: don't approve; fix the code and push.
"
fi
body+="
[Run, HTML report and full results (artifact \`visual-results\`)]($RUN_URL)"

# Create or update the one sticky comment.
id=$(gh api "repos/$REPO/issues/$pr/comments" --paginate --jq ".[] | select(.body | startswith(\"$marker\")) | .id" | head -1)
if [ -n "$id" ]; then
  gh api -X PATCH "repos/$REPO/issues/comments/$id" -f body="$body" >/dev/null
else
  gh pr comment "$pr" --repo "$REPO" --body "$body" >/dev/null
fi
echo "Reported on PR #$pr ($count screenshot difference(s), result: $RESULT)."

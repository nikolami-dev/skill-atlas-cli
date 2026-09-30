# vhs cli-demo.tape: a terminal recording of the CLI.
# SKILL.md step 3 copies this file to /tmp/demo/, sets the Output name, and runs it from the repo root
# with GITHUB_TOKEN already exported. Never Type a token here: everything typed after Show is recorded.
Output "/tmp/demo/cli.gif"
Set Shell "bash"
Set FontSize 12
# Wide enough that the scan table doesn't wrap. Height is about 17 px per output line + 60.
Set Width 1900
Set Height 280
Set TypingSpeed 35ms
Set Padding 16

# Off camera: build the binary, put it on PATH, and hide the local path from the prompt.
# HOME=/tmp/demo keeps the scan's saved index out of the real ~/.skill-atlas.
Hide
Type "go build -o /tmp/demo/skill-atlas . && export PATH=/tmp/demo:$PATH HOME=/tmp/demo PS1='$ ' && clear"
Enter
Sleep 8s
Show

# ---- on camera: replace with the commands being demonstrated (use a pinned /tree/<sha> URL) ----
Type "skill-atlas scan https://github.com/JetBrains/kotlin/tree/197871e7256b81028d7dbce42eaee642a36900d0"
Sleep 500ms
Enter
# Wait for the real output instead of a fixed sleep; network scans vary in duration.
Wait+Screen@90s /Found [0-9]+ skills/
Sleep 2s

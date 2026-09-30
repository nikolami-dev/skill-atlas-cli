<!--
Fill in every section. If one doesn't apply, write "n/a — <reason>" instead of deleting it.
One logical change per PR. Never push to main (see .spec/cli.md §7).
-->

## Summary
<!-- What changed and why, in 2–5 bullets. Link the spec section it implements (e.g. `.spec/webui.md` §4.3). -->

-

## Visual demonstration
<!--
A GIF, recorded by the agent, showing the change working. Use the `recording-pr-demos` skill
(.claude/skills/recording-pr-demos/SKILL.md): a browser recording for web UI changes, a terminal
recording for CLI changes.
Embed it from the pr-assets branch:
![demo](https://raw.githubusercontent.com/nikolami-dev/skill-atlas-cli/pr-assets/<branch>/demo.gif)
No user-visible change (docs, CI, refactor)? Write "n/a — <reason>".
-->

## Architecture changes
<!-- New or changed modules, data flow, APIs, dependencies, and spec sections. Write "None" if there are none. -->

## Tests
<!-- Tick what you ran and give the real result. Add new or changed tests and the DoD checks. -->

- [ ] `go vet -tags e2e ./...` and `go test -tags e2e ./...` —
- [ ] `cd webui && npm test && npm run build` —
- [ ] DoD checks (spec §…) —
- New or changed tests:

## Limitations
<!-- Known gaps, shortcuts, follow-ups, and anything not verified. Write "None known" if there are none. -->

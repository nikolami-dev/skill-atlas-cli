# Skill Atlas Web UI

Browses the skill indexes written by `skill-atlas scan <github-url>` (see [`../.spec/webui.md`](../.spec/webui.md)).

```sh
cd webui
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run build      # production build (type-checks too)
```

Indexes are read from `~/.skill-atlas/*.json`; override with `SKILL_ATLAS_DIR=/path npm run dev`.
Skill content is fetched from GitHub (raw.githubusercontent.com) at each skill's `commit_sha`.

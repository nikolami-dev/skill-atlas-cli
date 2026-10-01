package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestParseRepoURL(t *testing.T) {
	tests := []struct {
		in, owner, repo, branch string
		wantErr                 bool
	}{
		{in: "https://github.com/JetBrains/kotlin", owner: "JetBrains", repo: "kotlin"},
		{in: "https://github.com/JetBrains/kotlin/", owner: "JetBrains", repo: "kotlin"},
		{in: "https://github.com/JetBrains/kotlin.git", owner: "JetBrains", repo: "kotlin"},
		{in: "https://github.com/JetBrains/kotlin/tree/master/.claude/skills", owner: "JetBrains", repo: "kotlin", branch: "master"},
		{in: "https://github.com/JetBrains", owner: "JetBrains"},
		{in: "https://github.com/JetBrains/", owner: "JetBrains"},
		{in: "https://github.com/", wantErr: true},
		{in: "https://gitlab.com/JetBrains/kotlin", wantErr: true},
		{in: "https://github.com/JetBrains/kotlin/blob/master/README.md", wantErr: true},
		{in: "not a url", wantErr: true},
	}
	for _, tt := range tests {
		owner, repo, branch, err := parseRepoURL(tt.in)
		if tt.wantErr {
			if err == nil {
				t.Errorf("parseRepoURL(%q): expected error", tt.in)
			}
			continue
		}
		if err != nil || owner != tt.owner || repo != tt.repo || branch != tt.branch {
			t.Errorf("parseRepoURL(%q) = %q, %q, %q, %v", tt.in, owner, repo, branch, err)
		}
	}
}

func TestIsSkillFile(t *testing.T) {
	for p, want := range map[string]bool{
		".claude/skills/foo/SKILL.md": true,
		"skills.md":                   true,
		"a/b/Skill.MD":                true,
		"a/SKILL.txt":                 false,
		"a/MYSKILL.md":                false,
	} {
		if got := isSkillFile(p); got != want {
			t.Errorf("isSkillFile(%q) = %v, want %v", p, got, want)
		}
	}
}

func TestParseSkill(t *testing.T) {
	tests := []struct {
		name, path, content, wantName, wantDesc string
		wantOK                                  bool
	}{
		{"folded description", ".claude/skills/x/SKILL.md",
			"---\nname: bump\ndescription: >\n  Bumps the\n  version.\n---\n# Body\n", "bump", "Bumps the version.", true},
		{"CRLF line endings", "x/SKILL.md",
			"---\r\nname: crlf\r\ndescription: d\r\n---\r\n", "crlf", "d", true},
		{"invalid YAML falls back to lines", "x/SKILL.md",
			"---\nname: loose\ndescription: Use when: things break\n---\n", "loose", "Use when: things break", true},
		{"frontmatter without name uses dir name", "skills/other/skill.md",
			"---\ndescription: only desc\n---\n", "other", "only desc", true},
		{"root-level file uses repo name", "SKILL.md",
			"---\ndescription: root\n---\n", "kotlin", "root", true},
		{"no frontmatter is not a skill", "docs/docs/skills.md",
			"# Skills usage\n", "", "", false},
		{"frontmatter without name or description is not a skill", "x/SKILL.md",
			"---\ntitle: t\n---\n", "", "", false},
	}
	for _, tt := range tests {
		s, ok := parseSkill("JetBrains/kotlin", []string{tt.path}, []byte(tt.content))
		if ok != tt.wantOK || s.Name != tt.wantName || s.Description != tt.wantDesc {
			t.Errorf("%s: got name=%q desc=%q ok=%v, want name=%q desc=%q ok=%v", tt.name, s.Name, s.Description, ok, tt.wantName, tt.wantDesc, tt.wantOK)
		}
	}
}

func TestParseSkillMergesCopies(t *testing.T) {
	paths := []string{".agents/skills/x/SKILL.md", ".claude/skills/x/SKILL.md", "plugins/res/skills/x/SKILL.md"}
	s, ok := parseSkill("JetBrains/MPS", paths, []byte("---\nname: x\n---\n"))
	if !ok || s.Path != paths[0] || len(s.Paths) != 3 || strings.Join(s.Categories, ",") != "agent,product" {
		t.Errorf("got %+v", s)
	}
}

func TestCategory(t *testing.T) {
	for p, want := range map[string]string{
		".claude/skills/x/SKILL.md":      "agent",
		".agents/skills/x/SKILL.md":      "agent",
		"agent/skills/jewel-ui/SKILL.md": "agent",
		"SKILL.md":                       "agent",
		"integration-tests/src/jvmTest/resources/skills/x/SKILL.md":   "test",
		"src/test/resources/skills/x/SKILL.md":                        "test",
		".agents/skills/mps-tests/SKILL.md":                           "agent",
		"plugins/mcp-tools/resources/jetbrains/mps/skills/x/SKILL.md": "product",
		"src/main/resources/skills/x/SKILL.md":                        "product",
	} {
		if got := category(p); got != want {
			t.Errorf("category(%q) = %q, want %q", p, got, want)
		}
	}
}

// fakeOwner serves a fake GitHub API for the owner "acme" (spec §3.2), over two listing pages:
// alpha (1 skill, two identical copies), beta (2 skills), fork (a fork, never scanned),
// empty (409), plain (no skills) and, if broken is set, broken (whose tree request it answers).
func fakeOwner(t *testing.T, broken http.HandlerFunc) {
	t.Helper()
	pages := [][]map[string]any{
		{{"name": "alpha", "default_branch": "main"}, {"name": "beta", "default_branch": "dev"}, {"name": "fork", "default_branch": "main", "fork": true}},
		{{"name": "empty", "default_branch": "main"}, {"name": "plain", "default_branch": "main"}},
	}
	if broken != nil {
		pages[1] = append(pages[1], map[string]any{"name": "broken", "default_branch": "main"})
	}
	trees := map[string][]map[string]string{
		"alpha": {{"path": ".agents/skills/a/SKILL.md", "type": "blob", "sha": "a1"}, {"path": ".claude/skills/a/SKILL.md", "type": "blob", "sha": "a1"}},
		"beta":  {{"path": "skills/b1/SKILL.md", "type": "blob", "sha": "b1"}, {"path": "skills/b2/SKILL.md", "type": "blob", "sha": "b2"}},
		"plain": {{"path": "README.md", "type": "blob", "sha": "r"}},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /users/acme/repos", func(w http.ResponseWriter, r *http.Request) {
		var page int
		fmt.Sscan(r.URL.Query().Get("page"), &page)
		if page < 1 || page > len(pages) {
			w.Write([]byte("[]"))
			return
		}
		json.NewEncoder(w).Encode(pages[page-1])
	})
	mux.HandleFunc("GET /repos/acme/alpha", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"default_branch":"main"}`))
	})
	mux.HandleFunc("GET /repos/acme/{repo}/git/trees/{ref}", func(w http.ResponseWriter, r *http.Request) {
		switch repo := r.PathValue("repo"); {
		case repo == "empty":
			http.Error(w, `{"message":"Git Repository is empty."}`, http.StatusConflict)
		case repo == "broken":
			broken(w, r)
		case trees[repo] != nil:
			json.NewEncoder(w).Encode(map[string]any{"tree": trees[repo]})
		default:
			http.NotFound(w, r)
		}
	})
	mux.HandleFunc("GET /repos/acme/{repo}/contents/{path...}", func(w http.ResponseWriter, r *http.Request) {
		name := filepath.Base(filepath.Dir(r.PathValue("path")))
		fmt.Fprintf(w, "---\nname: %s\ndescription: skill %s\n---\n# %s\n", name, name, name)
	})
	mux.HandleFunc("GET /repos/acme/{repo}/commits", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`[{"sha":"0123456789abcdef","commit":{"committer":{"date":"2026-09-01T10:00:00Z"}}}]`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	old := apiBase
	apiBase = srv.URL
	t.Cleanup(func() { apiBase = old })
}

// runScan runs `skill-atlas scan <args>` with HOME in a fresh temp dir and returns the exit code,
// stdout, stderr and the ~/.skill-atlas dir.
func runScan(t *testing.T, args ...string) (int, string, string, string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	var stdout, stderr bytes.Buffer
	code := run(append([]string{"scan"}, args...), &stdout, &stderr)
	return code, stdout.String(), stderr.String(), filepath.Join(home, ".skill-atlas")
}

func readSummary(t *testing.T, dir, owner string) (OwnerSummary, []byte) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(dir, "orgs", owner+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var s OwnerSummary
	if err := json.Unmarshal(data, &s); err != nil {
		t.Fatalf("invalid summary: %v", err)
	}
	return s, data
}

func TestOwnerScan(t *testing.T) {
	fakeOwner(t, nil)
	code, stdout, stderr, dir := runScan(t, "https://github.com/acme/")
	if code != 0 {
		t.Fatalf("exit code %d: %s", code, stderr)
	}

	s, _ := readSummary(t, dir, "acme")
	want := []RepoCount{{Repo: "acme/beta", File: "acme-beta", Skills: 2}, {Repo: "acme/alpha", File: "acme-alpha", Skills: 1}}
	if s.Owner != "acme" || s.ReposScanned != 4 || fmt.Sprint(s.Repos) != fmt.Sprint(want) {
		t.Errorf("summary = %+v, want owner acme, 4 repos scanned (fork skipped, empty and plain counted), repos %+v", s, want)
	}
	if ts, err := time.Parse(time.RFC3339, s.ScannedAt); err != nil || time.Since(ts) > time.Minute || !strings.HasSuffix(s.ScannedAt, "Z") {
		t.Errorf("scanned_at = %q, want the current UTC time in RFC 3339", s.ScannedAt)
	}

	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	if len(lines) != 4 || !strings.HasPrefix(lines[0], "REPO") || !strings.HasPrefix(lines[1], "acme/beta") || !strings.HasPrefix(lines[2], "acme/alpha") ||
		lines[3] != "Found 3 skills in 2 of 4 repositories of acme" {
		t.Errorf("unexpected output:\n%s", stdout)
	}

	for _, f := range []string{"acme-plain.json", "acme-empty.json", "acme-fork.json"} {
		if _, err := os.Stat(filepath.Join(dir, f)); !os.IsNotExist(err) {
			t.Errorf("%s: want no index file for a repo without skills or a fork (err = %v)", f, err)
		}
	}

	// The index file of a repo equals what a single-repo scan writes.
	alpha, err := os.ReadFile(filepath.Join(dir, "acme-alpha.json"))
	if err != nil {
		t.Fatal(err)
	}
	if code, _, stderr, single := runScan(t, "https://github.com/acme/alpha"); code != 0 {
		t.Fatalf("single scan: exit code %d: %s", code, stderr)
	} else if want, _ := os.ReadFile(filepath.Join(single, "acme-alpha.json")); !bytes.Equal(alpha, want) {
		t.Errorf("owner scan wrote\n%s\nsingle scan wrote\n%s", alpha, want)
	}
	var skills []Skill
	if err := json.Unmarshal(alpha, &skills); err != nil || len(skills) != 1 || len(skills[0].Paths) != 2 || skills[0].CommitSHA == "" {
		t.Errorf("acme-alpha.json = %s", alpha)
	}
}

func TestOwnerScanJSON(t *testing.T) {
	fakeOwner(t, nil)
	code, stdout, stderr, dir := runScan(t, "https://github.com/acme", "--json")
	if code != 0 {
		t.Fatalf("exit code %d: %s", code, stderr)
	}
	if _, stored := readSummary(t, dir, "acme"); stdout != string(stored) {
		t.Errorf("--json output differs from the summary file:\n%s\nvs\n%s", stdout, stored)
	}
}

func TestOwnerScanKeepsOldIndexOfRepoWithoutSkills(t *testing.T) {
	fakeOwner(t, nil)
	home := t.TempDir()
	t.Setenv("HOME", home)
	old := filepath.Join(home, ".skill-atlas", "acme-plain.json")
	os.MkdirAll(filepath.Dir(old), 0o755)
	os.WriteFile(old, []byte("[]\n"), 0o644)
	if code := run([]string{"scan", "https://github.com/acme"}, io.Discard, io.Discard); code != 0 {
		t.Fatalf("exit code %d", code)
	}
	if data, err := os.ReadFile(old); err != nil || string(data) != "[]\n" {
		t.Errorf("acme-plain.json = %q, %v; want it left untouched", data, err)
	}
}

func TestOwnerScanRepoError(t *testing.T) {
	fakeOwner(t, func(w http.ResponseWriter, r *http.Request) { http.Error(w, "boom", http.StatusInternalServerError) })
	code, stdout, stderr, dir := runScan(t, "https://github.com/acme")
	if code != 1 {
		t.Errorf("exit code %d, want 1", code)
	}
	if !strings.Contains(stderr, "skill-atlas: acme/broken: ") {
		t.Errorf("stderr = %q, want the failing repo reported", stderr)
	}
	if !strings.Contains(stdout, "Found 3 skills in 2 of 4 repositories of acme") {
		t.Errorf("stdout = %q", stdout)
	}
	s, _ := readSummary(t, dir, "acme")
	if s.ReposScanned != 4 || len(s.Repos) != 2 {
		t.Errorf("summary = %+v, want the broken repo left out", s)
	}
	for _, f := range []string{"acme-alpha.json", "acme-beta.json"} {
		if _, err := os.Stat(filepath.Join(dir, f)); err != nil {
			t.Errorf("%s not stored: %v", f, err)
		}
	}
}

func TestOwnerScanRateLimit(t *testing.T) {
	fakeOwner(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-RateLimit-Remaining", "0")
		http.Error(w, "rate limited", http.StatusForbidden)
	})
	code, stdout, stderr, dir := runScan(t, "https://github.com/acme")
	if code != 1 || !strings.Contains(stderr, "GITHUB_TOKEN") || stdout != "" {
		t.Errorf("exit code %d, stdout %q, stderr %q; want 1, nothing, the rate-limit message", code, stdout, stderr)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Errorf("want no files written after a rate-limit error (err = %v)", err)
	}
}

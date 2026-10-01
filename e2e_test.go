//go:build e2e

package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// Run with: go test -tags e2e -v ./...
//
// All tests are pinned to a commit so upstream changes can't break them, except
// TestScanDefaultBranch, which checks the plain-URL (default branch) path with a loose assertion.
// The pinned tests replay recorded API responses (see e2e_recording_test.go); E2E_RECORD=1
// re-records them from the live API.
const (
	kotlinURL  = "https://github.com/JetBrains/kotlin/tree/197871e7256b81028d7dbce42eaee642a36900d0"
	mpsURL     = "https://github.com/JetBrains/MPS/tree/49d37b63488a0a8e42eb0130cb867fd508f398ac"
	koogURL    = "https://github.com/JetBrains/koog/tree/16d83270f8a7f25358ae0165466f14e70416c428"
	androidURL = "https://github.com/JetBrains/android/tree/4f0a5e1cb653c29f81c6b77eff885a6e81622cf4"
)

// scanJSON runs `skill-atlas scan <url> --json` with HOME in a temp dir and returns the skills and HOME.
func scanJSON(t *testing.T, url string) ([]Skill, []byte, string) {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	var stdout, stderr bytes.Buffer
	if code := run([]string{"scan", url, "--json"}, &stdout, &stderr); code != 0 {
		t.Fatalf("exit code %d: %s", code, stderr.String())
	}
	var skills []Skill
	if err := json.Unmarshal(stdout.Bytes(), &skills); err != nil {
		t.Fatalf("invalid JSON output: %v", err)
	}
	for _, s := range skills {
		if s.Name == "" || s.Path == "" || len(s.Paths) == 0 || len(s.Categories) == 0 || s.CommitSHA == "" || s.CommitDate == "" {
			t.Errorf("skill has empty fields: %+v", s)
		}
	}
	return skills, stdout.Bytes(), home
}

func TestScanKotlin(t *testing.T) {
	useRecording(t, "JetBrains-kotlin")
	skills, stdout, home := scanJSON(t, kotlinURL)
	if len(skills) != 6 {
		t.Fatalf("got %d skills, want 6: %+v", len(skills), skills)
	}
	for _, s := range skills {
		if !strings.HasPrefix(s.Path, ".claude/skills/") {
			t.Errorf("skill %q is not under .claude/skills/", s.Path)
		}
	}

	stored, err := os.ReadFile(filepath.Join(home, ".skill-atlas", "JetBrains-kotlin.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(stored, stdout) {
		t.Error("stored file does not match stdout")
	}
}

// A URL without /tree/<ref> makes the CLI look up the repo's default branch. Unpinned, so it only
// asserts that some skill is found, which survives upstream skills being added or removed. The only
// test against the live API; koog is small (11 requests).
func TestScanDefaultBranch(t *testing.T) {
	skills, _, _ := scanJSON(t, "https://github.com/JetBrains/koog")
	if len(skills) == 0 {
		t.Fatal("found no skills on the default branch of JetBrains/koog")
	}
}

// MPS keeps identical copies of every skill in .agents/skills and .claude/skills.
func TestScanMPSDuplicates(t *testing.T) {
	useRecording(t, "JetBrains-MPS")
	skills, _, _ := scanJSON(t, mpsURL)
	if len(skills) != 41 {
		t.Fatalf("got %d skills, want 41", len(skills))
	}
	names := map[string]bool{}
	for _, s := range skills {
		if names[s.Name] {
			t.Errorf("skill %q listed more than once", s.Name)
		}
		names[s.Name] = true

		dir := strings.TrimPrefix(s.Path, ".agents/skills/")
		if dir == s.Path || !slices.Contains(s.Paths, ".claude/skills/"+dir) {
			t.Errorf("skill %q: want copies in .agents/skills and .claude/skills, got %v", s.Name, s.Paths)
		}
	}
}

// MPS also ships 32 of its skills inside the product (plugin resources).
func TestScanMPSProduct(t *testing.T) {
	useRecording(t, "JetBrains-MPS")
	skills, _, _ := scanJSON(t, mpsURL)
	var product int
	for _, s := range skills {
		inProduct := slices.ContainsFunc(s.Paths, func(p string) bool {
			return strings.HasPrefix(p, "plugins/mcp-tools/resources/jetbrains/mps/agents/mcp/skills/")
		})
		if inProduct != slices.Contains(s.Categories, "product") {
			t.Errorf("skill %q: product path=%v but categories=%v", s.Name, inProduct, s.Categories)
		}
		if inProduct {
			product++
		}
	}
	if product != 32 {
		t.Errorf("got %d product skills, want 32", product)
	}
}

// koog has 2 agent skills, 2 test fixtures, and a docs page named skills.md that isn't a skill.
func TestScanKoogTestData(t *testing.T) {
	useRecording(t, "JetBrains-koog")
	skills, _, _ := scanJSON(t, koogURL)
	got := map[string][]string{}
	for _, s := range skills {
		got[s.Path] = s.Categories
	}
	want := map[string]string{
		".claude/skills/add-java-code-snippets-in-docs/SKILL.md":                       "agent",
		".claude/skills/split-jvm-nonjvm/SKILL.md":                                     "agent",
		"integration-tests/src/jvmTest/resources/skills/arithmetic-evaluator/SKILL.md": "test",
		"integration-tests/src/jvmTest/resources/skills/weather-retrieval/SKILL.md":    "test",
	}
	if len(got) != len(want) {
		t.Errorf("got %d skills, want %d: %v", len(got), len(want), got)
	}
	for p, c := range want {
		if strings.Join(got[p], ",") != c {
			t.Errorf("%s: categories %v, want [%s]", p, got[p], c)
		}
	}
}

// android keeps its skills in a non-dot top-level agent/ folder.
func TestScanAndroidUnusualFolder(t *testing.T) {
	useRecording(t, "JetBrains-android")
	skills, _, _ := scanJSON(t, androidURL)
	if len(skills) != 6 {
		t.Fatalf("got %d skills, want 6", len(skills))
	}
	for _, s := range skills {
		if !strings.HasPrefix(s.Path, "agent/skills/") || strings.Join(s.Categories, ",") != "agent" {
			t.Errorf("skill %q: path %s categories %v, want agent/skills/ and [agent]", s.Name, s.Path, s.Categories)
		}
	}
	// The frontmatter name wins over the folder name.
	i := slices.IndexFunc(skills, func(s Skill) bool { return s.Path == "agent/skills/android-studio-evals/SKILL.md" })
	if i < 0 || skills[i].Name != "write-evals" {
		t.Errorf("want agent/skills/android-studio-evals/SKILL.md named write-evals")
	}
}

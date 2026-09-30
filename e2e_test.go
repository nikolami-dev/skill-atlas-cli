//go:build e2e

package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Run with: go test -tags e2e -run TestScanKotlin ./...
func TestScanKotlin(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	var stdout, stderr bytes.Buffer
	if code := run([]string{"scan", "https://github.com/JetBrains/kotlin", "--json"}, &stdout, &stderr); code != 0 {
		t.Fatalf("exit code %d: %s", code, stderr.String())
	}

	var skills []Skill
	if err := json.Unmarshal(stdout.Bytes(), &skills); err != nil {
		t.Fatalf("invalid JSON output: %v", err)
	}
	if len(skills) != 6 {
		t.Fatalf("got %d skills, want 6: %+v", len(skills), skills)
	}
	for _, s := range skills {
		if !strings.HasPrefix(s.Path, ".claude/skills/") {
			t.Errorf("skill %q is not under .claude/skills/", s.Path)
		}
		if s.Name == "" || s.Path == "" || s.CommitSHA == "" || s.CommitDate == "" {
			t.Errorf("skill has empty fields: %+v", s)
		}
	}

	stored, err := os.ReadFile(filepath.Join(home, ".skill-atlas", "JetBrains-kotlin.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(stored, stdout.Bytes()) {
		t.Error("stored file does not match stdout")
	}
}

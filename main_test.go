package main

import (
	"strings"
	"testing"
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
		{in: "https://github.com/JetBrains", wantErr: true},
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

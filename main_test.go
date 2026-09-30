package main

import "testing"

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
	}{
		{"folded description", ".claude/skills/x/SKILL.md",
			"---\nname: bump\ndescription: >\n  Bumps the\n  version.\n---\n# Body\n", "bump", "Bumps the version."},
		{"CRLF line endings", "x/SKILL.md",
			"---\r\nname: crlf\r\ndescription: d\r\n---\r\n", "crlf", "d"},
		{"invalid YAML falls back to lines", "x/SKILL.md",
			"---\nname: loose\ndescription: Use when: things break\n---\n", "loose", "Use when: things break"},
		{"no frontmatter uses dir name", ".claude/skills/my-skill/SKILL.md",
			"# Just markdown\n", "my-skill", ""},
		{"frontmatter without name uses dir name", "skills/other/skill.md",
			"---\ndescription: only desc\n---\n", "other", "only desc"},
		{"root-level file uses repo name", "SKILL.md",
			"no frontmatter", "kotlin", ""},
	}
	for _, tt := range tests {
		s := parseSkill("JetBrains/kotlin", tt.path, []byte(tt.content))
		if s.Name != tt.wantName || s.Description != tt.wantDesc {
			t.Errorf("%s: got name=%q desc=%q, want name=%q desc=%q", tt.name, s.Name, s.Description, tt.wantName, tt.wantDesc)
		}
	}
}

// Command skill-atlas scans a GitHub repository for agent skill files (SKILL.md) and lists them.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"sync"
	"text/tabwriter"

	"gopkg.in/yaml.v3"
)

const apiBase = "https://api.github.com"

const usage = "usage: skill-atlas scan <github-url> [--json]"

// Skill is one unique skill file. Files with identical content (same git blob SHA)
// are merged into one Skill; Path is the first of Paths.
type Skill struct {
	Repo        string   `json:"repo"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Path        string   `json:"path"`
	Paths       []string `json:"paths"`
	Categories  []string `json:"categories"`
	CommitSHA   string   `json:"commit_sha"`
	CommitDate  string   `json:"commit_date"`
}

// sem bounds the number of concurrent GitHub API requests.
var sem = make(chan struct{}, 10)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 || args[0] != "scan" {
		fmt.Fprintln(stderr, usage)
		return 2
	}
	// Parsed by hand because the flag package stops at the first positional arg,
	// and the spec puts --json after the URL.
	var jsonOut bool
	var positional []string
	for _, a := range args[1:] {
		switch {
		case a == "--json" || a == "-json":
			jsonOut = true
		case a == "-h" || a == "--help":
			fmt.Fprintln(stdout, usage)
			return 0
		case strings.HasPrefix(a, "-"):
			fmt.Fprintf(stderr, "unknown flag %s\n%s\n", a, usage)
			return 2
		default:
			positional = append(positional, a)
		}
	}
	if len(positional) != 1 {
		fmt.Fprintln(stderr, usage)
		return 2
	}
	owner, repo, branch, err := parseRepoURL(positional[0])
	if err != nil {
		fmt.Fprintf(stderr, "%v\n%s\n", err, usage)
		return 2
	}

	skills, err := scan(owner, repo, branch)
	if err != nil {
		fmt.Fprintln(stderr, "skill-atlas:", err)
		return 1
	}
	data, err := json.MarshalIndent(skills, "", "  ")
	if err != nil {
		fmt.Fprintln(stderr, "skill-atlas:", err)
		return 1
	}
	data = append(data, '\n')
	if err := store(owner, repo, data); err != nil {
		fmt.Fprintln(stderr, "skill-atlas: storing results:", err)
		return 1
	}

	if jsonOut {
		stdout.Write(data)
		return 0
	}
	if len(skills) > 0 {
		tw := tabwriter.NewWriter(stdout, 0, 0, 2, ' ', 0)
		fmt.Fprintln(tw, "NAME\tCATEGORY\tDESCRIPTION\tPATH\tCOMMIT")
		for _, s := range skills {
			p := s.Path
			if n := len(s.Paths) - 1; n > 0 {
				p += fmt.Sprintf(" (+%d copies)", n)
			}
			fmt.Fprintf(tw, "%s\t%s\t%s\t%s\t%s\n", s.Name, strings.Join(s.Categories, ","), truncate(s.Description, 60), p, shortSHA(s.CommitSHA))
		}
		tw.Flush()
	}
	fmt.Fprintf(stdout, "Found %d skills in %s/%s\n", len(skills), owner, repo)
	return 0
}

// parseRepoURL accepts https://github.com/{owner}/{repo} with an optional trailing "/",
// ".git" or "/tree/{branch}/..." suffix. branch is empty when not given in the URL.
// ponytail: branch is the first segment after /tree/, so branch names containing "/" aren't supported.
func parseRepoURL(raw string) (owner, repo, branch string, err error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && u.Scheme != "http") || (u.Host != "github.com" && u.Host != "www.github.com") {
		return "", "", "", fmt.Errorf("invalid GitHub URL %q", raw)
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		return "", "", "", fmt.Errorf("invalid GitHub URL %q: expected https://github.com/{owner}/{repo}", raw)
	}
	owner, repo = parts[0], strings.TrimSuffix(parts[1], ".git")
	switch {
	case len(parts) == 2:
	case len(parts) >= 4 && parts[2] == "tree" && parts[3] != "":
		branch = parts[3]
	default:
		return "", "", "", fmt.Errorf("invalid GitHub URL %q: expected https://github.com/{owner}/{repo}[/tree/{branch}]", raw)
	}
	return owner, repo, branch, nil
}

func isSkillFile(p string) bool {
	base := path.Base(p)
	return strings.EqualFold(base, "SKILL.md") || strings.EqualFold(base, "SKILLS.md")
}

// category classifies a skill file path as "test", "agent" or "product".
// ponytail: name-based heuristic; add a config of extra patterns if repos need it.
func category(p string) string {
	dirs := strings.Split(path.Dir(p), "/")
	// The last dir is the skill's own folder (e.g. "mps-tests"), which names the skill, not its location.
	for _, d := range dirs[:len(dirs)-1] {
		l := strings.ToLower(d)
		if l == "test" || l == "tests" || l == "testdata" || l == "test-data" || l == "__tests__" ||
			strings.HasSuffix(d, "Test") || strings.HasSuffix(d, "Tests") ||
			strings.HasSuffix(l, "-test") || strings.HasSuffix(l, "-tests") ||
			strings.HasSuffix(l, "_test") || strings.HasSuffix(l, "_tests") {
			return "test"
		}
	}
	top := strings.ToLower(dirs[0])
	if top == "." || strings.HasPrefix(top, ".") || top == "agent" || top == "agents" {
		return "agent"
	}
	return "product"
}

func scan(owner, repo, branch string) ([]Skill, error) {
	if branch == "" {
		var r struct {
			DefaultBranch string `json:"default_branch"`
		}
		if err := getJSON(fmt.Sprintf("/repos/%s/%s", owner, repo), &r); err != nil {
			return nil, err
		}
		branch = r.DefaultBranch
	}
	files, err := findSkillFiles(owner, repo, branch, "")
	if err != nil {
		return nil, err
	}

	// Identical content means identical blob SHA, so copies (e.g. .agents/ and .claude/)
	// become one skill and each distinct blob is fetched only once.
	byBlob := map[string][]string{}
	for _, f := range files {
		byBlob[f.SHA] = append(byBlob[f.SHA], f.Path)
	}
	groups := make([][]string, 0, len(byBlob))
	for _, paths := range byBlob {
		sort.Strings(paths)
		groups = append(groups, paths)
	}

	results := make([]*Skill, len(groups))
	errs := make([]error, len(groups))
	var wg sync.WaitGroup
	for i, paths := range groups {
		wg.Go(func() { results[i], errs[i] = fetchSkill(owner, repo, branch, paths) })
	}
	wg.Wait()
	if err := errors.Join(errs...); err != nil {
		return nil, err
	}
	skills := []Skill{}
	for _, s := range results {
		if s != nil {
			skills = append(skills, *s)
		}
	}
	sort.Slice(skills, func(i, j int) bool { return skills[i].Path < skills[j].Path })
	return skills, nil
}

type treeEntry struct {
	Path string `json:"path"`
	Type string `json:"type"`
	SHA  string `json:"sha"`
}

type tree struct {
	Tree      []treeEntry `json:"tree"`
	Truncated bool        `json:"truncated"`
}

// findSkillFiles returns all skill file blobs under the tree ref, with paths relative to the repo root.
// GitHub truncates huge recursive listings (e.g. JetBrains/kotlin), so on truncation
// it lists one level and recurses into each subtree in parallel.
func findSkillFiles(owner, repo, ref, prefix string) ([]treeEntry, error) {
	base := fmt.Sprintf("/repos/%s/%s/git/trees/%s", owner, repo, url.PathEscape(ref))
	var t tree
	if err := getJSON(base+"?recursive=1", &t); err != nil {
		return nil, err
	}
	var found []treeEntry
	if !t.Truncated {
		for _, e := range t.Tree {
			if e.Type == "blob" && isSkillFile(e.Path) {
				found = append(found, treeEntry{Path: prefix + e.Path, Type: e.Type, SHA: e.SHA})
			}
		}
		return found, nil
	}

	var level tree
	if err := getJSON(base, &level); err != nil {
		return nil, err
	}
	var subtrees []treeEntry
	for _, e := range level.Tree {
		switch {
		case e.Type == "blob" && isSkillFile(e.Path):
			found = append(found, treeEntry{Path: prefix + e.Path, Type: e.Type, SHA: e.SHA})
		case e.Type == "tree":
			subtrees = append(subtrees, e)
		}
	}
	results := make([][]treeEntry, len(subtrees))
	errs := make([]error, len(subtrees))
	var wg sync.WaitGroup
	for i, e := range subtrees {
		wg.Go(func() { results[i], errs[i] = findSkillFiles(owner, repo, e.SHA, prefix+e.Path+"/") })
	}
	wg.Wait()
	if err := errors.Join(errs...); err != nil {
		return nil, err
	}
	for _, r := range results {
		found = append(found, r...)
	}
	return found, nil
}

// fetchSkill fetches one skill whose identical copies live at paths (sorted; the first is primary).
// It returns nil when the file has no frontmatter, i.e. isn't a skill.
func fetchSkill(owner, repo, branch string, paths []string) (*Skill, error) {
	p := paths[0]
	content, err := get(fmt.Sprintf("/repos/%s/%s/contents/%s?ref=%s", owner, repo, escapePath(p), url.QueryEscape(branch)), "application/vnd.github.raw")
	if err != nil {
		return nil, err
	}
	s, ok := parseSkill(owner+"/"+repo, paths, content)
	if !ok {
		return nil, nil
	}

	var commits []struct {
		SHA    string `json:"sha"`
		Commit struct {
			Committer struct {
				Date string `json:"date"`
			} `json:"committer"`
		} `json:"commit"`
	}
	if err := getJSON(fmt.Sprintf("/repos/%s/%s/commits?path=%s&sha=%s&per_page=1", owner, repo, url.QueryEscape(p), url.QueryEscape(branch)), &commits); err != nil {
		return nil, err
	}
	if len(commits) > 0 {
		s.CommitSHA, s.CommitDate = commits[0].SHA, commits[0].Commit.Committer.Date
	}
	return &s, nil
}

// parseSkill builds a Skill from a skill file's content and the sorted paths of its identical copies.
// ok is false when the frontmatter has neither name nor description (e.g. a docs page named skills.md).
// A missing name falls back to the parent directory name, or the repo name for a root-level file.
func parseSkill(repo string, paths []string, content []byte) (s Skill, ok bool) {
	name, desc := parseFrontmatter(content)
	if name == "" && desc == "" {
		return Skill{}, false
	}
	p := paths[0]
	if name == "" {
		if dir := path.Dir(p); dir != "." {
			name = path.Base(dir)
		} else {
			name = path.Base(repo)
		}
	}
	var categories []string
	for _, q := range paths {
		if c := category(q); !slices.Contains(categories, c) {
			categories = append(categories, c)
		}
	}
	sort.Strings(categories)
	return Skill{Repo: repo, Name: name, Description: desc, Path: p, Paths: paths, Categories: categories}, true
}

// parseFrontmatter returns the name and description from a leading "---" YAML block.
// Skill files often contain YAML that doesn't parse strictly (e.g. an unquoted ": " in the
// description), so on a YAML error it falls back to reading plain "key: value" lines.
func parseFrontmatter(content []byte) (name, desc string) {
	s := strings.ReplaceAll(string(content), "\r\n", "\n")
	rest, ok := strings.CutPrefix(s, "---\n")
	if !ok {
		return "", ""
	}
	rest = "\n" + rest
	end := strings.Index(rest, "\n---")
	if end < 0 {
		return "", ""
	}
	block := rest[:end]

	var fm struct {
		Name        string `yaml:"name"`
		Description string `yaml:"description"`
	}
	if err := yaml.Unmarshal([]byte(block), &fm); err == nil {
		return strings.TrimSpace(fm.Name), strings.TrimSpace(fm.Description)
	}
	for _, line := range strings.Split(block, "\n") {
		if v, ok := strings.CutPrefix(line, "name:"); ok {
			name = strings.Trim(strings.TrimSpace(v), `"'`)
		} else if v, ok := strings.CutPrefix(line, "description:"); ok {
			desc = strings.Trim(strings.TrimSpace(v), `"'`)
		}
	}
	return name, desc
}

func get(apiPath, accept string) ([]byte, error) {
	sem <- struct{}{}
	defer func() { <-sem }()

	req, err := http.NewRequest(http.MethodGet, apiBase+apiPath, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", accept)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if token := os.Getenv("GITHUB_TOKEN"); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusTooManyRequests ||
		(resp.StatusCode == http.StatusForbidden && resp.Header.Get("X-RateLimit-Remaining") == "0") {
		return nil, errors.New("GitHub API rate limit exceeded; set GITHUB_TOKEN to raise the limit")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: %s", apiPath, resp.Status)
	}
	return body, nil
}

func getJSON(apiPath string, v any) error {
	body, err := get(apiPath, "application/vnd.github+json")
	if err != nil {
		return err
	}
	return json.Unmarshal(body, v)
}

func escapePath(p string) string {
	parts := strings.Split(p, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func store(owner, repo string, data []byte) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	dir := filepath.Join(home, ".skill-atlas")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, owner+"-"+repo+".json"), data, 0o644)
}

func truncate(s string, n int) string {
	s = strings.Join(strings.Fields(s), " ")
	if r := []rune(s); len(r) > n {
		return string(r[:n-1]) + "…"
	}
	return s
}

func shortSHA(sha string) string {
	if len(sha) > 7 {
		return sha[:7]
	}
	return sha
}

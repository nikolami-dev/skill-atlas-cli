//go:build e2e

package main

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// The pinned E2E scans replay recorded GitHub API responses from testdata/e2e/<name>.json.gz, so they
// make no API requests (spec §5). The scanned commits are pinned, so the responses can't go stale.
// E2E_RECORD=1 runs them against the live API instead and rewrites the recordings (set GITHUB_TOKEN).

type recordedResponse struct {
	Status int    `json:"status"`
	Body   string `json:"body"`
}

// recording maps a request's path and query (e.g. /repos/o/r/git/trees/sha?recursive=1) to its response.
type recording map[string]recordedResponse

type recordingTransport struct {
	mu   sync.Mutex
	rec  recording
	live bool
}

func (rt *recordingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	key := req.URL.RequestURI()
	if req.URL.Host != "api.github.com" {
		return nil, fmt.Errorf("unexpected request to %s", req.URL)
	}
	if !rt.live {
		r, ok := rt.rec[key]
		if !ok {
			return nil, fmt.Errorf("no recorded response for GET %s; re-record with E2E_RECORD=1", key)
		}
		return &http.Response{
			StatusCode: r.Status,
			Status:     fmt.Sprintf("%d %s", r.Status, http.StatusText(r.Status)),
			Header:     http.Header{},
			Body:       io.NopCloser(bytes.NewBufferString(r.Body)),
			Request:    req,
		}, nil
	}
	resp, err := http.DefaultTransport.RoundTrip(req)
	if err != nil {
		return nil, err
	}
	body, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	if err != nil {
		return nil, err
	}
	resp.Body = io.NopCloser(bytes.NewReader(body))
	if resp.StatusCode == http.StatusOK {
		rt.mu.Lock()
		rt.rec[key] = recordedResponse{Status: resp.StatusCode, Body: string(body)}
		rt.mu.Unlock()
	}
	return resp, nil
}

// useRecording makes the CLI's API requests replay testdata/e2e/<name>.json.gz for the rest of the
// test, or, with E2E_RECORD=1, go to the live API and rewrite that file when the test passes.
func useRecording(t *testing.T, name string) {
	t.Helper()
	file := filepath.Join("testdata", "e2e", name+".json.gz")
	rt := &recordingTransport{rec: recording{}, live: os.Getenv("E2E_RECORD") == "1"}
	if !rt.live {
		if err := readRecording(file, &rt.rec); err != nil {
			t.Fatalf("%v (re-record with E2E_RECORD=1)", err)
		}
	}
	old := http.DefaultClient.Transport
	http.DefaultClient.Transport = rt
	t.Cleanup(func() {
		http.DefaultClient.Transport = old
		if rt.live && !t.Failed() {
			if err := writeRecording(file, rt.rec); err != nil {
				t.Errorf("writing %s: %v", file, err)
			}
		}
	})
}

func readRecording(file string, rec *recording) error {
	f, err := os.Open(file)
	if err != nil {
		return err
	}
	defer f.Close()
	zr, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("%s: %w", file, err)
	}
	if err := json.NewDecoder(zr).Decode(rec); err != nil {
		return fmt.Errorf("%s: %w", file, err)
	}
	return nil
}

// minimize keeps recordings small; the pinned repos' full tree listings are ~140 MB of JSON. Only the
// parts the scans read survive, and the result still replays to the same scan output:
//   - tree listings: entries whose file name contains "skill" (any case), so every skill-file
//     candidate and near miss stays, plus, in level listings, the subtrees that lead to one. Listings
//     of other subtrees are dropped. Entries keep only path, type and sha;
//   - commit lists: only sha and commit.committer.date;
//   - file contents: unchanged.
func minimize(rec recording) (recording, error) {
	out := recording{}
	referenced := map[string]bool{} // tree SHAs listed as subtrees of a level listing
	for key, r := range rec {
		switch {
		case strings.Contains(key, "/git/trees/"):
			if !strings.HasSuffix(key, "?recursive=1") {
				var t tree
				if err := json.Unmarshal([]byte(r.Body), &t); err != nil {
					return nil, fmt.Errorf("%s: %w", key, err)
				}
				for _, e := range t.Tree {
					if e.Type == "tree" {
						referenced[e.SHA] = true
					}
				}
			}
		case strings.Contains(key, "/commits?"):
			var commits []struct {
				SHA    string `json:"sha"`
				Commit struct {
					Committer struct {
						Date string `json:"date"`
					} `json:"committer"`
				} `json:"commit"`
			}
			if err := json.Unmarshal([]byte(r.Body), &commits); err != nil {
				return nil, fmt.Errorf("%s: %w", key, err)
			}
			b, _ := json.Marshal(commits)
			out[key] = recordedResponse{Status: r.Status, Body: string(b)}
		default:
			out[key] = r
		}
	}
	// keepTree copies the listing of the tree at key (and the level listings and subtrees it falls
	// back to when truncated) and reports whether it contains a skill-named file.
	var keepTree func(key string) (bool, error)
	keepTree = func(key string) (bool, error) {
		r, ok := rec[key]
		if !ok {
			return false, nil
		}
		var t tree
		if err := json.Unmarshal([]byte(r.Body), &t); err != nil {
			return false, fmt.Errorf("%s: %w", key, err)
		}
		skillNamed := func(e treeEntry) bool {
			return e.Type == "blob" && strings.Contains(strings.ToLower(path.Base(e.Path)), "skill")
		}
		found := false
		kept := tree{Tree: []treeEntry{}, Truncated: t.Truncated}
		if !t.Truncated {
			for _, e := range t.Tree {
				if skillNamed(e) {
					kept.Tree = append(kept.Tree, treeEntry{Path: e.Path, Type: e.Type, SHA: e.SHA})
					found = true
				}
			}
		} else {
			levelKey := strings.TrimSuffix(key, "?recursive=1")
			var level tree
			if err := json.Unmarshal([]byte(rec[levelKey].Body), &level); err != nil {
				return false, fmt.Errorf("%s: %w", levelKey, err)
			}
			keptLevel := tree{Tree: []treeEntry{}}
			for _, e := range level.Tree {
				keep := skillNamed(e)
				if e.Type == "tree" {
					sub := key[:strings.LastIndex(key, "/git/trees/")] + "/git/trees/" + e.SHA + "?recursive=1"
					var err error
					if keep, err = keepTree(sub); err != nil {
						return false, err
					}
				}
				if keep {
					keptLevel.Tree = append(keptLevel.Tree, treeEntry{Path: e.Path, Type: e.Type, SHA: e.SHA})
					found = true
				}
			}
			b, _ := json.Marshal(keptLevel)
			out[levelKey] = recordedResponse{Status: rec[levelKey].Status, Body: string(b)}
		}
		if found || !referenced[treeSHA(key)] { // the root listing is always kept
			b, _ := json.Marshal(kept)
			out[key] = recordedResponse{Status: r.Status, Body: string(b)}
		}
		return found, nil
	}
	for key := range rec {
		if strings.Contains(key, "/git/trees/") && strings.HasSuffix(key, "?recursive=1") && !referenced[treeSHA(key)] {
			if _, err := keepTree(key); err != nil {
				return nil, err
			}
		}
	}
	return out, nil
}

// treeSHA returns the ref of a /repos/o/r/git/trees/{ref}[?query] request.
func treeSHA(key string) string {
	ref := key[strings.LastIndex(key, "/git/trees/")+len("/git/trees/"):]
	ref, _, _ = strings.Cut(ref, "?")
	return ref
}

// writeRecording writes rec as gzipped JSON. Map keys are sorted and the gzip header has no
// timestamp, so recording the same responses again gives the same bytes.
func writeRecording(file string, rec recording) error {
	rec, err := minimize(rec)
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(rec, "", " ")
	if err != nil {
		return err
	}
	var buf bytes.Buffer
	zw, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
	if _, err := zw.Write(data); err != nil {
		return err
	}
	if err := zw.Close(); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		return err
	}
	return os.WriteFile(file, buf.Bytes(), 0o644)
}

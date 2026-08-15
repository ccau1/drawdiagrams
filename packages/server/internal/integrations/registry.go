// Package integrations merges built-in Go integrations (each exposing
// Inject()) with runtime plugins installed from zip files or the
// marketplace. The merged declarations are served to the frontend, which
// routes each entry (draws / reactions / themes / commands) to the matching
// area of the application.
package integrations

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"draw.local/manifest"
)

// Builtin is the function signature every Go integration exposes in
// packages/integrations/<name>/main.go.
type Builtin func() manifest.Declaration

type Registry struct {
	mu       sync.RWMutex
	builtins []manifest.Declaration
	plugins  []manifest.Declaration // installed from zip / marketplace
	dir      string                 // data/plugins
}

func New(dir string, builtins ...Builtin) (*Registry, error) {
	r := &Registry{dir: dir}
	for _, b := range builtins {
		r.builtins = append(r.builtins, b())
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	r.reload()
	return r, nil
}

// All returns every active declaration (builtins + installed plugins).
func (r *Registry) All() []manifest.Declaration {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]manifest.Declaration, 0, len(r.builtins)+len(r.plugins))
	out = append(out, r.builtins...)
	out = append(out, r.plugins...)
	return out
}

// reload scans data/plugins/*/manifest.json for installed runtime plugins.
func (r *Registry) reload() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.plugins = nil
	entries, _ := os.ReadDir(r.dir)
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(r.dir, e.Name(), "manifest.json"))
		if err != nil {
			continue
		}
		var d manifest.Declaration
		if json.Unmarshal(raw, &d) == nil && d.Name != "" {
			r.plugins = append(r.plugins, d)
		}
	}
}

// InstallZip extracts a plugin zip into data/plugins/<name>/ and activates
// it. The zip must contain a manifest.json matching manifest.Declaration;
// any other files (SVG assets, etc.) are served under /plugins/<name>/.
func (r *Registry) InstallZip(zr io.ReaderAt, size int64) (manifest.Declaration, error) {
	z, err := zip.NewReader(zr, size)
	if err != nil {
		return manifest.Declaration{}, fmt.Errorf("invalid zip: %w", err)
	}
	// First pass: read and validate manifest.
	var d manifest.Declaration
	found := false
	for _, f := range z.File {
		norm := strings.TrimPrefix(filepath.ToSlash(f.Name), "./")
		if norm == "manifest.json" || (strings.Count(norm, "/") == 1 && strings.HasSuffix(norm, "/manifest.json")) {
			rc, err := f.Open()
			if err != nil {
				continue
			}
			raw, _ := io.ReadAll(io.LimitReader(rc, 1<<20))
			rc.Close()
			if json.Unmarshal(raw, &d) == nil && d.Name != "" {
				found = true
				break
			}
		}
	}
	if !found {
		return manifest.Declaration{}, errors.New("zip has no valid manifest.json")
	}
	if !isSafeName(d.Name) {
		return manifest.Declaration{}, errors.New("invalid plugin name")
	}
	dest := filepath.Join(r.dir, d.Name)
	os.RemoveAll(dest)
	if err := os.MkdirAll(dest, 0o755); err != nil {
		return manifest.Declaration{}, err
	}
	// Second pass: extract files, flattening a single top-level folder.
	for _, f := range z.File {
		name := strings.TrimPrefix(filepath.ToSlash(f.Name), "./")
		parts := strings.Split(name, "/")
		if len(parts) > 1 {
			parts = parts[1:] // flatten top-level dir
		}
		if len(parts) == 0 || parts[0] == "" {
			continue
		}
		rel := filepath.Join(parts...)
		if strings.Contains(rel, "..") {
			continue // zip-slip guard
		}
		target := filepath.Join(dest, rel)
		if f.FileInfo().IsDir() {
			os.MkdirAll(target, 0o755)
			continue
		}
		os.MkdirAll(filepath.Dir(target), 0o755)
		rc, err := f.Open()
		if err != nil {
			continue
		}
		data, _ := io.ReadAll(io.LimitReader(rc, 16<<20))
		rc.Close()
		os.WriteFile(target, data, 0o644)
	}
	r.reload()
	return d, nil
}

// Uninstall removes an installed runtime plugin by name.
func (r *Registry) Uninstall(name string) error {
	if !isSafeName(name) {
		return errors.New("invalid name")
	}
	if err := os.RemoveAll(filepath.Join(r.dir, name)); err != nil {
		return err
	}
	r.reload()
	return nil
}

// ZippedData wraps an in-memory zip as a ReaderAt with its size.
type ZippedData struct {
	Data io.ReaderAt
	Size int64
}

// ReaderAtFrom buffers an uploaded stream (capped) so it can be used as a
// ReaderAt by the zip package.
func ReaderAtFrom(r io.Reader, cap int64) (*ZippedData, error) {
	raw, err := io.ReadAll(io.LimitReader(r, cap+1))
	if err != nil {
		return nil, err
	}
	if int64(len(raw)) > cap {
		return nil, errors.New("file too large")
	}
	return &ZippedData{Data: bytesReader(raw), Size: int64(len(raw))}, nil
}

type bytesReaderT struct{ b []byte }

func bytesReader(b []byte) io.ReaderAt { return bytesReaderT{b} }

func (r bytesReaderT) ReadAt(p []byte, off int64) (int, error) {
	if off >= int64(len(r.b)) {
		return 0, io.EOF
	}
	n := copy(p, r.b[off:])
	if n < len(p) {
		return n, io.EOF
	}
	return n, nil
}

func isSafeName(s string) bool {
	if s == "" || len(s) > 64 {
		return false
	}
	for _, c := range s {
		if !(c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

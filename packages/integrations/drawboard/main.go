// Package drawboard contributes core app-level declarations that are not
// tied to any particular shape pack or theme.
package drawboard

import "draw.local/manifest"

// Inject declares the built-in native import/export options.
func Inject() manifest.Declaration {
	return manifest.Declaration{
		Name:        "drawboard",
		Version:     "1.0.0",
		Description: "Core Drawboard format support",
		Author:      "builtin",
		Builtin:     true,
		Imports: []manifest.ImportDecl{
			{ID: "native-json", Label: "Drawboard JSON", Extensions: []string{"drawboard.json", "json"}},
		},
		Exports: []manifest.ExportDecl{
			{ID: "native-json", Label: "Drawboard JSON", Extension: "drawboard.json", MimeType: "application/json"},
		},
	}
}

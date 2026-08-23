// Package excalidraw contributes Excalidraw file format support.
package excalidraw

import "draw.local/manifest"

// Inject declares Excalidraw import/export capabilities.
func Inject() manifest.Declaration {
	return manifest.Declaration{
		Name:        "excalidraw",
		Version:     "1.0.0",
		Description: "Import and export Excalidraw scenes",
		Author:      "builtin",
		Builtin:     true,
		Imports: []manifest.ImportDecl{
			{ID: "excalidraw", Label: "Excalidraw (.excalidraw / .json)", Extensions: []string{"excalidraw", "json"}, Multiple: true},
		},
		Exports: []manifest.ExportDecl{
			{ID: "excalidraw", Label: "Excalidraw (.excalidraw)", Extension: "excalidraw", MimeType: "application/json"},
		},
	}
}

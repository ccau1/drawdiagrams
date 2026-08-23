// Package umlshapes contributes UML diagram building blocks. Shapes are still
// rendered parametrically on the canvas, but each draw carries an SVG preview
// so the right-hand library can show an icon instead of plain text.
package umlshapes

import "draw.local/manifest"

func shape(id, label, renderer, keywords, svg, tooltip string, w, h float64) manifest.DrawDecl {
	return manifest.DrawDecl{
		ID:       "uml-" + id,
		Label:    label,
		Category: "UML",
		Kind:     "shape",
		Shape:    renderer,
		SVG:      svg,
		Keywords: keywords,
		Tooltip:  tooltip,
		Width:    w,
		Height:   h,
	}
}

// Inject declares the UML building blocks contributed to the app.
func Inject() manifest.Declaration {
	return manifest.Declaration{
		Name:        "uml-shapes",
		Version:     "1.1.0",
		Description: "UML diagram shapes: classes, actors, use cases, notes, packages",
		Author:      "builtin",
		Builtin:     true,
		Draws: []manifest.DrawDecl{
			shape("class", "Class", "uml-class-typed",
				"class typed attributes methods property return type",
				`<rect x="12" y="14" width="40" height="36" rx="2" fill="none" stroke="#5b6471" stroke-width="2"/><path d="M12 26 h40 M12 38 h40" stroke="#5b6471" stroke-width="2"/><text x="16" y="34" font-size="5" fill="#5b6471">name</text><text x="44" y="34" font-size="5" text-anchor="end" fill="#5b6471">Type</text>`,
				"UML class",
				180, 110),
			shape("interface", "Interface", "uml-interface",
				"lollipop contract api",
				`<circle cx="32" cy="20" r="5" fill="none" stroke="#5b6471" stroke-width="2"/><path d="M32 25 v25" stroke="#5b6471" stroke-width="2"/>`,
				"UML interface / provided interface lollipop",
				180, 80),
			shape("actor", "Actor", "uml-actor",
				"user person role stick figure",
				`<circle cx="32" cy="18" r="5" fill="none" stroke="#5b6471" stroke-width="2"/><path d="M32 24 v16 M24 32 h16 M22 46 l10 -6 l10 6" fill="none" stroke="#5b6471" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
				"UML actor / external user",
				60, 90),
			shape("usecase", "Use Case", "uml-usecase",
				"use case oval ellipse",
				`<ellipse cx="32" cy="32" rx="20" ry="12" fill="none" stroke="#5b6471" stroke-width="2"/>`,
				"UML use case ellipse",
				160, 70),
			shape("package", "Package", "uml-package",
				"namespace folder group container",
				`<path d="M12 18 h12 l4 6 h24 v28 h-40 z" fill="none" stroke="#5b6471" stroke-width="2"/>`,
				"UML package / namespace folder",
				160, 110),
			shape("note", "Note", "uml-note",
				"comment annotation sticky",
				`<path d="M14 16 h28 l8 8 v24 h-36 z" fill="none" stroke="#5b6471" stroke-width="2"/><path d="M42 16 v8 h8" fill="none" stroke="#5b6471" stroke-width="2"/>`,
				"UML note / comment annotation",
				130, 90),
			shape("component", "Component", "uml-component",
				"module subsystem",
				`<rect x="16" y="16" width="32" height="32" rx="2" fill="none" stroke="#5b6471" stroke-width="2"/><rect x="10" y="22" width="6" height="6" fill="#5b6471"/><rect x="10" y="36" width="6" height="6" fill="#5b6471"/>`,
				"UML component with provided interfaces",
				150, 90),
			shape("lifeline", "Lifeline", "uml-lifeline",
				"sequence timing",
				`<rect x="24" y="12" width="16" height="8" rx="1" fill="none" stroke="#5b6471" stroke-width="2"/><line x1="32" y1="20" x2="32" y2="52" stroke="#5b6471" stroke-width="2" stroke-dasharray="4 2"/>`,
				"UML sequence lifeline",
				120, 200),
			shape("frame", "Combined Fragment", "uml-frame",
				"sequence loop alt opt",
				`<rect x="10" y="12" width="44" height="40" rx="2" fill="none" stroke="#5b6471" stroke-width="2"/><path d="M10 22 h44" stroke="#5b6471" stroke-width="2"/><text x="14" y="19" font-size="6" fill="#5b6471">sd</text>`,
				"UML combined fragment / sequence frame",
				240, 160),
		},
		Commands: []manifest.CommandDecl{
			{ID: "uml-autolayout", Label: "Auto-layout UML", Shortcut: "Ctrl+L", Action: "uml.autolayout"},
		},
		Imports: []manifest.ImportDecl{
			{ID: "drawio", Label: "draw.io / mxGraph XML", Extensions: []string{"drawio", "xml"}},
		},
		Exports: []manifest.ExportDecl{
			{ID: "drawio", Label: "draw.io / mxGraph XML", Extension: "drawio", MimeType: "application/xml"},
		},
	}
}

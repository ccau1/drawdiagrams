// Package umlshapes contributes UML diagram building blocks. Parametric
// shapes (kind "shape") are rendered by the frontend canvas engine, so the
// same declaration drives both the toolbox entry and the renderer.
package umlshapes

import "draw.local/manifest"

func shape(id, label, renderer string, w, h float64) manifest.DrawDecl {
	return manifest.DrawDecl{
		ID:       "uml-" + id,
		Label:    label,
		Category: "UML",
		Kind:     "shape",
		Shape:    renderer,
		Width:    w,
		Height:   h,
	}
}

// Inject declares the UML building blocks contributed to the app.
func Inject() manifest.Declaration {
	return manifest.Declaration{
		Name:        "uml-shapes",
		Version:     "1.0.0",
		Description: "UML diagram shapes: classes, actors, use cases, notes, packages",
		Author:      "builtin",
		Builtin:     true,
		Draws: []manifest.DrawDecl{
			shape("class", "Class", "uml-class", 180, 110),
			shape("interface", "Interface", "uml-interface", 180, 80),
			shape("actor", "Actor", "uml-actor", 60, 90),
			shape("usecase", "Use Case", "uml-usecase", 160, 70),
			shape("package", "Package", "uml-package", 160, 110),
			shape("note", "Note", "uml-note", 130, 90),
			shape("component", "Component", "uml-component", 150, 90),
			shape("lifeline", "Lifeline", "uml-lifeline", 120, 200),
			shape("frame", "Combined Fragment", "uml-frame", 240, 160),
		},
		Commands: []manifest.CommandDecl{
			{ID: "uml-autolayout", Label: "Auto-layout UML", Shortcut: "Ctrl+L", Action: "uml.autolayout"},
		},
	}
}

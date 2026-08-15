// Package manifest defines the integration declaration schema shared by the
// server and every integration. An integration declares what it injects into
// the application: drawable items (shapes/icons), reactions, themes and
// commands. The server merges all declarations and the frontend applies each
// entry to the matching area of the UI (toolbox, reaction bar, theme picker,
// command menu) based solely on these declarations.
package manifest

// Declaration is the root object an integration returns from Inject().
type Declaration struct {
	Name        string         `json:"name"`
	Version     string         `json:"version"`
	Description string         `json:"description"`
	Author      string         `json:"author"`
	Builtin     bool           `json:"builtin"`
	Draws       []DrawDecl     `json:"draws,omitempty"`
	Reactions   []ReactionDecl `json:"reactions,omitempty"`
	Themes      []ThemeDecl    `json:"themes,omitempty"`
	Commands    []CommandDecl  `json:"commands,omitempty"`
}

// DrawDecl is a drawable item contributed by an integration: either an icon
// (SVG) or a parametric shape rendered by the canvas engine.
type DrawDecl struct {
	ID       string  `json:"id"`
	Label    string  `json:"label"`
	Category string  `json:"category"`
	Kind     string  `json:"kind"` // "icon" | "shape"
	SVG      string  `json:"svg,omitempty"`
	Shape    string  `json:"shape,omitempty"` // e.g. "uml-class", "uml-actor" (frontend renderer)
	Width    float64 `json:"width,omitempty"`
	Height   float64 `json:"height,omitempty"`
}

// ReactionDecl is an emoji reaction shown in the reaction bar and broadcast
// to collaborators as a float-up animation.
type ReactionDecl struct {
	ID    string `json:"id"`
	Emoji string `json:"emoji"`
	Label string `json:"label"`
}

// ThemeDecl restyles the whole app: UI CSS variables and canvas defaults.
type ThemeDecl struct {
	ID    string            `json:"id"`
	Label string            `json:"label"`
	Dark  bool              `json:"dark"`
	Vars  map[string]string `json:"vars"`  // CSS custom properties, e.g. "--bg": "#0b0d10"
	Canvas CanvasTheme      `json:"canvas"` // canvas-specific drawing styles
}

// CanvasTheme controls how the drawing surface looks under a theme.
type CanvasTheme struct {
	Background   string   `json:"background"`
	GridColor    string   `json:"gridColor"`
	Stroke       string   `json:"stroke"`
	Palette      []string `json:"palette"`
	FillStyle    string   `json:"fillStyle"` // "solid" | "hachure" | "cross-hatch"
	Roughness    float64  `json:"roughness"`
	SelectionBox string   `json:"selectionBox"`
}

// CommandDecl is a menu/keyboard action contributed by an integration.
type CommandDecl struct {
	ID      string `json:"id"`
	Label   string `json:"label"`
	Shortcut string `json:"shortcut,omitempty"`
	Action  string `json:"action"` // frontend action identifier, e.g. "canvas.clear"
}

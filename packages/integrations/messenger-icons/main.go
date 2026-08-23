// Package messengericons contributes simplified, multi-colour icons for common
// messaging and communication tools. Icons are geometric simplifications only.
package messengericons

import "draw.local/manifest"

func icon(label, cat, keywords, body string) manifest.DrawDecl {
	return manifest.DrawDecl{
		ID:       "msg-" + label,
		Label:    label,
		Category: cat,
		Kind:     "icon",
		SVG:      body,
		Keywords: keywords,
		Width:    64,
		Height:   64,
	}
}

// Inject declares everything this integration contributes to the app.
func Inject() manifest.Declaration {
	return manifest.Declaration{
		Name:        "messenger-icons",
		Version:     "1.1.0",
		Description: "Messaging and communication app icons for diagrams",
		Author:      "builtin",
		Builtin:     true,
		Draws: []manifest.DrawDecl{
			icon("Slack", "Messaging", "slack chat team channel",
				`<rect x="4" y="4" width="56" height="56" rx="14" fill="#4a154b"/>`+
					`<path d="M22 30 a4 4 0 0 1 4 -4 h4 v8 h-4 a4 4 0 0 1 -4 -4" fill="#e01e5a"/>`+
					`<path d="M34 22 a4 4 0 0 1 4 -4 v8 h-4 a4 4 0 0 1 -4 -4" fill="#36c5f0"/>`+
					`<path d="M42 34 a4 4 0 0 1 -4 4 h-4 v-8 h4 a4 4 0 0 1 4 4" fill="#ecb22e"/>`+
					`<path d="M30 42 a4 4 0 0 1 -4 4 v-8 h4 a4 4 0 0 1 4 4" fill="#2eb67d"/>`),
			icon("CC", "Messaging", "cc suite chat meet email ccapp",
				`<rect x="4" y="4" width="56" height="56" rx="14" fill="#6c5ce7"/>`+
					`<circle cx="26" cy="32" r="7" fill="#fff"/>`+
					`<circle cx="38" cy="32" r="7" fill="#fff"/>`+
					`<circle cx="26" cy="32" r="3" fill="#6c5ce7"/>`+
					`<circle cx="38" cy="32" r="3" fill="#6c5ce7"/>`),
			icon("Teams", "Messaging", "microsoft teams chat meeting",
				`<rect x="4" y="4" width="56" height="56" rx="14" fill="#6264a7"/>`+
					`<rect x="12" y="14" width="18" height="18" rx="2" fill="#fff"/>`+
					`<circle cx="21" cy="23" r="5" fill="#6264a7"/>`+
					`<rect x="34" y="14" width="18" height="18" rx="2" fill="#fff"/>`+
					`<circle cx="43" cy="23" r="5" fill="#6264a7"/>`+
					`<path d="M14 46 c0 -8 6 -14 16 -14 s16 6 16 14" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`),
			icon("WhatsApp", "Messaging", "whatsapp chat message phone",
			`<rect x="4" y="4" width="56" height="56" rx="14" fill="#25d366"/>`+
				`<circle cx="32" cy="32" r="16" fill="#fff"/>`+
				`<path d="M26 38 l-2 6 l6 -2 c5 3 12 0 14 -6 c2 -6 -2 -13 -8 -15 s-13 2 -15 8 c-1 3 0 6 2 8" fill="none" stroke="#25d366" stroke-width="3" stroke-linecap="round"/>`+
				`<circle cx="26" cy="34" r="2" fill="#25d366"/>`+
				`<circle cx="32" cy="34" r="2" fill="#25d366"/>`+
				`<circle cx="38" cy="34" r="2" fill="#25d366"/>`),
			icon("Telegram", "Messaging", "telegram chat message",
			`<rect x="4" y="4" width="56" height="56" rx="14" fill="#0088cc"/>`+
				`<circle cx="32" cy="32" r="18" fill="#fff"/>`+
				`<path d="M22 34 l18 -8 l-6 18 l-3 -6 l-6 2 l-3 -6 z" fill="#0088cc"/>`),
		},
	}
}

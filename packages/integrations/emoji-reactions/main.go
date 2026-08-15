// Package emojireactions contributes the default emoji reaction set. Each
// declared reaction appears in the reaction bar and floats up from the
// sender's cursor, broadcast to all collaborators on the board.
package emojireactions

import "draw.local/manifest"

// Inject declares the reactions contributed to the app.
func Inject() manifest.Declaration {
	r := func(id, emoji, label string) manifest.ReactionDecl {
		return manifest.ReactionDecl{ID: id, Emoji: emoji, Label: label}
	}
	return manifest.Declaration{
		Name:        "emoji-reactions",
		Version:     "1.0.0",
		Description: "Floating emoji reactions for live collaboration",
		Author:      "builtin",
		Builtin:     true,
		Reactions: []manifest.ReactionDecl{
			r("thumbsup", "👍", "Thumbs up"),
			r("heart", "❤️", "Love"),
			r("laugh", "😂", "Haha"),
			r("tada", "🎉", "Celebrate"),
			r("clap", "👏", "Applause"),
			r("fire", "🔥", "Fire"),
			r("wow", "😮", "Wow"),
			r("rocket", "🚀", "Ship it"),
		},
	}
}

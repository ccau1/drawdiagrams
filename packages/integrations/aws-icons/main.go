// Package awsiicons is a built-in integration contributing AWS architecture
// icons to the drawing toolbox. Its Inject() declaration is merged by the
// server registry and consumed by the frontend anywhere draws are listed.
package awsicons

import "draw.local/manifest"

func icon(label, cat, body string) manifest.DrawDecl {
	return manifest.DrawDecl{
		ID:       "aws-" + label,
		Label:    label,
		Category: "AWS / " + cat,
		Kind:     "icon",
		SVG:      body,
		Width:    64,
		Height:   64,
	}
}

// Inject declares everything this integration contributes to the app.
func Inject() manifest.Declaration {
	orange := "#e88434"
	dark := "#232f3e"
	box := func(inner string) string {
		return `<rect x="2" y="2" width="60" height="60" rx="8" fill="none" stroke="` + dark + `" stroke-width="2"/>` + inner
	}
	return manifest.Declaration{
		Name:        "aws-icons",
		Version:     "1.0.0",
		Description: "AWS architecture icons for infrastructure diagrams",
		Author:      "builtin",
		Builtin:     true,
		Draws: []manifest.DrawDecl{
			icon("EC2", "Compute", box(`<rect x="16" y="20" width="32" height="24" rx="3" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="24" y="27" width="16" height="10" rx="1" fill="`+orange+`"/>`)),
			icon("Lambda", "Compute", box(`<path d="M20 16 L34 32 L26 48" fill="none" stroke="`+orange+`" stroke-width="4" stroke-linecap="round"/><path d="M30 16 H44 L32 48" fill="none" stroke="`+orange+`" stroke-width="4" stroke-linecap="round"/>`)),
			icon("S3", "Storage", box(`<path d="M14 24 h36 v6 c0 10 -8 16 -18 16 c-10 0 -18 -6 -18 -16 z" fill="none" stroke="`+orange+`" stroke-width="3"/><line x1="14" y1="24" x2="50" y2="24" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("RDS", "Database", box(`<ellipse cx="32" cy="22" rx="14" ry="5" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M18 22 v18 c0 3 6 6 14 6 c8 0 14 -3 14 -6 v-18" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M18 31 c0 3 6 6 14 6 c8 0 14 -3 14 -6" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("DynamoDB", "Database", box(`<path d="M32 16 L46 24 V40 L32 48 L18 40 V24 Z" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M32 16 V32 L18 24 M32 32 L46 24 M32 32 V48" fill="none" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("VPC", "Networking", box(`<rect x="14" y="18" width="36" height="28" rx="4" fill="none" stroke="`+orange+`" stroke-width="3" stroke-dasharray="5 4"/><circle cx="32" cy="32" r="6" fill="`+orange+`"/>`)),
			icon("CloudFront", "Networking", box(`<circle cx="32" cy="32" r="15" fill="none" stroke="`+orange+`" stroke-width="3"/><ellipse cx="32" cy="32" rx="15" ry="6" fill="none" stroke="`+orange+`" stroke-width="2"/><line x1="32" y1="17" x2="32" y2="47" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("API-Gateway", "Networking", box(`<path d="M24 16 L14 32 L24 48" fill="none" stroke="`+orange+`" stroke-width="3"/><path d="M40 16 L50 32 L40 48" fill="none" stroke="`+orange+`" stroke-width="3"/><line x1="27" y1="32" x2="37" y2="32" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("SQS", "Messaging", box(`<rect x="16" y="22" width="32" height="9" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/><rect x="20" y="34" width="24" height="9" rx="2" fill="none" stroke="`+orange+`" stroke-width="3"/>`)),
			icon("SNS", "Messaging", box(`<circle cx="32" cy="32" r="5" fill="`+orange+`"/><circle cx="32" cy="32" r="11" fill="none" stroke="`+orange+`" stroke-width="2"/><path d="M41 23 a13 13 0 0 1 0 18 M23 41 a13 13 0 0 1 0 -18" fill="none" stroke="`+orange+`" stroke-width="3" stroke-linecap="round"/>`)),
			icon("EKS", "Containers", box(`<path d="M32 16 L45 23 V39 L32 48 L19 39 V23 Z" fill="none" stroke="`+orange+`" stroke-width="3"/><circle cx="32" cy="31" r="7" fill="none" stroke="`+orange+`" stroke-width="3"/><line x1="32" y1="24" x2="32" y2="38" stroke="`+orange+`" stroke-width="2"/><line x1="25" y1="31" x2="39" y2="31" stroke="`+orange+`" stroke-width="2"/>`)),
			icon("CloudWatch", "Monitoring", box(`<path d="M16 40 L24 30 L30 36 L38 24 L48 34" fill="none" stroke="`+orange+`" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><line x1="16" y1="46" x2="48" y2="46" stroke="`+orange+`" stroke-width="3"/>`)),
		},
	}
}

// Package devopsicons contributes simplified, multi-colour icons for common
// DevOps tooling: monitoring, alerting, observability, CDN, and incident
// response. Icons are geometric simplifications only; no brand logos are
// reproduced.
package devopsicons

import "draw.local/manifest"

func icon(label, cat, keywords, body string) manifest.DrawDecl {
	return manifest.DrawDecl{
		ID:       "devops-" + label,
		Label:    label,
		Category: "DevOps / " + cat,
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
		Name:        "devops-icons",
		Version:     "1.1.0",
		Description: "DevOps tool icons for monitoring, alerting, observability, CDN and incident-response diagrams",
		Author:      "builtin",
		Builtin:     true,
		Draws: []manifest.DrawDecl{
			// Monitoring
			icon("Prometheus", "Monitoring", "metrics tsdb alert monitoring",
				`<circle cx="32" cy="32" r="28" fill="#e6522c"/>`+
					`<circle cx="32" cy="32" r="12" fill="#000"/>`+
					`<path d="M32 14 v18" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`+
					`<path d="M20 44 l12 -12 l12 12" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`),
			icon("Grafana", "Monitoring", "dashboard metrics visualization",
				`<rect x="4" y="4" width="56" height="56" rx="12" fill="#111217"/>`+
					`<path d="M18 42 C18 24 26 18 32 18 C38 18 46 24 46 42" fill="none" stroke="#f46800" stroke-width="5" stroke-linecap="round"/>`+
					`<circle cx="32" cy="32" r="4" fill="#f46800"/>`),
			icon("Grafana-Alloy", "Monitoring", "otel collector telemetry alloy",
				`<rect x="4" y="4" width="56" height="56" rx="12" fill="#111217"/>`+
					`<circle cx="32" cy="32" r="14" fill="none" stroke="#f46800" stroke-width="4"/>`+
					`<path d="M24 32 l6 6 l12 -12" fill="none" stroke="#f46800" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),
			icon("Victoria-Metrics", "Monitoring", "tsdb metrics monitoring vm",
				`<rect x="4" y="4" width="56" height="56" rx="12" fill="#621773"/>`+
					`<path d="M20 46 V26 l12 10 l12 -10 v20" fill="none" stroke="#ffd700" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),
			icon("Victoria-Logs", "Monitoring", "log storage observability vl",
				`<rect x="4" y="4" width="56" height="56" rx="12" fill="#621773"/>`+
					`<rect x="16" y="18" width="32" height="28" rx="4" fill="none" stroke="#00d4aa" stroke-width="3"/>`+
					`<path d="M20 28 h24 M20 34 h18" stroke="#00d4aa" stroke-width="2"/>`),
			icon("Victoria-Tracing", "Monitoring", "trace observability apm",
				`<rect x="4" y="4" width="56" height="56" rx="12" fill="#621773"/>`+
					`<circle cx="22" cy="22" r="6" fill="#00d4aa"/>`+
					`<circle cx="42" cy="22" r="6" fill="#00d4aa"/>`+
					`<circle cx="32" cy="42" r="6" fill="#00d4aa"/>`+
					`<path d="M26 25 l4 12 M38 25 l-4 12" stroke="#fff" stroke-width="2"/>`),

			// Alerting / Incident response
			icon("PagerDuty", "Alerting", "incident oncall alert paging",
				`<rect x="4" y="4" width="56" height="56" rx="12" fill="#fff"/>`+
					`<path d="M32 12 L50 22 V40 L32 52 L14 40 V22 Z" fill="#06ac38"/>`+
					`<circle cx="32" cy="32" r="6" fill="#fff"/>`),
			icon("BetterStack", "Alerting", "monitoring uptime alert better stack",
				`<rect x="4" y="4" width="56" height="56" rx="12" fill="#00c7b7"/>`+
					`<path d="M16 44 V28 l8 10 l8 -18 l16 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),
			icon("OneUptime", "Alerting", "incident monitoring status page opensource",
				`<rect x="4" y="4" width="56" height="56" rx="12" fill="#2563eb"/>`+
					`<path d="M32 16 L46 24 V40 L32 48 L18 40 V24 Z" fill="#fff"/>`+
					`<circle cx="32" cy="32" r="5" fill="#2563eb"/>`),
			icon("Regen", "Alerting", "incident response oncall ai fluidify regen",
				`<rect x="4" y="4" width="56" height="56" rx="12" fill="#7c3aed"/>`+
					`<path d="M32 12 a20 20 0 1 0 0 40 a20 20 0 1 0 0 -40" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`+
					`<path d="M32 22 v12 l8 8" fill="none" stroke="#fbbf24" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`),

			// CDN / Edge
			icon("Cloudflare", "CDN", "cdn edge dns waf",
				`<rect x="4" y="4" width="56" height="56" rx="12" fill="#f48120"/>`+
					`<circle cx="32" cy="32" r="12" fill="#fff"/>`+
					`<path d="M26 32 h12" stroke="#404041" stroke-width="4" stroke-linecap="round"/>`+
					`<circle cx="24" cy="32" r="3" fill="#404041"/>`+
					`<circle cx="40" cy="32" r="3" fill="#404041"/>`),
		},
	}
}

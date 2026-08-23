package oauth

import (
	"fmt"
	"log"
	"os"
	"strings"
)

// ProviderConfig holds the credentials and redirect URL for one OAuth provider.
type ProviderConfig struct {
	Enabled     bool
	ClientID    string
	ClientSecret string
	RedirectURL string // optional; falls back to the global redirect URL
}

// Config is parsed from environment variables.
type Config struct {
	LocalEnabled             bool
	LocalRegistrationEnabled bool
	RedirectURL              string // global fallback; may contain {provider}
	Providers                map[string]ProviderConfig
	OktaIssuer               string
}

func envBool(k string, def bool) bool {
	v := strings.ToLower(os.Getenv(k))
	if v == "" {
		return def
	}
	return v == "true" || v == "1" || v == "yes"
}

func envStr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// NewConfigFromEnv reads OAUTH_* environment variables.
func NewConfigFromEnv() Config {
	cfg := Config{
		LocalEnabled: envBool("OAUTH_LOCAL_ENABLED", true),
		RedirectURL:  os.Getenv("OAUTH_REDIRECT_URL"),
		Providers:    map[string]ProviderConfig{},
		OktaIssuer:   os.Getenv("OAUTH_OKTA_ISSUER"),
	}

	providers := []string{"google", "github", "facebook", "okta"}
	for _, p := range providers {
		prefix := "OAUTH_" + strings.ToUpper(p) + "_"
		cfg.Providers[p] = ProviderConfig{
			Enabled:      envBool(prefix+"ENABLED", false),
			ClientID:     os.Getenv(prefix + "CLIENT_ID"),
			ClientSecret: os.Getenv(prefix + "CLIENT_SECRET"),
			RedirectURL:  os.Getenv(prefix + "REDIRECT_URL"),
		}
	}

	if cfg.RedirectURL == "" {
		if hasEnabledProviders(cfg.Providers) {
			log.Println("warning: OAUTH_REDIRECT_URL not set; using http://localhost:8080/api/auth/{provider}/callback")
		}
		cfg.RedirectURL = "http://localhost:8080/api/auth/{provider}/callback"
	}

	return cfg
}

func hasEnabledProviders(m map[string]ProviderConfig) bool {
	for _, c := range m {
		if c.Enabled {
			return true
		}
	}
	return false
}

// RedirectURLFor returns the configured callback URL for a provider.
func (c Config) RedirectURLFor(provider string) string {
	pc, ok := c.Providers[provider]
	if ok && pc.RedirectURL != "" {
		return pc.RedirectURL
	}
	return strings.ReplaceAll(c.RedirectURL, "{provider}", provider)
}

// Validate checks required fields for enabled providers.
func (c Config) Validate() error {
	for id, pc := range c.Providers {
		if !pc.Enabled {
			continue
		}
		if pc.ClientID == "" || pc.ClientSecret == "" {
			return fmt.Errorf("oauth provider %s enabled but missing client id/secret", id)
		}
		if id == "okta" && c.OktaIssuer == "" {
			return fmt.Errorf("oauth provider okta enabled but OAUTH_OKTA_ISSUER not set")
		}
	}
	return nil
}

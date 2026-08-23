package oauth

import (
	"errors"
	"fmt"
	"log"

	"draw.local/server/internal/store"
)

// Manager holds the active OAuth providers and local-auth flag.
type Manager struct {
	LocalEnabled             bool
	LocalRegistrationEnabled bool
	providers                map[string]Provider
}

// NewManager builds a Manager from parsed config. Inactive providers are skipped.
func NewManager(cfg Config) (*Manager, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	m := &Manager{
		LocalEnabled:             cfg.LocalEnabled,
		LocalRegistrationEnabled: cfg.LocalRegistrationEnabled,
		providers:                map[string]Provider{},
	}

	for id, pc := range cfg.Providers {
		if !pc.Enabled {
			continue
		}
		redirectURL := cfg.RedirectURLFor(id)
		var prov Provider
		var err error
		switch id {
		case "google":
			prov, err = newGoogleProvider(pc.ClientID, pc.ClientSecret, redirectURL)
		case "okta":
			prov, err = newOktaProvider(pc.ClientID, pc.ClientSecret, redirectURL, cfg.OktaIssuer)
		case "github":
			prov, err = newGitHubProvider(pc.ClientID, pc.ClientSecret, redirectURL)
		case "facebook":
			prov, err = newFacebookProvider(pc.ClientID, pc.ClientSecret, redirectURL)
		default:
			err = fmt.Errorf("unknown provider %s", id)
		}
		if err != nil {
			return nil, fmt.Errorf("init %s: %w", id, err)
		}
		m.providers[id] = prov
		log.Printf("oauth provider enabled: %s (callback: %s)", id, redirectURL)
	}

	return m, nil
}

// Provider returns the named provider if active.
func (m *Manager) Provider(id string) (Provider, bool) {
	p, ok := m.providers[id]
	return p, ok
}

// ProviderInfo is the JSON shape for /api/auth/config.
type ProviderInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	AuthURL string `json:"authUrl"`
}

// ConfigResponse is the JSON shape for /api/auth/config.
type ConfigResponse struct {
	LocalEnabled             bool           `json:"localEnabled"`
	LocalRegistrationEnabled bool           `json:"localRegistrationEnabled"`
	Providers                []ProviderInfo `json:"providers"`
}

// Config returns the advertised auth configuration.
func (m *Manager) Config() ConfigResponse {
	resp := ConfigResponse{LocalEnabled: m.LocalEnabled, LocalRegistrationEnabled: m.LocalRegistrationEnabled, Providers: []ProviderInfo{}}
	for _, p := range m.providers {
		resp.Providers = append(resp.Providers, ProviderInfo{
			ID:      p.ID(),
			Name:    p.Name(),
			AuthURL: "/api/auth/" + p.ID(),
		})
	}
	return resp
}

// ResolveOrCreateUser links an OAuth identity to an existing user or creates one.
func (m *Manager) ResolveOrCreateUser(st store.Datastore, info *UserInfo) (*store.User, error) {
	// 1. Existing SSO identity.
	u, err := st.UserByProvider(info.Provider, info.ProviderID)
	if err == nil {
		return u, nil
	}

	// 2. Link to existing password user by verified email.
	if info.EmailVerified && info.Email != "" {
		existing, err := st.UserByEmail(info.Email)
		if err == nil {
			if existing.Provider != "" {
				return nil, errors.New("email already linked to another provider")
			}
			if err := st.LinkProvider(existing.ID, info.Provider, info.ProviderID, info.Avatar, info.EmailVerified); err != nil {
				return nil, err
			}
			// Re-fetch to obtain updated fields.
			return st.UserByID(existing.ID)
		}
	}

	// 3. Create a new SSO user.
	if info.Email == "" {
		return nil, errors.New("provider did not return an email")
	}
	u, err = st.CreateOAuthUser(info.Email, info.Name, info.Provider, info.ProviderID, info.Avatar, info.EmailVerified)
	if err != nil {
		return nil, err
	}
	st.CreateOrg(u.ID, u.Name+"'s workspace")
	return u, nil
}


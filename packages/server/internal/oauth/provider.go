package oauth

import "context"

// UserInfo is the normalized identity returned by any OAuth provider.
type UserInfo struct {
	Provider      string
	ProviderID    string
	Email         string
	Name          string
	Avatar        string
	EmailVerified bool
}

// Provider abstracts an OAuth/OIDC identity provider.
type Provider interface {
	ID() string
	Name() string
	AuthURL(state string) string
	Exchange(ctx context.Context, code string) (*UserInfo, error)
}

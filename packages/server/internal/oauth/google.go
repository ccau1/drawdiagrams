package oauth

import (
	"context"
	"fmt"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

const googleIssuer = "https://accounts.google.com"

type googleProvider struct {
	id      string
	name    string
	oauth2  oauth2.Config
	verifier *oidc.IDTokenVerifier
}

func newGoogleProvider(clientID, clientSecret, redirectURL string) (Provider, error) {
	ctx := context.Background()
	provider, err := oidc.NewProvider(ctx, googleIssuer)
	if err != nil {
		return nil, fmt.Errorf("google oidc provider: %w", err)
	}
	p := &googleProvider{
		id:   "google",
		name: "Google",
		oauth2: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Endpoint:     provider.Endpoint(),
			Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
		},
		verifier: provider.Verifier(&oidc.Config{ClientID: clientID}),
	}
	return p, nil
}

func (g *googleProvider) ID() string   { return g.id }
func (g *googleProvider) Name() string { return g.name }

func (g *googleProvider) AuthURL(state string) string {
	return g.oauth2.AuthCodeURL(state)
}

func (g *googleProvider) Exchange(ctx context.Context, code string) (*UserInfo, error) {
	tok, err := g.oauth2.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("exchange code: %w", err)
	}
	rawIDTok, ok := tok.Extra("id_token").(string)
	if !ok {
		return nil, fmt.Errorf("missing id_token")
	}
	idTok, err := g.verifier.Verify(ctx, rawIDTok)
	if err != nil {
		return nil, fmt.Errorf("verify id_token: %w", err)
	}

	var claims struct {
		Email         string `json:"email"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
		EmailVerified bool   `json:"email_verified"`
		Sub           string `json:"sub"`
	}
	if err := idTok.Claims(&claims); err != nil {
		return nil, fmt.Errorf("parse claims: %w", err)
	}

	return &UserInfo{
		Provider:      g.id,
		ProviderID:    claims.Sub,
		Email:         claims.Email,
		Name:          claims.Name,
		Avatar:        claims.Picture,
		EmailVerified: claims.EmailVerified,
	}, nil
}

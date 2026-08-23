package oauth

import (
	"context"
	"fmt"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type oktaProvider struct {
	id       string
	name     string
	oauth2   oauth2.Config
	verifier *oidc.IDTokenVerifier
}

func newOktaProvider(clientID, clientSecret, redirectURL, issuer string) (Provider, error) {
	ctx := context.Background()
	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, fmt.Errorf("okta oidc provider: %w", err)
	}
	p := &oktaProvider{
		id:   "okta",
		name: "Okta",
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

func (o *oktaProvider) ID() string   { return o.id }
func (o *oktaProvider) Name() string { return o.name }

func (o *oktaProvider) AuthURL(state string) string {
	return o.oauth2.AuthCodeURL(state)
}

func (o *oktaProvider) Exchange(ctx context.Context, code string) (*UserInfo, error) {
	tok, err := o.oauth2.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("exchange code: %w", err)
	}
	rawIDTok, ok := tok.Extra("id_token").(string)
	if !ok {
		return nil, fmt.Errorf("missing id_token")
	}
	idTok, err := o.verifier.Verify(ctx, rawIDTok)
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
		Provider:      o.id,
		ProviderID:    claims.Sub,
		Email:         claims.Email,
		Name:          claims.Name,
		Avatar:        claims.Picture,
		EmailVerified: claims.EmailVerified,
	}, nil
}

package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"
)

type githubProvider struct {
	id     string
	name   string
	oauth2 oauth2.Config
}

func newGitHubProvider(clientID, clientSecret, redirectURL string) (Provider, error) {
	return &githubProvider{
		id:   "github",
		name: "GitHub",
		oauth2: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Endpoint:     github.Endpoint,
			Scopes:       []string{"user:email"},
		},
	}, nil
}

func (g *githubProvider) ID() string   { return g.id }
func (g *githubProvider) Name() string { return g.name }

func (g *githubProvider) AuthURL(state string) string {
	return g.oauth2.AuthCodeURL(state)
}

func (g *githubProvider) Exchange(ctx context.Context, code string) (*UserInfo, error) {
	tok, err := g.oauth2.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("exchange code: %w", err)
	}
	client := g.oauth2.Client(ctx, tok)

	userReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}
	userReq.Header.Set("Accept", "application/vnd.github+json")
	userResp, err := client.Do(userReq)
	if err != nil {
		return nil, fmt.Errorf("github user request: %w", err)
	}
	defer userResp.Body.Close()
	if userResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github user status %d", userResp.StatusCode)
	}

	var user struct {
		ID        int    `json:"id"`
		Name      string `json:"name"`
		Login     string `json:"login"`
		AvatarURL string `json:"avatar_url"`
		Email     string `json:"email"`
	}
	if err := json.NewDecoder(userResp.Body).Decode(&user); err != nil {
		return nil, fmt.Errorf("decode github user: %w", err)
	}

	email := user.Email
	if email == "" {
		email, err = g.primaryEmail(ctx, client)
		if err != nil {
			return nil, err
		}
	}

	name := user.Name
	if name == "" {
		name = user.Login
	}

	return &UserInfo{
		Provider:      g.id,
		ProviderID:    fmt.Sprintf("%d", user.ID),
		Email:         email,
		Name:          name,
		Avatar:        user.AvatarURL,
		EmailVerified: email != "", // GitHub marks user emails as verified in its model
	}, nil
}

func (g *githubProvider) primaryEmail(ctx context.Context, client *http.Client) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user/emails", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("github emails request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("github emails status %d: %s", resp.StatusCode, string(body))
	}

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return "", fmt.Errorf("decode github emails: %w", err)
	}

	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	for _, e := range emails {
		if e.Email != "" {
			return e.Email, nil
		}
	}
	return "", fmt.Errorf("no email returned by github")
}

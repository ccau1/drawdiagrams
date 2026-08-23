package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/facebook"
)

type facebookProvider struct {
	id     string
	name   string
	oauth2 oauth2.Config
}

func newFacebookProvider(clientID, clientSecret, redirectURL string) (Provider, error) {
	return &facebookProvider{
		id:   "facebook",
		name: "Facebook",
		oauth2: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Endpoint:     facebook.Endpoint,
			Scopes:       []string{"email"},
		},
	}, nil
}

func (f *facebookProvider) ID() string   { return f.id }
func (f *facebookProvider) Name() string { return f.name }

func (f *facebookProvider) AuthURL(state string) string {
	return f.oauth2.AuthCodeURL(state)
}

func (f *facebookProvider) Exchange(ctx context.Context, code string) (*UserInfo, error) {
	tok, err := f.oauth2.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("exchange code: %w", err)
	}

	url := fmt.Sprintf("https://graph.facebook.com/me?fields=id,name,email,picture&access_token=%s", tok.AccessToken)
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("facebook graph request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("facebook graph status %d", resp.StatusCode)
	}

	var payload struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Email   string `json:"email"`
		Picture struct {
			Data struct {
				URL string `json:"url"`
			} `json:"data"`
		} `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("decode facebook graph: %w", err)
	}

	return &UserInfo{
		Provider:      f.id,
		ProviderID:    payload.ID,
		Email:         payload.Email,
		Name:          payload.Name,
		Avatar:        payload.Picture.Data.URL,
		EmailVerified: payload.Email != "", // Facebook returns email only when verified
	}, nil
}

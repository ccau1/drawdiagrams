package oauth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"draw.local/server/internal/auth"
	"draw.local/server/internal/store"
)

const stateCookieName = "__oauth_state"
const stateMaxAge = 600

// HandleConfig writes the advertised auth configuration.
func (m *Manager) HandleConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, m.Config())
}

// HandleAuth starts the OAuth flow for a provider.
func (m *Manager) HandleAuth(w http.ResponseWriter, r *http.Request) {
	providerID := r.PathValue("provider")
	p, ok := m.Provider(providerID)
	if !ok {
		http.NotFound(w, r)
		return
	}

	state, err := randomState(providerID)
	if err != nil {
		http.Error(w, "failed to generate state", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     stateCookieName,
		Value:    state,
		Path:     "/api/auth",
		MaxAge:   stateMaxAge,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
	})

	http.Redirect(w, r, p.AuthURL(state), http.StatusFound)
}

// HandleCallback completes the OAuth flow and redirects back to the frontend.
func (m *Manager) HandleCallback(st store.Datastore, key []byte, w http.ResponseWriter, r *http.Request) {
	providerID := r.PathValue("provider")
	p, ok := m.Provider(providerID)
	if !ok {
		http.NotFound(w, r)
		return
	}

	fail := func(msg string) {
		clearStateCookie(w, r)
		redirectWithError(w, r, msg)
	}

	cookie, err := r.Cookie(stateCookieName)
	if err != nil || cookie.Value == "" {
		fail("missing oauth state")
		return
	}
	queryState := r.URL.Query().Get("state")
	if queryState == "" || queryState != cookie.Value || !strings.HasPrefix(queryState, providerID+":") {
		fail("invalid oauth state")
		return
	}
	clearStateCookie(w, r)

	code := r.URL.Query().Get("code")
	if code == "" {
		fail("missing authorization code")
		return
	}

	info, err := p.Exchange(r.Context(), code)
	if err != nil {
		fail("oauth exchange failed")
		return
	}
	if info.Email == "" {
		fail("provider did not return an email")
		return
	}

	u, err := m.ResolveOrCreateUser(st, info)
	if err != nil {
		fail("failed to resolve user")
		return
	}

	tok, err := auth.SignToken(key, u.ID, u.Name)
	if err != nil {
		fail("failed to issue token")
		return
	}

	orgID := ""
	orgs := st.OrgsOfUser(u.ID)
	if len(orgs) > 0 {
		orgID = orgs[0].ID
	}

	redirectSuccess(w, r, tok, orgID)
}

func randomState(providerID string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return providerID + ":" + hex.EncodeToString(b), nil
}

func clearStateCookie(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:     stateCookieName,
		Value:    "",
		Path:     "/api/auth",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil,
	})
}

func redirectSuccess(w http.ResponseWriter, r *http.Request, token, orgID string) {
	q := url.Values{}
	q.Set("token", token)
	if orgID != "" {
		q.Set("orgId", orgID)
	}
	http.Redirect(w, r, "/#/login?"+q.Encode(), http.StatusFound)
}

func redirectWithError(w http.ResponseWriter, r *http.Request, msg string) {
	q := url.Values{}
	q.Set("error", msg)
	http.Redirect(w, r, "/#/login?"+q.Encode(), http.StatusFound)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

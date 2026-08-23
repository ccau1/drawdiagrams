// Command server runs the Drawboard backend: REST API, collaboration
// WebSocket, integration registry, plugin asset hosting, and (optionally)
// static hosting of the built frontend when WEB_DIR is set.
package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	awsicons "draw.local/integrations/aws-icons"
	drawboard "draw.local/integrations/drawboard"
	emojireactions "draw.local/integrations/emoji-reactions"
	excalidraw "draw.local/integrations/excalidraw"
	umlshapes "draw.local/integrations/uml-shapes"
	"draw.local/server/internal/auth"
	"draw.local/server/internal/collab"
	"draw.local/server/internal/httpapi"
	"draw.local/server/internal/integrations"
	"draw.local/server/internal/oauth"
	"draw.local/server/internal/store"
)

func main() {
	addr := env("ADDR", ":8080")
	dataDir := env("DATA_DIR", "data")
	webDir := env("WEB_DIR", "") // empty = API-only mode (web served separately)
	registrationEnabled := envBool("LOCAL_AUTH_REGISTRATION_ENABLED", true)

	secret := strings.TrimSpace(envOrFile("JWT_SECRET"))
	if secret == "" {
		b := make([]byte, 32)
		_, _ = rand.Read(b)
		secret = base64.StdEncoding.EncodeToString(b)
		log.Println("JWT_SECRET not set; generated an ephemeral secret (tokens reset on restart)")
	}

	var st store.Datastore
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
		pg, err := store.NewPostgres(ctx, dbURL)
		cancel()
		if err != nil {
			log.Fatalf("postgres: %v", err)
		}
		st = pg
		log.Println("using Postgres datastore")
	} else {
		js, err := store.New(dataDir)
		if err != nil {
			log.Fatal(err)
		}
		st = js
		log.Println("using JSON-file datastore (set DATABASE_URL for Postgres)")
	}

	ensureInitialLocalUser(st)

	reg, err := integrations.New(filepath.Join(dataDir, "plugins"),
		awsicons.Inject, drawboard.Inject, excalidraw.Inject, umlshapes.Inject, emojireactions.Inject)
	if err != nil {
		log.Fatal(err)
	}
	oauthCfg := oauth.NewConfigFromEnv()
	oauthCfg.LocalRegistrationEnabled = registrationEnabled
	manager, err := oauth.NewManager(oauthCfg)
	if err != nil {
		log.Fatalf("oauth: %v", err)
	}

	api := &httpapi.API{St: st, Hub: collab.NewHub(), Reg: reg, Key: []byte(secret), Providers: manager, LocalRegistrationEnabled: registrationEnabled}

	root := http.NewServeMux()
	root.Handle("/api/", api.Routes())
	root.Handle("/ws", api.Routes())
	root.Handle("/plugins/", api.Routes())
	// Marketplace catalog: pre-packaged plugin zips the frontend installs.
	root.Handle("/marketplace/", http.StripPrefix("/marketplace/",
		http.FileServer(http.Dir(env("MARKETPLACE_DIR", "packages/server/marketplace")))))
	// Optional SPA static hosting with client-side fallback to index.html
	// (all-in-one image). In split deploys the web image serves the SPA.
	if webDir != "" {
		root.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			p := filepath.Join(webDir, filepath.Clean(strings.TrimPrefix(r.URL.Path, "/")))
			if st2, err := os.Stat(p); err == nil && !st2.IsDir() {
				http.ServeFile(w, r, p)
				return
			}
			http.ServeFile(w, r, filepath.Join(webDir, "index.html"))
		})
	}

	srv := &http.Server{
		Addr:              addr,
		Handler:           logRequests(cors(root)),
		ReadHeaderTimeout: 10 * time.Second,
	}
	if manager != nil {
		cfg := manager.Config()
		ids := make([]string, 0, len(cfg.Providers))
		for _, p := range cfg.Providers {
			ids = append(ids, p.ID)
		}
		log.Printf("oauth providers: %v, localEnabled=%v, localRegistrationEnabled=%v, redirectBase=%s", ids, cfg.LocalEnabled, cfg.LocalRegistrationEnabled, oauthCfg.RedirectURL)
	}
	log.Printf("listening on %s (web dir: %q, data dir: %s)", addr, webDir, dataDir)
	log.Fatal(srv.ListenAndServe())
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envBool(k string, def bool) bool {
	v := strings.ToLower(os.Getenv(k))
	if v == "" {
		return def
	}
	return v == "true" || v == "1" || v == "yes"
}

// envOrFile reads a plain env var or, if <NAME>_FILE is set, the contents
// of that file. This lets secrets be injected as mounted files instead of
// being exposed as container env vars (and therefore in etcd).
func envOrFile(k string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	path := os.Getenv(k + "_FILE")
	if path == "" {
		return ""
	}
	b, err := os.ReadFile(path)
	if err != nil {
		log.Printf("failed to read %s_FILE %q: %v", k, path, err)
		return ""
	}
	return string(b)
}

// ensureInitialLocalUser creates a bootstrap local account when
// LOCAL_AUTH_INITIAL_USERNAME and LOCAL_AUTH_INITIAL_PASSWORD are set.
func ensureInitialLocalUser(st store.Datastore) {
	username := strings.ToLower(strings.TrimSpace(envOrFile("LOCAL_AUTH_INITIAL_USERNAME")))
	password := strings.TrimRight(envOrFile("LOCAL_AUTH_INITIAL_PASSWORD"), "\r\n")
	if username == "" || password == "" {
		return
	}
	if _, err := st.UserByUsername(username); err == nil {
		return // already exists
	}
	email := strings.ToLower(strings.TrimSpace(os.Getenv("LOCAL_AUTH_INITIAL_EMAIL")))
	if email == "" {
		if strings.Contains(username, "@") {
			email = username
		} else {
			email = username + "@local"
		}
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		log.Printf("failed to hash initial local user password: %v", err)
		return
	}
	u, err := st.CreateUser(email, username, username, hash, "admin")
	if err != nil {
		log.Printf("failed to create initial local user: %v", err)
		return
	}
	st.CreateOrg(u.ID, username+"'s workspace")
	log.Printf("created initial local user: %s", username)
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			log.Printf("%s %s (%s)", r.Method, r.URL.Path, time.Since(start).Round(time.Millisecond))
		}
	})
}

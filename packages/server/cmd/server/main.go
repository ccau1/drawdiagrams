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
	emojireactions "draw.local/integrations/emoji-reactions"
	umlshapes "draw.local/integrations/uml-shapes"
	"draw.local/server/internal/collab"
	"draw.local/server/internal/httpapi"
	"draw.local/server/internal/integrations"
	"draw.local/server/internal/store"
)

func main() {
	addr := env("ADDR", ":8080")
	dataDir := env("DATA_DIR", "data")
	webDir := env("WEB_DIR", "") // empty = API-only mode (web served separately)

	secret := os.Getenv("JWT_SECRET")
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

	reg, err := integrations.New(filepath.Join(dataDir, "plugins"),
		awsicons.Inject, umlshapes.Inject, emojireactions.Inject)
	if err != nil {
		log.Fatal(err)
	}
	api := &httpapi.API{St: st, Hub: collab.NewHub(), Reg: reg, Key: []byte(secret)}

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
	log.Printf("listening on %s (web dir: %q, data dir: %s)", addr, webDir, dataDir)
	log.Fatal(srv.ListenAndServe())
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
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

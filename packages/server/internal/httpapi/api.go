// Package httpapi exposes the REST API and the collaboration WebSocket.
package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"draw.local/server/internal/auth"
	"draw.local/server/internal/collab"
	"draw.local/server/internal/integrations"
	"draw.local/server/internal/oauth"
	"draw.local/server/internal/store"
	"draw.local/server/internal/ws"
)

type API struct {
	St                       store.Datastore
	Hub                      *collab.Hub
	Reg                      *integrations.Registry
	Key                      []byte // JWT secret
	Providers                *oauth.Manager
	LocalRegistrationEnabled bool
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}
	return true
}

// user returns the authenticated claims or writes 401.
func (a *API) user(w http.ResponseWriter, r *http.Request) *auth.Claims {
	tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if tok == "" {
		tok = r.URL.Query().Get("token")
	}
	c, err := auth.ParseToken(a.Key, tok)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "authentication required")
		return nil
	}
	return c
}

func (a *API) Routes() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/auth/config", a.authConfig)
	mux.HandleFunc("GET /api/auth/{provider}", a.oauthStart)
	mux.HandleFunc("GET /api/auth/{provider}/callback", a.oauthCallback)
	mux.HandleFunc("POST /api/register", a.register)
	mux.HandleFunc("POST /api/login", a.login)
	mux.HandleFunc("GET /api/me", a.me)
	mux.HandleFunc("GET /api/orgs", a.listOrgs)
	mux.HandleFunc("POST /api/orgs", a.createOrg)
	mux.HandleFunc("POST /api/orgs/{id}/members", a.addMember)
	mux.HandleFunc("GET /api/orgs/{id}/boards", a.listBoards)
	mux.HandleFunc("POST /api/orgs/{id}/boards", a.createBoard)
	mux.HandleFunc("GET /api/orgs/{id}/folders", a.listFolders)
	mux.HandleFunc("POST /api/orgs/{id}/folders", a.createFolder)
	mux.HandleFunc("GET /api/boards/{id}", a.getBoard)
	mux.HandleFunc("PUT /api/boards/{id}", a.saveBoard)
	mux.HandleFunc("DELETE /api/boards/{id}", a.deleteBoard)
	mux.HandleFunc("POST /api/boards/{id}/share", a.shareBoard)
	mux.HandleFunc("POST /api/boards/{id}/thumbnail", a.saveThumbnail)
	mux.HandleFunc("POST /api/boards/{id}/move", a.moveBoard)
	mux.HandleFunc("POST /api/folders/{id}/move", a.moveFolder)
	mux.HandleFunc("DELETE /api/folders/{id}", a.deleteFolder)
	mux.HandleFunc("GET /api/integrations", a.listIntegrations)
	mux.HandleFunc("POST /api/plugins/upload", a.uploadPlugin)
	mux.HandleFunc("DELETE /api/plugins/{name}", a.deletePlugin)
	mux.HandleFunc("/plugins/", http.StripPrefix("/plugins/",
		http.FileServer(http.Dir("data/plugins"))).ServeHTTP)
	mux.HandleFunc("GET /ws", a.websocket)
	return mux
}

func (a *API) register(w http.ResponseWriter, r *http.Request) {
	var in struct{ Email, Username, Name, Password string }
	if !readJSON(w, r, &in) {
		return
	}
	if !a.LocalRegistrationEnabled {
		writeErr(w, http.StatusForbidden, "registration disabled")
		return
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Username = strings.ToLower(strings.TrimSpace(in.Username))
	if in.Email == "" || in.Username == "" || in.Name == "" || len(in.Password) < 6 {
		writeErr(w, http.StatusBadRequest, "email, username, name and a 6+ char password are required")
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "hash failed")
		return
	}
	u, err := a.St.CreateUser(in.Email, in.Name, in.Username, hash, "")
	if err != nil {
		writeErr(w, http.StatusConflict, err.Error())
		return
	}
	org := a.St.CreateOrg(u.ID, u.Name+"'s workspace")
	a.respondAuth(w, u.ID, u.Name, u.Email, org.ID)
}

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var in struct{ UsernameOrEmail, Password string }
	if !readJSON(w, r, &in) {
		return
	}
	ident := strings.ToLower(strings.TrimSpace(in.UsernameOrEmail))
	var u *store.User
	var err error
	if strings.Contains(ident, "@") {
		u, err = a.St.UserByEmail(ident)
	} else {
		u, err = a.St.UserByUsername(ident)
	}
	if err != nil || !auth.CheckPassword(in.Password, u.PasswordHash) {
		writeErr(w, http.StatusUnauthorized, "invalid username/email or password")
		return
	}
	orgs := a.St.OrgsOfUser(u.ID)
	orgID := ""
	if len(orgs) > 0 {
		orgID = orgs[0].ID
	}
	a.respondAuth(w, u.ID, u.Name, u.Email, orgID)
}

func (a *API) respondAuth(w http.ResponseWriter, id, name, email, orgID string) {
	tok, _ := auth.SignToken(a.Key, id, name)
	writeJSON(w, http.StatusOK, map[string]any{
		"token": tok,
		"user":  map[string]string{"id": id, "name": name, "email": email},
		"orgId": orgID,
	})
}

func (a *API) authConfig(w http.ResponseWriter, r *http.Request) {
	if a.Providers == nil {
		writeJSON(w, http.StatusOK, oauth.ConfigResponse{LocalEnabled: true, Providers: []oauth.ProviderInfo{}})
		return
	}
	a.Providers.HandleConfig(w, r)
}

func (a *API) oauthStart(w http.ResponseWriter, r *http.Request) {
	if a.Providers == nil {
		http.NotFound(w, r)
		return
	}
	a.Providers.HandleAuth(w, r)
}

func (a *API) oauthCallback(w http.ResponseWriter, r *http.Request) {
	if a.Providers == nil {
		http.NotFound(w, r)
		return
	}
	a.Providers.HandleCallback(a.St, a.Key, w, r)
}

func (a *API) me(w http.ResponseWriter, r *http.Request) {
	c := a.user(w, r)
	if c == nil {
		return
	}
	u, err := a.St.UserByID(c.Sub)
	if err != nil {
		writeErr(w, http.StatusNotFound, "user gone")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"user": map[string]string{"id": u.ID, "name": u.Name, "email": u.Email},
		"orgs": a.St.OrgsOfUser(u.ID),
	})
}

func (a *API) listOrgs(w http.ResponseWriter, r *http.Request) {
	c := a.user(w, r)
	if c == nil {
		return
	}
	writeJSON(w, http.StatusOK, a.St.OrgsOfUser(c.Sub))
}

func (a *API) createOrg(w http.ResponseWriter, r *http.Request) {
	c := a.user(w, r)
	if c == nil {
		return
	}
	var in struct{ Name string }
	if !readJSON(w, r, &in) || strings.TrimSpace(in.Name) == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	writeJSON(w, http.StatusOK, a.St.CreateOrg(c.Sub, strings.TrimSpace(in.Name)))
}

func (a *API) addMember(w http.ResponseWriter, r *http.Request) {
	c := a.user(w, r)
	if c == nil {
		return
	}
	orgID := r.PathValue("id")
	if !a.St.IsOrgMember(orgID, c.Sub) {
		writeErr(w, http.StatusForbidden, "not an org member")
		return
	}
	var in struct{ Email string }
	if !readJSON(w, r, &in) {
		return
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	u, err := a.St.UserByEmail(email)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "user not found")
		return
	}
	if err := a.St.AddMember(orgID, u.ID, store.OrgRoleMember); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, a.St.OrgsOfUser(c.Sub))
}

func (a *API) listBoards(w http.ResponseWriter, r *http.Request) {
	c := a.user(w, r)
	if c == nil {
		return
	}
	orgID := r.PathValue("id")
	if !a.St.IsOrgMember(orgID, c.Sub) {
		writeErr(w, http.StatusForbidden, "not an org member")
		return
	}
	writeJSON(w, http.StatusOK, a.St.BoardsOfOrg(orgID, c.Sub))
}

func (a *API) createBoard(w http.ResponseWriter, r *http.Request) {
	c := a.user(w, r)
	if c == nil {
		return
	}
	orgID := r.PathValue("id")
	if !a.St.IsOrgMember(orgID, c.Sub) {
		writeErr(w, http.StatusForbidden, "not an org member")
		return
	}
	var in struct{ Name, FolderId string }
	if !readJSON(w, r, &in) || strings.TrimSpace(in.Name) == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	if !a.folderInOrg(w, orgID, in.FolderId) {
		return
	}
	writeJSON(w, http.StatusOK, a.St.CreateBoard(orgID, c.Sub, strings.TrimSpace(in.Name), in.FolderId, ""))
}

// boardAccess loads a board and checks the caller may use it.
func (a *API) boardAccess(w http.ResponseWriter, r *http.Request) (*store.Board, string) {
	id := r.PathValue("id")
	b, err := a.St.Board(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "board not found")
		return nil, ""
	}
	uid := ""
	if c, err := auth.ParseToken(a.Key, strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")); err == nil {
		uid = c.Sub
	} else if c, err := auth.ParseToken(a.Key, r.URL.Query().Get("token")); err == nil {
		uid = c.Sub
	}
	if !a.St.CanAccess(b, uid) {
		writeErr(w, http.StatusForbidden, "no access to this board")
		return nil, ""
	}
	return b, uid
}

func (a *API) getBoard(w http.ResponseWriter, r *http.Request) {
	b, _ := a.boardAccess(w, r)
	if b == nil {
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func (a *API) saveBoard(w http.ResponseWriter, r *http.Request) {
	b, _ := a.boardAccess(w, r)
	if b == nil {
		return
	}
	var in struct {
		Elements json.RawMessage `json:"elements"`
		AppState json.RawMessage `json:"appState"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if err := a.St.SaveBoardScene(b.ID, in.Elements, in.AppState); err != nil {
		writeErr(w, http.StatusNotFound, "board not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) saveThumbnail(w http.ResponseWriter, r *http.Request) {
	b, _ := a.boardAccess(w, r)
	if b == nil {
		return
	}
	var in struct {
		Thumbnail string `json:"thumbnail"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if in.Thumbnail == "" || len(in.Thumbnail) > 600*1024 {
		writeErr(w, http.StatusBadRequest, "thumbnail missing or too large")
		return
	}
	if err := a.St.SaveBoardThumbnail(b.ID, in.Thumbnail); err != nil {
		writeErr(w, http.StatusNotFound, "board not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) deleteBoard(w http.ResponseWriter, r *http.Request) {
	b, uid := a.boardAccess(w, r)
	if b == nil {
		return
	}
	if b.OwnerID != uid {
		if o, err := a.St.Org(b.OrgID); err != nil || o.OwnerID != uid {
			writeErr(w, http.StatusForbidden, "only the owner can delete")
			return
		}
	}
	_ = a.St.DeleteBoard(b.ID)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) shareBoard(w http.ResponseWriter, r *http.Request) {
	b, _ := a.boardAccess(w, r)
	if b == nil {
		return
	}
	var in struct{ Shared bool }
	if !readJSON(w, r, &in) {
		return
	}
	_ = a.St.SetBoardShared(b.ID, in.Shared)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "shared": in.Shared})
}

// --- Folders ---

// folderInOrg writes an error and returns false when folderID is set but is
// not a folder of the org. Empty folderID (root) passes.
func (a *API) folderInOrg(w http.ResponseWriter, orgID, folderID string) bool {
	if folderID == "" {
		return true
	}
	f, err := a.St.Folder(folderID)
	if err != nil || f.OrgID != orgID {
		writeErr(w, http.StatusBadRequest, "folder not in this org")
		return false
	}
	return true
}

func (a *API) listFolders(w http.ResponseWriter, r *http.Request) {
	c := a.user(w, r)
	if c == nil {
		return
	}
	orgID := r.PathValue("id")
	if !a.St.IsOrgMember(orgID, c.Sub) {
		writeErr(w, http.StatusForbidden, "not an org member")
		return
	}
	writeJSON(w, http.StatusOK, a.St.FoldersOfOrg(orgID))
}

func (a *API) createFolder(w http.ResponseWriter, r *http.Request) {
	c := a.user(w, r)
	if c == nil {
		return
	}
	orgID := r.PathValue("id")
	if !a.St.IsOrgMember(orgID, c.Sub) {
		writeErr(w, http.StatusForbidden, "not an org member")
		return
	}
	var in struct{ Name, ParentId string }
	if !readJSON(w, r, &in) || strings.TrimSpace(in.Name) == "" {
		writeErr(w, http.StatusBadRequest, "name required")
		return
	}
	if !a.folderInOrg(w, orgID, in.ParentId) {
		return
	}
	writeJSON(w, http.StatusOK, a.St.CreateFolder(orgID, in.ParentId, strings.TrimSpace(in.Name)))
}

func (a *API) moveBoard(w http.ResponseWriter, r *http.Request) {
	b, uid := a.boardAccess(w, r)
	if b == nil {
		return
	}
	if uid == "" || !a.St.IsOrgMember(b.OrgID, uid) {
		writeErr(w, http.StatusForbidden, "not an org member")
		return
	}
	var in struct{ FolderId string }
	if !readJSON(w, r, &in) {
		return
	}
	if !a.folderInOrg(w, b.OrgID, in.FolderId) {
		return
	}
	if err := a.St.MoveBoard(b.ID, in.FolderId); err != nil {
		writeErr(w, http.StatusNotFound, "board not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// folderAccess loads a folder and checks the caller is a member of its org.
func (a *API) folderAccess(w http.ResponseWriter, r *http.Request) (*store.Folder, string) {
	c := a.user(w, r)
	if c == nil {
		return nil, ""
	}
	f, err := a.St.Folder(r.PathValue("id"))
	if err != nil {
		writeErr(w, http.StatusNotFound, "folder not found")
		return nil, ""
	}
	if !a.St.IsOrgMember(f.OrgID, c.Sub) {
		writeErr(w, http.StatusForbidden, "not an org member")
		return nil, ""
	}
	return f, c.Sub
}

func (a *API) moveFolder(w http.ResponseWriter, r *http.Request) {
	f, _ := a.folderAccess(w, r)
	if f == nil {
		return
	}
	var in struct{ ParentId string }
	if !readJSON(w, r, &in) {
		return
	}
	if !a.folderInOrg(w, f.OrgID, in.ParentId) {
		return
	}
	if err := a.St.MoveFolder(f.ID, in.ParentId); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) deleteFolder(w http.ResponseWriter, r *http.Request) {
	f, _ := a.folderAccess(w, r)
	if f == nil {
		return
	}
	_ = a.St.DeleteFolder(f.ID) // cascades to subfolders and boards
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) listIntegrations(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, a.Reg.All())
}

func (a *API) uploadPlugin(w http.ResponseWriter, r *http.Request) {
	c := a.user(w, r)
	if c == nil {
		return
	}
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "multipart form expected")
		return
	}
	f, _, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "file field required")
		return
	}
	defer f.Close()
	tmp, err := integrations.ReaderAtFrom(f, 32<<20)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	d, err := a.Reg.InstallZip(tmp.Data, tmp.Size)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (a *API) deletePlugin(w http.ResponseWriter, r *http.Request) {
	c := a.user(w, r)
	if c == nil {
		return
	}
	if err := a.Reg.Uninstall(r.PathValue("name")); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (a *API) websocket(w http.ResponseWriter, r *http.Request) {
	boardID := r.URL.Query().Get("board")
	b, err := a.St.Board(boardID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "board not found")
		return
	}
	uid, name := "", "Guest"
	if c, err := auth.ParseToken(a.Key, r.URL.Query().Get("token")); err == nil {
		uid, name = c.Sub, c.Name
	}
	if !a.St.CanAccess(b, uid) {
		writeErr(w, http.StatusForbidden, "no access")
		return
	}
	if uid == "" {
		uid = "guest-" + r.RemoteAddr
	}
	conn, err := ws.Upgrade(w, r)
	if err != nil {
		return
	}
	leave := a.Hub.Join(boardID, uid, name, conn)
	defer func() { leave(); conn.Close() }()
	for {
		msg, err := conn.ReadMessage()
		if err != nil {
			return
		}
		a.Hub.Relay(boardID, conn, msg)
	}
}

// Package store is a JSON-file-backed datastore with in-memory caching and
// coarse locking. Users, orgs, memberships, teams and boards all live here.
package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

var ErrNotFound = errors.New("not found")

const (
	UserRoleAdmin = "admin"
	UserRoleUser  = "user"
)

const (
	OrgRoleOwner  = "owner"
	OrgRoleAdmin  = "admin"
	OrgRoleMember = "member"
)

type User struct {
	ID            string    `json:"id"`
	Email         string    `json:"email"`
	Username      string    `json:"username"`
	Name          string    `json:"name"`
	Role          string    `json:"role"` // "admin" or "user" (default "user")
	PasswordHash  string    `json:"passwordHash"`
	Provider      string    `json:"provider,omitempty"`
	ProviderID    string    `json:"providerId,omitempty"`
	Avatar        string    `json:"avatar,omitempty"`
	EmailVerified bool      `json:"emailVerified"`
	CreatedAt     time.Time `json:"createdAt"`
}

type OrgMember struct {
	UserID string `json:"userId"`
	Role   string `json:"role"` // "owner", "admin" or "member"
}

type Org struct {
	ID        string      `json:"id"`
	Name      string      `json:"name"`
	OwnerID   string      `json:"ownerId"`
	MemberIDs []string    `json:"memberIds,omitempty"` // legacy; kept for migration only
	Members   []OrgMember `json:"members"`
	CreatedAt time.Time   `json:"createdAt"`
}

type Team struct {
	ID        string    `json:"id"`
	OrgID     string    `json:"orgId"`
	Name      string    `json:"name"`
	MemberIDs []string  `json:"memberIds"`
	CreatedAt time.Time `json:"createdAt"`
}

type Board struct {
	ID        string          `json:"id"`
	OrgID     string          `json:"orgId"`
	Name      string          `json:"name"`
	OwnerID   string          `json:"ownerId"`
	FolderID  string          `json:"folderId,omitempty"` // "" = org root
	TeamID    string          `json:"teamId,omitempty"`
	Elements  json.RawMessage `json:"elements"`           // opaque canvas scene (array of elements)
	AppState  json.RawMessage `json:"appState"`           // opaque view state
	Shared    bool            `json:"shared"`             // anyone with link can view/edit
	Thumbnail string          `json:"thumbnail,omitempty"` // JPEG data URL snapshot of the scene
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

type Folder struct {
	ID        string    `json:"id"`
	OrgID     string    `json:"orgId"`
	ParentID  string    `json:"parentId,omitempty"` // "" = org root
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
}

type data struct {
	Users   map[string]*User   `json:"users"`
	Orgs    map[string]*Org    `json:"orgs"`
	Boards  map[string]*Board  `json:"boards"`
	Folders map[string]*Folder `json:"folders"`
	Teams   map[string]*Team   `json:"teams"`
}

type Store struct {
	mu   sync.RWMutex
	path string
	d    data
}

func New(dir string) (*Store, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	s := &Store{path: filepath.Join(dir, "db.json")}
	s.d = data{Users: map[string]*User{}, Orgs: map[string]*Org{}, Boards: map[string]*Board{}, Folders: map[string]*Folder{}, Teams: map[string]*Team{}}
	if raw, err := os.ReadFile(s.path); err == nil {
		_ = json.Unmarshal(raw, &s.d)
	}
	if s.d.Folders == nil { // db.json predates folders
		s.d.Folders = map[string]*Folder{}
	}
	if s.d.Teams == nil { // db.json predates teams
		s.d.Teams = map[string]*Team{}
	}
	// Migrate legacy org member ID lists to role-based memberships.
	for _, o := range s.d.Orgs {
		if len(o.Members) == 0 && len(o.MemberIDs) > 0 {
			members := []OrgMember{{UserID: o.OwnerID, Role: OrgRoleOwner}}
			seen := map[string]bool{o.OwnerID: true}
			for _, id := range o.MemberIDs {
				if !seen[id] {
					members = append(members, OrgMember{UserID: id, Role: OrgRoleMember})
					seen[id] = true
				}
			}
			o.Members = members
		}
		o.MemberIDs = nil // migrated; drop the legacy list
	}
	return s, nil
}

func (s *Store) saveLocked() {
	raw, _ := json.MarshalIndent(s.d, "", "  ")
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o644); err == nil {
		_ = os.Rename(tmp, s.path)
	}
}

func NewID(prefix string) string {
	b := make([]byte, 9)
	_, _ = rand.Read(b)
	return prefix + "_" + hex.EncodeToString(b)
}

func normalizeUserRole(role string) string {
	if role == UserRoleAdmin {
		return UserRoleAdmin
	}
	return UserRoleUser
}

// --- Users ---

func (s *Store) CreateUser(email, name, username, passwordHash, role string) (*User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, u := range s.d.Users {
		if u.Email == email {
			return nil, errors.New("email already registered")
		}
		if username != "" && u.Username == username {
			return nil, errors.New("username already taken")
		}
	}
	u := &User{ID: NewID("usr"), Email: email, Username: username, Name: name, Role: normalizeUserRole(role), PasswordHash: passwordHash, CreatedAt: time.Now()}
	s.d.Users[u.ID] = u
	s.saveLocked()
	return u, nil
}

func (s *Store) UserByEmail(email string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range s.d.Users {
		if u.Email == email {
			cp := *u
			return &cp, nil
		}
	}
	return nil, ErrNotFound
}

func (s *Store) UserByUsername(username string) (*User, error) {
	if username == "" {
		return nil, ErrNotFound
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range s.d.Users {
		if u.Username == username {
			cp := *u
			return &cp, nil
		}
	}
	return nil, ErrNotFound
}

func (s *Store) UserByID(id string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.d.Users[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *u
	return &cp, nil
}

func (s *Store) UserByProvider(provider, providerID string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range s.d.Users {
		if u.Provider == provider && u.ProviderID == providerID {
			cp := *u
			return &cp, nil
		}
	}
	return nil, ErrNotFound
}

func (s *Store) CreateOAuthUser(email, name, provider, providerID, avatar string, emailVerified bool) (*User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, u := range s.d.Users {
		if u.Email == email {
			return nil, errors.New("email already registered")
		}
	}
	u := &User{
		ID:            NewID("usr"),
		Email:         email,
		Username:      "",
		Name:          name,
		Role:          UserRoleUser,
		Provider:      provider,
		ProviderID:    providerID,
		Avatar:        avatar,
		EmailVerified: emailVerified,
		CreatedAt:     time.Now(),
	}
	s.d.Users[u.ID] = u
	s.saveLocked()
	return u, nil
}

func (s *Store) LinkProvider(userID, provider, providerID, avatar string, emailVerified bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.d.Users[userID]
	if !ok {
		return ErrNotFound
	}
	u.Provider = provider
	u.ProviderID = providerID
	u.Avatar = avatar
	u.EmailVerified = emailVerified
	s.saveLocked()
	return nil
}

// --- Orgs ---

func (s *Store) CreateOrg(ownerID, name string) *Org {
	s.mu.Lock()
	defer s.mu.Unlock()
	o := &Org{ID: NewID("org"), Name: name, OwnerID: ownerID, Members: []OrgMember{{UserID: ownerID, Role: OrgRoleOwner}}, CreatedAt: time.Now()}
	s.d.Orgs[o.ID] = o
	s.saveLocked()
	return o
}

func (s *Store) OrgsOfUser(userID string) []*Org {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []*Org{}
	for _, o := range s.d.Orgs {
		if s.orgMemberRoleLocked(o, userID) != "" {
			cp := *o
			out = append(out, &cp)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

func (s *Store) Org(id string) (*Org, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	o, ok := s.d.Orgs[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *o
	return &cp, nil
}

func (s *Store) orgMemberRoleLocked(o *Org, userID string) string {
	if o == nil {
		return ""
	}
	if o.OwnerID == userID {
		return OrgRoleOwner
	}
	for _, m := range o.Members {
		if m.UserID == userID {
			return m.Role
		}
	}
	return ""
}

func (s *Store) OrgMemberRole(orgID, userID string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	o, ok := s.d.Orgs[orgID]
	if !ok {
		return ""
	}
	return s.orgMemberRoleLocked(o, userID)
}

func (s *Store) IsOrgMember(orgID, userID string) bool {
	return s.OrgMemberRole(orgID, userID) != ""
}

func (s *Store) IsOrgAdmin(orgID, userID string) bool {
	role := s.OrgMemberRole(orgID, userID)
	return role == OrgRoleOwner || role == OrgRoleAdmin
}

func (s *Store) IsOrgOwner(orgID, userID string) bool {
	return s.OrgMemberRole(orgID, userID) == OrgRoleOwner
}

func (s *Store) AddMember(orgID, userID, role string) error {
	if role == "" {
		role = OrgRoleMember
	}
	if role != OrgRoleMember && role != OrgRoleAdmin {
		return errors.New("invalid role")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	o, ok := s.d.Orgs[orgID]
	if !ok {
		return ErrNotFound
	}
	if _, ok := s.d.Users[userID]; !ok {
		return errors.New("user not found")
	}
	for _, m := range o.Members {
		if m.UserID == userID {
			return nil
		}
	}
	o.Members = append(o.Members, OrgMember{UserID: userID, Role: role})
	s.saveLocked()
	return nil
}

func (s *Store) RemoveMember(orgID, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	o, ok := s.d.Orgs[orgID]
	if !ok {
		return ErrNotFound
	}
	if o.OwnerID == userID {
		return errors.New("cannot remove owner")
	}
	for i, m := range o.Members {
		if m.UserID == userID {
			o.Members = append(o.Members[:i], o.Members[i+1:]...)
			s.saveLocked()
			return nil
		}
	}
	return ErrNotFound
}

func (s *Store) SetOrgMemberRole(orgID, userID, role string) error {
	if role != OrgRoleOwner && role != OrgRoleAdmin && role != OrgRoleMember {
		return errors.New("invalid role")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	o, ok := s.d.Orgs[orgID]
	if !ok {
		return ErrNotFound
	}
	if o.OwnerID == userID {
		return errors.New("cannot change owner's role")
	}
	for i := range o.Members {
		if o.Members[i].UserID == userID {
			o.Members[i].Role = role
			s.saveLocked()
			return nil
		}
	}
	// User was not explicitly listed but may have been derived from legacy data.
	o.Members = append(o.Members, OrgMember{UserID: userID, Role: role})
	s.saveLocked()
	return nil
}

// --- Teams ---

func (s *Store) CreateTeam(orgID, name string) *Team {
	s.mu.Lock()
	defer s.mu.Unlock()
	t := &Team{ID: NewID("team"), OrgID: orgID, Name: name, MemberIDs: []string{}, CreatedAt: time.Now()}
	s.d.Teams[t.ID] = t
	s.saveLocked()
	return t
}

func (s *Store) TeamsOfOrg(orgID string) []*Team {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []*Team{}
	for _, t := range s.d.Teams {
		if t.OrgID == orgID {
			cp := *t
			out = append(out, &cp)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

func (s *Store) Team(id string) (*Team, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.d.Teams[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *t
	return &cp, nil
}

func (s *Store) AddTeamMember(teamID, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, ok := s.d.Teams[teamID]
	if !ok {
		return ErrNotFound
	}
	if _, ok := s.d.Users[userID]; !ok {
		return errors.New("user not found")
	}
	o, ok := s.d.Orgs[t.OrgID]
	if !ok {
		return ErrNotFound
	}
	if s.orgMemberRoleLocked(o, userID) == "" {
		return errors.New("user is not an org member")
	}
	for _, m := range t.MemberIDs {
		if m == userID {
			return nil
		}
	}
	t.MemberIDs = append(t.MemberIDs, userID)
	s.saveLocked()
	return nil
}

func (s *Store) RemoveTeamMember(teamID, userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	t, ok := s.d.Teams[teamID]
	if !ok {
		return ErrNotFound
	}
	for i, m := range t.MemberIDs {
		if m == userID {
			t.MemberIDs = append(t.MemberIDs[:i], t.MemberIDs[i+1:]...)
			s.saveLocked()
			return nil
		}
	}
	return ErrNotFound
}

func (s *Store) IsTeamMember(teamID, userID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.d.Teams[teamID]
	if !ok {
		return false
	}
	for _, m := range t.MemberIDs {
		if m == userID {
			return true
		}
	}
	return false
}

// --- Boards ---

func (s *Store) CreateBoard(orgID, ownerID, name, folderID, teamID string) *Board {
	s.mu.Lock()
	defer s.mu.Unlock()
	b := &Board{
		ID: NewID("brd"), OrgID: orgID, OwnerID: ownerID, Name: name, FolderID: folderID, TeamID: teamID,
		Elements: json.RawMessage("[]"), AppState: json.RawMessage("{}"),
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	s.d.Boards[b.ID] = b
	s.saveLocked()
	return b
}

func (s *Store) BoardsOfOrg(orgID, userID string) []*Board {
	s.mu.RLock()
	defer s.mu.RUnlock()
	role := s.orgMemberRoleLocked(s.d.Orgs[orgID], userID)
	out := []*Board{}
	for _, b := range s.d.Boards {
		if b.OrgID != orgID {
			continue
		}
		if b.TeamID != "" && role != OrgRoleOwner && role != OrgRoleAdmin && !s.isTeamMemberLocked(b.TeamID, userID) {
			continue
		}
		cp := *b
		cp.Elements, cp.AppState = nil, nil // list view: skip heavy payloads
		out = append(out, &cp)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	return out
}

func (s *Store) Board(id string) (*Board, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	b, ok := s.d.Boards[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *b
	return &cp, nil
}

// CanAccess: org owner/admins always may; for team boards, team members may;
// for non-team boards, any org member may; anyone may if the board is shared.
func (s *Store) CanAccess(b *Board, userID string) bool {
	if b.Shared {
		return true
	}
	if userID == "" {
		return false
	}
	role := s.OrgMemberRole(b.OrgID, userID)
	if role == OrgRoleOwner || role == OrgRoleAdmin {
		return true
	}
	if b.TeamID != "" {
		return s.IsTeamMember(b.TeamID, userID)
	}
	return role != ""
}

func (s *Store) isTeamMemberLocked(teamID, userID string) bool {
	t, ok := s.d.Teams[teamID]
	if !ok {
		return false
	}
	for _, m := range t.MemberIDs {
		if m == userID {
			return true
		}
	}
	return false
}

func (s *Store) SaveBoardScene(id string, elements, appState json.RawMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.d.Boards[id]
	if !ok {
		return ErrNotFound
	}
	if elements != nil {
		b.Elements = elements
	}
	if appState != nil {
		b.AppState = appState
	}
	b.UpdatedAt = time.Now()
	s.saveLocked()
	return nil
}

func (s *Store) SaveBoardThumbnail(id string, thumbnail string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.d.Boards[id]
	if !ok {
		return ErrNotFound
	}
	b.Thumbnail = thumbnail
	s.saveLocked()
	return nil
}

func (s *Store) SetBoardShared(id string, shared bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.d.Boards[id]
	if !ok {
		return ErrNotFound
	}
	b.Shared = shared
	s.saveLocked()
	return nil
}

func (s *Store) DeleteBoard(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.d.Boards[id]; !ok {
		return ErrNotFound
	}
	delete(s.d.Boards, id)
	s.saveLocked()
	return nil
}

// --- Folders ---

func (s *Store) CreateFolder(orgID, parentID, name string) *Folder {
	s.mu.Lock()
	defer s.mu.Unlock()
	f := &Folder{ID: NewID("fld"), OrgID: orgID, ParentID: parentID, Name: name, CreatedAt: time.Now()}
	s.d.Folders[f.ID] = f
	s.saveLocked()
	return f
}

func (s *Store) FoldersOfOrg(orgID string) []*Folder {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []*Folder{}
	for _, f := range s.d.Folders {
		if f.OrgID == orgID {
			cp := *f
			out = append(out, &cp)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.Before(out[j].CreatedAt) })
	return out
}

func (s *Store) Folder(id string) (*Folder, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	f, ok := s.d.Folders[id]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *f
	return &cp, nil
}

func (s *Store) MoveBoard(id, folderID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.d.Boards[id]
	if !ok {
		return ErrNotFound
	}
	b.FolderID = folderID
	s.saveLocked()
	return nil
}

func (s *Store) RenameBoard(id, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	b, ok := s.d.Boards[id]
	if !ok {
		return ErrNotFound
	}
	b.Name = name
	b.UpdatedAt = time.Now()
	s.saveLocked()
	return nil
}

// folderCycleLocked reports whether moving folder id under newParentID would
// create a cycle (new parent is the folder itself or one of its descendants).
func folderCycleLocked(folders map[string]*Folder, id, newParentID string) bool {
	for cur := newParentID; cur != ""; {
		if cur == id {
			return true
		}
		f, ok := folders[cur]
		if !ok {
			return false
		}
		cur = f.ParentID
	}
	return false
}

func (s *Store) MoveFolder(id, parentID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, ok := s.d.Folders[id]
	if !ok {
		return ErrNotFound
	}
	if folderCycleLocked(s.d.Folders, id, parentID) {
		return errors.New("cannot move a folder into itself or its descendant")
	}
	f.ParentID = parentID
	s.saveLocked()
	return nil
}

// DeleteFolder removes the folder, its subfolders and all boards inside them.
func (s *Store) DeleteFolder(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.d.Folders[id]; !ok {
		return ErrNotFound
	}
	dead := map[string]bool{id: true}
	changed := true
	for changed {
		changed = false
		for _, f := range s.d.Folders {
			if f.ParentID != "" && dead[f.ParentID] && !dead[f.ID] {
				dead[f.ID] = true
				changed = true
			}
		}
	}
	for fid := range dead {
		delete(s.d.Folders, fid)
	}
	for bid, b := range s.d.Boards {
		if dead[b.FolderID] {
			delete(s.d.Boards, bid)
		}
	}
	s.saveLocked()
	return nil
}

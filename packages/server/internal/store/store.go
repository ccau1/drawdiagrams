// Package store is a JSON-file-backed datastore with in-memory caching and
// coarse locking. Users, orgs, memberships and boards all live here.
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

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	Name         string    `json:"name"`
	PasswordHash string    `json:"passwordHash"`
	CreatedAt    time.Time `json:"createdAt"`
}

type Org struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	OwnerID   string    `json:"ownerId"`
	MemberIDs []string  `json:"memberIds"`
	CreatedAt time.Time `json:"createdAt"`
}

type Board struct {
	ID        string          `json:"id"`
	OrgID     string          `json:"orgId"`
	Name      string          `json:"name"`
	OwnerID   string          `json:"ownerId"`
	Elements  json.RawMessage `json:"elements"`  // opaque canvas scene (array of elements)
	AppState  json.RawMessage `json:"appState"`  // opaque view state
	Shared    bool            `json:"shared"`    // anyone with link can view/edit
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

type data struct {
	Users  map[string]*User  `json:"users"`
	Orgs   map[string]*Org   `json:"orgs"`
	Boards map[string]*Board `json:"boards"`
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
	s.d = data{Users: map[string]*User{}, Orgs: map[string]*Org{}, Boards: map[string]*Board{}}
	if raw, err := os.ReadFile(s.path); err == nil {
		_ = json.Unmarshal(raw, &s.d)
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

// --- Users ---

func (s *Store) CreateUser(email, name, passwordHash string) (*User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, u := range s.d.Users {
		if u.Email == email {
			return nil, errors.New("email already registered")
		}
	}
	u := &User{ID: NewID("usr"), Email: email, Name: name, PasswordHash: passwordHash, CreatedAt: time.Now()}
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

// --- Orgs ---

func (s *Store) CreateOrg(ownerID, name string) *Org {
	s.mu.Lock()
	defer s.mu.Unlock()
	o := &Org{ID: NewID("org"), Name: name, OwnerID: ownerID, MemberIDs: []string{ownerID}, CreatedAt: time.Now()}
	s.d.Orgs[o.ID] = o
	s.saveLocked()
	return o
}

func (s *Store) OrgsOfUser(userID string) []*Org {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []*Org{}
	for _, o := range s.d.Orgs {
		for _, m := range o.MemberIDs {
			if m == userID {
				cp := *o
				out = append(out, &cp)
				break
			}
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

func (s *Store) IsMember(orgID, userID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	o, ok := s.d.Orgs[orgID]
	if !ok {
		return false
	}
	for _, m := range o.MemberIDs {
		if m == userID {
			return true
		}
	}
	return false
}

func (s *Store) AddMember(orgID, email string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	o, ok := s.d.Orgs[orgID]
	if !ok {
		return ErrNotFound
	}
	var target *User
	for _, u := range s.d.Users {
		if u.Email == email {
			target = u
			break
		}
	}
	if target == nil {
		return errors.New("no user with that email")
	}
	for _, m := range o.MemberIDs {
		if m == target.ID {
			return nil
		}
	}
	o.MemberIDs = append(o.MemberIDs, target.ID)
	s.saveLocked()
	return nil
}

// --- Boards ---

func (s *Store) CreateBoard(orgID, ownerID, name string) *Board {
	s.mu.Lock()
	defer s.mu.Unlock()
	b := &Board{
		ID: NewID("brd"), OrgID: orgID, OwnerID: ownerID, Name: name,
		Elements: json.RawMessage("[]"), AppState: json.RawMessage("{}"),
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	s.d.Boards[b.ID] = b
	s.saveLocked()
	return b
}

func (s *Store) BoardsOfOrg(orgID string) []*Board {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []*Board{}
	for _, b := range s.d.Boards {
		if b.OrgID == orgID {
			cp := *b
			cp.Elements, cp.AppState = nil, nil // list view: skip heavy payloads
			out = append(out, &cp)
		}
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

// CanAccess: org members always may; anyone may if the board is shared.
func (s *Store) CanAccess(b *Board, userID string) bool {
	if b.Shared {
		return true
	}
	if userID == "" {
		return false
	}
	return s.IsMember(b.OrgID, userID)
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

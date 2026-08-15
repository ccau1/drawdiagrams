package store

import "encoding/json"

// Datastore is the persistence contract used by the API layer. It is
// implemented by Store (JSON file) and Postgres (DATABASE_URL set).
type Datastore interface {
	CreateUser(email, name, passwordHash string) (*User, error)
	UserByEmail(email string) (*User, error)
	UserByID(id string) (*User, error)
	CreateOrg(ownerID, name string) *Org
	OrgsOfUser(userID string) []*Org
	Org(id string) (*Org, error)
	IsMember(orgID, userID string) bool
	AddMember(orgID, email string) error
	CreateBoard(orgID, ownerID, name string) *Board
	BoardsOfOrg(orgID string) []*Board
	Board(id string) (*Board, error)
	CanAccess(b *Board, userID string) bool
	SaveBoardScene(id string, elements, appState json.RawMessage) error
	SetBoardShared(id string, shared bool) error
	DeleteBoard(id string) error
}

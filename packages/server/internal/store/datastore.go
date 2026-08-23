package store

import "encoding/json"

// Datastore is the persistence contract used by the API layer. It is
// implemented by Store (JSON file) and Postgres (DATABASE_URL set).
type Datastore interface {
	CreateUser(email, name, username, passwordHash, role string) (*User, error)
	UserByEmail(email string) (*User, error)
	UserByUsername(username string) (*User, error)
	UserByID(id string) (*User, error)
	UserByProvider(provider, providerID string) (*User, error)
	CreateOAuthUser(email, name, provider, providerID, avatar string, emailVerified bool) (*User, error)
	LinkProvider(userID, provider, providerID, avatar string, emailVerified bool) error
	CreateOrg(ownerID, name string) *Org
	OrgsOfUser(userID string) []*Org
	Org(id string) (*Org, error)
	IsOrgMember(orgID, userID string) bool
	IsOrgAdmin(orgID, userID string) bool
	IsOrgOwner(orgID, userID string) bool
	OrgMemberRole(orgID, userID string) string
	AddMember(orgID, userID, role string) error
	RemoveMember(orgID, userID string) error
	SetOrgMemberRole(orgID, userID, role string) error
	CreateTeam(orgID, name string) *Team
	TeamsOfOrg(orgID string) []*Team
	Team(id string) (*Team, error)
	AddTeamMember(teamID, userID string) error
	RemoveTeamMember(teamID, userID string) error
	IsTeamMember(teamID, userID string) bool
	CreateBoard(orgID, ownerID, name, folderID, teamID string) *Board
	BoardsOfOrg(orgID, userID string) []*Board
	Board(id string) (*Board, error)
	CanAccess(b *Board, userID string) bool
	SaveBoardScene(id string, elements, appState json.RawMessage) error
	SaveBoardThumbnail(id string, thumbnail string) error
	SetBoardShared(id string, shared bool) error
	DeleteBoard(id string) error
	CreateFolder(orgID, parentID, name string) *Folder
	FoldersOfOrg(orgID string) []*Folder
	Folder(id string) (*Folder, error)
	MoveBoard(id, folderID string) error
	MoveFolder(id, parentID string) error
	DeleteFolder(id string) error
}

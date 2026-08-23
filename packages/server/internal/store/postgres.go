// Postgres-backed store. Activated when DATABASE_URL is set; otherwise the
// JSON file store is used. Same API as Store via the Datastore interface.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Postgres struct {
	pool *pgxpool.Pool
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  password_hash TEXT,
  provider TEXT NOT NULL DEFAULT '',
  provider_id TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  email_verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Migration: these columns were added after initial deploy.
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
-- Backfill nullable provider columns and enforce NOT NULL for local users.
UPDATE users SET provider = COALESCE(provider, ''), provider_id = COALESCE(provider_id, ''), avatar = COALESCE(avatar, '')
  WHERE provider IS NULL OR provider_id IS NULL OR avatar IS NULL;
ALTER TABLE users ALTER COLUMN provider SET NOT NULL;
ALTER TABLE users ALTER COLUMN provider_id SET NOT NULL;
ALTER TABLE users ALTER COLUMN avatar SET NOT NULL;
DROP INDEX IF EXISTS users_provider_idx;
CREATE UNIQUE INDEX IF NOT EXISTS users_provider_idx ON users(provider, provider_id) WHERE provider <> '';
CREATE UNIQUE INDEX IF NOT EXISTS users_username_idx ON users(username) WHERE username <> '';
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS org_members (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (org_id, user_id)
);
ALTER TABLE org_members ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS folders_org_idx ON folders(org_id);
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  elements JSONB NOT NULL DEFAULT '[]',
  app_state JSONB NOT NULL DEFAULT '{}',
  shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS boards_org_idx ON boards(org_id);
ALTER TABLE boards ADD COLUMN IF NOT EXISTS folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS thumbnail TEXT;
`

func NewPostgres(ctx context.Context, url string) (*Postgres, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	// Retry ping/schema for a while — postgres may still be starting.
	var last error
	for i := 0; i < 30; i++ {
		if _, last = pool.Exec(ctx, schema); last == nil {
			break
		}
		time.Sleep(2 * time.Second)
	}
	if last != nil {
		return nil, last
	}
	return &Postgres{pool: pool}, nil
}

func (p *Postgres) Close() { p.pool.Close() }

func (p *Postgres) CreateUser(email, name, username, passwordHash, role string) (*User, error) {
	ctx := context.Background()
	if role == "" {
		role = UserRoleUser
	}
	u := &User{ID: NewID("usr"), Email: email, Username: username, Name: name, Role: role, PasswordHash: passwordHash, EmailVerified: false, CreatedAt: time.Now()}
	_, err := p.pool.Exec(ctx,
		`INSERT INTO users (id, email, username, name, role, password_hash, email_verified, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		u.ID, u.Email, u.Username, u.Name, u.Role, u.PasswordHash, u.EmailVerified, u.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "users_username_idx") {
			return nil, errors.New("username already taken")
		}
		return nil, errors.New("email already registered")
	}
	return u, nil
}

func (p *Postgres) scanUser(row interface{ Scan(...any) error }) (*User, error) {
	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.Username, &u.Name, &u.Role, &u.PasswordHash, &u.Provider, &u.ProviderID, &u.Avatar, &u.EmailVerified, &u.CreatedAt); err != nil {
		return nil, ErrNotFound
	}
	return &u, nil
}

func (p *Postgres) UserByEmail(email string) (*User, error) {
	return p.scanUser(p.pool.QueryRow(context.Background(),
		`SELECT id, email, username, name, role, password_hash, provider, provider_id, avatar, email_verified, created_at FROM users WHERE email=$1`, email))
}

func (p *Postgres) UserByUsername(username string) (*User, error) {
	if username == "" {
		return nil, ErrNotFound
	}
	return p.scanUser(p.pool.QueryRow(context.Background(),
		`SELECT id, email, username, name, role, password_hash, provider, provider_id, avatar, email_verified, created_at FROM users WHERE username=$1`, username))
}

func (p *Postgres) UserByID(id string) (*User, error) {
	return p.scanUser(p.pool.QueryRow(context.Background(),
		`SELECT id, email, username, name, role, password_hash, provider, provider_id, avatar, email_verified, created_at FROM users WHERE id=$1`, id))
}

func (p *Postgres) UserByProvider(provider, providerID string) (*User, error) {
	return p.scanUser(p.pool.QueryRow(context.Background(),
		`SELECT id, email, username, name, role, password_hash, provider, provider_id, avatar, email_verified, created_at FROM users WHERE provider=$1 AND provider_id=$2`, provider, providerID))
}

func (p *Postgres) CreateOAuthUser(email, name, provider, providerID, avatar string, emailVerified bool) (*User, error) {
	ctx := context.Background()
	u := &User{ID: NewID("usr"), Email: email, Username: "", Name: name, Role: UserRoleUser, Provider: provider, ProviderID: providerID, Avatar: avatar, EmailVerified: emailVerified, CreatedAt: time.Now()}
	_, err := p.pool.Exec(ctx,
		`INSERT INTO users (id, email, username, name, role, provider, provider_id, avatar, email_verified, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		u.ID, u.Email, u.Username, u.Name, u.Role, u.Provider, u.ProviderID, u.Avatar, u.EmailVerified, u.CreatedAt)
	if err != nil {
		return nil, errors.New("email already registered")
	}
	return u, nil
}

func (p *Postgres) LinkProvider(userID, provider, providerID, avatar string, emailVerified bool) error {
	_, err := p.pool.Exec(context.Background(),
		`UPDATE users SET provider=$2, provider_id=$3, avatar=$4, email_verified=$5 WHERE id=$1`,
		userID, provider, providerID, avatar, emailVerified)
	return err
}

func (p *Postgres) CreateOrg(ownerID, name string) *Org {
	ctx := context.Background()
	o := &Org{ID: NewID("org"), Name: name, OwnerID: ownerID, Members: []OrgMember{{UserID: ownerID, Role: OrgRoleOwner}}, CreatedAt: time.Now()}
	_, err := p.pool.Exec(ctx, `INSERT INTO orgs (id, name, owner_id, created_at) VALUES ($1,$2,$3,$4)`,
		o.ID, o.Name, o.OwnerID, o.CreatedAt)
	if err != nil {
		return nil
	}
	_, _ = p.pool.Exec(ctx, `INSERT INTO org_members (org_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, o.ID, ownerID, OrgRoleOwner)
	return o
}

func (p *Postgres) OrgsOfUser(userID string) []*Org {
	ctx := context.Background()
	rows, err := p.pool.Query(ctx, `
		SELECT o.id, o.name, o.owner_id, o.created_at
		FROM orgs o JOIN org_members m ON m.org_id = o.id
		WHERE m.user_id=$1 ORDER BY o.created_at`, userID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []*Org{}
	for rows.Next() {
		var o Org
		if rows.Scan(&o.ID, &o.Name, &o.OwnerID, &o.CreatedAt) == nil {
			o.Members = p.members(o.ID)
			out = append(out, &o)
		}
	}
	return out
}

func (p *Postgres) members(orgID string) []OrgMember {
	rows, err := p.pool.Query(context.Background(),
		`SELECT user_id, role FROM org_members WHERE org_id=$1`, orgID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var members []OrgMember
	for rows.Next() {
		var m OrgMember
		if rows.Scan(&m.UserID, &m.Role) == nil {
			members = append(members, m)
		}
	}
	return members
}

func (p *Postgres) Org(id string) (*Org, error) {
	var o Org
	err := p.pool.QueryRow(context.Background(),
		`SELECT id, name, owner_id, created_at FROM orgs WHERE id=$1`, id).
		Scan(&o.ID, &o.Name, &o.OwnerID, &o.CreatedAt)
	if err != nil {
		return nil, ErrNotFound
	}
	o.Members = p.members(id)
	return &o, nil
}

func (p *Postgres) OrgMemberRole(orgID, userID string) string {
	var role string
	err := p.pool.QueryRow(context.Background(),
		`SELECT role FROM org_members WHERE org_id=$1 AND user_id=$2`, orgID, userID).Scan(&role)
	if err != nil {
		return ""
	}
	return role
}

func (p *Postgres) IsOrgMember(orgID, userID string) bool {
	return p.OrgMemberRole(orgID, userID) != ""
}

func (p *Postgres) IsOrgAdmin(orgID, userID string) bool {
	role := p.OrgMemberRole(orgID, userID)
	return role == OrgRoleOwner || role == OrgRoleAdmin
}

func (p *Postgres) IsOrgOwner(orgID, userID string) bool {
	return p.OrgMemberRole(orgID, userID) == OrgRoleOwner
}

func (p *Postgres) AddMember(orgID, userID, role string) error {
	if role == "" {
		role = OrgRoleMember
	}
	if role != OrgRoleMember && role != OrgRoleAdmin {
		return errors.New("invalid role")
	}
	ctx := context.Background()
	var exists bool
	if err := p.pool.QueryRow(ctx, `SELECT true FROM users WHERE id=$1`, userID).Scan(&exists); err != nil || !exists {
		return errors.New("user not found")
	}
	if !p.orgExists(orgID) {
		return ErrNotFound
	}
	_, err := p.pool.Exec(ctx,
		`INSERT INTO org_members (org_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (org_id, user_id) DO UPDATE SET role=$3`,
		orgID, userID, role)
	return err
}

func (p *Postgres) RemoveMember(orgID, userID string) error {
	if p.OrgMemberRole(orgID, userID) == OrgRoleOwner {
		return errors.New("cannot remove owner")
	}
	tag, err := p.pool.Exec(context.Background(),
		`DELETE FROM org_members WHERE org_id=$1 AND user_id=$2`, orgID, userID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (p *Postgres) SetOrgMemberRole(orgID, userID, role string) error {
	if role != OrgRoleOwner && role != OrgRoleAdmin && role != OrgRoleMember {
		return errors.New("invalid role")
	}
	if p.OrgMemberRole(orgID, userID) == OrgRoleOwner {
		return errors.New("cannot change owner's role")
	}
	if !p.orgExists(orgID) {
		return ErrNotFound
	}
	var exists bool
	if err := p.pool.QueryRow(context.Background(), `SELECT true FROM users WHERE id=$1`, userID).Scan(&exists); err != nil || !exists {
		return errors.New("user not found")
	}
	_, err := p.pool.Exec(context.Background(),
		`INSERT INTO org_members (org_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (org_id, user_id) DO UPDATE SET role=$3`,
		orgID, userID, role)
	return err
}

func (p *Postgres) orgExists(orgID string) bool {
	var n int
	_ = p.pool.QueryRow(context.Background(), `SELECT 1 FROM orgs WHERE id=$1`, orgID).Scan(&n)
	return n == 1
}

// --- Teams ---

func (p *Postgres) CreateTeam(orgID, name string) *Team {
	ctx := context.Background()
	t := &Team{ID: NewID("team"), OrgID: orgID, Name: name, MemberIDs: []string{}, CreatedAt: time.Now()}
	_, err := p.pool.Exec(ctx,
		`INSERT INTO teams (id, org_id, name, created_at) VALUES ($1,$2,$3,$4)`,
		t.ID, t.OrgID, t.Name, t.CreatedAt)
	if err != nil {
		return nil
	}
	return t
}

func (p *Postgres) TeamsOfOrg(orgID string) []*Team {
	rows, err := p.pool.Query(context.Background(),
		`SELECT id, org_id, name, created_at FROM teams WHERE org_id=$1 ORDER BY created_at`, orgID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []*Team{}
	for rows.Next() {
		var t Team
		if rows.Scan(&t.ID, &t.OrgID, &t.Name, &t.CreatedAt) == nil {
			t.MemberIDs = p.teamMemberIDs(t.ID)
			out = append(out, &t)
		}
	}
	return out
}

func (p *Postgres) Team(id string) (*Team, error) {
	var t Team
	err := p.pool.QueryRow(context.Background(),
		`SELECT id, org_id, name, created_at FROM teams WHERE id=$1`, id).
		Scan(&t.ID, &t.OrgID, &t.Name, &t.CreatedAt)
	if err != nil {
		return nil, ErrNotFound
	}
	t.MemberIDs = p.teamMemberIDs(id)
	return &t, nil
}

func (p *Postgres) teamMemberIDs(teamID string) []string {
	rows, err := p.pool.Query(context.Background(),
		`SELECT user_id FROM team_members WHERE team_id=$1`, teamID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if rows.Scan(&id) == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

func (p *Postgres) AddTeamMember(teamID, userID string) error {
	ctx := context.Background()
	t, err := p.Team(teamID)
	if err != nil {
		return err
	}
	if !p.IsOrgMember(t.OrgID, userID) {
		return errors.New("user is not an org member")
	}
	_, err = p.pool.Exec(ctx,
		`INSERT INTO team_members (team_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
		teamID, userID)
	return err
}

func (p *Postgres) RemoveTeamMember(teamID, userID string) error {
	tag, err := p.pool.Exec(context.Background(),
		`DELETE FROM team_members WHERE team_id=$1 AND user_id=$2`, teamID, userID)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (p *Postgres) IsTeamMember(teamID, userID string) bool {
	var n int
	_ = p.pool.QueryRow(context.Background(),
		`SELECT 1 FROM team_members WHERE team_id=$1 AND user_id=$2`, teamID, userID).Scan(&n)
	return n == 1
}

// --- Boards ---

func (p *Postgres) CreateBoard(orgID, ownerID, name, folderID, teamID string) *Board {
	b := &Board{
		ID: NewID("brd"), OrgID: orgID, OwnerID: ownerID, Name: name, FolderID: folderID, TeamID: teamID,
		Elements: json.RawMessage("[]"), AppState: json.RawMessage("{}"),
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	var fid, tid any
	if folderID != "" {
		fid = folderID
	}
	if teamID != "" {
		tid = teamID
	}
	_, err := p.pool.Exec(context.Background(), `
		INSERT INTO boards (id, org_id, name, owner_id, folder_id, team_id, elements, app_state, shared, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10)`,
		b.ID, b.OrgID, b.Name, b.OwnerID, fid, tid, b.Elements, b.AppState, b.CreatedAt, b.UpdatedAt)
	if err != nil {
		return nil
	}
	return b
}

func (p *Postgres) BoardsOfOrg(orgID, userID string) []*Board {
	role := p.OrgMemberRole(orgID, userID)
	rows, err := p.pool.Query(context.Background(), `
		SELECT id, org_id, name, owner_id, folder_id, team_id, shared, created_at, updated_at, COALESCE(thumbnail, '')
		FROM boards WHERE org_id=$1 ORDER BY updated_at DESC`, orgID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []*Board{}
	for rows.Next() {
		var b Board
		var fid, tid *string
		if rows.Scan(&b.ID, &b.OrgID, &b.Name, &b.OwnerID, &fid, &tid, &b.Shared, &b.CreatedAt, &b.UpdatedAt, &b.Thumbnail) == nil {
			if fid != nil {
				b.FolderID = *fid
			}
			if tid != nil {
				b.TeamID = *tid
			}
			if b.TeamID != "" && role != OrgRoleOwner && role != OrgRoleAdmin && !p.IsTeamMember(b.TeamID, userID) {
				continue
			}
			out = append(out, &b)
		}
	}
	return out
}

func (p *Postgres) Board(id string) (*Board, error) {
	var b Board
	var fid, tid *string
	err := p.pool.QueryRow(context.Background(), `
		SELECT id, org_id, name, owner_id, folder_id, team_id, elements, app_state, shared, created_at, updated_at, COALESCE(thumbnail, '')
		FROM boards WHERE id=$1`, id).
		Scan(&b.ID, &b.OrgID, &b.Name, &b.OwnerID, &fid, &tid, &b.Elements, &b.AppState, &b.Shared, &b.CreatedAt, &b.UpdatedAt, &b.Thumbnail)
	if err != nil {
		return nil, ErrNotFound
	}
	if fid != nil {
		b.FolderID = *fid
	}
	if tid != nil {
		b.TeamID = *tid
	}
	return &b, nil
}

func (p *Postgres) CanAccess(b *Board, userID string) bool {
	if b.Shared {
		return true
	}
	if userID == "" {
		return false
	}
	role := p.OrgMemberRole(b.OrgID, userID)
	if role == OrgRoleOwner || role == OrgRoleAdmin {
		return true
	}
	if b.TeamID != "" {
		return p.IsTeamMember(b.TeamID, userID)
	}
	return role != ""
}

func (p *Postgres) SaveBoardScene(id string, elements, appState json.RawMessage) error {
	ctx := context.Background()
	if elements != nil && appState != nil {
		_, err := p.pool.Exec(ctx,
			`UPDATE boards SET elements=$2, app_state=$3, updated_at=now() WHERE id=$1`, id, elements, appState)
		return err
	}
	if elements != nil {
		_, err := p.pool.Exec(ctx, `UPDATE boards SET elements=$2, updated_at=now() WHERE id=$1`, id, elements)
		return err
	}
	if appState != nil {
		_, err := p.pool.Exec(ctx, `UPDATE boards SET app_state=$2, updated_at=now() WHERE id=$1`, id, appState)
		return err
	}
	return nil
}

func (p *Postgres) SaveBoardThumbnail(id string, thumbnail string) error {
	_, err := p.pool.Exec(context.Background(),
		`UPDATE boards SET thumbnail=$1 WHERE id=$2`, thumbnail, id)
	return err
}

func (p *Postgres) SetBoardShared(id string, shared bool) error {
	tag, err := p.pool.Exec(context.Background(),
		`UPDATE boards SET shared=$2 WHERE id=$1`, id, shared)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (p *Postgres) DeleteBoard(id string) error {
	tag, err := p.pool.Exec(context.Background(), `DELETE FROM boards WHERE id=$1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// --- Folders ---

func (p *Postgres) CreateFolder(orgID, parentID, name string) *Folder {
	f := &Folder{ID: NewID("fld"), OrgID: orgID, ParentID: parentID, Name: name, CreatedAt: time.Now()}
	var pid any
	if parentID != "" {
		pid = parentID
	}
	_, err := p.pool.Exec(context.Background(), `
		INSERT INTO folders (id, org_id, parent_id, name, created_at) VALUES ($1,$2,$3,$4,$5)`,
		f.ID, f.OrgID, pid, f.Name, f.CreatedAt)
	if err != nil {
		return nil
	}
	return f
}

func (p *Postgres) scanFolder(row interface{ Scan(...any) error }) (*Folder, error) {
	var f Folder
	var pid *string
	if err := row.Scan(&f.ID, &f.OrgID, &pid, &f.Name, &f.CreatedAt); err != nil {
		return nil, ErrNotFound
	}
	if pid != nil {
		f.ParentID = *pid
	}
	return &f, nil
}

func (p *Postgres) Folder(id string) (*Folder, error) {
	return p.scanFolder(p.pool.QueryRow(context.Background(),
		`SELECT id, org_id, parent_id, name, created_at FROM folders WHERE id=$1`, id))
}

func (p *Postgres) FoldersOfOrg(orgID string) []*Folder {
	rows, err := p.pool.Query(context.Background(), `
		SELECT id, org_id, parent_id, name, created_at FROM folders WHERE org_id=$1 ORDER BY created_at`, orgID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []*Folder{}
	for rows.Next() {
		var f Folder
		var pid *string
		if rows.Scan(&f.ID, &f.OrgID, &pid, &f.Name, &f.CreatedAt) == nil {
			if pid != nil {
				f.ParentID = *pid
			}
			out = append(out, &f)
		}
	}
	return out
}

func (p *Postgres) MoveBoard(id, folderID string) error {
	var fid any
	if folderID != "" {
		fid = folderID
	}
	tag, err := p.pool.Exec(context.Background(),
		`UPDATE boards SET folder_id=$2 WHERE id=$1`, id, fid)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (p *Postgres) MoveFolder(id, parentID string) error {
	f, err := p.Folder(id)
	if err != nil {
		return err
	}
	// Reject moving into itself or a descendant: walk the parent chain up.
	for cur := parentID; cur != ""; {
		if cur == id {
			return errors.New("cannot move a folder into itself or its descendant")
		}
		par, err := p.Folder(cur)
		if err != nil {
			break
		}
		cur = par.ParentID
	}
	var pid any
	if parentID != "" {
		pid = parentID
	}
	tag, err := p.pool.Exec(context.Background(),
		`UPDATE folders SET parent_id=$2 WHERE id=$1`, f.ID, pid)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// DeleteFolder removes the folder; FK cascades remove subfolders and boards.
func (p *Postgres) DeleteFolder(id string) error {
	tag, err := p.pool.Exec(context.Background(), `DELETE FROM folders WHERE id=$1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

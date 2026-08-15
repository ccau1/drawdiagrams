// Postgres-backed store. Activated when DATABASE_URL is set; otherwise the
// JSON file store is used. Same API as Store via the Datastore interface.
package store

import (
	"context"
	"encoding/json"
	"errors"
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
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS org_members (
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (org_id, user_id)
);
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  elements JSONB NOT NULL DEFAULT '[]',
  app_state JSONB NOT NULL DEFAULT '{}',
  shared BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS boards_org_idx ON boards(org_id);
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

func (p *Postgres) CreateUser(email, name, passwordHash string) (*User, error) {
	ctx := context.Background()
	u := &User{ID: NewID("usr"), Email: email, Name: name, PasswordHash: passwordHash, CreatedAt: time.Now()}
	_, err := p.pool.Exec(ctx,
		`INSERT INTO users (id, email, name, password_hash, created_at) VALUES ($1,$2,$3,$4,$5)`,
		u.ID, u.Email, u.Name, u.PasswordHash, u.CreatedAt)
	if err != nil {
		return nil, errors.New("email already registered")
	}
	return u, nil
}

func (p *Postgres) scanUser(row interface{ Scan(...any) error }) (*User, error) {
	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.CreatedAt); err != nil {
		return nil, ErrNotFound
	}
	return &u, nil
}

func (p *Postgres) UserByEmail(email string) (*User, error) {
	return p.scanUser(p.pool.QueryRow(context.Background(),
		`SELECT id, email, name, password_hash, created_at FROM users WHERE email=$1`, email))
}

func (p *Postgres) UserByID(id string) (*User, error) {
	return p.scanUser(p.pool.QueryRow(context.Background(),
		`SELECT id, email, name, password_hash, created_at FROM users WHERE id=$1`, id))
}

func (p *Postgres) CreateOrg(ownerID, name string) *Org {
	ctx := context.Background()
	o := &Org{ID: NewID("org"), Name: name, OwnerID: ownerID, MemberIDs: []string{ownerID}, CreatedAt: time.Now()}
	_, err := p.pool.Exec(ctx, `INSERT INTO orgs (id, name, owner_id, created_at) VALUES ($1,$2,$3,$4)`,
		o.ID, o.Name, o.OwnerID, o.CreatedAt)
	if err != nil {
		return nil
	}
	_, _ = p.pool.Exec(ctx, `INSERT INTO org_members (org_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, o.ID, ownerID)
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
			o.MemberIDs = p.memberIDs(o.ID)
			out = append(out, &o)
		}
	}
	return out
}

func (p *Postgres) memberIDs(orgID string) []string {
	rows, err := p.pool.Query(context.Background(),
		`SELECT user_id FROM org_members WHERE org_id=$1`, orgID)
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

func (p *Postgres) Org(id string) (*Org, error) {
	var o Org
	err := p.pool.QueryRow(context.Background(),
		`SELECT id, name, owner_id, created_at FROM orgs WHERE id=$1`, id).
		Scan(&o.ID, &o.Name, &o.OwnerID, &o.CreatedAt)
	if err != nil {
		return nil, ErrNotFound
	}
	o.MemberIDs = p.memberIDs(id)
	return &o, nil
}

func (p *Postgres) IsMember(orgID, userID string) bool {
	var n int
	_ = p.pool.QueryRow(context.Background(),
		`SELECT 1 FROM org_members WHERE org_id=$1 AND user_id=$2`, orgID, userID).Scan(&n)
	return n == 1
}

func (p *Postgres) AddMember(orgID, email string) error {
	ctx := context.Background()
	var uid string
	if err := p.pool.QueryRow(ctx, `SELECT id FROM users WHERE email=$1`, email).Scan(&uid); err != nil {
		return errors.New("no user with that email")
	}
	tag, err := p.pool.Exec(ctx,
		`INSERT INTO org_members (org_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, orgID, uid)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		if !p.orgExists(orgID) {
			return ErrNotFound
		}
	}
	return nil
}

func (p *Postgres) orgExists(orgID string) bool {
	var n int
	_ = p.pool.QueryRow(context.Background(), `SELECT 1 FROM orgs WHERE id=$1`, orgID).Scan(&n)
	return n == 1
}

func (p *Postgres) CreateBoard(orgID, ownerID, name string) *Board {
	b := &Board{
		ID: NewID("brd"), OrgID: orgID, OwnerID: ownerID, Name: name,
		Elements: json.RawMessage("[]"), AppState: json.RawMessage("{}"),
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	_, err := p.pool.Exec(context.Background(), `
		INSERT INTO boards (id, org_id, name, owner_id, elements, app_state, shared, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,false,$7,$8)`,
		b.ID, b.OrgID, b.Name, b.OwnerID, b.Elements, b.AppState, b.CreatedAt, b.UpdatedAt)
	if err != nil {
		return nil
	}
	return b
}

func (p *Postgres) BoardsOfOrg(orgID string) []*Board {
	rows, err := p.pool.Query(context.Background(), `
		SELECT id, org_id, name, owner_id, shared, created_at, updated_at
		FROM boards WHERE org_id=$1 ORDER BY updated_at DESC`, orgID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []*Board{}
	for rows.Next() {
		var b Board
		if rows.Scan(&b.ID, &b.OrgID, &b.Name, &b.OwnerID, &b.Shared, &b.CreatedAt, &b.UpdatedAt) == nil {
			out = append(out, &b)
		}
	}
	return out
}

func (p *Postgres) Board(id string) (*Board, error) {
	var b Board
	err := p.pool.QueryRow(context.Background(), `
		SELECT id, org_id, name, owner_id, elements, app_state, shared, created_at, updated_at
		FROM boards WHERE id=$1`, id).
		Scan(&b.ID, &b.OrgID, &b.Name, &b.OwnerID, &b.Elements, &b.AppState, &b.Shared, &b.CreatedAt, &b.UpdatedAt)
	if err != nil {
		return nil, ErrNotFound
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
	return p.IsMember(b.OrgID, userID)
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

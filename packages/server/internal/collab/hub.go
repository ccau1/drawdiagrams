// Package collab manages per-board rooms: presence, scene ops, cursors and
// reactions are broadcast to every peer in the room except the sender.
package collab

import (
	"encoding/json"
	"sync"

	"draw.local/server/internal/ws"
)

// Message is the envelope used on the wire.
// Types: "join", "leave", "op" (element upsert/delete), "cursor",
// "reaction", "scene" (full scene sync), "presence".
type Message struct {
	Type    string          `json:"type"`
	Board   string          `json:"board,omitempty"`
	From    string          `json:"from,omitempty"`
	Name    string          `json:"name,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

type client struct {
	id   string
	name string
	conn *ws.Conn
}

type room struct {
	mu      sync.RWMutex
	clients map[*client]struct{}
}

type Hub struct {
	mu    sync.Mutex
	rooms map[string]*room
}

func NewHub() *Hub { return &Hub{rooms: map[string]*room{}} }

func (h *Hub) room(board string) *room {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[board]
	if !ok {
		r = &room{clients: map[*client]struct{}{}}
		h.rooms[board] = r
	}
	return r
}

// Join registers a client and returns a leave function. Presence of all
// current peers is sent to the new client; the join is broadcast to peers.
func (h *Hub) Join(board, userID, name string, conn *ws.Conn) func() {
	r := h.room(board)
	c := &client{id: userID, name: name, conn: conn}

	r.mu.Lock()
	var peers []map[string]string
	for p := range r.clients {
		peers = append(peers, map[string]string{"id": p.id, "name": p.name})
	}
	r.clients[c] = struct{}{}
	r.mu.Unlock()

	initMsg, _ := json.Marshal(Message{Type: "presence", Payload: mustJSON(peers)})
	c.conn.WriteText(initMsg)
	h.broadcast(r, c, Message{Type: "join", From: userID, Name: name})

	return func() {
		r.mu.Lock()
		delete(r.clients, c)
		empty := len(r.clients) == 0
		r.mu.Unlock()
		h.broadcast(r, c, Message{Type: "leave", From: userID})
		if empty {
			h.mu.Lock()
			delete(h.rooms, board)
			h.mu.Unlock()
		}
	}
}

// Relay forwards a client message to all other clients in the room.
func (h *Hub) Relay(board string, from *ws.Conn, raw []byte) {
	r := h.room(board)
	r.mu.RLock()
	defer r.mu.RUnlock()
	for c := range r.clients {
		if c.conn != from {
			c.conn.WriteText(raw)
		}
	}
}

func (h *Hub) broadcast(r *room, except *client, m Message) {
	raw, _ := json.Marshal(m)
	r.mu.RLock()
	defer r.mu.RUnlock()
	for c := range r.clients {
		if c != except {
			c.conn.WriteText(raw)
		}
	}
}

func mustJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

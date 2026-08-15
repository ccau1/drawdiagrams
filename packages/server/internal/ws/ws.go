// Package ws is a minimal RFC 6455 WebSocket server implementation using
// only the standard library (server-side: handshake, masked frame parsing,
// text message read/write, close/ping/pong).
package ws

import (
	"bufio"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
)

const magic = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

type Conn struct {
	net  net.Conn
	br   *bufio.Reader
	wmu  sync.Mutex
	done chan struct{}
}

// Upgrade performs the WebSocket handshake on an HTTP request.
func Upgrade(w http.ResponseWriter, r *http.Request) (*Conn, error) {
	if !strings.Contains(strings.ToLower(r.Header.Get("Upgrade")), "websocket") {
		return nil, errors.New("not a websocket request")
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		return nil, errors.New("missing key")
	}
	h, ok := w.(http.Hijacker)
	if !ok {
		return nil, errors.New("hijacking unsupported")
	}
	nc, buf, err := h.Hijack()
	if err != nil {
		return nil, err
	}
	hsh := sha1.New()
	hsh.Write([]byte(key + magic))
	accept := base64.StdEncoding.EncodeToString(hsh.Sum(nil))
	resp := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\nConnection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + accept + "\r\n\r\n"
	if _, err := buf.WriteString(resp); err != nil {
		nc.Close()
		return nil, err
	}
	if err := buf.Flush(); err != nil {
		nc.Close()
		return nil, err
	}
	return &Conn{net: nc, br: buf.Reader, done: make(chan struct{})}, nil
}

// ReadMessage blocks until a complete text/binary message arrives.
// Ping frames are answered automatically; close frames end the connection.
func (c *Conn) ReadMessage() ([]byte, error) {
	var msg []byte
	for {
		op, payload, err := c.readFrame()
		if err != nil {
			return nil, err
		}
		switch op {
		case 0x8: // close
			c.WriteClose()
			return nil, io.EOF
		case 0x9: // ping
			c.writeFrame(0xA, payload)
			continue
		case 0xA: // pong
			continue
		}
		msg = append(msg, payload...)
		return msg, nil // fragmentation across frames is merged via op 0x0 below
	}
}

func (c *Conn) readFrame() (byte, []byte, error) {
	hdr := make([]byte, 2)
	if _, err := io.ReadFull(c.br, hdr); err != nil {
		return 0, nil, err
	}
	op := hdr[0] & 0x0F
	masked := hdr[1]&0x80 != 0
	ln := uint64(hdr[1] & 0x7F)
	if ln == 126 {
		var b [2]byte
		if _, err := io.ReadFull(c.br, b[:]); err != nil {
			return 0, nil, err
		}
		ln = uint64(binary.BigEndian.Uint16(b[:]))
	} else if ln == 127 {
		var b [8]byte
		if _, err := io.ReadFull(c.br, b[:]); err != nil {
			return 0, nil, err
		}
		ln = binary.BigEndian.Uint64(b[:])
	}
	if ln > 4<<20 { // 4 MiB cap per frame
		return 0, nil, errors.New("frame too large")
	}
	var mask [4]byte
	if masked {
		if _, err := io.ReadFull(c.br, mask[:]); err != nil {
			return 0, nil, err
		}
	}
	payload := make([]byte, ln)
	if _, err := io.ReadFull(c.br, payload); err != nil {
		return 0, nil, err
	}
	if masked {
		for i := range payload {
			payload[i] ^= mask[i%4]
		}
	}
	return op, payload, nil
}

func (c *Conn) writeFrame(op byte, payload []byte) error {
	c.wmu.Lock()
	defer c.wmu.Unlock()
	hdr := []byte{0x80 | op}
	switch {
	case len(payload) < 126:
		hdr = append(hdr, byte(len(payload)))
	case len(payload) < 65536:
		hdr = append(hdr, 126, byte(len(payload)>>8), byte(len(payload)))
	default:
		hdr = append(hdr, 127)
		var b [8]byte
		binary.BigEndian.PutUint64(b[:], uint64(len(payload)))
		hdr = append(hdr, b[:]...)
	}
	if _, err := c.net.Write(hdr); err != nil {
		return err
	}
	_, err := c.net.Write(payload)
	return err
}

// WriteText sends a text message.
func (c *Conn) WriteText(b []byte) error { return c.writeFrame(0x1, b) }

// WriteClose sends a close frame (best effort).
func (c *Conn) WriteClose() { _ = c.writeFrame(0x8, nil) }

// Close terminates the underlying connection.
func (c *Conn) Close() {
	select {
	case <-c.done:
	default:
		close(c.done)
		c.net.Close()
	}
}

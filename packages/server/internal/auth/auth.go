// Package auth implements password hashing (PBKDF2-HMAC-SHA256) and
// HMAC-SHA256 JWTs using only the standard library.
package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	pbkdf2Iterations = 120_000
	saltLen          = 16
	keyLen           = 32
)

// HashPassword returns "pbkdf2$iter$saltB64$keyB64".
func HashPassword(password string) (string, error) {
	salt := make([]byte, saltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	key := pbkdf2([]byte(password), salt, pbkdf2Iterations, keyLen)
	return fmt.Sprintf("pbkdf2$%d$%s$%s", pbkdf2Iterations,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key)), nil
}

// CheckPassword verifies a password against a stored hash.
func CheckPassword(password, stored string) bool {
	parts := strings.Split(stored, "$")
	if len(parts) != 4 || parts[0] != "pbkdf2" {
		return false
	}
	var iter int
	fmt.Sscanf(parts[1], "%d", &iter)
	salt, err1 := base64.RawStdEncoding.DecodeString(parts[2])
	key, err2 := base64.RawStdEncoding.DecodeString(parts[3])
	if err1 != nil || err2 != nil {
		return false
	}
	calc := pbkdf2([]byte(password), salt, iter, len(key))
	return subtle.ConstantTimeCompare(calc, key) == 1
}

// pbkdf2 implements PBKDF2-HMAC-SHA256 (single block keys only, keyLen<=32).
func pbkdf2(password, salt []byte, iter, keyLen int) []byte {
	prf := hmac.New(sha256.New, password)
	var block [4]byte
	binary.BigEndian.PutUint32(block[:], 1)
	prf.Reset()
	prf.Write(salt)
	prf.Write(block[:])
	u := prf.Sum(nil)
	out := make([]byte, len(u))
	copy(out, u)
	for i := 1; i < iter; i++ {
		prf.Reset()
		prf.Write(u)
		u = prf.Sum(nil)
		for j := range out {
			out[j] ^= u[j]
		}
	}
	return out[:keyLen]
}

// --- JWT (HS256) ---

type Claims struct {
	Sub  string `json:"sub"`  // user id
	Name string `json:"name"` // display name
	Exp  int64  `json:"exp"`
}

var b64 = base64.RawURLEncoding

// SignToken issues a JWT for the given user, valid for 30 days.
func SignToken(secret []byte, userID, name string) (string, error) {
	header := b64.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload, _ := json.Marshal(Claims{Sub: userID, Name: name, Exp: time.Now().Add(30 * 24 * time.Hour).Unix()})
	body := header + "." + b64.EncodeToString(payload)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(body))
	return body + "." + b64.EncodeToString(mac.Sum(nil)), nil
}

// ParseToken validates a JWT and returns its claims.
func ParseToken(secret []byte, token string) (*Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("malformed token")
	}
	body := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(body))
	sig, err := b64.DecodeString(parts[2])
	if err != nil || !hmac.Equal(sig, mac.Sum(nil)) {
		return nil, errors.New("bad signature")
	}
	payload, err := b64.DecodeString(parts[1])
	if err != nil {
		return nil, err
	}
	var c Claims
	if err := json.Unmarshal(payload, &c); err != nil {
		return nil, err
	}
	if time.Now().Unix() > c.Exp {
		return nil, errors.New("token expired")
	}
	return &c, nil
}

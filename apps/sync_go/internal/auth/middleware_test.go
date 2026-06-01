package auth

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/lestrrat-go/jwx/v2/jwa"
	"github.com/lestrrat-go/jwx/v2/jwk"
	"github.com/lestrrat-go/jwx/v2/jwt"
)

func testKeySet(t *testing.T) (jwk.Set, *ecdsa.PrivateKey) {
	t.Helper()
	privKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	jwkKey, err := jwk.FromRaw(privKey.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	jwkKey.Set(jwk.AlgorithmKey, jwa.ES256)
	jwkKey.Set(jwk.KeyIDKey, "test-key")

	set := jwk.NewSet()
	set.AddKey(jwkKey)
	return set, privKey
}

func signToken(t *testing.T, privKey *ecdsa.PrivateKey, claims map[string]interface{}, expiry time.Time) string {
	t.Helper()
	builder := jwt.NewBuilder().Expiration(expiry).IssuedAt(time.Now())
	for k, v := range claims {
		builder = builder.Claim(k, v)
	}
	tok, err := builder.Build()
	if err != nil {
		t.Fatal(err)
	}

	jwkPriv, err := jwk.FromRaw(privKey)
	if err != nil {
		t.Fatal(err)
	}
	jwkPriv.Set(jwk.AlgorithmKey, jwa.ES256)
	jwkPriv.Set(jwk.KeyIDKey, "test-key")

	signed, err := jwt.Sign(tok, jwt.WithKey(jwa.ES256, jwkPriv))
	if err != nil {
		t.Fatal(err)
	}
	return string(signed)
}

func dummyHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uid, _ := UserIDFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(uid))
	})
}

func TestMissingHeader(t *testing.T) {
	set, _ := testKeySet(t)
	m := NewMiddlewareWithKeySet(set)
	handler := m.Wrap(dummyHandler())

	req := httptest.NewRequest("POST", "/sync", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestMalformedToken(t *testing.T) {
	set, _ := testKeySet(t)
	m := NewMiddlewareWithKeySet(set)
	handler := m.Wrap(dummyHandler())

	req := httptest.NewRequest("POST", "/sync", nil)
	req.Header.Set("Authorization", "Bearer not-a-jwt")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestExpiredToken(t *testing.T) {
	set, privKey := testKeySet(t)
	m := NewMiddlewareWithKeySet(set)
	handler := m.Wrap(dummyHandler())

	token := signToken(t, privKey, map[string]interface{}{"userID": "user-123"}, time.Now().Add(-1*time.Hour))

	req := httptest.NewRequest("POST", "/sync", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestValidToken(t *testing.T) {
	set, privKey := testKeySet(t)
	m := NewMiddlewareWithKeySet(set)
	handler := m.Wrap(dummyHandler())

	token := signToken(t, privKey, map[string]interface{}{"userID": "user-456"}, time.Now().Add(1*time.Hour))

	req := httptest.NewRequest("POST", "/sync", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if rec.Body.String() != "user-456" {
		t.Fatalf("expected userID 'user-456', got '%s'", rec.Body.String())
	}
}
